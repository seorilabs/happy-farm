-- ============================================================================
-- 콘텐츠(작물·구역) 세부 지표 정기 리포트 쿼리
-- ----------------------------------------------------------------------------
-- happy-farm 개별 콘텐츠 소비를 GA4 BigQuery export에서 작물/구역 단위로 집계한다.
-- 지표 정의는 docs/04-work/content-analytics.md를 단일 출처로 따른다.
--
-- 데이터셋: happy-farm-tycoon.analytics_539626577 (일일 events_YYYYMMDD 샤드)
-- 이벤트 계약: packages/farm-core/src/analytics.ts
--   (crop_planted / crop_harvested / crop_ready_summary / legacy crop_ready / seed_selected /
--    area_unlock_clicked / area_unlocked / crop_of_the_day_harvested)
-- 콘텐츠 키: packages/farm-core/src/balance.json (crops[].key, areas[].key)
--
-- 실행 환경: BigQuery 콘솔 GoogleSQL(레거시 SQL 아님). 두 쿼리 [A]/[B]는 각각
--   BEGIN ... END 스크립트 블록으로 변수 스코프를 분리해, 파일 전체를 한 번에
--   실행하든 블록을 개별 실행하든 DECLARE 변수 충돌 없이 동작한다.
-- 기간은 각 블록의 window_days(일)로 조절한다. 기본 [A]=28, [B]=28.
-- backoffice 수집기(content-metrics-collect)는 이 정의를 코드로 구현한다.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- [A] 일자 × 작물(crop) 일별 지표
--   심기/수확/성장완료/씨앗선택 카운트, 매출 합계, 수확 고유 사용자, 첫 수확·오늘의
--   작물 수확 수와 파생율(심기→수확 전환율, 수확당 평균 매출)을 함께 낸다.
--   NOTE: 해당 (일자×작물) 이벤트가 있는 행만 산출한다(0 채움 아님).
-- ----------------------------------------------------------------------------
BEGIN
  DECLARE window_days INT64 DEFAULT 28;

  WITH
  -- 콘텐츠 이벤트만 추출하고 event_params에서 crop/area/revenue/ready-count/first-flag를 평탄화.
  content_events AS (
    SELECT
      PARSE_DATE('%Y%m%d', event_date) AS day,
      event_name,
      user_pseudo_id,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'crop') AS crop,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'area') AS area,
      (SELECT COALESCE(ep.value.double_value, ep.value.int_value)
         FROM UNNEST(event_params) ep WHERE ep.key = 'revenue') AS revenue,
      (SELECT COALESCE(ep.value.int_value, CAST(ep.value.double_value AS INT64))
         FROM UNNEST(event_params) ep WHERE ep.key = 'ready_count') AS ready_count,
      (SELECT ep.value.int_value FROM UNNEST(event_params) ep WHERE ep.key = 'is_first_crop_harvest') AS is_first_crop_harvest
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
      AND event_name IN (
        'seed_selected',
        'first_seed_selected',
        'crop_planted',
        'crop_ready_summary',
        'crop_ready',
        'crop_harvested',
        'crop_of_the_day_harvested'
      )
  ),

  agg AS (
    SELECT
      day,
      crop,
      COUNTIF(event_name = 'crop_planted')  AS planted,
      -- 신규 summary는 ready_count 합계, 배포 전 legacy crop_ready는 이벤트당 1건.
      SUM(
        CASE
          WHEN event_name = 'crop_ready_summary' THEN COALESCE(ready_count, 0)
          WHEN event_name = 'crop_ready' THEN 1
          ELSE 0
        END
      ) AS ready,
      COUNTIF(event_name = 'crop_harvested') AS harvested,
      COUNTIF(event_name IN ('seed_selected', 'first_seed_selected')) AS seed_selected,
      COUNTIF(event_name = 'crop_harvested' AND is_first_crop_harvest = 1) AS first_harvests,
      COUNTIF(event_name = 'crop_of_the_day_harvested') AS cotd_harvests,
      COUNT(DISTINCT IF(event_name = 'crop_harvested', user_pseudo_id, NULL)) AS harvesters,
      SUM(IF(event_name = 'crop_harvested', COALESCE(revenue, 0), 0)) AS revenue
    FROM content_events
    WHERE crop IS NOT NULL
    GROUP BY day, crop
  )

  SELECT
    day,
    crop,
    planted,
    ready,
    harvested,
    seed_selected,
    first_harvests,
    cotd_harvests,
    harvesters,
    revenue,
    -- 심기→수확 전환율 = 수확 / 심기
    SAFE_DIVIDE(harvested, planted)    AS plant_to_harvest_rate,
    -- 수확당 평균 매출 = 매출 / 수확
    SAFE_DIVIDE(revenue, harvested)    AS avg_revenue_per_harvest
  FROM agg
  ORDER BY day DESC, revenue DESC, crop;
END;


-- ----------------------------------------------------------------------------
-- [B] 일자 × 구역(area) 일별 지표
--   언락 시도/완료, 언락 비용 합계, 구역 내 심기/수확 카운트와 언락 전환율.
--   area_unlock_clicked/area_unlocked는 area 파라미터를, crop_planted/crop_harvested는
--   같은 area 파라미터를 공유하므로 하나의 스캔에서 area 단위로 합산한다.
-- ----------------------------------------------------------------------------
BEGIN
  DECLARE window_days INT64 DEFAULT 28;

  WITH
  area_events AS (
    SELECT
      PARSE_DATE('%Y%m%d', event_date) AS day,
      event_name,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'area') AS area,
      (SELECT COALESCE(ep.value.double_value, ep.value.int_value)
         FROM UNNEST(event_params) ep WHERE ep.key = 'cost') AS cost
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
      AND event_name IN (
        'area_unlock_clicked',
        'area_unlocked',
        'crop_planted',
        'crop_harvested'
      )
  ),

  agg AS (
    SELECT
      day,
      area,
      COUNTIF(event_name = 'area_unlock_clicked') AS unlock_clicked,
      COUNTIF(event_name = 'area_unlocked')       AS unlocked,
      COUNTIF(event_name = 'crop_planted')        AS planted,
      COUNTIF(event_name = 'crop_harvested')      AS harvested,
      SUM(IF(event_name = 'area_unlocked', COALESCE(cost, 0), 0)) AS unlock_cost_sum
    FROM area_events
    WHERE area IS NOT NULL
    GROUP BY day, area
  )

  SELECT
    day,
    area,
    unlock_clicked,
    unlocked,
    planted,
    harvested,
    unlock_cost_sum,
    -- 구역 언락 전환율 = 언락 완료 / 언락 시도
    SAFE_DIVIDE(unlocked, unlock_clicked) AS unlock_conversion
  FROM agg
  ORDER BY day DESC, area;
END;
