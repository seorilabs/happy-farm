# placement별 광고 지표 정기 리포트 기준 (Ad Placement Report)

happy-farm 보상형 광고를 **placement × reward_kind 단위로 정기 모니터링**하기 위한 운영 기준
문서다. 지표의 정의는 `docs/04-work/ad-analytics.md`를 단일 출처로 삼고, 이 문서는
"무엇을 · 얼마나 자주 · 어떤 쿼리로 · 어떻게 읽는가"를 규정한다. (관련 이슈: [M7] #116)

## 산출물
- **쿼리 스크립트**: `analytics/queries/ad-placement-metrics.sql`
  - `[A]` 일자 × placement × reward_kind 일별 지표(시계열)
  - `[B]` 기간 롤업 × placement × reward_kind(요약)
- **기준 문서**: 이 파일.

이벤트 계약은 `packages/farm-core/src/analytics.ts`, placement 매핑은
`packages/farm-core/src/ads.ts`(`REWARDED_AD_PLACEMENT_BY_TYPE`)가 단일 출처다.
데이터 소스는 GA4 BigQuery export 데이터셋 `happy-farm-tycoon.analytics_539626577`
(일일 `events_YYYYMMDD` 샤드)이다.

## placement 목록
| `placement` | 노출 지면 | `ad_type` |
|---|---|---|
| `shop_gold_reward` | 상점 주 보상(역사적 키, P0 골드 / P1+ 축제 배송 포인트) | `rewardedGold` |
| `shop_plot_discount` | 상점 밭 할인 구매 | `plotDiscountAd` |
| `growth_ad_sheet` | 성장 스킵 시트 | `growthAd` |
| `harvest_bonus_sheet` | 수확 2배 부스트 시트 | `harvestBonusAd` |
| `return_offline_bonus` | 복귀 오프라인 골드 2배 CTA | `offlineBonusAd` |
| `wheel_bonus_spin` | 무료 룰렛 이후 보너스 스핀 CTA | `wheelBonusAd` |
| `cooking_speed_up` | 요리 즉시 완성 CTA | `cookingSpeedAd` |

`shop_gold_reward`는 placement 시계열 호환을 위해 이름을 유지한다. 실제 보상은
`reward_kind=gold` / `reward_kind=festival_delivery_points`로 나눠 비교한다.

## 리포트 지표
모두 placement × reward_kind 단위로 집계한다. 정의·근거는 `ad-analytics.md`의
"파생 지표"와 일치한다.

| 컬럼 | 정의 |
|---|---|
| `impressions` | `count(ad_reward_impression)` — 광고 지면 노출 |
| `clicks` | `count(ad_reward_click)` — 광고 시청 선택 |
| `readiness_measured_clicks` | `ad_ready`가 있는 click 수 — 신규 준비도 계측 분모 |
| `ready_clicks` | `ad_ready=1` click 수 |
| `actionable_clicks` | `ad_ready=1 AND eligible=1` click 수 |
| `completes` | `count(ad_reward_completed)` — 보상 적립(earned) |
| `fails` | `count(ad_reward_failed)` — 미준비·미지원·취소·SDK 오류 |
| `blocked` | `count(ad_limit_blocked)` — 일일 한도·쿨다운 차단 |
| `dau` | 그날 이벤트가 있는 고유 사용자 수(ARPDAU 분모) |
| `ctr` | `clicks / impressions` |
| `completion_rate` | `completes / clicks` |
| `fail_rate` | `fails / clicks` |
| `fill_approx` | `ready_clicks / readiness_measured_clicks` — 탭 시점 광고 준비율. 동일 attempt의 click/not_ready 실패 이중계상 제외 |
| `block_rate` | `blocked / (impressions + blocked)` — 한도/쿨다운의 수요 억제 |
| `readiness_measured_impressions` | `ad_ready`가 있는 신규 impression 수 |
| `ready_impressions` | `ad_ready=1` impression 수 |
| `eligible_impressions` | `eligible=1` impression 수 |
| `actionable_impressions` | `ad_ready=1 AND eligible=1` impression 수 |
| `ready_rate` | `ready_impressions / readiness_measured_impressions` |
| `eligible_rate` | `eligible_impressions / impressions` |
| `actionable_ctr` | `actionable_clicks / actionable_impressions` — 실제 시청 가능 노출 대비 동기 |
| `identified_attempts` | `attempt_id`가 있는 고유 click attempt 수 |
| `completed_attempts` | 같은 attempt ID로 completed가 온 고유 attempt 수 |
| `terminal_attempts` | 같은 attempt ID로 completed 또는 failed가 온 수 |
| `attempt_id_coverage` | `identified_attempts / clicks` — 신규 계측 커버리지 |
| `attempt_completion_rate` | `completed_attempts / identified_attempts` |
| `terminal_gap` | `max(identified_attempts - terminal_attempts, 0)` |
| `fails_not_ready` 등 | stable `failure_family`별 실패 수 |
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
  - `ready_rate`↓, `fails_not_ready`↑ 또는 `fill_approx`↓ → 광고 로딩/캐시·재고 부족.
  - `block_rate`↑ → 한도/쿨다운이 수요를 과도하게 억제(수익 기회 손실 가능).
  - `actionable_ctr`↓ → 준비·자격 차이를 제외해도 보상 동기가 약함.
  - `attempt_completion_rate`↓ → SDK 시청 시작 후 이탈/실패 가능.
  - `terminal_gap > 0` → SDK 종료 콜백 누락·프로세스 종료·계측 유실 조사.

## 변경 시 유지할 것
- placement를 추가/변경하면 `ads.ts`와 함께 이 표, 쿼리의 `placement_ecpm` CTE,
  `ad-analytics.md`의 매핑 표를 같이 갱신한다.
- 지표 정의는 `ad-analytics.md`를 단일 출처로 유지하고, 이 문서·쿼리는 그 정의를
  그대로 구현한다(정의 중복·드리프트 금지).
- 구버전 별칭은 쿼리에서 canonical `reward_kind`로 합친다
  (`landmark_material`/`festival_delivery_point` → `festival_delivery_points`,
  `bonus_spin` → `wheel_bonus_spin`).
- 이벤트 파라미터에 변화가 생기면 쿼리의 `event_params` 추출부
  (`placement`, `attempt_id`, `reward_kind`, `failure_family`, `ad_ready`, `eligible`)를 갱신한다.
- `attempt_id`는 고카디널리티이므로 GA4 custom dimension에 등록하지 않는다.
