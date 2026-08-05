-- ============================================================================
-- placement × reward_kind 보상형 광고 지표
-- ----------------------------------------------------------------------------
-- - 기존 impression/click/complete/fail 카운트를 유지한다.
-- - 신규 attempt_id가 있는 빌드는 클릭→단일 terminal(completed/failed)을
--   고유 attempt 기준으로 연결해 completion/terminal gap을 계산한다.
-- - failure_family가 없는 구버전 reason은 코드/문구를 정규화해 포함한다.
-- - attempt_id는 GA4 custom dimension으로 등록하지 않고 BigQuery raw join에만 쓴다.
-- ============================================================================

-- [A] 일자 × placement × reward_kind 시계열
BEGIN
  DECLARE window_days INT64 DEFAULT 28;

  WITH
  extracted AS (
    SELECT
      PARSE_DATE('%Y%m%d', event_date) AS day,
      user_pseudo_id,
      event_name,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'placement') AS placement,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'attempt_id') AS attempt_id,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'reward_kind') AS raw_reward_kind,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'reason') AS reason,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'failure_family') AS raw_failure_family,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64), SAFE_CAST(ep.value.string_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'ad_ready') AS ad_ready,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64), SAFE_CAST(ep.value.string_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'eligible') AS eligible
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
      AND event_name IN (
        'ad_reward_impression', 'ad_reward_click', 'ad_reward_completed',
        'ad_reward_failed', 'ad_limit_blocked'
      )
  ),
  normalized AS (
    SELECT
      * EXCEPT(raw_reward_kind, raw_failure_family),
      CASE
        WHEN NULLIF(raw_reward_kind, '') IS NOT NULL THEN
          CASE LOWER(raw_reward_kind)
            WHEN 'landmark_material' THEN 'festival_delivery_points'
            WHEN 'festival_delivery_point' THEN 'festival_delivery_points'
            WHEN 'festival_delivery_points' THEN 'festival_delivery_points'
            WHEN 'bonus_spin' THEN 'wheel_bonus_spin'
            WHEN 'wheel_bonus_spin' THEN 'wheel_bonus_spin'
            WHEN 'harvest_bonus' THEN 'harvest_boost'
            WHEN 'offline_gold' THEN 'offline_gold_multiplier'
            WHEN 'cooking_speed' THEN 'cooking_speed_up'
            ELSE LOWER(raw_reward_kind)
          END
        ELSE CASE placement
          WHEN 'shop_gold_reward' THEN 'gold'
          WHEN 'shop_plot_discount' THEN 'plot_discount'
          WHEN 'growth_ad_sheet' THEN 'growth_skip'
          WHEN 'harvest_bonus_sheet' THEN 'harvest_boost'
          WHEN 'return_offline_bonus' THEN 'offline_gold_multiplier'
          WHEN 'wheel_bonus_spin' THEN 'wheel_bonus_spin'
          WHEN 'cooking_speed_up' THEN 'cooking_speed_up'
          ELSE 'legacy_unspecified'
        END
      END AS reward_kind,
      CASE
        WHEN event_name != 'ad_reward_failed' THEN NULL
        WHEN NULLIF(raw_failure_family, '') IS NOT NULL THEN raw_failure_family
        WHEN REGEXP_CONTAINS(LOWER(COALESCE(reason, '')), r'(not[ _-]?ready|1006|준비되지|준비되어 있지)') THEN 'not_ready'
        WHEN REGEXP_CONTAINS(LOWER(COALESCE(reason, '')), r'(no[ _-]?fill|error_code_no_fill|(^|[^0-9])3\s*:)') THEN 'no_fill'
        WHEN REGEXP_CONTAINS(LOWER(COALESCE(reason, '')), r'(network|offline|connection|네트워크)') THEN 'network'
        WHEN REGEXP_CONTAINS(LOWER(COALESCE(reason, '')), r'(timeout|timed out)') THEN 'timeout'
        WHEN REGEXP_CONTAINS(LOWER(COALESCE(reason, '')), r'(unsupported|not supported|미지원)') THEN 'unsupported'
        WHEN REGEXP_CONTAINS(LOWER(COALESCE(reason, '')), r'(dismissed|cancelled|canceled)') THEN 'dismissed'
        ELSE 'sdk_error'
      END AS failure_family,
      IF(attempt_id IS NULL OR attempt_id = '', NULL, CONCAT(user_pseudo_id, ':', attempt_id)) AS attempt_key
    FROM extracted
    WHERE placement IS NOT NULL
  ),
  attempts AS (
    SELECT
      attempt_key,
      placement,
      COALESCE(
        MAX(IF(event_name = 'ad_reward_click', reward_kind, NULL)),
        MAX(reward_kind)
      ) AS reward_kind,
      MIN(IF(event_name = 'ad_reward_click', day, NULL)) AS click_day,
      COUNTIF(event_name = 'ad_reward_click') > 0 AS has_click,
      COUNTIF(event_name = 'ad_reward_completed') > 0 AS has_completed,
      COUNTIF(event_name IN ('ad_reward_completed', 'ad_reward_failed')) > 0 AS has_terminal
    FROM normalized
    WHERE attempt_key IS NOT NULL
    GROUP BY attempt_key, placement
  ),
  attempt_agg AS (
    SELECT
      click_day AS day,
      placement,
      reward_kind,
      COUNT(*) AS identified_attempts,
      COUNTIF(has_completed) AS completed_attempts,
      COUNTIF(has_terminal) AS terminal_attempts
    FROM attempts
    WHERE has_click AND click_day IS NOT NULL
    GROUP BY day, placement, reward_kind
  ),
  daily_dau AS (
    SELECT PARSE_DATE('%Y%m%d', event_date) AS day, COUNT(DISTINCT user_pseudo_id) AS dau
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    GROUP BY day
  ),
  placement_ecpm AS (
    SELECT 'shop_gold_reward' AS placement, 0.0 AS ecpm_usd UNION ALL
    SELECT 'shop_plot_discount', 0.0 UNION ALL
    SELECT 'growth_ad_sheet', 0.0 UNION ALL
    SELECT 'harvest_bonus_sheet', 0.0 UNION ALL
    SELECT 'return_offline_bonus', 0.0 UNION ALL
    SELECT 'wheel_bonus_spin', 0.0 UNION ALL
    SELECT 'cooking_speed_up', 0.0
  ),
  agg AS (
    SELECT
      day,
      placement,
      reward_kind,
      COUNTIF(event_name = 'ad_reward_impression') AS impressions,
      COUNTIF(event_name = 'ad_reward_click') AS clicks,
      COUNTIF(event_name = 'ad_reward_click' AND ad_ready IS NOT NULL) AS readiness_measured_clicks,
      COUNTIF(event_name = 'ad_reward_click' AND ad_ready = 1) AS ready_clicks,
      COUNTIF(event_name = 'ad_reward_click' AND ad_ready = 1 AND eligible = 1) AS actionable_clicks,
      COUNTIF(event_name = 'ad_reward_completed') AS completes,
      COUNTIF(event_name = 'ad_reward_failed') AS fails,
      COUNTIF(event_name = 'ad_limit_blocked') AS blocked,
      COUNTIF(event_name = 'ad_reward_impression' AND ad_ready IS NOT NULL) AS readiness_measured_impressions,
      COUNTIF(event_name = 'ad_reward_impression' AND ad_ready = 1) AS ready_impressions,
      COUNTIF(event_name = 'ad_reward_impression' AND eligible = 1) AS eligible_impressions,
      COUNTIF(event_name = 'ad_reward_impression' AND ad_ready = 1 AND eligible = 1) AS actionable_impressions,
      COUNTIF(event_name = 'ad_reward_failed' AND failure_family = 'not_ready') AS fails_not_ready,
      COUNTIF(event_name = 'ad_reward_failed' AND failure_family = 'no_fill') AS fails_no_fill,
      COUNTIF(event_name = 'ad_reward_failed' AND failure_family = 'network') AS fails_network,
      COUNTIF(event_name = 'ad_reward_failed' AND failure_family = 'timeout') AS fails_timeout,
      COUNTIF(event_name = 'ad_reward_failed' AND failure_family = 'unsupported') AS fails_unsupported,
      COUNTIF(event_name = 'ad_reward_failed' AND failure_family = 'dismissed') AS fails_dismissed,
      COUNTIF(event_name = 'ad_reward_failed' AND failure_family = 'sdk_error') AS fails_sdk_error
    FROM normalized
    GROUP BY day, placement, reward_kind
  ),
  metrics AS (
    SELECT
      agg.*,
      d.dau,
      COALESCE(a.identified_attempts, 0) AS identified_attempts,
      COALESCE(a.completed_attempts, 0) AS completed_attempts,
      COALESCE(a.terminal_attempts, 0) AS terminal_attempts,
      (agg.completes * COALESCE(e.ecpm_usd, 0)) / 1000 AS est_revenue_usd
    FROM agg
    JOIN daily_dau d USING (day)
    LEFT JOIN placement_ecpm e USING (placement)
    LEFT JOIN attempt_agg a USING (day, placement, reward_kind)
  )
  SELECT
    *,
    SAFE_DIVIDE(clicks, impressions) AS ctr,
    SAFE_DIVIDE(completes, clicks) AS completion_rate,
    SAFE_DIVIDE(fails, clicks) AS fail_rate,
    SAFE_DIVIDE(ready_clicks, readiness_measured_clicks) AS fill_approx,
    SAFE_DIVIDE(blocked, impressions + blocked) AS block_rate,
    SAFE_DIVIDE(ready_impressions, readiness_measured_impressions) AS ready_rate,
    SAFE_DIVIDE(eligible_impressions, impressions) AS eligible_rate,
    SAFE_DIVIDE(actionable_clicks, actionable_impressions) AS actionable_ctr,
    SAFE_DIVIDE(identified_attempts, clicks) AS attempt_id_coverage,
    SAFE_DIVIDE(completed_attempts, identified_attempts) AS attempt_completion_rate,
    GREATEST(identified_attempts - terminal_attempts, 0) AS terminal_gap,
    SAFE_DIVIDE(est_revenue_usd, dau) AS arpdau_usd
  FROM metrics
  ORDER BY day DESC, placement, reward_kind;
END;

-- [B] 기간 롤업 × placement × reward_kind
BEGIN
  DECLARE window_days INT64 DEFAULT 7;

  WITH
  extracted AS (
    SELECT
      user_pseudo_id,
      event_name,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'placement') AS placement,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'attempt_id') AS attempt_id,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'reward_kind') AS raw_reward_kind,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'reason') AS reason,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'failure_family') AS raw_failure_family,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64), SAFE_CAST(ep.value.string_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'ad_ready') AS ad_ready,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64), SAFE_CAST(ep.value.string_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'eligible') AS eligible
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
      AND event_name IN (
        'ad_reward_impression', 'ad_reward_click', 'ad_reward_completed',
        'ad_reward_failed', 'ad_limit_blocked'
      )
  ),
  normalized AS (
    SELECT
      * EXCEPT(raw_reward_kind, raw_failure_family),
      CASE
        WHEN NULLIF(raw_reward_kind, '') IS NOT NULL THEN
          CASE LOWER(raw_reward_kind)
            WHEN 'landmark_material' THEN 'festival_delivery_points'
            WHEN 'festival_delivery_point' THEN 'festival_delivery_points'
            WHEN 'festival_delivery_points' THEN 'festival_delivery_points'
            WHEN 'bonus_spin' THEN 'wheel_bonus_spin'
            WHEN 'wheel_bonus_spin' THEN 'wheel_bonus_spin'
            WHEN 'harvest_bonus' THEN 'harvest_boost'
            WHEN 'offline_gold' THEN 'offline_gold_multiplier'
            WHEN 'cooking_speed' THEN 'cooking_speed_up'
            ELSE LOWER(raw_reward_kind)
          END
        ELSE CASE placement
          WHEN 'shop_gold_reward' THEN 'gold'
          WHEN 'shop_plot_discount' THEN 'plot_discount'
          WHEN 'growth_ad_sheet' THEN 'growth_skip'
          WHEN 'harvest_bonus_sheet' THEN 'harvest_boost'
          WHEN 'return_offline_bonus' THEN 'offline_gold_multiplier'
          WHEN 'wheel_bonus_spin' THEN 'wheel_bonus_spin'
          WHEN 'cooking_speed_up' THEN 'cooking_speed_up'
          ELSE 'legacy_unspecified'
        END
      END AS reward_kind,
      CASE
        WHEN event_name != 'ad_reward_failed' THEN NULL
        WHEN NULLIF(raw_failure_family, '') IS NOT NULL THEN raw_failure_family
        WHEN REGEXP_CONTAINS(LOWER(COALESCE(reason, '')), r'(not[ _-]?ready|1006|준비되지|준비되어 있지)') THEN 'not_ready'
        WHEN REGEXP_CONTAINS(LOWER(COALESCE(reason, '')), r'(no[ _-]?fill|error_code_no_fill|(^|[^0-9])3\s*:)') THEN 'no_fill'
        WHEN REGEXP_CONTAINS(LOWER(COALESCE(reason, '')), r'(network|offline|connection|네트워크)') THEN 'network'
        WHEN REGEXP_CONTAINS(LOWER(COALESCE(reason, '')), r'(timeout|timed out)') THEN 'timeout'
        WHEN REGEXP_CONTAINS(LOWER(COALESCE(reason, '')), r'(unsupported|not supported|미지원)') THEN 'unsupported'
        WHEN REGEXP_CONTAINS(LOWER(COALESCE(reason, '')), r'(dismissed|cancelled|canceled)') THEN 'dismissed'
        ELSE 'sdk_error'
      END AS failure_family,
      IF(attempt_id IS NULL OR attempt_id = '', NULL, CONCAT(user_pseudo_id, ':', attempt_id)) AS attempt_key
    FROM extracted
    WHERE placement IS NOT NULL
  ),
  attempts AS (
    SELECT
      attempt_key,
      placement,
      COALESCE(
        MAX(IF(event_name = 'ad_reward_click', reward_kind, NULL)),
        MAX(reward_kind)
      ) AS reward_kind,
      COUNTIF(event_name = 'ad_reward_click') > 0 AS has_click,
      COUNTIF(event_name = 'ad_reward_completed') > 0 AS has_completed,
      COUNTIF(event_name IN ('ad_reward_completed', 'ad_reward_failed')) > 0 AS has_terminal
    FROM normalized
    WHERE attempt_key IS NOT NULL
    GROUP BY attempt_key, placement
  ),
  attempt_agg AS (
    SELECT
      placement,
      reward_kind,
      COUNT(*) AS identified_attempts,
      COUNTIF(has_completed) AS completed_attempts,
      COUNTIF(has_terminal) AS terminal_attempts
    FROM attempts
    WHERE has_click
    GROUP BY placement, reward_kind
  ),
  avg_dau AS (
    SELECT AVG(dau) AS value FROM (
      SELECT COUNT(DISTINCT user_pseudo_id) AS dau
      FROM `happy-farm-tycoon.analytics_539626577.events_*`
      WHERE _TABLE_SUFFIX
          BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
              AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
      GROUP BY event_date
    )
  ),
  placement_ecpm AS (
    SELECT 'shop_gold_reward' AS placement, 0.0 AS ecpm_usd UNION ALL
    SELECT 'shop_plot_discount', 0.0 UNION ALL
    SELECT 'growth_ad_sheet', 0.0 UNION ALL
    SELECT 'harvest_bonus_sheet', 0.0 UNION ALL
    SELECT 'return_offline_bonus', 0.0 UNION ALL
    SELECT 'wheel_bonus_spin', 0.0 UNION ALL
    SELECT 'cooking_speed_up', 0.0
  ),
  agg AS (
    SELECT
      placement,
      reward_kind,
      COUNTIF(event_name = 'ad_reward_impression') AS impressions,
      COUNTIF(event_name = 'ad_reward_click') AS clicks,
      COUNTIF(event_name = 'ad_reward_click' AND ad_ready IS NOT NULL) AS readiness_measured_clicks,
      COUNTIF(event_name = 'ad_reward_click' AND ad_ready = 1) AS ready_clicks,
      COUNTIF(event_name = 'ad_reward_click' AND ad_ready = 1 AND eligible = 1) AS actionable_clicks,
      COUNTIF(event_name = 'ad_reward_completed') AS completes,
      COUNTIF(event_name = 'ad_reward_failed') AS fails,
      COUNTIF(event_name = 'ad_limit_blocked') AS blocked,
      COUNTIF(event_name = 'ad_reward_impression' AND ad_ready IS NOT NULL) AS readiness_measured_impressions,
      COUNTIF(event_name = 'ad_reward_impression' AND ad_ready = 1) AS ready_impressions,
      COUNTIF(event_name = 'ad_reward_impression' AND eligible = 1) AS eligible_impressions,
      COUNTIF(event_name = 'ad_reward_impression' AND ad_ready = 1 AND eligible = 1) AS actionable_impressions,
      COUNTIF(event_name = 'ad_reward_failed' AND failure_family = 'not_ready') AS fails_not_ready,
      COUNTIF(event_name = 'ad_reward_failed' AND failure_family = 'no_fill') AS fails_no_fill,
      COUNTIF(event_name = 'ad_reward_failed' AND failure_family = 'network') AS fails_network,
      COUNTIF(event_name = 'ad_reward_failed' AND failure_family = 'timeout') AS fails_timeout,
      COUNTIF(event_name = 'ad_reward_failed' AND failure_family = 'unsupported') AS fails_unsupported,
      COUNTIF(event_name = 'ad_reward_failed' AND failure_family = 'dismissed') AS fails_dismissed,
      COUNTIF(event_name = 'ad_reward_failed' AND failure_family = 'sdk_error') AS fails_sdk_error
    FROM normalized
    GROUP BY placement, reward_kind
  ),
  metrics AS (
    SELECT
      agg.*,
      COALESCE(a.identified_attempts, 0) AS identified_attempts,
      COALESCE(a.completed_attempts, 0) AS completed_attempts,
      COALESCE(a.terminal_attempts, 0) AS terminal_attempts,
      (agg.completes * COALESCE(e.ecpm_usd, 0)) / 1000 AS est_revenue_usd
    FROM agg
    LEFT JOIN placement_ecpm e USING (placement)
    LEFT JOIN attempt_agg a USING (placement, reward_kind)
  )
  SELECT
    *,
    SAFE_DIVIDE(clicks, impressions) AS ctr,
    SAFE_DIVIDE(completes, clicks) AS completion_rate,
    SAFE_DIVIDE(fails, clicks) AS fail_rate,
    SAFE_DIVIDE(ready_clicks, readiness_measured_clicks) AS fill_approx,
    SAFE_DIVIDE(blocked, impressions + blocked) AS block_rate,
    SAFE_DIVIDE(ready_impressions, readiness_measured_impressions) AS ready_rate,
    SAFE_DIVIDE(eligible_impressions, impressions) AS eligible_rate,
    SAFE_DIVIDE(actionable_clicks, actionable_impressions) AS actionable_ctr,
    SAFE_DIVIDE(identified_attempts, clicks) AS attempt_id_coverage,
    SAFE_DIVIDE(completed_attempts, identified_attempts) AS attempt_completion_rate,
    GREATEST(identified_attempts - terminal_attempts, 0) AS terminal_gap,
    SAFE_DIVIDE(est_revenue_usd, (SELECT value FROM avg_dau) * window_days) AS arpdau_usd
  FROM metrics
  ORDER BY est_revenue_usd DESC, placement, reward_kind;
END;
