# 콘텐츠 지표 기준 (Content Analytics)

happy-farm **개별 콘텐츠(작물·구역·기능 퍼널)** 세부 지표의 단일 기준 문서.
공통 지표(DAU/리텐션/광고 노출 등)는 backoffice `AppMetricDaily`가 이미 다루므로,
이 문서는 "앱 안에서 무엇이 얼마나 소비되는가"(작물별 심기·수확·매출, 구역 언락
전환, 온보딩 단계 통과율, 수동 수확 콤보 baseline)를 다룬다.

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
| 소스 이벤트 | 파라미터 | 용도 |
|---|---|---|
| `seed_selected` / `first_seed_selected` | `crop`, `area` | 씨앗 선택(관심) |
| `crop_planted` | `crop`, `area`, `crop_tier`, `crop_cost` | 심기 |
| `crop_ready_summary` | `crop`, `area`, `crop_tier`, `ready_count`, `window_seconds`, `schema_version` | 60초 rolling window의 성장 완료 집계(bucket별 1건) |
| `crop_ready` | `crop`, `area`, `crop_tier` | 배칭 전 버전의 legacy 성장 완료 이벤트 |
| `crop_harvested` | `crop`, `area`, `crop_tier`, `revenue`, `is_first_crop_harvest` | 수확·매출 |
| `crop_of_the_day_harvested` | `crop`, `multiplier` | 오늘의 작물 수확 |
| `breed_unlocked` | `crop` | 교배 해금 |

작물×일자 집계 지표:
- **planted** = `count(crop_planted)`
- **harvested** = `count(crop_harvested)`
- **revenue** = `sum(crop_harvested.revenue)`
- **harvesters** = `count(distinct user_pseudo_id where crop_harvested)`
- **seed_selected** = `count(seed_selected) + count(first_seed_selected)`
- **ready** = `sum(crop_ready_summary.ready_count) + count(legacy crop_ready)`
- **first_harvests** = `count(crop_harvested where is_first_crop_harvest)`
- **cotd_harvests** = `count(crop_of_the_day_harvested)`

파생 지표:
- **심기→수확 전환율** = `harvested / planted` (작물별 완주율)
- **수확당 평균 매출** = `revenue / harvested`

`crop_ready_summary`는 같은 window 안에서 `(crop, area, crop_tier)`가 같은 익음을
`ready_count`로 합친다. 정상 active window는 60초 뒤 flush하며, 앱 background/inactive,
unmount, prestige/reset/cloud restore에서는 유실을 줄이고 새 농장 context 혼합을 막기 위해
부분 window를 best-effort로 먼저 flush한다. 이때 `window_seconds`에는 실제 경과 초가 기록된다.
배칭 배포 전후를 함께 조회할 때는 반드시 위의 legacy 호환 합계식을 사용한다. #288의
기존 `crop_ready` 대비 수확 비율은 과다 발화 기간을 포함하므로 신규 계약 배포 뒤 다시
baseline을 잡고, 자동수확 사용자는 crop별 수확 이벤트가 없으므로 별도 cohort로 분리한다.

### 2) 구역(area) 차원
| 소스 이벤트 | 파라미터 | 용도 |
|---|---|---|
| `area_unlock_clicked` | `area` | 언락 시도(관심) |
| `area_unlocked` | `area`, `cost` | 언락 완료 |
| `crop_planted` / `crop_harvested` | `area` | 구역별 활동량 |

구역×일자 집계 지표:
- **unlock_clicked** = `count(area_unlock_clicked)`
- **unlocked** = `count(area_unlocked)`
- **unlock_cost_sum** = `sum(area_unlocked.cost)`
- **planted** = `count(crop_planted)` (해당 area)
- **harvested** = `count(crop_harvested)` (해당 area)

파생 지표:
- **구역 언락 전환율** = `unlocked / unlock_clicked`

### 3) 기능 퍼널(feature funnel) 차원
`funnel`(퍼널 키) × `step`(단계) × 일자로 일반화해 저장한다.

| 퍼널(`funnel`) | 소스 이벤트 → step | 지표 |
|---|---|---|
| `onboarding` | `onboarding_step_view`(step), `onboarding_skip`(skipped_step), `onboarding_stall`(step), `onboarding_complete`(step=`complete`) | 단계별 view/skip/stall + 완료 |
| `prestige` | `prestige`(step=`prestige`) | 발생 수 |
| `research` | `research_node_unlocked`(step=node_key) | 노드별 해금 수 |
| `collection` | `collection_reward_claimed`(step=reward_key) | 리워드별 수령 수 |

퍼널×단계×일자 집계 지표:
- **count** = 이벤트 수(view/발생)
- **users** = `count(distinct user_pseudo_id)`
- **skips** = `count(onboarding_skip)` (onboarding 전용)
- **stalls** = `count(onboarding_stall)` (onboarding 전용)

파생 지표(온보딩): 단계별 **도달률** = `step_users / step1_users`,
**이탈률** = `skips / step_users`.

온보딩 단계 stable key는 `selectSeed`, `plant`, `harvest`, `reward` 순서다.
`onboarding_step_view`/`onboarding_stall`은 이 네 값을 쓰고, `onboarding_skip`의
`skipped_step`은 명시적 확인이 있는 `harvest`만 사용한다. 완료는 step 이벤트가
아닌 `onboarding_complete`로 집계한다. 재진입 시 저장된 단계가 다시 노출될 수
있으므로 도달률에는 이벤트 수가 아닌 고유 사용자를 쓴다. 이전 배포에서 수집된
`unlock`은 역사 데이터로 보존하고 배포일/앱 버전으로 `reward`와 분리한다.

### 4) 수동 수확 콤보 baseline

`harvest_combo_completed`는 **수동 단일 수확 streak가 끝날 때 1건** 발생한다. 단일
수확 streak도 포함하며, 화면 연출용 콤보에는 들어가는 `harvest_all`과 자동 수확은 이
계측 accumulator에서 제외한다. 따라서 배포 전 `crop_harvested` timestamp를 1.5초
간격으로 재구성한 값과 직접 섞지 않고, 배포 이후 직접 이벤트만 새 baseline으로 쓴다.

| 소스 이벤트 | 파라미터 | 계약 |
|---|---|---|
| `harvest_combo_completed` | `manual_harvest_count` | streak 내 수동 단일 수확 수, 1 이상 |
|  | `combo_tier` | `normal \| great \| legendary` stable key |
|  | `duration_ms` | 첫 수확부터 마지막 수확까지. 단일 수확은 0이며 종료 대기 window는 제외 |
|  | `base_revenue_total` | 기존 boost·변이 등은 반영하되 미래 콤보 보너스는 적용하기 전인 실제 골드 수익 합계 |
|  | `end_reason` | `timeout \| background \| prestige \| reset \| cloud_restore` |
|  | `schema_version` | 초기 계약은 `1` |

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

### 5) 광고 placement 차원
`docs/04-work/ad-analytics.md` 및 `analytics/queries/ad-placement-metrics.sql`를
그대로 따른다. 콘텐츠 대시보드에서는 placement별 impression/click/complete/fail/blocked
카운트를 콘텐츠 지표와 나란히 보여준다(정의 중복 금지, 참조만).

## 집계·저장 파이프라인
- **집계 참조 쿼리**: `analytics/queries/content-metrics.sql`(작물·구역 일별 집계)과
  `analytics/queries/harvest-combo-metrics.sql`(수동 콤보 28일 baseline). 둘 다 BigQuery
  콘솔에서 실행 가능한 GoogleSQL이며, backoffice 수집기는 작물·구역 일별 정의를 구현한다.
- **저장(백오피스)**: happy-farm 전용 일별 스냅샷 테이블
  (`happy_farm_crop_daily` / `happy_farm_area_daily` / `happy_farm_funnel_daily` /
  `happy_farm_ad_placement_daily`)에 앱×일자×차원키로 멱등 upsert.
- **대시보드**: `/analytics?app=happy-farm` 콘텐츠 지표 섹션에서 표/퍼널로 표시.

## 변경 시 유지할 것
- 새 작물/구역 키를 추가하면 `balance.json`에만 등록하면 집계가 자동 편입된다(키 하드코딩 금지).
- 새 콘텐츠 이벤트를 추가하면 이 표와 해당 `analytics/queries/*.sql`, 필요한 backoffice
  수집 쿼리를 함께 갱신한다.
- 이벤트 파라미터에서 `crop`·`area`·`step` 등 차원 키는 항상 유지한다(집계 join 키).
