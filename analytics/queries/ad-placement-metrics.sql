-- ============================================================================
-- placement별 광고 지표 정기 리포트 쿼리 (이슈 [M7] #116)
-- ----------------------------------------------------------------------------
-- happy-farm 보상형 광고 퍼널을 GA4 BigQuery export에서 placement 단위로 집계한다.
-- 지표 정의는 docs/04-work/ad-analytics.md, 리포트 운영 기준은
-- docs/04-work/ad-placement-report.md를 단일 출처로 따른다.
--
-- 데이터셋: happy-farm-tycoon.analytics_539626577 (일일 events_YYYYMMDD 샤드)
-- 이벤트 계약: packages/farm-core/src/analytics.ts (ad_reward_*, ad_limit_blocked)
-- placement 매핑: packages/farm-core/src/ads.ts (REWARDED_AD_PLACEMENT_BY_TYPE)
--
-- 실행 환경: BigQuery 콘솔 GoogleSQL(레거시 SQL 아님). 두 쿼리 [A]/[B]는 각각
--   BEGIN ... END 스크립트 블록으로 변수 스코프를 분리해, 파일 전체를 한 번에
--   실행하든 블록을 개별 실행하든 DECLARE 변수 충돌 없이 동작한다.
-- 기간은 각 블록의 window_days(일)로 조절한다. [A]=28(시계열), [B]=7(주간 요약).
-- 실제 수치 검증(콘솔 실행)은 사람이 확인한다(#116 스코프).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- [A] 일자 × placement 일별 지표 (대시보드 시계열)
--   impression/click/complete/fail/blocked 카운트와 파생율(CTR/완료율/실패율/
--   fill 근사/차단율), eCPM 기반 추정 매출·ARPDAU를 함께 낸다.
--   NOTE: 광고 퍼널 이벤트가 있는 (일자×placement)만 행으로 산출한다. 광고가 전혀
--   없던 일자/placement는 행이 생성되지 않는다(0 채움 아님). arpdau_usd는 그날
--   전체 DAU를 분모로 한 placement의 기여 ARPDAU다.
-- ----------------------------------------------------------------------------
BEGIN
  DECLARE window_days INT64 DEFAULT 28;

  WITH
  -- 기간 내 광고 퍼널 이벤트만 추출하고 event_params에서 placement/reason을 평탄화.
  ad_events AS (
    SELECT
      PARSE_DATE('%Y%m%d', event_date) AS day,
      event_name,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'placement') AS placement,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'reason') AS reason
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
      AND event_name IN (
        'ad_reward_impression',
        'ad_reward_click',
        'ad_reward_completed',
        'ad_reward_failed',
        'ad_limit_blocked'
      )
  ),

  -- 일별 DAU: 그날 이벤트가 하나라도 있는 고유 사용자 수(ARPDAU 분모).
  daily_dau AS (
    SELECT
      PARSE_DATE('%Y%m%d', event_date) AS day,
      COUNT(DISTINCT user_pseudo_id) AS dau
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    GROUP BY day
  ),

  -- placement별 eCPM(USD, 완료 1,000회당 단가). AdMob/AppsInToss 매출 리포트에서
  -- placement 단위로 채워 넣는다. GA4 export에는 매출 단가가 없으므로 여기서 조인한다.
  -- 값이 없는(0) placement는 추정 매출·ARPDAU가 0으로 계산된다.
  placement_ecpm AS (
    SELECT 'shop_gold_reward'   AS placement, 0.0 AS ecpm_usd UNION ALL
    SELECT 'shop_plot_discount',     0.0            UNION ALL
    SELECT 'growth_ad_sheet',        0.0            UNION ALL
    SELECT 'harvest_bonus_sheet',    0.0            UNION ALL
    SELECT 'return_offline_bonus',   0.0
  ),

  -- 일자 × placement 카운트 집계.
  agg AS (
    SELECT
      day,
      placement,
      COUNTIF(event_name = 'ad_reward_impression') AS impressions,
      COUNTIF(event_name = 'ad_reward_click')      AS clicks,
      COUNTIF(event_name = 'ad_reward_completed')  AS completes,
      COUNTIF(event_name = 'ad_reward_failed')     AS fails,
      COUNTIF(event_name = 'ad_reward_failed' AND reason = 'not_ready') AS fails_not_ready,
      COUNTIF(event_name = 'ad_limit_blocked')     AS blocked
    FROM ad_events
    WHERE placement IS NOT NULL
    GROUP BY day, placement
  ),

  -- 추정 매출을 단일 지점에서 계산해 ARPDAU가 est_revenue_usd와 항상 일치하도록 한다.
  -- 추정 매출(USD) = 완료 수 × eCPM / 1000 (괄호로 연산 순서 고정).
  metrics AS (
    SELECT
      agg.*,
      d.dau,
      (agg.completes * COALESCE(e.ecpm_usd, 0)) / 1000 AS est_revenue_usd
    FROM agg
    JOIN daily_dau d USING (day)
    LEFT JOIN placement_ecpm e USING (placement)
  )

  SELECT
    day,
    placement,
    impressions,
    clicks,
    completes,
    fails,
    blocked,
    dau,
    -- CTR = 클릭 / 노출
    SAFE_DIVIDE(clicks, impressions)                 AS ctr,
    -- 완료율 = 완료 / 클릭
    SAFE_DIVIDE(completes, clicks)                   AS completion_rate,
    -- 실패율 = 실패 / 클릭 (모든 reason 포함)
    SAFE_DIVIDE(fails, clicks)                       AS fail_rate,
    -- fill 근사 = 클릭 / (클릭 + not_ready 실패). not_ready 외 실패는 fill에서 제외.
    SAFE_DIVIDE(clicks, clicks + fails_not_ready)    AS fill_approx,
    -- 차단율 = 한도차단 / (노출 + 한도차단).
    SAFE_DIVIDE(blocked, impressions + blocked)      AS block_rate,
    est_revenue_usd,
    -- placement 기여 ARPDAU(USD) = 추정 매출 / 그날 전체 DAU.
    SAFE_DIVIDE(est_revenue_usd, dau)                AS arpdau_usd
  FROM metrics
  ORDER BY day DESC, placement;
END;


-- ----------------------------------------------------------------------------
-- [B] 기간 롤업 × placement (주간 요약)
--   기간(window_days) 전체를 placement별로 합산한 요약. placement 간 상대 성과
--   (완료율·fill·기여 ARPDAU)를 한눈에 비교할 때 쓴다. 주간 리포트 기본 7일.
-- ----------------------------------------------------------------------------
BEGIN
  DECLARE window_days INT64 DEFAULT 7;

  WITH
  ad_events AS (
    SELECT
      event_name,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'placement') AS placement,
      (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'reason') AS reason
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
      AND event_name IN (
        'ad_reward_impression',
        'ad_reward_click',
        'ad_reward_completed',
        'ad_reward_failed',
        'ad_limit_blocked'
      )
  ),

  -- 기간 평균 DAU(일별 DAU의 평균) — 기간 ARPDAU 분모의 기준.
  avg_dau AS (
    SELECT AVG(dau) AS avg_dau FROM (
      SELECT COUNT(DISTINCT user_pseudo_id) AS dau
      FROM `happy-farm-tycoon.analytics_539626577.events_*`
      WHERE _TABLE_SUFFIX
          BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
              AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
      GROUP BY event_date
    )
  ),

  placement_ecpm AS (
    SELECT 'shop_gold_reward'   AS placement, 0.0 AS ecpm_usd UNION ALL
    SELECT 'shop_plot_discount',     0.0            UNION ALL
    SELECT 'growth_ad_sheet',        0.0            UNION ALL
    SELECT 'harvest_bonus_sheet',    0.0            UNION ALL
    SELECT 'return_offline_bonus',   0.0
  ),

  agg AS (
    SELECT
      placement,
      COUNTIF(event_name = 'ad_reward_impression') AS impressions,
      COUNTIF(event_name = 'ad_reward_click')      AS clicks,
      COUNTIF(event_name = 'ad_reward_completed')  AS completes,
      COUNTIF(event_name = 'ad_reward_failed')     AS fails,
      COUNTIF(event_name = 'ad_reward_failed' AND reason = 'not_ready') AS fails_not_ready,
      COUNTIF(event_name = 'ad_limit_blocked')     AS blocked
    FROM ad_events
    WHERE placement IS NOT NULL
    GROUP BY placement
  ),

  metrics AS (
    SELECT
      agg.*,
      (agg.completes * COALESCE(e.ecpm_usd, 0)) / 1000 AS est_revenue_usd
    FROM agg
    LEFT JOIN placement_ecpm e USING (placement)
  )

  SELECT
    placement,
    impressions,
    clicks,
    completes,
    fails,
    blocked,
    SAFE_DIVIDE(clicks, impressions)                 AS ctr,
    SAFE_DIVIDE(completes, clicks)                   AS completion_rate,
    SAFE_DIVIDE(fails, clicks)                       AS fail_rate,
    SAFE_DIVIDE(clicks, clicks + fails_not_ready)    AS fill_approx,
    SAFE_DIVIDE(blocked, impressions + blocked)      AS block_rate,
    est_revenue_usd,
    -- 기간 ARPDAU = 기간 추정 매출 / (기간 평균 DAU × 기간 일수).
    SAFE_DIVIDE(est_revenue_usd, (SELECT avg_dau FROM avg_dau) * window_days) AS arpdau_usd
  FROM metrics
  ORDER BY est_revenue_usd DESC, placement;
END;
