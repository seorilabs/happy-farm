# placement별 광고 지표 정기 리포트 기준 (Ad Placement Report)

happy-farm 보상형 광고를 **placement 단위로 정기 모니터링**하기 위한 운영 기준
문서다. 지표의 정의는 `docs/04-work/ad-analytics.md`를 단일 출처로 삼고, 이 문서는
"무엇을 · 얼마나 자주 · 어떤 쿼리로 · 어떻게 읽는가"를 규정한다. (관련 이슈: [M7] #116)

## 산출물
- **쿼리 스크립트**: `analytics/queries/ad-placement-metrics.sql`
  - `[A]` 일자 × placement 일별 지표(시계열)
  - `[B]` 기간 롤업 × placement(요약)
- **기준 문서**: 이 파일.

이벤트 계약은 `packages/farm-core/src/analytics.ts`, placement 매핑은
`packages/farm-core/src/ads.ts`(`REWARDED_AD_PLACEMENT_BY_TYPE`)가 단일 출처다.
데이터 소스는 GA4 BigQuery export 데이터셋 `happy-farm-tycoon.analytics_539626577`
(일일 `events_YYYYMMDD` 샤드)이다.

## placement 목록
| `placement` | 노출 지면 | `ad_type` |
|---|---|---|
| `shop_gold_reward` | 상점 보상 골드 | `rewardedGold` |
| `shop_plot_discount` | 상점 밭 할인 구매 | `plotDiscountAd` |
| `growth_ad_sheet` | 성장 스킵 시트 | `growthAd` |
| `harvest_bonus_sheet` | 수확 2배 부스트 시트 | `harvestBonusAd` |
| `return_offline_bonus` | 복귀 오프라인 골드 2배 CTA | `offlineBonusAd` |
| `wheel_bonus_spin` | 무료 룰렛 이후 보너스 스핀 CTA | `wheelBonusAd` |

## 리포트 지표
모두 placement 단위로 집계한다. 정의·근거는 `ad-analytics.md`의 "파생 지표"와 일치한다.

| 컬럼 | 정의 |
|---|---|
| `impressions` | `count(ad_reward_impression)` — 광고 지면 노출 |
| `clicks` | `count(ad_reward_click)` — 광고 시청 선택 |
| `completes` | `count(ad_reward_completed)` — 보상 적립(earned) |
| `fails` | `count(ad_reward_failed)` — 미준비·미지원·취소·SDK 오류 |
| `blocked` | `count(ad_limit_blocked)` — 일일 한도·쿨다운 차단 |
| `dau` | 그날 이벤트가 있는 고유 사용자 수(ARPDAU 분모) |
| `ctr` | `clicks / impressions` |
| `completion_rate` | `completes / clicks` |
| `fail_rate` | `fails / clicks` |
| `fill_approx` | `clicks / (clicks + fails[reason=not_ready])` — 광고 재고/로딩 건전성 |
| `block_rate` | `blocked / (impressions + blocked)` — 한도/쿨다운의 수요 억제 |
| `est_revenue_usd` | `completes × eCPM / 1000` — 추정 매출 |
| `arpdau_usd` | 추정 매출 / DAU — placement 기여 ARPDAU |

### eCPM 결합 (ARPDAU 필수 입력)
GA4 export에는 매출 단가가 없다. ARPDAU는 광고 네트워크(AdMob/AppsInToss) 매출
리포트에서 placement별 **eCPM(USD, 완료 1,000회당 단가)**을 가져와 결합해야 한다.

- 쿼리의 `placement_ecpm` CTE에 placement별 eCPM을 채워 넣는다(기본값 0 → ARPDAU 0).
- `est_revenue_usd = completes × eCPM / 1000`. eCPM은 "완료 1,000회당 단가"로 통일한다
  (보상형 광고는 완료 시점이 수익 인정 이벤트이므로 노출이 아닌 완료 기준).
- eCPM 미기입 상태로도 카운트/율(fill·완료율 등)은 정상 산출된다. ARPDAU만 0이 된다.

## 실행 방법
1. BigQuery 콘솔은 **GoogleSQL**(레거시 SQL 아님)로 실행한다. 두 쿼리 `[A]`/`[B]`는
   각각 `BEGIN ... END` 블록으로 변수 스코프가 분리돼, 파일 전체를 한 번에 실행하든
   블록을 개별 실행하든 `DECLARE` 변수 충돌이 없다.
2. 기간은 각 블록 상단 `DECLARE window_days INT64`(일 단위)로 조절한다. 기본값은
   `[A]` = 28일(시계열), `[B]` = 7일(주간 요약)이다. 다른 기간이 필요하면 해당 블록의
   `window_days` 기본값만 바꾼다(날짜 리터럴 수정 불필요).
3. ARPDAU가 필요하면 먼저 `placement_ecpm` CTE에 최신 eCPM을 반영한다.

## 정기 운영 기준(cadence)
- **주간**: 쿼리 `[B]`(기본 `window_days = 7`)로 placement별 완료율·fill·차단율·기여
  ARPDAU를 비교, 이상 지면(fill 급락·차단율 급등)을 점검한다. 별도 수정 없이 최근 7일
  기준으로 동작한다.
- **월간**: 쿼리 `[A]`(기본 `window_days = 28` 시계열)로 추세를 확인하고 eCPM을 갱신해
  ARPDAU를 재산출한다. `[A]`는 시계열이라 28일을 유지하고, 주간 요약은 `[B]`가 담당한다.
- **경보 신호(사람이 판단)**:
  - `fail_rate`에서 `not_ready` 비중↑ 또는 `fill_approx`↓ → 광고 로딩/캐시·재고 부족.
  - `block_rate`↑ → 한도/쿨다운이 수요를 과도하게 억제(수익 기회 손실 가능).
  - `completion_rate`↓ → 지면 UX/보상 매력도 저하 가능.

## 변경 시 유지할 것
- placement를 추가/변경하면 `ads.ts`와 함께 이 표, 쿼리의 `placement_ecpm` CTE,
  `ad-analytics.md`의 매핑 표를 같이 갱신한다.
- 지표 정의는 `ad-analytics.md`를 단일 출처로 유지하고, 이 문서·쿼리는 그 정의를
  그대로 구현한다(정의 중복·드리프트 금지).
- 이벤트 파라미터에 변화가 생기면 쿼리의 `event_params` 추출부(placement/reason)를 갱신한다.
