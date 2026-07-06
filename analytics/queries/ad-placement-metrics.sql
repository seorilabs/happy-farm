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
-- 이 파일은 두 개의 독립 쿼리를 담는다.
--   [A] 일자 × placement 일별 지표 (대시보드 시계열용)
--   [B] 기간 롤업 × placement (기간 요약 리포트용)
-- 각 쿼리는 세미콜론으로 끝나며 BigQuery 콘솔에서 개별 실행할 수 있다.
-- 실제 수치 검증(콘솔 실행)은 사람이 확인한다(#116 스코프).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- [A] 일자 × placement 일별 지표
--   impression/click/complete/fail/blocked 카운트와 파생율(CTR/완료율/실패율/
--   fill 근사/차단율), 그리고 eCPM 기반 ARPDAU 추정을 함께 낸다.
-- ----------------------------------------------------------------------------
DECLARE start_date DATE DEFAULT DATE_SUB(CURRENT_DATE(), INTERVAL 28 DAY);
DECLARE end_date   DATE DEFAULT CURRENT_DATE();

WITH
-- 기간 내 광고 퍼널 이벤트만 추출하고, event_params에서 placement/reason을 평탄화한다.
ad_events AS (
  SELECT
    PARSE_DATE('%Y%m%d', event_date) AS day,
    event_name,
    user_pseudo_id,
    (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'placement') AS placement,
    (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'reason') AS reason
  FROM `happy-farm-tycoon.analytics_539626577.events_*`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', start_date) AND FORMAT_DATE('%Y%m%d', end_date)
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
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', start_date) AND FORMAT_DATE('%Y%m%d', end_date)
  GROUP BY day
),

-- placement별 eCPM(USD, 완료 1,000회당 단가). AdMob/AppsInToss 매출 리포트에서
-- placement 단위로 채워 넣는다. GA4 export에는 매출 단가가 없으므로 여기서 조인한다.
-- 값이 없는(0) placement는 ARPDAU가 0으로 계산된다.
placement_ecpm AS (
  SELECT 'shop_gold_reward'    AS placement, 0.0 AS ecpm_usd UNION ALL
  SELECT 'shop_plot_discount',      0.0            UNION ALL
  SELECT 'growth_ad_sheet',         0.0            UNION ALL
  SELECT 'harvest_bonus_sheet',     0.0
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
)

SELECT
  agg.day,
  agg.placement,
  agg.impressions,
  agg.clicks,
  agg.completes,
  agg.fails,
  agg.blocked,
  d.dau,
  -- CTR = 클릭 / 노출
  SAFE_DIVIDE(agg.clicks, agg.impressions)                          AS ctr,
  -- 완료율 = 완료 / 클릭
  SAFE_DIVIDE(agg.completes, agg.clicks)                            AS completion_rate,
  -- 실패율 = 실패 / 클릭
  SAFE_DIVIDE(agg.fails, agg.clicks)                               AS fail_rate,
  -- fill 근사 = 클릭 / (클릭 + not_ready 실패). not_ready 비중이 높으면 재고 부족 신호.
  SAFE_DIVIDE(agg.clicks, agg.clicks + agg.fails_not_ready)         AS fill_approx,
  -- 차단율 = 한도차단 / (노출 + 한도차단). 한도/쿨다운이 수요를 얼마나 누르는지.
  SAFE_DIVIDE(agg.blocked, agg.impressions + agg.blocked)           AS block_rate,
  -- 추정 매출(USD) = 완료 수 × eCPM / 1000 (eCPM은 완료 1,000회당 단가).
  agg.completes * COALESCE(e.ecpm_usd, 0) / 1000                    AS est_revenue_usd,
  -- placement 기여 ARPDAU(USD) = 추정 매출 / 그날 전체 DAU.
  SAFE_DIVIDE(agg.completes * COALESCE(e.ecpm_usd, 0) / 1000, d.dau) AS arpdau_usd
FROM agg
JOIN daily_dau d USING (day)
LEFT JOIN placement_ecpm e USING (placement)
ORDER BY agg.day DESC, agg.placement;


-- ----------------------------------------------------------------------------
-- [B] 기간 롤업 × placement
--   기간(start_date~end_date) 전체를 placement별로 합산한 요약. 정기 리포트에서
--   placement 간 상대 성과(완료율·fill·기여 ARPDAU)를 한눈에 비교할 때 쓴다.
-- ----------------------------------------------------------------------------
DECLARE start_date DATE DEFAULT DATE_SUB(CURRENT_DATE(), INTERVAL 28 DAY);
DECLARE end_date   DATE DEFAULT CURRENT_DATE();

WITH
ad_events AS (
  SELECT
    event_name,
    (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'placement') AS placement,
    (SELECT ep.value.string_value FROM UNNEST(event_params) ep WHERE ep.key = 'reason') AS reason
  FROM `happy-farm-tycoon.analytics_539626577.events_*`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', start_date) AND FORMAT_DATE('%Y%m%d', end_date)
    AND event_name IN (
      'ad_reward_impression',
      'ad_reward_click',
      'ad_reward_completed',
      'ad_reward_failed',
      'ad_limit_blocked'
    )
),

-- 기간 평균 DAU(일별 DAU의 평균) — 기간 ARPDAU의 분모.
avg_dau AS (
  SELECT AVG(dau) AS avg_dau FROM (
    SELECT COUNT(DISTINCT user_pseudo_id) AS dau
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', start_date) AND FORMAT_DATE('%Y%m%d', end_date)
    GROUP BY event_date
  )
),

placement_ecpm AS (
  SELECT 'shop_gold_reward'    AS placement, 0.0 AS ecpm_usd UNION ALL
  SELECT 'shop_plot_discount',      0.0            UNION ALL
  SELECT 'growth_ad_sheet',         0.0            UNION ALL
  SELECT 'harvest_bonus_sheet',     0.0
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
)

SELECT
  agg.placement,
  agg.impressions,
  agg.clicks,
  agg.completes,
  agg.fails,
  agg.blocked,
  SAFE_DIVIDE(agg.clicks, agg.impressions)                  AS ctr,
  SAFE_DIVIDE(agg.completes, agg.clicks)                    AS completion_rate,
  SAFE_DIVIDE(agg.fails, agg.clicks)                       AS fail_rate,
  SAFE_DIVIDE(agg.clicks, agg.clicks + agg.fails_not_ready) AS fill_approx,
  SAFE_DIVIDE(agg.blocked, agg.impressions + agg.blocked)   AS block_rate,
  agg.completes * COALESCE(e.ecpm_usd, 0) / 1000            AS est_revenue_usd,
  -- 기간 ARPDAU = 기간 추정 매출 / (기간 평균 DAU × 기간 일수).
  SAFE_DIVIDE(
    agg.completes * COALESCE(e.ecpm_usd, 0) / 1000,
    (SELECT avg_dau FROM avg_dau) * (DATE_DIFF(end_date, start_date, DAY) + 1)
  )                                                          AS arpdau_usd
FROM agg
LEFT JOIN placement_ecpm e USING (placement)
ORDER BY est_revenue_usd DESC, agg.placement;
