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

// 초기화 완료 전에 발생한 이벤트를 담아 두는 큐. FarmGame은 analytics 초기화가
// 끝나기 전에 렌더/이벤트 발생이 가능하므로, 준비되기 전 이벤트를 유실하지 않도록
// 여기에 쌓아 두었다가 준비되면 순서대로 flush 한다.
type QueuedAnalyticsEvent = { name: string; params: Record<string, AnalyticsValue> };
const pendingEvents: QueuedAnalyticsEvent[] = [];
// 초기화가 끝내 실패(미지원)해도 큐가 무한히 커지지 않도록 상한을 둔다.
// 상한 초과 시 가장 오래된 이벤트부터 폐기한다.
const MAX_PENDING_EVENTS = 200;

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

// 준비되기 전 큐에 쌓인 이벤트를 순서대로 전송한다. 초기화 성공 직후에만 호출된다.
function flushPendingEvents() {
  if (firebaseAnalytics == null || pendingEvents.length === 0) {
    return;
  }
  // splice로 큐를 비우면서 스냅샷을 받아, flush 중 재진입에도 안전하게 처리한다.
  const flushed = pendingEvents.splice(0, pendingEvents.length);
  for (const { name, params } of flushed) {
    logEvent(firebaseAnalytics, name, normalizeAnalyticsParams(params));
  }
  console.info(`[ait-analytics] 초기화 전 대기 이벤트 ${flushed.length}건 flush 완료`);
}

async function initializeAnalytics(app: FirebaseApp): Promise<AppsInTossAnalyticsInitResult> {
  try {
    const isAnalyticsSupported = await isSupported();
    if (!isAnalyticsSupported) {
      // Granite 웹뷰 등 일부 환경에서 isSupported()가 보수적으로 false를 반환할 수
      // 있어, 미지원으로 단정하기 전에 getAnalytics를 한 번 최선 노력으로 시도한다.
      // 시도가 실패하면 그때 미지원으로 처리해 이벤트를 큐에 남긴다.
      console.warn('[ait-analytics] isSupported() === false — 강제 초기화를 시도합니다');
      try {
        firebaseAnalytics = getAnalytics(app);
      } catch (fallbackError) {
        console.warn(
          `[ait-analytics] 강제 초기화 실패, 미지원으로 처리합니다: ${normalizeErrorReason(fallbackError)}`,
        );
        return { status: 'unsupported' };
      }
    } else {
      firebaseAnalytics = getAnalytics(app);
    }

    logEvent(firebaseAnalytics, 'ait_firebase_initialized', normalizeAnalyticsParams());
    // 초기화가 완료된 시점에 대기 이벤트를 즉시 flush 해 유실을 막는다.
    flushPendingEvents();

    return { status: 'ready' };
  } catch (error) {
    firebaseAnalytics = null;
    console.warn(`[ait-analytics] 초기화 오류: ${normalizeErrorReason(error)}`);
    return { status: 'error', reason: normalizeErrorReason(error) };
  }
}

export function initializeAppsInTossAnalytics(app: FirebaseApp) {
  initializePromise ??= initializeAnalytics(app);
  return initializePromise;
}

export const trackAppsInTossAnalyticsEvent: TrackGameEvent = (name, params = {}) => {
  if (firebaseAnalytics == null) {
    // 아직 초기화 전이면 이벤트를 큐에 쌓아 두었다가 준비되면 flush 한다.
    // 상한을 넘으면 가장 오래된 이벤트부터 폐기해 메모리 무한 증가를 막는다.
    if (pendingEvents.length >= MAX_PENDING_EVENTS) {
      pendingEvents.shift();
    }
    pendingEvents.push({ name, params });
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
