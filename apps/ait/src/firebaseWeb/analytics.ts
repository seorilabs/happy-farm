import { Storage } from '@apps-in-toss/framework';

import {
  RELEASE_INFO,
  combineTrackers,
  createFarmAnalytics,
  toFirebaseAnalyticsParams,
  type AnalyticsValue,
  type TrackGameEvent,
} from '../../../../packages/farm-core/src';

import { APPS_IN_TOSS_GA4_MEASUREMENT_ID } from './firebaseWebConfig';
import { createAppsInTossAnalyticsLifecycle } from './analyticsLifecycle';
import { GA4_MP_API_SECRET } from './mpSecret.generated';
import { createGa4MeasurementProtocolClient, type Ga4McpInitResult } from './measurementProtocol';
import { trackAppsInTossPlatformEvent } from '../platformEvents';

// AppsInToss 빌드는 Granite React Native 런타임(브라우저 DOM 없음)에서 동작한다. 브라우저
// 전용 Firebase JS Web SDK(firebase/analytics)는 이 환경에서 초기화조차 되지 않아 이벤트가
// GA4로 전혀 전송되지 않았다. 그래서 RN의 fetch에서 확실히 동작하는 GA4 Measurement
// Protocol(HTTP) 전송으로 교체한다. measurementId는 기존 web 스트림 값을 그대로 쓰고,
// api_secret은 빌드 시 주입되는 mpSecret.generated에서 온다(미주입이면 전송 no-op).

type AppsInTossAnalyticsInitResult =
  | { status: 'ready' }
  | { status: 'unsupported' }
  | { status: 'error'; reason: string };

function isDevBuild() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

// GA4 MP 전송 클라이언트. Storage(client_id 영속)와 fetch(전송)를 주입한다.
const mpClient = createGa4MeasurementProtocolClient({
  measurementId: APPS_IN_TOSS_GA4_MEASUREMENT_ID,
  apiSecret: GA4_MP_API_SECRET,
  storage: {
    getItem: (key) => Storage.getItem(key),
    setItem: (key, value) => Storage.setItem(key, value),
  },
  post: async (url, body) => {
    // best-effort. keepalive로 앱 백그라운드 전환 중에도 전송을 시도한다.
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    });
  },
});

const analyticsLifecycle = createAppsInTossAnalyticsLifecycle({
  storage: {
    getItem: (key) => Storage.getItem(key),
    setItem: (key, value) => Storage.setItem(key, value),
  },
  track: (name, params) => mpClient.track(name, normalizeAnalyticsParams(params)),
  startNewSession: mpClient.startNewSession,
  flush: mpClient.flush,
});

let initializePromise: Promise<AppsInTossAnalyticsInitResult> | null = null;

function normalizeAnalyticsParams(params: Record<string, AnalyticsValue> = {}) {
  const normalizedParams: Record<string, string | number> = {
    app_market: 'apps_in_toss',
    release_version: RELEASE_INFO.versionName,
    release_build_number: RELEASE_INFO.buildNumber,
    ...toFirebaseAnalyticsParams(params),
  };

  // MP client가 session_id/engagement_time_msec 2개를 추가한다. 최대 광고 payload는
  // production에서 이미 25개를 모두 쓰므로 그 경우에만 debug_mode를 생략한다.
  if (isDevBuild() && Object.keys(normalizedParams).length < 23) {
    // debug_mode=1이면 GA4 DebugView에 실시간 노출되어 온디바이스 검증이 쉽다.
    normalizedParams.debug_mode = 1;
  }

  return normalizedParams;
}

function mapInitResult(result: Ga4McpInitResult): AppsInTossAnalyticsInitResult {
  switch (result.status) {
    case 'ready':
      return { status: 'ready' };
    case 'disabled':
      // 비밀값 미주입(로컬/개발). 미지원과 동일하게 취급해 상위 로깅 계약을 유지한다.
      return { status: 'unsupported' };
    case 'error':
      return { status: 'error', reason: result.reason };
  }
}

async function initializeAnalytics(): Promise<AppsInTossAnalyticsInitResult> {
  const mpResult = await mpClient.initialize();
  const result = mapInitResult(mpResult);
  if (result.status === 'ready') {
    const lifecycle = await analyticsLifecycle.initialize(mpResult.status === 'ready' && mpResult.isNewClient);
    if (lifecycle.firstTouch === 'storage_error') {
      console.warn(`[ait-analytics] lifecycle storage error: ${lifecycle.reason}`);
    }
    // 초기화 완료 마커(웹 스트림 전용). BigQuery/DebugView에서 web 수집 여부 확인용.
    mpClient.track('ait_firebase_initialized', normalizeAnalyticsParams());
  } else if (result.status === 'error') {
    console.warn(`[ait-analytics] init error: ${result.reason}`);
  }
  return result;
}

export function initializeAppsInTossAnalytics() {
  // 성공(ready)만 메모이즈한다. 미지원/일시 오류는 메모이즈를 해제해 다음 호출에서
  // 재시도할 수 있게 한다(초기화 실패 후 영구 차단 방지). MP 클라이언트가 준비 전
  // 이벤트를 자체 큐에 보관하므로, 첫 시도가 실패해도 큐 이벤트는 유실되지 않는다.
  initializePromise ??= initializeAnalytics().then((result) => {
    if (result.status !== 'ready') {
      initializePromise = null;
    }
    return result;
  });
  return initializePromise;
}

// 이벤트 전송. 시장 공통 파라미터를 정규화해 MP 클라이언트로 넘긴다. 클라이언트가
// 준비 전 이벤트 큐잉·배치 전송·client_id/session_id 주입을 담당한다.
export const trackAppsInTossAnalyticsEvent: TrackGameEvent = (name, params = {}) => {
  mpClient.track(name, normalizeAnalyticsParams(params));
};

/**
 * 원격 설정(analytics_collection_enabled)에 따라 애널리틱스 수집을 켜고 끈다.
 * 끄면 이후 이벤트는 버퍼에 쌓지 않고 즉시 무시된다.
 */
export function setAppsInTossAnalyticsCollectionEnabled(enabled: boolean) {
  mpClient.setCollectionEnabled(enabled);
}

export const handleAppsInTossAnalyticsAppStateChange = analyticsLifecycle.handleAppStateChange;

// 기존 GA4 Measurement Protocol은 그대로 유지하고, 합의한 저빈도 이벤트만 Platform
// tracker에 두 번째 sink로 전달한다. 각 sink의 실패는 combineTrackers가 격리한다.
export const appsInTossFarmAnalytics = createFarmAnalytics(
  combineTrackers(trackAppsInTossAnalyticsEvent, trackAppsInTossPlatformEvent),
);
