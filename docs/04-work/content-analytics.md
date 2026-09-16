# 콘텐츠 지표 기준 (Content Analytics)

happy-farm **개별 콘텐츠(작물·구역·기능 퍼널)** 세부 지표의 단일 기준 문서.
공통 지표(DAU/리텐션/광고 노출 등)는 backoffice `AppMetricDaily`가 이미 다루므로,
이 문서는 "앱 안에서 무엇이 얼마나 소비되는가"(작물별 심기·수확·매출, 구역 언락
전환, 온보딩 단계 통과율, 수동 수확 콤보와 동물 퍼널 baseline)를 다룬다.

이벤트 계약은 `packages/farm-core/src/analytics.ts`, 콘텐츠 키(작물/구역)는
`packages/farm-core/src/balance.json`·`types.ts`가 진실원본이다. 광고 placement 지표는
`docs/04-work/ad-analytics.md`를 그대로 따른다(중복 정의하지 않는다).

## 핵심 원칙

- **콘텐츠 이벤트는 stable key(crop/area 등)를 그대로 싣는다.** 번역 문자열이 아니라
  `carrot`·`starter_field` 같은 키를 파라미터로 보내 downstream 집계가 라벨 드리프트
  없이 동작한다(AGENTS.md: analytics key 미번역 규칙).
- **하루 딜레이 허용.** 지표는 GA4→BigQuery 일별 export(D-1 확정)를 기준으로 집계하며,
  backoffice가 일 1회 스냅샷으로 upsert한다. 실시간이 아니다.
- **전송 경로 무관 계약.** 현재는 Firebase(GA4)로 전송되지만, 자체 지표 서버가 준비되면
  `packages/farm-core/src/metricsSink.ts`의 fanout seam으로 같은 이벤트가 함께 전송된다.
  집계 계약(아래 지표 정의)은 전송 백엔드와 무관하게 동일하다.

## 콘텐츠 차원과 소스 이벤트

### 1) 작물(crop) 차원

| 소스 이벤트                             | 파라미터                                                                                                                                     | 용도                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `seed_selected` / `first_seed_selected` | `crop`, `area`                                                                                                                               | 씨앗 선택(관심)                                    |
| `crop_planted`                          | `crop`, `area`, `crop_tier`, `crop_cost`                                                                                                     | 심기                                               |
| `crop_ready_summary`                    | `crop`, `area`, `crop_tier`, `ready_count`, `window_seconds`, `schema_version`                                                               | 60초 rolling window의 성장 완료 집계(bucket별 1건) |
| `crop_ready`                            | `crop`, `area`, `crop_tier`                                                                                                                  | 배칭 전 버전의 legacy 성장 완료 이벤트             |
| `crop_harvested`                        | `crop`, `area`, `crop_tier`, `revenue`, `research_points_gained`, `reward_type`, `harvest_source`, `is_first_crop_harvest`, `schema_version` | 수동·명시적 일괄 수확과 실지급 보상                |
| `auto_harvest_summary`                  | `crop`, `area`, `crop_tier`, `harvested_count`, `replanted_count`, `total_gold`, `total_research_points`, `window_seconds`, `schema_version` | 60초 rolling window의 자동수확 집계                 |
| `mutation_discovered`                   | `crop`, `area`, `crop_tier`, `mutation`, `harvest_source`, `pity_triggered`, `schema_version`                                             | 돌연변이 최초 발견과 천장 발동 여부                 |
| `crop_of_the_day_harvested`             | `crop`, `multiplier`                                                                                                                         | 오늘의 작물 수확                                   |
| `breed_unlocked`                        | `crop`                                                                                                                                       | 교배 해금                                          |

작물×일자 집계 지표:

- **planted** = `count(crop_planted)`
- **harvested** = `count(crop_harvested where harvest_source != auto) + sum(auto_harvest_summary.harvested_count)`
- **revenue** = `sum(crop_harvested.revenue where harvest_source != auto) + sum(auto_harvest_summary.total_gold)`
- **harvesters** = `count(distinct user_pseudo_id where crop_harvested or auto_harvest_summary)`
- **seed_selected** = `count(seed_selected) + count(first_seed_selected)`
- **ready** = `sum(crop_ready_summary.ready_count) + count(legacy crop_ready)`
- **first_harvests** = `count(crop_harvested where is_first_crop_harvest)`
- **cotd_harvests** = `count(crop_of_the_day_harvested)`
- **mutation_discoveries** = `count(mutation_discovered)`
- **mutation_pity_share** = `countif(mutation_discovered.pity_triggered=1) / mutation_discoveries`

파생 지표:

- **심기→수확 전환율** = `harvested / planted` (작물별 완주율)
- **수확당 평균 매출** = `revenue / harvested`

`crop_harvested.schema_version=2`의 `harvest_source`는 `manual | batch | auto`이며 수확 후
재심기도 `batch`에 포함한다. `reward_type`은
`gold | research_points` stable key다. `revenue`는 canonical 수확 결과에서 실제로 지급된
골드와 정확히 같으므로 정상 골드 수확에서는 양수다. 기부 모드는 골드 대신 RP를 지급해
`revenue=0`, `reward_type=research_points`, `research_points_gained>0`으로 명시 구분한다.
offline 정산은 작물을 익은 상태로만 남기며 수확하지 않고, combo는 수동 수확의 후처리
summary이므로 별도 `harvest_source`가 아니다. schema v2 전 `crop_harvested`는 수동 단일
수확에서만 발생했으므로 source가 없는 legacy 행은 분석 시 `manual`로 간주한다.

`auto_harvest_summary.schema_version=2`부터 자동수확은 per-crop `crop_harvested`를 보내지
않고 `(crop, area, crop_tier)` bucket별 summary를 최대 60초에 1건 보낸다. 앱 background,
프레스티지, 초기화, 클라우드 복원 경계에서는 부분 window를 먼저 flush한다. 1.8.7 이하의
`harvest_source=auto` raw 이벤트는 자동화 처리량과 초대형 경제값으로 지표를 왜곡하므로
현재 집계에서 제외하고 summary만 합산한다. 숫자 파라미터는 JS 안전 범위로 clamp한다.
돌연변이 최초 발견은 희소한 사용자 성과이므로 자동수확에서도 `mutation_discovered`를
별도 1건 기록한다. `pity_triggered=1`은 프리즘 최초 발견 천장이 결과를 보장한 경우이며,
발견 후 반복 프리즘 수확에는 이벤트와 천장 모두 적용하지 않는다.

### 후반 경제 숫자 해상도

`GameAnalyticsContext`는 기존 raw clamp 값(`gold`, `research_points`)을 유지하면서
`gold_mantissa`/`gold_exponent`, `research_points_mantissa`/`research_points_exponent`,
`gold_is_saturated`/`research_points_is_saturated`를 제공한다. 포화 플래그는 원본이 유한하고
절대값이 `Number.MAX_SAFE_INTEGER`를 넘을 때 `1`, 그 외에는 `0`이다. 따라서 raw 값이
`9007199254740991`로 같아도 지수 차원으로 실제 크기 구간을 나눌 수 있다. `NaN`/`Infinity`는
기존 안전 규칙대로 raw `0`, 가수·지수 `0`, 포화 플래그 `0`으로 기록해 후반 경제값과 섞지 않는다.

AIT의 이벤트당 25개 파라미터 제한 때문에 네 보조 필드를 모든 이벤트에 무조건 복제하지 않는다.
`game_start`/`farm_main_screen`에는 전체 보조 필드가 실리고, 단건
`research_node_unlocked`에는 `research_points_exponent`와
`research_points_is_saturated`가 실린다. 파라미터가 조밀한 작물 이벤트는 기존
`gold_mantissa`/`gold_exponent`를 유지한다. 광고 이벤트는 아래 광고 문서의
`economy_stage_bucket`으로 두 포화 상태를 한 차원에 압축한다.

`crop_ready_summary`는 같은 window 안에서 `(crop, area, crop_tier)`가 같은 익음을
`ready_count`로 합친다. 정상 active window는 60초 뒤 flush하며, 앱 background/inactive,
unmount, prestige/reset/cloud restore에서는 유실을 줄이고 새 농장 context 혼합을 막기 위해
부분 window를 best-effort로 먼저 flush한다. 이때 `window_seconds`에는 실제 경과 초가 기록된다.
배칭 배포 전후를 함께 조회할 때는 반드시 위의 legacy 호환 합계식을 사용한다. #288의
기존 `crop_ready` 대비 수확 비율은 과다 발화 기간을 포함하므로 신규 계약 배포 뒤 다시
baseline을 잡는다. 수동 행동 전환을 볼 때는 `harvest_source=manual` cohort로 제한한다.

### 2) 구역(area) 차원

| 소스 이벤트                       | 파라미터       | 용도            |
| --------------------------------- | -------------- | --------------- |
| `area_unlock_clicked`             | `area`         | 언락 시도(관심) |
| `area_unlocked`                   | `area`, `cost` | 언락 완료       |
| `crop_planted` / `crop_harvested` / `auto_harvest_summary` | `area` | 구역별 활동량 |

구역×일자 집계 지표:

- **unlock_clicked** = `count(area_unlock_clicked)`
- **unlocked** = `count(area_unlocked)`
- **unlock_cost_sum** = `sum(area_unlocked.cost)`
- **planted** = `count(crop_planted)` (해당 area)
- **harvested** = 명시적 `crop_harvested` + `auto_harvest_summary.harvested_count` (해당 area)

파생 지표:

- **구역 언락 전환율** = `unlocked / unlock_clicked`

### 3) 기능 퍼널(feature funnel) 차원

`funnel`(퍼널 키) × `step`(단계) × 일자로 일반화해 저장한다.

| 퍼널(`funnel`) | 소스 이벤트 → step                                                                                                              | 지표                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `onboarding`   | `onboarding_step_view`(step), `onboarding_skip`(skipped_step), `onboarding_stall`(step, nudge_fired), `onboarding_complete`(step=`complete`, completion_source) | 단계별 view/skip/stall + 넛지 발화 + 종료 원인별 완료 |
| `prestige`     | `prestige`(step=`prestige`)                                                                                                     | 발생 수                       |
| `research`     | `research_node_unlocked` (`node_key`, `next_level`, `next_level_exponent`, `next_level_is_saturated`) / `research_node_batch_unlocked` (`node_key`, `levels_purchased`, `from_level`, `to_level`, `total_cost`, `total_cost_exponent`, `total_cost_is_saturated`) / `research_scaling_bulk_unlocked` (`node_keys`, `node_count`, `levels_purchased`, `total_cost`, `total_cost_exponent`, `total_cost_is_saturated`) | 노드별 단일·배치 연구 구매와 스케일 연구 일괄 강화 |
| `collection`   | `collection_reward_claimed`(step=reward_key)                                                                                    | 리워드별 수령 수              |

퍼널×단계×일자 집계 지표:

- **count** = 이벤트 수(view/발생)
- **users** = `count(distinct user_pseudo_id)`
- **skips** = `count(onboarding_skip)` (onboarding 전용)
- **stalls** = `count(onboarding_stall)` (onboarding 전용)

파생 지표(온보딩): 단계별 **도달률** = `step_users / step1_users`,
**이탈률** = `skips / step_users`.

온보딩 단계 stable key는 `plant`, `harvest`, `reward` 순서다. 신규 사용자는 첫 밭에
당근이 자동 파종된 상태로 시작해 첫 노출 단계가 `harvest`이며, `plant`는 심지 못한
레거시 진행 중 세이브의 재개 경로에만 남는다.
`onboarding_step_view`/`onboarding_stall`은 이 세 값을 쓰고, `onboarding_skip`의
`skipped_step`은 명시적 확인이 있는 `harvest`만 사용한다. 완료는 step 이벤트가
아닌 `onboarding_complete`로 집계한다. 재진입 시 저장된 단계가 다시 노출될 수
있으므로 도달률에는 이벤트 수가 아닌 고유 사용자를 쓴다. 제거 전 `selectSeed`와
이전 배포의 `unlock`은 역사 데이터로만 보존하고 배포일/앱 버전으로 분리한다.
`onboarding_complete.completion_source`는 `confirm`, `auto`, `interaction` 중 하나이며,
명시 확인과 시간 경과·후속 조작 종료를 분리해 완료율 해석에 사용한다.

#### GA4 권장 게임 이벤트 mirror

제품 세부 분석의 진실원본은 기존 custom event이다. 다만 GA4 표준 게임 리포트와
Seorilabs 게임 간 공통 축에서 가상 재화 소비·업적 해금을 비교할 수 있게, 상태 변경이
성공한 행동만 다음 권장 이벤트를 함께 1건 발화한다.

| custom event | recommended mirror | 주요 파라미터 |
| --- | --- | --- |
| `upgrade_purchased` | `spend_virtual_currency` | `virtual_currency_name=gold`, `value=cost`, `item_name=upgrade:{kind}` |
| `upgrade_batch_purchased` | `spend_virtual_currency` | `virtual_currency_name=gold`, `value=total_cost`, `item_name=upgrade_batch:{kind}` |
| `research_node_unlocked` | `spend_virtual_currency` | `virtual_currency_name=research_points`, `value=cost`, `item_name=research:{node_key}` |
| `research_node_batch_unlocked` | `spend_virtual_currency` | `virtual_currency_name=research_points`, `value=total_cost`, `item_name=research:{node_key}` |
| `research_scaling_bulk_unlocked` | `spend_virtual_currency` | `virtual_currency_name=research_points`, `value=total_cost`, `item_name=research_scaling_bulk` |
| `achievement_claimed` | `unlock_achievement` | `achievement_id={track_key}:{tier}` |

mirror는 GA4 권장 파라미터만 싣고 `GameAnalyticsContext`를 복제하지 않는다. AIT의
`app_market`·`runtime_platform`·버전·세션 envelope는 Platform relay adapter가
우선 추가하므로 이벤트당 25개 파라미터 예산을 지킨다. 집계 시 custom과
mirror를 합산하지 않고, 앱 세부 분석은 custom event를 권위 기준으로 삼는다.

### 4) 수동 수확 콤보 baseline

`harvest_combo_completed`는 **수동 단일 수확 streak가 끝날 때 1건** 발생한다. 단일
수확 streak도 포함하며, 화면 연출용 콤보에는 들어가는 `harvest_all`과 자동 수확은 이
계측 accumulator에서 제외한다. schema v2 이후 원본 수확을 함께 볼 때도
`crop_harvested.harvest_source=manual`만 비교한다. 배포 전 `crop_harvested` timestamp를
1.5초 간격으로 재구성한 값과 직접 섞지 않고, 배포 이후 직접 이벤트만 새 baseline으로 쓴다.

| 소스 이벤트               | 파라미터               | 계약                                                                               |
| ------------------------- | ---------------------- | ---------------------------------------------------------------------------------- |
| `harvest_combo_completed` | `manual_harvest_count` | streak 내 수동 단일 수확 수, 1 이상                                                |
|                           | `combo_tier`           | `normal \| great \| legendary` stable key                                          |
|                           | `duration_ms`          | 첫 수확부터 마지막 수확까지. 단일 수확은 0이며 종료 대기 window는 제외             |
|                           | `base_revenue_total`   | 기존 boost·변이 등은 반영하되 미래 콤보 보너스는 적용하기 전인 실제 골드 수익 합계 |
|                           | `end_reason`           | `timeout \| background \| prestige \| reset \| cloud_restore`                      |
|                           | `schema_version`       | 초기 계약은 `1`                                                                    |

모든 이벤트에는 `GameAnalyticsContext`가 함께 실린다. `end_reason=background`는
`AppState`의 background/inactive 경계를 합친 값이며, `timeout`은 마지막 수동 수확 뒤
combo window가 끝났거나 다음 수확 시 이미 window를 넘은 경우다. prestige/reset은 상태
전환 전, cloud_restore는 성공한 복원 적용 전에 기존 streak를 닫는다. React StrictMode의
가상 unmount는 실제 종료로 보지 않으므로 unmount에서는 이벤트를 emit하지 않는다.

`analytics/queries/harvest-combo-metrics.sql`은 당일 미완료 export를 제외한 최근 **28개
완료일(D-28~D-1)** 을 기본 window로 사용하며 다음 결과를 독립 블록으로 산출한다.

- **티어 분포**: 티어별 완료 콤보·`event_tier_users`·세션·수동 수확 수, 사용자별 최고
  streak 기반 상호배타 `exclusive_tier_users`, `reached_users` 기반 threshold 누적 도달 수를
  함께 제공한다(great 누적 도달에는 legendary 사용자 포함). normal(1+)은 active cohort
  자체이므로 `user_reach_rate=NULL`이고 great/legendary만 누적 도달률을 제공한다.
- **길이·수익 분포**: 전체와 티어별 count·duration·base revenue의 평균/median/p90/max,
  수동 수확 1회당 평균 base revenue
- **종료 사유**: end reason별 콤보·사용자·수확·수익과 전체 콤보 대비 share
- **사용자 집중도**: 수동 수확 기준 top1/top2/top10% share, 수익 top1/top2 share,
  수동 수확·수익 HHI. top1/top2는 동률이어도 정확히 1명/2명을 stable key로 선택하며,
  전체 분포의 동률 비의존 비교는 HHI를 사용한다.
- **계약 품질**: 필수 6개 파라미터 누락, enum·범위·schema 위반, valid event rate

분석 블록은 `schema_version=1`, `manual_harvest_count>=1`, 음수가 아닌 duration/revenue와
정의된 tier/end reason을 모두 만족한 이벤트만 사용한다. 첫 daily export에서는 품질 블록의
필수 파라미터 누락이 0인지 먼저 확인한다. 품질 블록은 `observed_events=0`이면
`quality_status=no_data`, `valid_event_rate=NULL`로 표시하고, 이벤트가 있으나 모두 무효면
`quality_status=all_invalid`, `valid_event_rate=0`으로 구분한다. 최소 28일이 쌓인 뒤 표본 수와 top 사용자
집중도를 함께 보고 #320의 A/B 실험 가능 여부를 다시 판단하며, 이 계측만으로 보상 기능을
unblock하지 않는다.

### 5) 동물 구매·급여·산출 수집 퍼널 baseline

동물 기능의 진입부터 산출 수집까지를 아래 5개 schema v1 이벤트로 계측한다. 모든
이벤트에는 `GameAnalyticsContext`가 함께 실리며 stable animal key만 저장한다.

| 소스 이벤트                  | 주요 파라미터                                                                                               | 계약                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `animals_screen`             | `source`, `owned_count`, `feeding_count`, `ready_count`                                                     | 동물 시트가 실제로 열릴 때 1건. `source=more \| welcome_back`     |
| `animal_purchased`           | `animal`, `purchase_cost`, `owned_count_after`                                                              | 구매 상태 변경이 성공한 뒤 1건                                    |
| `animal_fed`                 | `animal`, `feed_cost`, `produce_timer_ms`, `owned_count`                                                    | 급여 상태 변경이 성공한 뒤 1건                                    |
| `animal_produce_collected`   | `animal`, `collection_mode`, `base_revenue`, `final_revenue`, `is_rare`, `rare_multiplier`, `ready_wait_ms` | 동물별 수집 성공마다 1건. `collection_mode=single \| collect_all` |
| `animal_produce_collect_all` | `collected_count`, `base_revenue_total`, `final_revenue_total`, `rare_count`                                | 동물 일괄 수집의 item 이벤트가 모두 기록된 뒤 1건                 |

현재 canonical 수집 결과는 희귀 산출 보상 구현 전 baseline이므로 항상
`base_revenue=final_revenue=producePrice`, `is_rare=false`, `rare_multiplier=1`이다.
`ready_wait_ms`는 준비 완료 시점부터 실제 수집까지의 대기 시간이며 음수가 아니다.
일괄 수집은 동물 catalog 순서대로 item 이벤트 N건을 먼저 기록한 뒤 합계 summary 1건을
기록한다. 작업실 일괄 수집은 동물 이벤트를 만들지 않는다.

구매·급여·단일 수집의 성공 이벤트는 immutable pending effect가 확정된 상태 변경을
소비할 때만 발생한다. React StrictMode 재실행이나 빠른 중복 탭으로 같은 성공 이벤트를
두 번 기록하지 않으며, 잔액 부족·준비 전 수집 같은 실패 또는 no-op에는 성공 이벤트를
기록하지 않는다. 시트가 열린 동안의 clock tick도 `animals_screen`을 반복하지 않는다.

`analytics/queries/animal-funnel-metrics.sql`은 당일 미완료 export를 제외한 최근 **28개
완료일(D-28~D-1)** 을 기본 window로 사용해 다음을 독립 블록으로 산출한다.

- **퍼널**: 화면 진입→구매→급여→산출 수집 사용자와 단계 전환율
- **수집 빈도·경로**: 단일/일괄 수집 건수, 사용자, 수익, 평균 대기 시간
- **동물별 분포**: 구매·급여·수집량과 수익
- **사용자 집중도**: 수집량·수익 top1/top2/top10% share와 HHI
- **계약 품질**: 필수 파라미터 누락, enum·범위·schema 및 baseline 결과 위반

첫 daily export에서는 품질 블록의 `quality_status`와 필수 파라미터 누락을 먼저 확인한다.
`observed_events=0`은 `no_data`로 분리하며 전환율 0으로 해석하지 않는다. 최소 28일이
쌓인 뒤 수집 빈도·대기 시간·사용자 집중도를 함께 보고 #322의 희귀 산출 보상 설계를
다시 판단한다. 이 baseline 계측만으로 #322를 unblock하거나 보상 RNG·경제를 변경하지 않는다.

### 6) 광고 placement 차원

`docs/04-work/ad-analytics.md` 및 `analytics/queries/ad-placement-metrics.sql`를
그대로 따른다. 콘텐츠 대시보드에서는 placement별 impression/click/complete/fail/blocked
카운트를 콘텐츠 지표와 나란히 보여준다(정의 중복 금지, 참조만).

## 집계·저장 파이프라인

- **집계 참조 쿼리**: `analytics/queries/content-metrics.sql`(작물·구역 일별 집계),
  `analytics/queries/harvest-combo-metrics.sql`(수동 콤보 28일 baseline),
  `analytics/queries/animal-funnel-metrics.sql`(동물 퍼널 28일 baseline). 모두 BigQuery
  콘솔에서 실행 가능한 GoogleSQL이며, backoffice 수집기는 작물·구역 일별 정의를 구현한다.
- **저장(백오피스)**: 공통 앱 콘텐츠 스냅샷에 앱×마켓×일자 단위로 멱등 upsert한다.
  수집 스펙은 행복한 농장 저장소의 `.seorilabs/backoffice.json`을 우선한다.
- **대시보드**: `/apps/happy-farm/content` 전용 워크스페이스에서 표/퍼널로 표시.

## 변경 시 유지할 것

- 새 작물/구역 키를 추가하면 `balance.json`에만 등록하면 집계가 자동 편입된다(키 하드코딩 금지).
- 새 콘텐츠 이벤트를 추가하면 이 표와 해당 `analytics/queries/*.sql`, 필요한 backoffice
  수집 쿼리를 함께 갱신한다.
- 이벤트 파라미터에서 `crop`·`area`·`step` 등 차원 키는 항상 유지한다(집계 join 키).
