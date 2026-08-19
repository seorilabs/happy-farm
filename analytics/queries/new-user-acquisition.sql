-- ============================================================================
-- 마켓별 신규 유저 유입 분석 쿼리
-- ----------------------------------------------------------------------------
-- 당일 미완료 export를 제외한 D-28~D-1 daily shard를 사용한다.
-- 데이터셋: happy-farm-tycoon.analytics_539626577
-- 이벤트 계약: packages/farm-core/src/analytics.ts
--
-- 왜 GA4 표준 "새 사용자" 지표를 쓰지 않는가
-- ----------------------------------------------------------------------------
-- AppsInToss(WEB 스트림)는 Granite RN 런타임이라 Firebase Web SDK가 동작하지 않고
-- Measurement Protocol로만 전송한다. GA4는 `first_visit`/`first_open`/`session_start`를
-- 예약 이름으로 막아 MP 요청을 거부하므로(2026-08-19 /debug/mp/collect 실측),
-- AIT 스트림은 `user_first_touch_timestamp`가 항상 NULL이고 GA4의 "새 사용자"는
-- 구조적으로 0으로 나온다. AIT 신규 유입은 아래 [A]의 `ait_first_touch`로 센다.
--
-- iOS/Android는 네이티브 Firebase SDK가 `first_open`을 정상 전송하므로 그대로 쓴다.
--
-- Android는 봇 보정이 필요하다
-- ----------------------------------------------------------------------------
-- Google Play 사전 출시 보고서(pre-launch report)의 로보 테스트 기기가 릴리스 업로드일마다
-- 신규 사용자로 잡힌다. 판별 시그니처는 geo/device가 전부 비어 있는 것이며, 업로드 1건당
-- 정확히 3대씩 등장한다. [B]는 이를 분리한다.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- [A] 일자별 실제 신규 유저 (마켓별, 봇 제외)
-- ----------------------------------------------------------------------------
BEGIN
  DECLARE window_days INT64 DEFAULT 28;

  WITH
  source_events AS (
    SELECT
      event_date,
      event_name,
      platform,
      user_pseudo_id,
      user_first_touch_timestamp,
      geo.country AS country
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
  ),
  -- 마켓별로 신규 판정 기준이 다르다. AIT는 커스텀 생애 1회 이벤트, 네이티브는 first_open.
  new_users AS (
    SELECT event_date, platform, user_pseudo_id, country
    FROM source_events
    WHERE (platform = 'WEB' AND event_name = 'ait_first_touch')
       OR (platform IN ('IOS', 'ANDROID') AND event_name = 'first_open')
  )
  SELECT
    event_date,
    platform,
    COUNT(DISTINCT IF(country IS NOT NULL AND country != '', user_pseudo_id, NULL)) AS new_users,
    COUNT(DISTINCT IF(country IS NULL OR country = '', user_pseudo_id, NULL)) AS unattributed_users
  FROM new_users
  GROUP BY event_date, platform
  ORDER BY event_date DESC, platform;
END;


-- ----------------------------------------------------------------------------
-- [B] Android 신규의 로보 테스트 허수 분리
-- ----------------------------------------------------------------------------
-- prelaunch_robo_users가 릴리스일에 3의 배수로 튀면 사전 출시 보고서 실행이다.
-- 실제 유기적 설치만 보려면 real_users 열을 쓴다.
--
-- 신규 판정은 [A]와 같이 first_open으로 고정한다. 관측 첫날(MIN(event_date))로 잡으면
-- 창 시작 이전에 설치한 기존 사용자가 창 첫날에 신규로 접히는 left-censoring이 생긴다.
-- geo 판정은 first_open 행이 아니라 그 사용자의 창 내 전체 이벤트로 본다. 어느 이벤트에도
-- 국가가 없어야 로보로 보므로, first_open에만 국가가 비어 있는 실사용자를 오분류하지 않는다.
BEGIN
  DECLARE window_days INT64 DEFAULT 28;

  WITH
  android_events AS (
    SELECT
      user_pseudo_id,
      event_name,
      event_date,
      geo.country AS country,
      app_info.version AS app_version
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
      AND platform = 'ANDROID'
  ),
  installs AS (
    SELECT user_pseudo_id, MIN(event_date) AS first_date
    FROM android_events
    WHERE event_name = 'first_open'
    GROUP BY user_pseudo_id
  ),
  attribution AS (
    SELECT
      user_pseudo_id,
      MAX(IF(country IS NOT NULL AND country != '', 1, 0)) AS has_geo,
      ANY_VALUE(app_version) AS app_version
    FROM android_events
    GROUP BY user_pseudo_id
  )
  SELECT
    i.first_date,
    SUM(a.has_geo) AS real_users,
    SUM(1 - a.has_geo) AS prelaunch_robo_users,
    STRING_AGG(DISTINCT a.app_version ORDER BY a.app_version) AS app_versions
  FROM installs i
  JOIN attribution a USING (user_pseudo_id)
  GROUP BY i.first_date
  ORDER BY i.first_date DESC;
END;


-- ----------------------------------------------------------------------------
-- [C] ait_first_touch 신뢰도 점검
-- ----------------------------------------------------------------------------
-- AIT 신규 판정이 계측 사고로 어긋나지 않았는지 확인한다. client_id가 처음 등장한 날과
-- ait_first_touch 발화일이 일치해야 한다. 두 값이 벌어지면 스토리지 영속이나 lifecycle
-- 초기화를 먼저 의심한다. (2026-08-19 기준 16일 중 15일 정확히 일치)
BEGIN
  DECLARE window_days INT64 DEFAULT 28;

  WITH
  windowed AS (
    SELECT event_date, event_name, user_pseudo_id
    FROM `happy-farm-tycoon.analytics_539626577.events_*`
    WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY))
            AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
      AND platform = 'WEB'
  ),
  newly_seen AS (
    SELECT MIN(event_date) AS event_date, user_pseudo_id
    FROM windowed
    GROUP BY user_pseudo_id
  ),
  by_first_seen AS (
    SELECT event_date, COUNT(*) AS newly_seen_clients
    FROM newly_seen
    GROUP BY event_date
  ),
  by_first_touch AS (
    SELECT event_date, COUNT(DISTINCT user_pseudo_id) AS first_touch_users
    FROM windowed
    WHERE event_name = 'ait_first_touch'
    GROUP BY event_date
  )
  SELECT
    s.event_date,
    s.newly_seen_clients,
    IFNULL(t.first_touch_users, 0) AS first_touch_users,
    s.newly_seen_clients - IFNULL(t.first_touch_users, 0) AS gap
  FROM by_first_seen s
  LEFT JOIN by_first_touch t USING (event_date)
  ORDER BY s.event_date DESC;
END;
