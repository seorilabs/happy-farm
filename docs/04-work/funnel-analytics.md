# 핵심 퍼널 분석 기준 (Funnel Analytics)

happy-farm 활성화·리텐션 퍼널 측정의 단일 기준 문서. 이벤트 계약은
`packages/farm-core/src/analytics.ts`(`createFarmAnalytics`)에 정의돼 있고,
발화 지점은 대부분 `packages/farm-ui/src/FarmGame.tsx`다. 광고 퍼널은 별도
문서(`docs/04-work/ad-analytics.md`)를 참조한다. (관련 이슈: [I1] #107)

## 핵심 원칙
- **게임 상태를 아는 지점에서 발화하는 모든 퍼널 이벤트는 `GameAnalyticsContext`를 함께 싣는다.**
  코호트(골드·밭 수·프레스티지·누적 수확 등)별로 퍼널 전환율을 분해할 수 있다.
  단 앱 로드 이전에 발생할 수 있는 이벤트(`notification_opened`)는 예외다.
- **"첫 …" 단계는 전용 이벤트 + 플래그를 함께 둔다.** 첫 수확은
  `first_meaningful_harvest`(전용) + `crop_harvested.is_first_*`(플래그), 첫 데일리
  클레임은 `first_daily_bonus_claimed`(전용) + `daily_bonus_claimed.is_first_claim`(플래그)로
  대칭을 맞춘다. 전용 이벤트는 퍼널 분자(count)로, 플래그는 원본 이벤트 위 세그먼트로 쓴다.
- 이벤트명·파라미터는 snake_case, 값은 string·number·boolean만 사용한다(boolean은
  `toFirebaseAnalyticsValue`가 1/0으로 정규화).

## GameAnalyticsContext (모든 퍼널 이벤트 공통 파라미터)
`getGameAnalyticsContext(gameState, sessionStartedAt, now)`가 생성한다.

| 필드 | 의미 |
|---|---|
| `gold` | 현재 골드(floor) |
| `plot_count` | 해금된 밭 수 |
| `speed_level` / `profit_level` | 성장속도·수익 업그레이드 레벨 |
| `unlocked_area_count` | 해금된 구역 수 |
| `harvested_crop_count` | 도감상 수확 경험이 있는 작물 종 수 |
| `session_elapsed_sec` | 현재 세션 경과 초 |
| `prestige_level` / `prestige_stars` | 프레스티지 레벨·누적 별 |
| `research_points` | 연구 포인트(floor) |
| `lifetime_harvests` | 생애 누적 수확 횟수 |

## 활성화 퍼널 (신규 → 첫 수확 → 첫 데일리)
표준 활성화 경로. 신규 설치 커버리지는 GA4 자동 이벤트 `first_open`, 게임 안 단계별
전환은 첫 `onboarding_step_view`를 분모로 읽는다.

| 단계 | 이벤트 | 주요 파라미터 |
|---|---|---|
| 신규 설치 | `first_open` (GA4 자동 수집) | GA4 기본 파라미터 |
| 게임 시작 | `game_start` | context |
| 씨앗 선택 안내 | `onboarding_step_view` (`step` = `selectSeed`, `step_index` = 1) | `step`, `step_index`, context |
| 온보딩 이탈 | `onboarding_skip` | `skipped_step`, `step_index`, context |
| 첫 씨앗 선택 | `first_seed_selected` (이후는 `seed_selected`) | `crop`, `area`, context |
| 심기 안내 | `onboarding_step_view` (`step` = `plant`, `step_index` = 2) | `step`, `step_index`, context |
| 심기 | `crop_planted` | `crop`, `area`, `crop_tier`, `crop_cost`, context |
| 수확 안내 | `onboarding_step_view` (`step` = `harvest`, `step_index` = 3) | `step`, `step_index`, context |
| 수확 준비 집계 | `crop_ready_summary` | `crop`, `area`, `crop_tier`, `ready_count`, `window_seconds`, `schema_version`, context |
| 수확 | `crop_harvested` | `crop`, `area`, `crop_tier`, `revenue`, `is_first_crop_harvest`, `is_first_meaningful_harvest`, context |
| **첫 유의미 수확** | `first_meaningful_harvest` | `crop`, `area`, `crop_tier`, `revenue`, context |
| 첫 수확 보상 확인 | `onboarding_step_view` (`step` = `reward`, `step_index` = 4) | `step`, `step_index`, context |
| 온보딩 완료 | `onboarding_complete` | context |
| 데일리 보너스 노출 | `daily_bonus_opened` | `source` (`auto_popup` / `more` / `welcome_back`), context |
| 데일리 보너스 수령 | `daily_bonus_claimed` | `streak`, `reward_value`, `is_first_claim`, `source`, context |
| **첫 데일리 클레임** | `first_daily_bonus_claimed` | `streak`, `reward_value`, `source`, context |

> **온보딩 "시작"**은 별도 이벤트가 아니라 `onboarding_step_view`의 `step_index = 1` 발화로
> 정의한다. "완료"는 마지막 단계 노출과 구분되는 별도 종료 시점이므로 전용
> `onboarding_complete`를 둔다(건너뛰기로 끝나면 `onboarding_skip`만 발화).
>
> 단계 stable key는 `selectSeed` → `plant` → `harvest` → `reward`다. 미완료 세이브는
> 현재 단계를 저장하고 재진입 시 이어서 보여 준다. 따라서 세션을 넘긴 재노출로 같은 사용자의
> `onboarding_step_view`가 중복될 수 있으므로 전환율은 이벤트 수가 아니라 고유 사용자로 집계한다.
> 성장 완료 수는 배칭 배포 이후 `sum(crop_ready_summary.ready_count)`, 이전 기간은
> `count(crop_ready)`로 읽으며 혼합 기간에는 두 값을 더한다.
> `unlock`은 이전 버전의 역사 데이터에만 존재하는 legacy key이며 `reward`로 소급 치환하지 않는다.
> 미완료 가이드가 있는 복귀 세션에서는 온보딩이 foreground를 소유한다. 출석 보너스 시트는
> 완료/skip 뒤로 미루고, 복귀 passive gold는 `lastSeenAt`을 갱신하기 전에 저장 상태에 먼저
> 정산해 시트 지연 중 금액 변경이나 앱 종료로 인한 유실을 막는다.

```mermaid
flowchart LR
  A[first_open] --> B[game_start]
  B --> C[selectSeed view #35;1]
  C --> D[first_seed_selected]
  D --> E[plant view #35;2]
  E --> F[crop_planted]
  F --> G[harvest view #35;3]
  G --> H[first_meaningful_harvest]
  H --> I[reward view #35;4]
  I --> J[onboarding_complete]
  J --> K[daily_bonus_opened]
  K --> L[first_daily_bonus_claimed]
  G -. 명시적 확인 후 이탈 .-> S[onboarding_skip]
```

## 리텐션 · 복귀 퍼널
복귀 넛지(알림) → 앱 오픈 → 복귀 요약 → 첫 행동 경로.

| 단계 | 이벤트 | 주요 파라미터 |
|---|---|---|
| 복귀 알림 예약 | `notification_scheduled` | `notification_kind`, `lead_time_ms?`, context? |
| 복귀 알림 열림 | `notification_opened` | `notification_kind` (context 없음) |
| 복귀 요약 노출 | `return_summary_shown` | `away_ms`, `offline_gold`, `ready_crop_count`, context |
| 복귀 요약 수령 | `return_summary_collected` | `away_ms`, `offline_gold`, `ready_crop_count`, context |
| 오늘의 작물 수확 | `crop_of_the_day_harvested` | `crop`, `multiplier`, context |

`notification_kind` 값: `harvest`, `daily_bonus`, `crop_of_the_day`.

일일 보너스 발견성은 source별 `daily_bonus_claimed` 고유 사용자 /
`daily_bonus_opened` 고유 사용자로 측정한다. `auto_popup`은 앱 진입 자동 노출,
`more`는 자동 시트를 닫은 뒤 더보기에서 재진입, `welcome_back`은 복귀 요약 CTA다.

### D1(익일) 복귀
D1 복귀는 전용 클라이언트 이벤트가 아니라 **`game_start`의 일별 코호트에서 파생**한다.
사용자의 최초 `game_start`(또는 GA4 자동 `first_open`) 일자를 코호트 기준일로 잡고,
그 다음 날 `game_start`가 있으면 D1 복귀로 집계한다. 세션 진입마다 항상 `game_start`가
context와 함께 발화하므로 별도 이벤트 없이 코호트·채널 귀속 분석이 가능하다.

```sql
-- D1 복귀율: 최초 접속 다음 날 game_start가 있는 사용자 비율 (GA4 BigQuery export)
WITH first_seen AS (
  SELECT user_pseudo_id, MIN(DATE(TIMESTAMP_MICROS(event_timestamp))) AS d0
  FROM `happy-farm-tycoon.analytics_539626577.events_*`
  WHERE event_name = 'game_start'
  GROUP BY user_pseudo_id
),
returns AS (
  SELECT DISTINCT user_pseudo_id, DATE(TIMESTAMP_MICROS(event_timestamp)) AS d
  FROM `happy-farm-tycoon.analytics_539626577.events_*`
  WHERE event_name = 'game_start'
)
SELECT
  f.d0,
  COUNT(DISTINCT f.user_pseudo_id) AS cohort,
  COUNT(DISTINCT r.user_pseudo_id) AS d1_returned,
  SAFE_DIVIDE(COUNT(DISTINCT r.user_pseudo_id), COUNT(DISTINCT f.user_pseudo_id)) AS d1_rate
FROM first_seen f
LEFT JOIN returns r
  ON f.user_pseudo_id = r.user_pseudo_id AND r.d = DATE_ADD(f.d0, INTERVAL 1 DAY)
GROUP BY f.d0
ORDER BY f.d0;
```

## 파생 지표 (대시보드 기준)
- **온보딩 진입 커버리지** = `onboarding_step_view`(step_index=1) 고유 사용자 / `first_open` 고유 사용자
- **온보딩 단계 도달률** = 각 `step_index`별 `onboarding_step_view` 고유 사용자 / `onboarding_step_view`(step_index=1) 고유 사용자
- **온보딩 완료율** = `onboarding_complete` 고유 사용자 / `onboarding_step_view`(step_index=1) 고유 사용자
- **첫 심기 활성화율** = `crop_planted` 고유 사용자 / `first_open` 고유 사용자
- **첫 수확 도달률** = `first_meaningful_harvest` 고유 사용자 / `first_open` 고유 사용자
- **첫 데일리 클레임율** = `first_daily_bonus_claimed` / `first_meaningful_harvest`
- **복귀 요약 수령률** = `return_summary_collected` / `return_summary_shown`
- **D1 복귀율** = 위 SQL 참조

## 변경 시 유지할 것
- 새 퍼널 단계 이벤트를 추가하면 이 표와 대응 이벤트 이름을 함께 갱신한다.
- 게임 상태를 아는 지점의 이벤트에는 항상 `GameAnalyticsContext`(스프레드)를 싣는다.
  이 정합성은 `packages/farm-core/src/__tests__/analytics.test.ts`의 퍼널 컨텍스트
  테스트로 회귀 방지한다.
- "첫 …" 단계는 전용 이벤트 + 원본 이벤트 플래그 대칭 패턴을 유지한다.
