-- ============================================================================
-- 첫 세션 퍼널과 첫날 행동별 복귀 (#606)
-- ----------------------------------------------------------------------------
-- 데이터셋: happy-farm-tycoon.analytics_539626577
-- 이벤트 계약: packages/farm-core/src/analytics.ts
-- 설계: docs/design/2026-11-26-game-ui-first-session/design.md
--
-- 표본 보정
-- ----------------------------------------------------------------------------
-- 1. 스토어 설치만 남긴다(app_info.install_source IN iTunes, com.android.vending).
--    manual_install은 개발 빌드다. release_version은 #604 전까지 항상 0.0.0이라 거를 수 없다.
-- 2. geo.country가 빈 행은 Play 사전 출시 보고서 로보 단말이라 뺀다.
-- 3. 네이티브(iOS, Android)만 본다. AIT(WEB)는 first_open이 없고 engagement_time_msec이 1로
--    고정이라 이 쿼리의 첫날 참여 시간과 복귀 판정을 쓸 수 없다.
-- 4. 복귀(1~3일)를 끝까지 관찰하도록 첫 실행일은 D-4 이전으로 자른다.
-- 5. 비정상 버전을 뺀다. iOS 1.1.4는 2026-10-13~14에 36명이 설치해 21명이 첫 화면 전에 떠났고,
--    Android 1.8.1, 1.8.3은 2026-10-25 하루에 16대가 몰린 옛 버전이다. iOS 1.1.2, 1.2.4는 같은 기간
--    공개 버전(1.11~1.13)과 동떨어진 번호로 1명씩 잡혔다(설계 문서의 76명 기준).
--
-- 표본이 작다(2026-11 기준 60일 76명). 구간 비교는 상관관계이며 인과가 아니다.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- [A] 첫날 행동별 1~3일 내 복귀율
-- ----------------------------------------------------------------------------
BEGIN
  DECLARE window_days INT64 DEFAULT 60;
  DECLARE follow_days INT64 DEFAULT 4;

  WITH
  source_events AS (
    SELECT
      user_pseudo_id,
      event_name,
      PARSE_DATE('%Y%m%d', event_date) AS event_day,
      (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec') AS engagement_msec
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
      AND platform IN ('IOS', 'ANDROID')
      AND app_info.install_source IN ('iTunes', 'com.android.vending')
      AND app_info.version NOT IN ('1.1.2', '1.1.4', '1.2.4', '1.8.1', '1.8.3')
      AND geo.country IS NOT NULL AND geo.country != ''
  ),
  first_open AS (
    SELECT user_pseudo_id, MIN(event_day) AS first_day
    FROM source_events
    WHERE event_name = 'first_open'
    GROUP BY user_pseudo_id
    HAVING MIN(event_day) <= DATE_SUB(CURRENT_DATE(), INTERVAL follow_days DAY)
  ),
  per_user AS (
    SELECT
      e.user_pseudo_id,
      MAX(IF(e.event_day = f.first_day AND e.event_name = 'onboarding_complete', 1, 0)) AS d0_onboarding_complete,
      MAX(IF(e.event_day = f.first_day AND e.event_name = 'plot_unlocked', 1, 0)) AS d0_plot_unlocked,
      MAX(IF(e.event_day = f.first_day AND e.event_name = 'upgrade_purchased', 1, 0)) AS d0_upgrade_purchased,
      MAX(IF(e.event_day = f.first_day
             AND e.event_name IN ('missions_screen', 'production_screen', 'animals_screen', 'cooking_screen', 'collection_screen'), 1, 0)) AS d0_meta_opened,
      MAX(IF(e.event_day = f.first_day AND e.event_name = 'interstitial_shown', 1, 0)) AS d0_interstitial_shown,
      MAX(IF(DATE_DIFF(e.event_day, f.first_day, DAY) BETWEEN 1 AND 3, 1, 0)) AS returned_d1_3,
      SUM(IF(e.event_day = f.first_day, e.engagement_msec, 0)) / 1000 AS d0_engaged_sec
    FROM source_events e
    JOIN first_open f USING (user_pseudo_id)
    GROUP BY e.user_pseudo_id
  ),
  segments AS (
    SELECT 'all' AS segment, 1 AS value, * FROM per_user
    UNION ALL SELECT 'd0_onboarding_complete', d0_onboarding_complete, * FROM per_user
    UNION ALL SELECT 'd0_plot_unlocked', d0_plot_unlocked, * FROM per_user
    UNION ALL SELECT 'd0_upgrade_purchased', d0_upgrade_purchased, * FROM per_user
    UNION ALL SELECT 'd0_meta_opened', d0_meta_opened, * FROM per_user
    UNION ALL SELECT 'd0_interstitial_shown', d0_interstitial_shown, * FROM per_user
  )
  SELECT
    segment,
    value,
    COUNT(*) AS users,
    SUM(returned_d1_3) AS returned_users,
    ROUND(100 * AVG(returned_d1_3), 1) AS returned_pct,
    ROUND(APPROX_QUANTILES(d0_engaged_sec, 2)[OFFSET(1)]) AS median_d0_engaged_sec
  FROM segments
  GROUP BY segment, value
  ORDER BY segment, value DESC;
END;


-- ----------------------------------------------------------------------------
-- [B] 첫날 온보딩을 끝내지 못한 사용자가 멈춘 단계
-- ----------------------------------------------------------------------------
BEGIN
  DECLARE window_days INT64 DEFAULT 60;

  WITH
  source_events AS (
    SELECT
      user_pseudo_id,
      event_name,
      PARSE_DATE('%Y%m%d', event_date) AS event_day,
      (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'step') AS step
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
      AND platform IN ('IOS', 'ANDROID')
      AND app_info.install_source IN ('iTunes', 'com.android.vending')
      AND app_info.version NOT IN ('1.1.2', '1.1.4', '1.2.4', '1.8.1', '1.8.3')
      AND geo.country IS NOT NULL AND geo.country != ''
  ),
  first_open AS (
    SELECT user_pseudo_id, MIN(event_day) AS first_day
    FROM source_events
    WHERE event_name = 'first_open'
    GROUP BY user_pseudo_id
  ),
  per_user AS (
    SELECT
      e.user_pseudo_id,
      MAX(IF(e.event_name = 'game_start', 1, 0)) AS started,
      MAX(IF(e.event_name = 'onboarding_stall' AND e.step = 'harvest', 1, 0)) AS stalled_harvest,
      MAX(IF(e.event_name = 'onboarding_skip', 1, 0)) AS skipped,
      MAX(IF(e.event_name = 'first_meaningful_harvest', 1, 0)) AS harvested,
      MAX(IF(e.event_name = 'onboarding_complete', 1, 0)) AS completed
    FROM source_events e
    JOIN first_open f USING (user_pseudo_id)
    WHERE e.event_day = f.first_day
    GROUP BY e.user_pseudo_id
  )
  SELECT
    CASE
      WHEN started = 0 THEN '1_left_at_title'
      WHEN harvested = 0 AND stalled_harvest = 1 THEN '2_stalled_before_first_harvest'
      WHEN harvested = 0 THEN '3_left_before_first_harvest'
      WHEN skipped = 1 THEN '4_skipped'
      ELSE '5_left_at_reward_step'
    END AS stage,
    COUNT(*) AS users
  FROM per_user
  WHERE completed = 0
  GROUP BY stage
  ORDER BY stage;
END;


-- ----------------------------------------------------------------------------
-- [C] 시트 진입 경로와 체류(#606 계측, 개편 뒤 비교용)
-- ----------------------------------------------------------------------------
BEGIN
  DECLARE window_days INT64 DEFAULT 28;

  WITH
  sheet_events AS (
    SELECT
      user_pseudo_id,
      event_name,
      (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'sheet') AS sheet,
      (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'source') AS source,
      (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'dwell_ms') AS dwell_ms
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
      AND event_name IN ('sheet_opened', 'sheet_closed')
      AND (platform = 'WEB' OR (geo.country IS NOT NULL AND geo.country != ''))
  ),
  opens AS (
    SELECT sheet, source, COUNT(DISTINCT user_pseudo_id) AS opened_users, COUNT(*) AS opens
    FROM sheet_events
    WHERE event_name = 'sheet_opened'
    GROUP BY sheet, source
  ),
  -- sheet_closed에는 source가 없으므로 체류는 시트 단위로만 잰다.
  dwell AS (
    SELECT sheet, APPROX_QUANTILES(dwell_ms, 2)[OFFSET(1)] AS median_dwell_ms, COUNT(*) AS closes
    FROM sheet_events
    WHERE event_name = 'sheet_closed' AND dwell_ms IS NOT NULL
    GROUP BY sheet
  )
  SELECT o.sheet, o.source, o.opened_users, o.opens, d.closes, d.median_dwell_ms
  FROM opens o
  LEFT JOIN dwell d USING (sheet)
  ORDER BY o.opens DESC;
END;
