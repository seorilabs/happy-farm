# 콘텐츠 지표 기준 (Content Analytics)

happy-farm **개별 콘텐츠(작물·구역·기능 퍼널)** 세부 지표의 단일 기준 문서.
공통 지표(DAU/리텐션/광고 노출 등)는 backoffice `AppMetricDaily`가 이미 다루므로,
이 문서는 "앱 안에서 무엇이 얼마나 소비되는가"(작물별 심기·수확·매출, 구역 언락
전환, 온보딩 단계 통과율)를 다룬다.

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
| `crop_ready` | `crop`, `area`, `crop_tier` | 성장 완료 |
| `crop_harvested` | `crop`, `area`, `crop_tier`, `revenue`, `is_first_crop_harvest` | 수확·매출 |
| `crop_of_the_day_harvested` | `crop`, `multiplier` | 오늘의 작물 수확 |
| `breed_unlocked` | `crop` | 교배 해금 |

작물×일자 집계 지표:
- **planted** = `count(crop_planted)`
- **harvested** = `count(crop_harvested)`
- **revenue** = `sum(crop_harvested.revenue)`
- **harvesters** = `count(distinct user_pseudo_id where crop_harvested)`
- **seed_selected** = `count(seed_selected) + count(first_seed_selected)`
- **ready** = `count(crop_ready)`
- **first_harvests** = `count(crop_harvested where is_first_crop_harvest)`
- **cotd_harvests** = `count(crop_of_the_day_harvested)`

파생 지표:
- **심기→수확 전환율** = `harvested / planted` (작물별 완주율)
- **수확당 평균 매출** = `revenue / harvested`

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

### 4) 광고 placement 차원
`docs/04-work/ad-analytics.md` 및 `analytics/queries/ad-placement-metrics.sql`를
그대로 따른다. 콘텐츠 대시보드에서는 placement별 impression/click/complete/fail/blocked
카운트를 콘텐츠 지표와 나란히 보여준다(정의 중복 금지, 참조만).

## 집계·저장 파이프라인
- **집계 참조 쿼리**: `analytics/queries/content-metrics.sql`(작물·구역 일별 집계, BigQuery
  콘솔에서 실행 가능한 GoogleSQL). backoffice 수집기가 같은 정의를 구현한다.
- **저장(백오피스)**: happy-farm 전용 일별 스냅샷 테이블
  (`happy_farm_crop_daily` / `happy_farm_area_daily` / `happy_farm_funnel_daily` /
  `happy_farm_ad_placement_daily`)에 앱×일자×차원키로 멱등 upsert.
- **대시보드**: `/analytics?app=happy-farm` 콘텐츠 지표 섹션에서 표/퍼널로 표시.

## 변경 시 유지할 것
- 새 작물/구역 키를 추가하면 `balance.json`에만 등록하면 집계가 자동 편입된다(키 하드코딩 금지).
- 새 콘텐츠 이벤트를 추가하면 이 표와 `analytics/queries/content-metrics.sql`,
  backoffice 수집 쿼리를 함께 갱신한다.
- 이벤트 파라미터에서 `crop`·`area`·`step` 등 차원 키는 항상 유지한다(집계 join 키).
