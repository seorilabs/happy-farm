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

## ad_type ↔ placement 매핑
| `ad_type` | `placement` | 노출 지면 |
|---|---|---|
| `rewardedGold` | `shop_gold_reward` | 상점 보상 골드 |
| `plotDiscountAd` | `shop_plot_discount` | 상점 밭 할인 구매 |
| `growthAd` | `growth_ad_sheet` | 성장 스킵 시트 |
| `harvestBonusAd` | `harvest_bonus_sheet` | 수확 2배 부스트 시트 |

전면(interstitial) 광고는 별도 트랙이다.
- `interstitial_shown` — `placement`: `return_welcome_back`(복귀 시점), 마일스톤 등.

## 보상형 광고 퍼널 이벤트
| 이벤트 | 발생 시점 | 주요 파라미터 |
|---|---|---|
| `ad_reward_impression` | 광고 지면(시트/카드) 노출 | `ad_type`, `placement` |
| `ad_reward_click` | 유저가 광고 시청 선택 | `ad_type`, `placement` |
| `ad_reward_completed` | 보상 적립(earned) | `ad_type`, `placement`, `reward_value` |
| `ad_reward_failed` | 미준비·미지원·취소·SDK 오류 | `ad_type`, `placement`, `reason` |
| `ad_limit_blocked` | 일일 한도·쿨다운으로 차단 | `ad_type`, `placement`, `blocked_reason` |

`reason` 값: `not_ready`, `unsupported`, `dismissed`, `show_ad_threw`, SDK 오류 코드.
모든 퍼널 이벤트에는 게임 상태 컨텍스트(`gold`, `plot_count`, `prestige_level` 등,
`GameAnalyticsContext`)가 함께 실려 코호트 분해가 가능하다.

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
- **fill 근사** = `ad_reward_click / (ad_reward_click + ad_reward_failed[reason=not_ready])`
  — `not_ready` 비중이 높으면 광고 로딩/캐시 부족 신호. 분모는 `clicks + fails[reason=not_ready]`
  뿐이며, `not_ready` 외 실패(`unsupported`·`dismissed`·`show_ad_threw` 등)는 fill 신호에서
  제외하고 `fail_rate`(분모 전체 clicks)에서만 집계한다.
- **광고 완료 수(일)** = `count(ad_reward_completed)` per day
- **ARPDAU(추정)** = `(일 광고 완료 수 × placement별 eCPM) / DAU`
  eCPM은 AdMob/AppsInToss 매출 리포트에서 placement별로 가져와 결합한다.
  (본 이벤트는 노출/완료 카운트를 제공하고, 매출 단가는 광고 네트워크 리포트와 조인한다.)

## 변경 시 유지할 것
- 새 보상형 지면을 추가하면 `REWARDED_AD_PLACEMENTS`와
  `REWARDED_AD_PLACEMENT_BY_TYPE`에 함께 등록하고 이 표를 갱신한다.
- 퍼널 이벤트에 파라미터를 추가할 때 `ad_type`·`placement`는 항상 유지한다.
