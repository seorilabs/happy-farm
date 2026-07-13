-- ============================================================================
-- 수동 수확 콤보 28일 baseline 분석 쿼리 (#348)
-- ----------------------------------------------------------------------------
-- harvest_combo_completed를 GA4 BigQuery export에서 직접 집계한다. 배포 전
-- crop_harvested timestamp로 streak를 재구성하지 않으며, 수동 단일 수확만 포함하는
-- analytics 계약을 그대로 따른다.
--
-- 데이터셋: happy-farm-tycoon.analytics_539626577 (일일 events_YYYYMMDD 샤드)
-- 이벤트 계약: packages/farm-core/src/analytics.ts (harvest_combo_completed)
-- 지표 정의: docs/04-work/content-analytics.md
--
-- 실행 환경: BigQuery 콘솔 GoogleSQL(레거시 SQL 아님). [A]~[E]는 각각
-- BEGIN ... END 블록으로 분리되어 파일 전체 또는 필요한 블록만 실행할 수 있다.
-- 모든 블록은 당일 미완료 export를 제외한 최근 28개 완료일(D-28~D-1)을 기본으로 한다.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- [A] 티어 분포
--   normal/great/legendary별 완료 콤보·사용자·세션·수동 수확 수와 전체 대비 비율.
--   이벤트가 없는 티어도 0행이 아니라 0값 행으로 유지한다.
-- ----------------------------------------------------------------------------
BEGIN
  DECLARE window_days INT64 DEFAULT 28;

  WITH
  combo_events AS (
    SELECT
      user_pseudo_id,
      (SELECT ep.value.int_value FROM UNNEST(event_params) ep WHERE ep.key = 'ga_session_id') AS ga_session_id,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'manual_harvest_count') AS manual_harvest_count,
      (SELECT ep.value.string_value
         FROM UNNEST(event_params) ep WHERE ep.key = 'combo_tier') AS combo_tier,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'duration_ms') AS duration_ms,
      (SELECT COALESCE(CAST(ep.value.int_value AS FLOAT64), ep.value.double_value)
         FROM UNNEST(event_params) ep WHERE ep.key = 'base_revenue_total') AS base_revenue_total,
      (SELECT ep.value.string_value
         FROM UNNEST(event_params) ep WHERE ep.key = 'end_reason') AS end_reason,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'schema_version') AS schema_version
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
      AND event_name = 'harvest_combo_completed'
  ),
  valid_combo_events AS (
    SELECT *
    FROM combo_events
    WHERE schema_version = 1
      AND manual_harvest_count >= 1
      AND combo_tier IN ('normal', 'great', 'legendary')
      AND duration_ms >= 0
      AND base_revenue_total >= 0
      AND end_reason IN ('timeout', 'background', 'prestige', 'reset', 'cloud_restore')
  ),
  tiers AS (
    SELECT 'normal' AS combo_tier, 1 AS tier_order, 1 AS minimum_manual_harvest_count UNION ALL
    SELECT 'great', 2, 5 UNION ALL
    SELECT 'legendary', 3, 10
  ),
  tier_agg AS (
    SELECT
      combo_tier,
      COUNT(*) AS completed_combos,
      COUNT(DISTINCT user_pseudo_id) AS exact_tier_users,
      COUNT(DISTINCT CONCAT(user_pseudo_id, ':', CAST(ga_session_id AS STRING))) AS combo_sessions,
      SUM(manual_harvest_count) AS manual_harvests
    FROM valid_combo_events
    GROUP BY combo_tier
  ),
  tier_reach AS (
    -- Reach is cumulative: a legendary streak also reached great. Keep the
    -- exact final-tier user count above for distribution, but use this cohort
    -- for threshold reach rates that compare with the pre-instrumentation 5+/10+ baseline.
    -- normal(1+) is an intentional 100% cohort anchor whenever valid events exist.
    SELECT
      tiers.combo_tier,
      COUNT(DISTINCT valid_combo_events.user_pseudo_id) AS reached_users
    FROM tiers
    LEFT JOIN valid_combo_events
      ON valid_combo_events.manual_harvest_count >= tiers.minimum_manual_harvest_count
    GROUP BY tiers.combo_tier
  ),
  totals AS (
    SELECT
      COUNT(*) AS completed_combos,
      COUNT(DISTINCT user_pseudo_id) AS active_combo_users,
      SUM(manual_harvest_count) AS manual_harvests
    FROM valid_combo_events
  )

  SELECT
    tiers.combo_tier,
    COALESCE(tier_agg.completed_combos, 0) AS completed_combos,
    COALESCE(tier_agg.exact_tier_users, 0) AS exact_tier_users,
    COALESCE(tier_reach.reached_users, 0) AS reached_users,
    COALESCE(tier_agg.combo_sessions, 0) AS combo_sessions,
    COALESCE(tier_agg.manual_harvests, 0) AS manual_harvests,
    SAFE_DIVIDE(COALESCE(tier_agg.completed_combos, 0), totals.completed_combos) AS combo_share,
    SAFE_DIVIDE(COALESCE(tier_agg.manual_harvests, 0), totals.manual_harvests) AS manual_harvest_share,
    SAFE_DIVIDE(COALESCE(tier_reach.reached_users, 0), totals.active_combo_users) AS user_reach_rate
  FROM tiers
  LEFT JOIN tier_agg USING (combo_tier)
  LEFT JOIN tier_reach USING (combo_tier)
  CROSS JOIN totals
  ORDER BY tiers.tier_order;
END;


-- ----------------------------------------------------------------------------
-- [B] 콤보 길이·지속시간·수익 분포
--   전체(all)와 티어별 평균/median/p90/max를 함께 산출한다. duration_ms는 첫 수확부터
--   마지막 수확까지이며 1회 콤보는 0, 종료 대기 window는 포함하지 않는다.
-- ----------------------------------------------------------------------------
BEGIN
  DECLARE window_days INT64 DEFAULT 28;

  WITH
  combo_events AS (
    SELECT
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'manual_harvest_count') AS manual_harvest_count,
      (SELECT ep.value.string_value
         FROM UNNEST(event_params) ep WHERE ep.key = 'combo_tier') AS combo_tier,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'duration_ms') AS duration_ms,
      (SELECT COALESCE(CAST(ep.value.int_value AS FLOAT64), ep.value.double_value)
         FROM UNNEST(event_params) ep WHERE ep.key = 'base_revenue_total') AS base_revenue_total,
      (SELECT ep.value.string_value
         FROM UNNEST(event_params) ep WHERE ep.key = 'end_reason') AS end_reason,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'schema_version') AS schema_version
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
      AND event_name = 'harvest_combo_completed'
  ),
  valid_combo_events AS (
    SELECT *
    FROM combo_events
    WHERE schema_version = 1
      AND manual_harvest_count >= 1
      AND combo_tier IN ('normal', 'great', 'legendary')
      AND duration_ms >= 0
      AND base_revenue_total >= 0
      AND end_reason IN ('timeout', 'background', 'prestige', 'reset', 'cloud_restore')
  ),
  tier_stats AS (
    SELECT
      combo_tier,
      COUNT(*) AS completed_combos,
      AVG(manual_harvest_count) AS avg_manual_harvest_count,
      APPROX_QUANTILES(manual_harvest_count, 100)[OFFSET(50)] AS median_manual_harvest_count,
      APPROX_QUANTILES(manual_harvest_count, 100)[OFFSET(90)] AS p90_manual_harvest_count,
      MAX(manual_harvest_count) AS max_manual_harvest_count,
      AVG(duration_ms) AS avg_duration_ms,
      APPROX_QUANTILES(duration_ms, 100)[OFFSET(50)] AS median_duration_ms,
      APPROX_QUANTILES(duration_ms, 100)[OFFSET(90)] AS p90_duration_ms,
      MAX(duration_ms) AS max_duration_ms,
      SUM(base_revenue_total) AS base_revenue_total,
      AVG(base_revenue_total) AS avg_base_revenue_per_combo,
      APPROX_QUANTILES(base_revenue_total, 100)[OFFSET(50)] AS median_base_revenue_per_combo,
      APPROX_QUANTILES(base_revenue_total, 100)[OFFSET(90)] AS p90_base_revenue_per_combo,
      SAFE_DIVIDE(SUM(base_revenue_total), SUM(manual_harvest_count)) AS avg_base_revenue_per_manual_harvest
    FROM valid_combo_events
    GROUP BY combo_tier
  ),
  overall_stats AS (
    SELECT
      'all' AS combo_tier,
      COUNT(*) AS completed_combos,
      AVG(manual_harvest_count) AS avg_manual_harvest_count,
      APPROX_QUANTILES(manual_harvest_count, 100)[SAFE_OFFSET(50)] AS median_manual_harvest_count,
      APPROX_QUANTILES(manual_harvest_count, 100)[SAFE_OFFSET(90)] AS p90_manual_harvest_count,
      MAX(manual_harvest_count) AS max_manual_harvest_count,
      AVG(duration_ms) AS avg_duration_ms,
      APPROX_QUANTILES(duration_ms, 100)[SAFE_OFFSET(50)] AS median_duration_ms,
      APPROX_QUANTILES(duration_ms, 100)[SAFE_OFFSET(90)] AS p90_duration_ms,
      MAX(duration_ms) AS max_duration_ms,
      SUM(base_revenue_total) AS base_revenue_total,
      AVG(base_revenue_total) AS avg_base_revenue_per_combo,
      APPROX_QUANTILES(base_revenue_total, 100)[SAFE_OFFSET(50)] AS median_base_revenue_per_combo,
      APPROX_QUANTILES(base_revenue_total, 100)[SAFE_OFFSET(90)] AS p90_base_revenue_per_combo,
      SAFE_DIVIDE(SUM(base_revenue_total), SUM(manual_harvest_count)) AS avg_base_revenue_per_manual_harvest
    FROM valid_combo_events
  ),
  stats AS (
    SELECT * FROM overall_stats
    UNION ALL
    SELECT * FROM tier_stats
  )

  SELECT *
  FROM stats
  ORDER BY CASE combo_tier
    WHEN 'all' THEN 0
    WHEN 'normal' THEN 1
    WHEN 'great' THEN 2
    WHEN 'legendary' THEN 3
    ELSE 4
  END;
END;


-- ----------------------------------------------------------------------------
-- [C] 종료 사유 분포
--   timeout/background/prestige/reset/cloud_restore별 콤보 수·사용자·수확·수익과 비율.
-- ----------------------------------------------------------------------------
BEGIN
  DECLARE window_days INT64 DEFAULT 28;

  WITH
  combo_events AS (
    SELECT
      user_pseudo_id,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'manual_harvest_count') AS manual_harvest_count,
      (SELECT ep.value.string_value
         FROM UNNEST(event_params) ep WHERE ep.key = 'combo_tier') AS combo_tier,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'duration_ms') AS duration_ms,
      (SELECT COALESCE(CAST(ep.value.int_value AS FLOAT64), ep.value.double_value)
         FROM UNNEST(event_params) ep WHERE ep.key = 'base_revenue_total') AS base_revenue_total,
      (SELECT ep.value.string_value
         FROM UNNEST(event_params) ep WHERE ep.key = 'end_reason') AS end_reason,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'schema_version') AS schema_version
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
      AND event_name = 'harvest_combo_completed'
  ),
  valid_combo_events AS (
    SELECT *
    FROM combo_events
    WHERE schema_version = 1
      AND manual_harvest_count >= 1
      AND combo_tier IN ('normal', 'great', 'legendary')
      AND duration_ms >= 0
      AND base_revenue_total >= 0
      AND end_reason IN ('timeout', 'background', 'prestige', 'reset', 'cloud_restore')
  ),
  reasons AS (
    SELECT 'timeout' AS end_reason, 1 AS reason_order UNION ALL
    SELECT 'background', 2 UNION ALL
    SELECT 'prestige', 3 UNION ALL
    SELECT 'reset', 4 UNION ALL
    SELECT 'cloud_restore', 5
  ),
  reason_agg AS (
    SELECT
      end_reason,
      COUNT(*) AS completed_combos,
      COUNT(DISTINCT user_pseudo_id) AS combo_users,
      SUM(manual_harvest_count) AS manual_harvests,
      SUM(base_revenue_total) AS base_revenue_total,
      AVG(manual_harvest_count) AS avg_manual_harvest_count,
      AVG(duration_ms) AS avg_duration_ms
    FROM valid_combo_events
    GROUP BY end_reason
  ),
  totals AS (
    SELECT COUNT(*) AS completed_combos
    FROM valid_combo_events
  )

  SELECT
    reasons.end_reason,
    COALESCE(reason_agg.completed_combos, 0) AS completed_combos,
    COALESCE(reason_agg.combo_users, 0) AS combo_users,
    COALESCE(reason_agg.manual_harvests, 0) AS manual_harvests,
    COALESCE(reason_agg.base_revenue_total, 0) AS base_revenue_total,
    reason_agg.avg_manual_harvest_count,
    reason_agg.avg_duration_ms,
    SAFE_DIVIDE(COALESCE(reason_agg.completed_combos, 0), totals.completed_combos) AS end_reason_share
  FROM reasons
  LEFT JOIN reason_agg USING (end_reason)
  CROSS JOIN totals
  ORDER BY reasons.reason_order;
END;


-- ----------------------------------------------------------------------------
-- [D] 사용자 집중도
--   timestamp 재구성 baseline의 top1/top2 편향과 직접 비교할 수 있도록 수동 수확 수
--   기준 top share와 HHI를 낸다. 사용자 ID 원문은 결과에 노출하지 않는다.
-- ----------------------------------------------------------------------------
BEGIN
  DECLARE window_days INT64 DEFAULT 28;

  WITH
  combo_events AS (
    SELECT
      user_pseudo_id,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'manual_harvest_count') AS manual_harvest_count,
      (SELECT ep.value.string_value
         FROM UNNEST(event_params) ep WHERE ep.key = 'combo_tier') AS combo_tier,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'duration_ms') AS duration_ms,
      (SELECT COALESCE(CAST(ep.value.int_value AS FLOAT64), ep.value.double_value)
         FROM UNNEST(event_params) ep WHERE ep.key = 'base_revenue_total') AS base_revenue_total,
      (SELECT ep.value.string_value
         FROM UNNEST(event_params) ep WHERE ep.key = 'end_reason') AS end_reason,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'schema_version') AS schema_version
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
      AND event_name = 'harvest_combo_completed'
  ),
  valid_combo_events AS (
    SELECT *
    FROM combo_events
    WHERE user_pseudo_id IS NOT NULL
      AND schema_version = 1
      AND manual_harvest_count >= 1
      AND combo_tier IN ('normal', 'great', 'legendary')
      AND duration_ms >= 0
      AND base_revenue_total >= 0
      AND end_reason IN ('timeout', 'background', 'prestige', 'reset', 'cloud_restore')
  ),
  user_agg AS (
    SELECT
      user_pseudo_id,
      COUNT(*) AS completed_combos,
      SUM(manual_harvest_count) AS manual_harvests,
      SUM(base_revenue_total) AS base_revenue_total
    FROM valid_combo_events
    GROUP BY user_pseudo_id
  ),
  ranked AS (
    -- top1/top2 mean exactly the largest one/two users, matching the historical
    -- baseline. ROW_NUMBER keeps that denominator stable; ties have identical
    -- shares and use user_pseudo_id only as a deterministic selection key.
    -- HHI below remains the tie-independent whole-distribution metric.
    SELECT
      *,
      ROW_NUMBER() OVER (ORDER BY manual_harvests DESC, user_pseudo_id) AS harvest_rank,
      ROW_NUMBER() OVER (ORDER BY base_revenue_total DESC, user_pseudo_id) AS revenue_rank,
      COUNT(*) OVER () AS active_users,
      SUM(completed_combos) OVER () AS all_completed_combos,
      SUM(manual_harvests) OVER () AS all_manual_harvests,
      SUM(base_revenue_total) OVER () AS all_base_revenue
    FROM user_agg
  )

  SELECT
    COALESCE(MAX(active_users), 0) AS active_users,
    COALESCE(MAX(all_completed_combos), 0) AS completed_combos,
    COALESCE(MAX(all_manual_harvests), 0) AS manual_harvests,
    COALESCE(MAX(all_base_revenue), 0) AS base_revenue_total,
    APPROX_QUANTILES(ranked.manual_harvests, 100)[SAFE_OFFSET(50)] AS median_manual_harvests_per_user,
    APPROX_QUANTILES(ranked.manual_harvests, 100)[SAFE_OFFSET(90)] AS p90_manual_harvests_per_user,
    SAFE_DIVIDE(SUM(IF(harvest_rank = 1, ranked.manual_harvests, 0)), MAX(all_manual_harvests))
      AS top1_manual_harvest_share,
    SAFE_DIVIDE(SUM(IF(harvest_rank <= 2, ranked.manual_harvests, 0)), MAX(all_manual_harvests))
      AS top2_manual_harvest_share,
    SAFE_DIVIDE(
      SUM(IF(
        harvest_rank <= GREATEST(1, CAST(CEIL(active_users * 0.1) AS INT64)),
        ranked.manual_harvests,
        0
      )),
      MAX(all_manual_harvests)
    ) AS top10pct_manual_harvest_share,
    SAFE_DIVIDE(SUM(IF(revenue_rank = 1, ranked.base_revenue_total, 0)), MAX(all_base_revenue))
      AS top1_base_revenue_share,
    SAFE_DIVIDE(SUM(IF(revenue_rank <= 2, ranked.base_revenue_total, 0)), MAX(all_base_revenue))
      AS top2_base_revenue_share,
    SUM(POW(SAFE_DIVIDE(ranked.manual_harvests, all_manual_harvests), 2)) AS hhi_manual_harvests,
    SUM(POW(SAFE_DIVIDE(ranked.base_revenue_total, all_base_revenue), 2)) AS hhi_base_revenue
  FROM ranked;
END;


-- ----------------------------------------------------------------------------
-- [E] 이벤트 계약 품질
--   필수 6개 파라미터 누락·범위/enum 위반과 schema_version 드리프트를 확인한다.
--   분석 블록 [A]~[D]는 여기서 valid로 판정되는 이벤트만 사용한다.
-- ----------------------------------------------------------------------------
BEGIN
  DECLARE window_days INT64 DEFAULT 28;

  WITH
  combo_events AS (
    SELECT
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'manual_harvest_count') AS manual_harvest_count,
      (SELECT ep.value.string_value
         FROM UNNEST(event_params) ep WHERE ep.key = 'combo_tier') AS combo_tier,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'duration_ms') AS duration_ms,
      (SELECT COALESCE(CAST(ep.value.int_value AS FLOAT64), ep.value.double_value)
         FROM UNNEST(event_params) ep WHERE ep.key = 'base_revenue_total') AS base_revenue_total,
      (SELECT ep.value.string_value
         FROM UNNEST(event_params) ep WHERE ep.key = 'end_reason') AS end_reason,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'schema_version') AS schema_version
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
      AND event_name = 'harvest_combo_completed'
  ),
  classified AS (
    SELECT
      *,
      manual_harvest_count >= 1
        AND combo_tier IN ('normal', 'great', 'legendary')
        AND duration_ms >= 0
        AND base_revenue_total >= 0
        AND end_reason IN ('timeout', 'background', 'prestige', 'reset', 'cloud_restore')
        AND schema_version = 1 AS is_valid
    FROM combo_events
  )

  SELECT
    COUNT(*) AS observed_events,
    COUNT(*) > 0 AS has_data,
    COUNTIF(manual_harvest_count IS NULL) AS missing_manual_harvest_count,
    COUNTIF(combo_tier IS NULL) AS missing_combo_tier,
    COUNTIF(duration_ms IS NULL) AS missing_duration_ms,
    COUNTIF(base_revenue_total IS NULL) AS missing_base_revenue_total,
    COUNTIF(end_reason IS NULL) AS missing_end_reason,
    COUNTIF(schema_version IS NULL) AS missing_schema_version,
    COUNTIF(manual_harvest_count IS NOT NULL AND manual_harvest_count < 1) AS invalid_manual_harvest_count,
    COUNTIF(combo_tier IS NOT NULL AND combo_tier NOT IN ('normal', 'great', 'legendary')) AS invalid_combo_tier,
    COUNTIF(duration_ms IS NOT NULL AND duration_ms < 0) AS invalid_duration_ms,
    COUNTIF(base_revenue_total IS NOT NULL AND base_revenue_total < 0) AS invalid_base_revenue_total,
    COUNTIF(
      end_reason IS NOT NULL
      AND end_reason NOT IN ('timeout', 'background', 'prestige', 'reset', 'cloud_restore')
    ) AS invalid_end_reason,
    COUNTIF(schema_version IS NOT NULL AND schema_version != 1) AS invalid_schema_version,
    COUNTIF(is_valid) AS valid_events,
    -- NULL explicitly means no data; observed_events/has_data let monitors
    -- distinguish an empty export from a 0% valid contract.
    IF(COUNT(*) = 0, NULL, SAFE_DIVIDE(COUNTIF(is_valid), COUNT(*))) AS valid_event_rate
  FROM classified;
END;
