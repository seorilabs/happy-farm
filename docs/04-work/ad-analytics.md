# 광고 분석 기준 (Ad Analytics)

happy-farm 광고 수익·노출 모니터링의 단일 기준 문서. 이벤트 계약은
`packages/farm-core/src/analytics.ts`, placement 매핑은
`packages/farm-core/src/ads.ts`에 정의돼 있다. (관련 이슈: [M4])

## 핵심 원칙
- **모든 보상형(rewarded) 광고 퍼널 이벤트는 `ad_type`과 `placement`를 함께 싣는다.**
  impression → click → completed/failed(+blocked)를 placement 단위로 끝까지 추적할 수 있어
  placement별 fill·완료율과 ARPDAU 분해가 가능하다.
- placement는 `ad_type`에서 **유일하게** 결정된다(`REWARDED_AD_PLACEMENT_BY_TYPE`).
  코드 어디서든 `getRewardedAdPlacement(type)`로 같은 값을 쓰므로 라벨 드리프트가 없다.
- 유저의 한 번의 선택은 `attempt_id`로 click→completed/failed를 묶는다.
  `attempt_id`는 세션 로컬 비식별 값이며 GA4 custom dimension으로 등록하지 않고
  BigQuery raw event join에만 사용한다.
- `placement`는 지면, `reward_kind`는 실제 보상을 뜻한다. 같은 상점 주 보상
  지면이 진행도에 따라 골드/랜드마크 재료로 바뀌어도 placement는 유지한다.

## ad_type ↔ placement 매핑
| `ad_type` | `placement` | 노출 지면 |
|---|---|---|
| `rewardedGold` | `shop_gold_reward` | 상점 주 보상(역사적 키, P0 골드 / P1+ 축제 배송 포인트) |
| `plotDiscountAd` | `shop_plot_discount` | 상점 밭 할인 구매 |
| `growthAd` | `growth_ad_sheet` | 성장 스킵 시트 |
| `harvestBonusAd` | `harvest_bonus_sheet` | 수확 2배 부스트 시트 |
| `offlineBonusAd` | `return_offline_bonus` | 복귀 오프라인 골드 2배 CTA |
| `wheelBonusAd` | `wheel_bonus_spin` | 무료 룰렛 이후 보너스 스핀 CTA |
| `cookingSpeedAd` | `cooking_speed_up` | 남은 조리 즉시 완료 + 결과 성공 보장 CTA |

전면(interstitial) 광고는 별도 트랙이다.
- `interstitial_shown` — SDK가 실제 전면광고를 표시하고 종료된 뒤 기록한다.
  현재 AppsInToss 활성 후보는 `return_welcome_back` 하나다. `progression_plot_unlock`,
  `progression_area_unlock`, `progression_speed_upgrade`, `progression_profit_upgrade`는
  구분해 계측할 수 있지만 AppsInToss에서는 정책·빈도 검증 전까지 비활성이다.

AppsInToss 광고 SDK 로드는 `ad_load_result`로 별도 진단한다.

| 파라미터 | 의미 |
|---|---|
| `ad_format` | `rewarded` 또는 `interstitial` |
| `result` | `loaded`, `sdk_error`, `timeout`, `unsupported`, `session_blocked`, `policy_blocked`, `policy_error` |
| `attempt_stage` | 정책/세션 판정이 발생한 `load` 또는 `show` 단계 |
| `block_reason` | `ads_session_failed`, `app_uses_ads_false`, `ads_disabled` 중 차단 원인 |
| `disabled_by` | 정책이 반환한 비활성 주체 목록. 여러 값은 쉼표로 연결한다. |
| `client_os` | Granite 런타임의 `ios` 또는 `android` |
| `load_latency_ms` | 로드 또는 차단 결과까지 걸린 시간 |
| `reason`, `failure_family` | 오류가 있을 때의 정규화된 원인과 집계 family |

이 이벤트로 iOS/Android의 `loaded / SDK load attempt`를 직접 비교한다. CTA 진입 직후
남기는 `ad_reward_impression.ad_ready`는 SDK 로드가 끝나기 전일 수 있으므로 그 값만으로
fill 실패를 확정하지 않는다. AppsInToss 공식 안내에 따라 iOS에서 `sdk_error`가 집중되면
실기기 Toss 앱 버전과 ATT 허용 상태를 함께 확인한다.

명시적 정책 거부(`app_uses_ads_false`, `ads_disabled`)는 AIT 앱 세션 동안 캐시한다.
rewarded/interstitial 컨트롤러가 같은 결정을 공유하므로 차단 중에는 SDK load/show를 호출하지
않고 `ad_load_result`도 세션당 최초 1건만 남긴다. `ads_session_failed`와 `policy_error`는
일시 장애일 수 있어 캐시하지 않는다. background→active 복귀에서는 캐시를 비우고 정책을
다시 평가한다.

### 라이브 번들 진단 파라미터 도달 확인

다음 쿼리에서 `policy_blocked_with_reason`이 0보다 크면 해당 `release_version`에
`block_reason` 진단 계약이 도달한 것이다. `_TABLE_SUFFIX` 범위와 프로젝트·데이터셋은
확인할 릴리스에 맞게 바꾼다. intraday 테이블은 완결일 비교에서 제외한다.

```sql
WITH load_results AS (
  SELECT
    COALESCE(
      (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'release_version'),
      app_info.version,
      'unknown'
    ) AS release_version,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'result') AS result,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'block_reason') AS block_reason
  FROM `PROJECT.DATASET.events_*`
  WHERE _TABLE_SUFFIX BETWEEN 'YYYYMMDD' AND 'YYYYMMDD'
    AND platform = 'WEB'
    AND event_name = 'ad_load_result'
)
SELECT
  release_version,
  COUNT(*) AS load_result_count,
  COUNTIF(result = 'policy_blocked') AS policy_blocked_count,
  COUNTIF(result = 'policy_blocked' AND block_reason IS NOT NULL)
    AS policy_blocked_with_reason
FROM load_results
GROUP BY release_version
ORDER BY release_version DESC;
```

## 보상형 광고 퍼널 이벤트
| 이벤트 | 발생 시점 | 주요 파라미터 |
|---|---|---|
| `ad_reward_impression` | 실제 CTA 지면(시트/카드) 노출 | `ad_type`, `placement`, `ad_ready`, `eligible`, `reward_kind`, `reward_value` |
| `ad_reward_click` | 유저가 광고 시청 선택 | 위 공통 필드 + `attempt_id`, `cta_position` |
| `ad_reward_completed` | 보상 적립(earned) | 공통 필드 + `attempt_id`, `reward_key`, `reward_value`, `retry_count` |
| `ad_reward_failed` | 미준비·미지원·취소·SDK 오류 | 공통 필드 + `attempt_id`, `reason`, `failure_family`, `retry_count` |
| `ad_limit_blocked` | 일일 한도·쿨다운으로 차단 | 공통 필드 + `blocked_reason` |

공통 optional metadata는 `attempt_id`, `ad_ready`, `eligible`, `ad_supported`,
`reward_kind`, `reward_key`, `reward_value`, `cta_position`, `retry_count`,
`failure_family`다. 이벤트 시점에 알 수 없는 값은 전송하지 않는다.
`reward_value`는 impression/click에서는 미리보기, completed에서는 실제 적립값이다.

`offlineBonusAd`의 `reward_value`는 광고 완료 후 유저에게 제시·정산된 총 2배 지급액이다.
즉 `reward_value = summary.offlineGold × offlineBonusMultiplier`이며, 기본 1배 지급액은
`return_summary_collected.offline_gold`에도 별도로 남는다. 광고가 추가로 만든 증분 보너스만
분석할 때는 `reward_value - return_summary_collected.offline_gold`로 계산한다. 현재 placement
리포트 SQL의 매출 추정은 `reward_value` 합계가 아니라 완료 수와 eCPM을 사용한다.

`wheelBonusAd`의 `reward_value`는 골드/RP/부스트 당첨량이 아니라 광고가 해금한
보너스 스핀 수 `1`이다. 실제 당첨은 무료 스핀과 동일한 슬롯·보상 계산을 사용한다.
impression/click/completed/failed의 `reward_kind`는 모두 `wheel_bonus_spin`으로 고정한다.

`cookingSpeedAd`의 `reward_value`는 CTA를 누른 시점에 절약하는 남은 조리시간(초)이다.
광고 완료 시 조리를 즉시 끝내고 해당 솥의 결과 성공을 보장한다. 특정 등급이나 신규
메뉴는 보장하지 않는다. 결과의 광고 보장 적용 여부는 `cook_resolved.schema_version=2`의
`rewarded_ad_boosted`로 분리한다.

`shop_gold_reward`는 placement 시계열을 보존하기 위해 기존 이름을 유지한다.
`reward_kind=gold`은 P0 골드, `reward_kind=festival_delivery_points`는 P1+
랜드마크 축제 배송 포인트다. 두 보상은 기존 `rewardedGold` 한도를 공유한다.

`reason` 값은 원본 진단용이다. 집계는 `failure_family`(
`not_ready`, `no_fill`, `network`, `timeout`, `unsupported`, `dismissed`, `sdk_error`)를
기준으로 한다. 신규 이벤트에 family가 없어도 core가 reason에서 자동 파생한다.
리포트 SQL은 `1006: ...준비되지...` 같은 구버전 현지화 reason도 보정한다.
퍼널 이벤트에는 광고 동기 코호트에 필요한 컨텍스트 subset(`gold`,
`gold_mantissa`, `gold_exponent`, `plot_count`, `session_elapsed_sec`,
`prestige_level`, `economy_stage_bucket`)만 싣는다. `economy_stage_bucket`은
`standard | gold_saturated | research_saturated | gold_and_research_saturated` stable key로,
골드·연구 포인트의 `Number.MAX_SAFE_INTEGER` 초과 여부를 한 차원에 압축한다. AppsInToss
시장·세션 필드까지 포함해 GA4
Measurement Protocol의 이벤트당 25개 파라미터 제한을 지키기 위함이다. 안전 정수를
넘는 후반 골드는 `gold_mantissa`/`gold_exponent`로 실제 크기 구간을 보존한다. optional
metadata가 모두 실린 최대 `ad_reward_failed` payload는 production에서 정확히 25개이므로,
dev에서도 이 경우에만 `debug_mode`를 생략하고 이벤트 계약 필드를 우선한다.

리포트 SQL은 구버전 `reward_kind` 별칭도 canonical 값으로 합친다. 예를 들어
`landmark_material`/`festival_delivery_point`는 `festival_delivery_points`,
`bonus_spin`은 `wheel_bonus_spin`으로 집계한다.

## 파생 지표 (대시보드 기준)
placement(또는 `ad_type`)별로 집계한다. 아래 정의를 그대로 구현한 실행 가능한
BigQuery 쿼리는 `analytics/queries/ad-placement-metrics.sql`, 정기 리포트 운영
기준은 `docs/04-work/ad-placement-report.md`에 있다.

- **노출(impression) 수** = `count(ad_reward_impression)`
- **클릭률(CTR)** = `ad_reward_click / ad_reward_impression`
- **완료율(completion rate)** = `ad_reward_completed / ad_reward_click`
- **실패율(fail rate)** = `ad_reward_failed / ad_reward_click`
- **차단율** = `ad_limit_blocked / (ad_reward_impression + ad_limit_blocked)`
  — 한도/쿨다운이 수요를 얼마나 누르는지(인벤토리 소멸) 확인.
- **fill 근사** = `clicks[ad_ready=1] / clicks[ad_ready measured]`
  — 실제 탭 시점의 준비율이다. `not_ready` 실패도 이미 click 한 건과 같은 attempt이므로
  `clicks + fails_not_ready`처럼 더하지 않아 이중계상을 막는다. 구버전처럼 `ad_ready`가
  없는 클릭은 분모에서 제외하고, `fails_not_ready`는 별도 진단 카운트로 유지한다.
- **광고 완료 수(일)** = `count(ad_reward_completed)` per day
- **attempt ID 커버리지** = `identified_attempts / clicks`
- **attempt 완료율** = `completed_attempts / identified_attempts`
- **terminal gap** = `max(identified_attempts - terminal_attempts, 0)`
  — terminal은 같은 `attempt_id`의 completed 또는 failed다. 구버전은 커버리지에서 제외한다.
- **ready rate** = `ready_impressions / readiness_measured_impressions`
- **actionable CTR** = `clicks[ad_ready=1 AND eligible=1] / impressions[ad_ready=1 AND eligible=1]`
- **ARPDAU(추정)** = `(일 광고 완료 수 × placement별 eCPM) / DAU`
  eCPM은 AdMob/AppsInToss 매출 리포트에서 placement별로 가져와 결합한다.
  (본 이벤트는 노출/완료 카운트를 제공하고, 매출 단가는 광고 네트워크 리포트와 조인한다.)

## 변경 시 유지할 것
- 새 보상형 지면을 추가하면 `REWARDED_AD_PLACEMENTS`와
  `REWARDED_AD_PLACEMENT_BY_TYPE`에 함께 등록하고 이 표를 갱신한다.
- 퍼널 이벤트에 파라미터를 추가할 때 `ad_type`·`placement`는 항상 유지한다.
- `attempt_id`를 유저 프로퍼티/custom dimension으로 등록하지 않는다.
- 어댑터는 동시 show를 하나로 제한하고, 로드·show timeout에서도 Promise를
  반드시 종료한다. timeout 전 earned를 받았다면 보상을 보존한다.
