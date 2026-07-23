-- ============================================================================
-- 동물 구매 → 급여 → 산출물 수집 28일 baseline 분석 쿼리 (#349)
-- ----------------------------------------------------------------------------
-- 당일 미완료 export를 제외한 D-28~D-1 daily shard를 사용한다.
-- 데이터셋: happy-farm-tycoon.analytics_539626577
-- 이벤트 계약: packages/farm-core/src/analytics.ts
-- 지표 정의: docs/04-work/content-analytics.md
--
-- [A]~[E]는 독립 결과 블록이다. 파라미터 stable key는 번역하지 않는다.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- [A] 사용자 퍼널: 동물 시트 → 구매 → 급여 → 수집
-- ----------------------------------------------------------------------------
BEGIN
  DECLARE window_days INT64 DEFAULT 28;

  WITH
  source_events AS (
    SELECT event_name, user_pseudo_id
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
      AND event_name IN (
        'animals_screen',
        'animal_purchased',
        'animal_fed',
        'animal_produce_collected'
      )
      AND user_pseudo_id IS NOT NULL
      AND (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
             FROM UNNEST(event_params) ep WHERE ep.key = 'schema_version') = 1
  ),
  steps AS (
    SELECT 'animals_screen' AS event_name, 1 AS step_order UNION ALL
    SELECT 'animal_purchased', 2 UNION ALL
    SELECT 'animal_fed', 3 UNION ALL
    SELECT 'animal_produce_collected', 4
  ),
  step_agg AS (
    SELECT
      event_name,
      COUNT(*) AS events,
      COUNT(DISTINCT user_pseudo_id) AS users
    FROM source_events
    GROUP BY event_name
  ),
  screen AS (
    SELECT COALESCE(MAX(IF(event_name = 'animals_screen', users, NULL)), 0) AS users
    FROM step_agg
  )

  SELECT
    steps.event_name AS funnel_step,
    COALESCE(step_agg.events, 0) AS events,
    COALESCE(step_agg.users, 0) AS users,
    SAFE_DIVIDE(COALESCE(step_agg.users, 0), screen.users) AS screen_user_conversion_rate
  FROM steps
  LEFT JOIN step_agg USING (event_name)
  CROSS JOIN screen
  ORDER BY steps.step_order;
END;


-- ----------------------------------------------------------------------------
-- [B] 수집 빈도·경로: single과 collect_all item event를 비교한다.
-- ----------------------------------------------------------------------------
BEGIN
  DECLARE window_days INT64 DEFAULT 28;

  WITH
  collection_events AS (
    SELECT
      user_pseudo_id,
      (SELECT ep.value.int_value FROM UNNEST(event_params) ep WHERE ep.key = 'ga_session_id') AS ga_session_id,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'collection_mode') AS collection_mode,
      (SELECT COALESCE(CAST(ep.value.int_value AS FLOAT64), ep.value.double_value)
         FROM UNNEST(event_params) ep WHERE ep.key = 'base_revenue') AS base_revenue,
      (SELECT COALESCE(CAST(ep.value.int_value AS FLOAT64), ep.value.double_value)
         FROM UNNEST(event_params) ep WHERE ep.key = 'final_revenue') AS final_revenue,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'ready_wait_ms') AS ready_wait_ms,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'schema_version') AS schema_version
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
      AND event_name = 'animal_produce_collected'
  ),
  valid_events AS (
    SELECT *
    FROM collection_events
    WHERE schema_version = 1
      AND collection_mode IN ('single', 'collect_all')
      AND base_revenue >= 0
      AND final_revenue >= 0
      AND ready_wait_ms >= 0
  ),
  modes AS (
    SELECT 'single' AS collection_mode, 1 AS mode_order UNION ALL
    SELECT 'collect_all', 2
  ),
  mode_agg AS (
    SELECT
      collection_mode,
      COUNT(*) AS collections,
      COUNT(DISTINCT user_pseudo_id) AS users,
      COUNT(DISTINCT CONCAT(user_pseudo_id, ':', CAST(ga_session_id AS STRING))) AS sessions,
      SUM(base_revenue) AS base_revenue,
      SUM(final_revenue) AS final_revenue,
      AVG(ready_wait_ms) AS avg_ready_wait_ms,
      APPROX_QUANTILES(ready_wait_ms, 100)[SAFE_OFFSET(50)] AS median_ready_wait_ms,
      APPROX_QUANTILES(ready_wait_ms, 100)[SAFE_OFFSET(90)] AS p90_ready_wait_ms
    FROM valid_events
    GROUP BY collection_mode
  )

  SELECT
    modes.collection_mode,
    COALESCE(mode_agg.collections, 0) AS collections,
    COALESCE(mode_agg.users, 0) AS users,
    COALESCE(mode_agg.sessions, 0) AS sessions,
    SAFE_DIVIDE(COALESCE(mode_agg.collections, 0), mode_agg.users) AS collections_per_user,
    SAFE_DIVIDE(COALESCE(mode_agg.collections, 0), mode_agg.sessions) AS collections_per_session,
    COALESCE(mode_agg.base_revenue, 0) AS base_revenue,
    COALESCE(mode_agg.final_revenue, 0) AS final_revenue,
    mode_agg.avg_ready_wait_ms,
    mode_agg.median_ready_wait_ms,
    mode_agg.p90_ready_wait_ms
  FROM modes
  LEFT JOIN mode_agg USING (collection_mode)
  ORDER BY modes.mode_order;
END;


-- ----------------------------------------------------------------------------
-- [C] 동물별 분포: stable animal key별 구매·급여·수집량과 수익을 본다.
-- ----------------------------------------------------------------------------
BEGIN
  DECLARE window_days INT64 DEFAULT 28;

  WITH
  animal_events AS (
    SELECT
      event_name,
      user_pseudo_id,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'animal') AS animal,
      (SELECT COALESCE(CAST(ep.value.int_value AS FLOAT64), ep.value.double_value)
         FROM UNNEST(event_params) ep WHERE ep.key = 'base_revenue') AS base_revenue,
      (SELECT COALESCE(CAST(ep.value.int_value AS FLOAT64), ep.value.double_value)
         FROM UNNEST(event_params) ep WHERE ep.key = 'final_revenue') AS final_revenue,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'ready_wait_ms') AS ready_wait_ms,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'schema_version') AS schema_version
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
      AND event_name IN ('animal_purchased', 'animal_fed', 'animal_produce_collected')
  ),
  valid_events AS (
    SELECT *
    FROM animal_events
    WHERE schema_version = 1
      AND animal IS NOT NULL
      AND CASE event_name
        WHEN 'animal_produce_collected' THEN
          base_revenue >= 0 AND final_revenue >= 0 AND ready_wait_ms >= 0
        ELSE TRUE
      END
  )

  SELECT
    animal,
    COUNTIF(event_name = 'animal_purchased') AS purchases,
    COUNT(DISTINCT IF(event_name = 'animal_purchased', user_pseudo_id, NULL)) AS purchasers,
    COUNTIF(event_name = 'animal_fed') AS feeds,
    COUNT(DISTINCT IF(event_name = 'animal_fed', user_pseudo_id, NULL)) AS feeders,
    COUNTIF(event_name = 'animal_produce_collected') AS collections,
    COUNT(DISTINCT IF(event_name = 'animal_produce_collected', user_pseudo_id, NULL)) AS collectors,
    SUM(IF(event_name = 'animal_produce_collected', base_revenue, 0)) AS base_revenue,
    SUM(IF(event_name = 'animal_produce_collected', final_revenue, 0)) AS final_revenue,
    AVG(IF(event_name = 'animal_produce_collected', ready_wait_ms, NULL)) AS avg_ready_wait_ms,
    APPROX_QUANTILES(
      IF(event_name = 'animal_produce_collected', ready_wait_ms, NULL),
      100
    )[SAFE_OFFSET(50)] AS median_ready_wait_ms,
    APPROX_QUANTILES(
      IF(event_name = 'animal_produce_collected', ready_wait_ms, NULL),
      100
    )[SAFE_OFFSET(90)] AS p90_ready_wait_ms
  FROM valid_events
  GROUP BY animal
  ORDER BY collections DESC, animal;
END;


-- ----------------------------------------------------------------------------
-- [D] 사용자 집중도: 수집 횟수 top1·top2·top10% share와 HHI.
-- ----------------------------------------------------------------------------
BEGIN
  DECLARE window_days INT64 DEFAULT 28;

  WITH
  collection_events AS (
    SELECT
      user_pseudo_id,
      (SELECT COALESCE(CAST(ep.value.int_value AS FLOAT64), ep.value.double_value)
         FROM UNNEST(event_params) ep WHERE ep.key = 'final_revenue') AS final_revenue,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'schema_version') AS schema_version
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
      AND event_name = 'animal_produce_collected'
  ),
  user_agg AS (
    SELECT
      user_pseudo_id,
      COUNT(*) AS collections,
      SUM(final_revenue) AS final_revenue
    FROM collection_events
    WHERE schema_version = 1
      AND user_pseudo_id IS NOT NULL
      AND final_revenue >= 0
    GROUP BY user_pseudo_id
  ),
  ranked AS (
    SELECT
      *,
      ROW_NUMBER() OVER (ORDER BY collections DESC, user_pseudo_id) AS collection_rank,
      ROW_NUMBER() OVER (ORDER BY final_revenue DESC, user_pseudo_id) AS revenue_rank,
      COUNT(*) OVER () AS user_count,
      SUM(collections) OVER () AS total_collections,
      SUM(final_revenue) OVER () AS total_revenue
    FROM user_agg
  )

  SELECT
    MAX(user_count) AS users,
    MAX(total_collections) AS collections,
    MAX(total_revenue) AS final_revenue,
    SAFE_DIVIDE(SUM(IF(collection_rank = 1, collections, 0)), MAX(total_collections)) AS collection_top1_share,
    SAFE_DIVIDE(SUM(IF(collection_rank <= 2, collections, 0)), MAX(total_collections)) AS collection_top2_share,
    SAFE_DIVIDE(
      SUM(IF(collection_rank <= CEIL(user_count * 0.1), collections, 0)),
      MAX(total_collections)
    ) AS collection_top10pct_share,
    SUM(POW(SAFE_DIVIDE(collections, total_collections), 2)) AS collection_hhi,
    SAFE_DIVIDE(SUM(IF(revenue_rank = 1, final_revenue, 0)), MAX(total_revenue)) AS revenue_top1_share,
    SAFE_DIVIDE(SUM(IF(revenue_rank <= 2, final_revenue, 0)), MAX(total_revenue)) AS revenue_top2_share,
    SUM(POW(SAFE_DIVIDE(final_revenue, total_revenue), 2)) AS revenue_hhi
  FROM ranked;
END;


-- ----------------------------------------------------------------------------
-- [E] 계약 품질: 필수 파라미터·enum·범위·baseline outcome 위반.
-- ----------------------------------------------------------------------------
BEGIN
  DECLARE window_days INT64 DEFAULT 28;

  WITH
  animal_events AS (
    SELECT
      event_name,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'source') AS source,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'animal') AS animal,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'collection_mode') AS collection_mode,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'owned_count') AS owned_count,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'feeding_count') AS feeding_count,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'ready_count') AS ready_count,
      (SELECT COALESCE(CAST(ep.value.int_value AS FLOAT64), ep.value.double_value)
         FROM UNNEST(event_params) ep WHERE ep.key = 'purchase_cost') AS purchase_cost,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'owned_count_after') AS owned_count_after,
      (SELECT COALESCE(CAST(ep.value.int_value AS FLOAT64), ep.value.double_value)
         FROM UNNEST(event_params) ep WHERE ep.key = 'feed_cost') AS feed_cost,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'produce_timer_ms') AS produce_timer_ms,
      (SELECT COALESCE(CAST(ep.value.int_value AS FLOAT64), ep.value.double_value)
         FROM UNNEST(event_params) ep WHERE ep.key = 'base_revenue') AS base_revenue,
      (SELECT COALESCE(CAST(ep.value.int_value AS FLOAT64), ep.value.double_value)
         FROM UNNEST(event_params) ep WHERE ep.key = 'final_revenue') AS final_revenue,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'is_rare') AS is_rare,
      (SELECT COALESCE(CAST(ep.value.int_value AS FLOAT64), ep.value.double_value)
         FROM UNNEST(event_params) ep WHERE ep.key = 'rare_multiplier') AS rare_multiplier,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'ready_wait_ms') AS ready_wait_ms,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'collected_count') AS collected_count,
      (SELECT COALESCE(CAST(ep.value.int_value AS FLOAT64), ep.value.double_value)
         FROM UNNEST(event_params) ep WHERE ep.key = 'base_revenue_total') AS base_revenue_total,
      (SELECT COALESCE(CAST(ep.value.int_value AS FLOAT64), ep.value.double_value)
         FROM UNNEST(event_params) ep WHERE ep.key = 'final_revenue_total') AS final_revenue_total,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'rare_count') AS rare_count,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'schema_version') AS schema_version
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
      AND event_name IN (
        'animals_screen',
        'animal_purchased',
        'animal_fed',
        'animal_produce_collected',
        'animal_produce_collect_all'
      )
  ),
  validated AS (
    SELECT
      *,
      CASE event_name
        WHEN 'animals_screen' THEN
          source IN ('more', 'welcome_back')
          AND owned_count >= 0 AND feeding_count >= 0 AND ready_count >= 0
        WHEN 'animal_purchased' THEN
          animal IS NOT NULL AND purchase_cost > 0 AND owned_count_after >= 1
        WHEN 'animal_fed' THEN
          animal IS NOT NULL AND feed_cost > 0 AND produce_timer_ms > 0 AND owned_count >= 1
        WHEN 'animal_produce_collected' THEN
          animal IS NOT NULL
          AND collection_mode IN ('single', 'collect_all')
          AND base_revenue >= 0 AND final_revenue = base_revenue
          AND is_rare = 0 AND rare_multiplier = 1 AND ready_wait_ms >= 0
        WHEN 'animal_produce_collect_all' THEN
          collected_count >= 1
          AND base_revenue_total >= 0 AND final_revenue_total = base_revenue_total
          AND rare_count = 0
        ELSE FALSE
      END AS payload_valid
    FROM animal_events
  ),
  event_names AS (
    SELECT 'animals_screen' AS event_name UNION ALL
    SELECT 'animal_purchased' UNION ALL
    SELECT 'animal_fed' UNION ALL
    SELECT 'animal_produce_collected' UNION ALL
    SELECT 'animal_produce_collect_all'
  )

  SELECT
    event_names.event_name,
    COUNT(validated.event_name) AS observed_events,
    COUNTIF(validated.event_name IS NOT NULL AND schema_version IS NULL) AS missing_schema_version_events,
    COUNTIF(schema_version != 1) AS invalid_schema_version_events,
    COUNTIF(validated.event_name IS NOT NULL AND NOT COALESCE(payload_valid, FALSE)) AS invalid_payload_events,
    COUNTIF(schema_version = 1 AND COALESCE(payload_valid, FALSE)) AS valid_events,
    SAFE_DIVIDE(
      COUNTIF(schema_version = 1 AND COALESCE(payload_valid, FALSE)),
      COUNT(validated.event_name)
    ) AS valid_event_rate,
    CASE
      WHEN COUNT(validated.event_name) = 0 THEN 'no_data'
      WHEN COUNTIF(schema_version = 1 AND COALESCE(payload_valid, FALSE)) = 0 THEN 'all_invalid'
      WHEN COUNTIF(schema_version = 1 AND COALESCE(payload_valid, FALSE)) = COUNT(validated.event_name) THEN 'valid'
      ELSE 'partially_invalid'
    END AS quality_status
  FROM event_names
  LEFT JOIN validated USING (event_name)
  GROUP BY event_names.event_name
  ORDER BY event_names.event_name;
END;
