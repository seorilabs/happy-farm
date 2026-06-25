import type { FirebaseApp } from 'firebase/app';
import {
  getAnalytics,
  isSupported,
  logEvent,
  setAnalyticsCollectionEnabled,
  type Analytics,
} from 'firebase/analytics';

import {
  RELEASE_INFO,
  createFarmAnalytics,
  toFirebaseAnalyticsParams,
  type AnalyticsValue,
  type TrackGameEvent,
} from '../../../../packages/farm-core/src';

type AppsInTossAnalyticsInitResult =
  | { status: 'ready' }
  | { status: 'unsupported' }
  | { status: 'error'; reason: string };

let firebaseAnalytics: Analytics | null = null;
let initializePromise: Promise<AppsInTossAnalyticsInitResult> | null = null;

function isDevBuild() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

function normalizeAnalyticsParams(params: Record<string, AnalyticsValue> = {}) {
  const normalizedParams: Record<string, string | number> = {
    app_market: 'apps_in_toss',
    release_version: RELEASE_INFO.versionName,
    release_build_number: RELEASE_INFO.buildNumber,
  };

  if (isDevBuild()) {
    normalizedParams.debug_mode = 1;
  }

  // 호출부가 넘긴 파라미터는 공유 정규화 헬퍼로 변환하되, 시장 공통 필드는
  // 호출부 값으로 덮어쓸 수 있도록 뒤에 합친다(기존 동작 유지).
  return { ...normalizedParams, ...toFirebaseAnalyticsParams(params) };
}

function normalizeErrorReason(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : 'unknown';
}

async function initializeAnalytics(app: FirebaseApp): Promise<AppsInTossAnalyticsInitResult> {
  try {
    const isAnalyticsSupported = await isSupported();
    if (!isAnalyticsSupported) {
      return { status: 'unsupported' };
    }

    firebaseAnalytics = getAnalytics(app);
    logEvent(firebaseAnalytics, 'ait_firebase_initialized', normalizeAnalyticsParams());

    return { status: 'ready' };
  } catch (error) {
    firebaseAnalytics = null;
    return { status: 'error', reason: normalizeErrorReason(error) };
  }
}

export function initializeAppsInTossAnalytics(app: FirebaseApp) {
  initializePromise ??= initializeAnalytics(app);
  return initializePromise;
}

export const trackAppsInTossAnalyticsEvent: TrackGameEvent = (name, params = {}) => {
  if (firebaseAnalytics == null) {
    return;
  }

  logEvent(firebaseAnalytics, name, normalizeAnalyticsParams(params));
};

/**
 * 원격 설정(analytics_collection_enabled)에 따라 애널리틱스 수집을 켜고 끈다.
 * 애널리틱스가 아직 준비되지 않았거나 미지원이면 아무 일도 하지 않는다(안전).
 */
export function setAppsInTossAnalyticsCollectionEnabled(enabled: boolean) {
  if (firebaseAnalytics == null) {
    return;
  }
  setAnalyticsCollectionEnabled(firebaseAnalytics, enabled);
}

export const appsInTossFarmAnalytics = createFarmAnalytics(trackAppsInTossAnalyticsEvent);
