import type { AppStateStatus } from 'react-native';

import type { TrackGameEvent } from '../../../../packages/farm-core/src';

export const AIT_FIRST_TOUCH_STORAGE_KEY = 'ait_ga4_first_touch_recorded';
export const AIT_ANALYTICS_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

type LifecycleStorage = {
  getItem: (key: string) => Promise<string | null> | string | null;
  setItem: (key: string, value: string) => Promise<void> | void;
};

type AppsInTossAnalyticsLifecycleOptions = {
  storage: LifecycleStorage;
  track: TrackGameEvent;
  startNewSession: () => void;
  flush: () => void;
  now?: () => number;
  sessionTimeoutMs?: number;
};

export type AppsInTossAnalyticsLifecycleInitResult =
  | { status: 'ready'; firstTouch: 'recorded' | 'existing' }
  | { status: 'ready'; firstTouch: 'storage_error'; reason: string };

/**
 * AppsInToss Platform GA4 relay에 first-touch와 30분 세션 경계를 보강한다.
 * 자동 이벤트를 위조하지 않고 커스텀 이벤트와 숫자형 session_id로 세션을 구분한다.
 */
export function createAppsInTossAnalyticsLifecycle(options: AppsInTossAnalyticsLifecycleOptions) {
  const {
    storage,
    track,
    startNewSession,
    flush,
    now = Date.now,
    sessionTimeoutMs = AIT_ANALYTICS_SESSION_TIMEOUT_MS,
  } = options;

  let initialized = false;
  let backgroundedAtMs: number | null = null;

  async function initialize(isNewClient: boolean): Promise<AppsInTossAnalyticsLifecycleInitResult> {
    if (initialized) {
      return { status: 'ready', firstTouch: 'existing' };
    }

    let firstTouch: 'recorded' | 'existing' = 'existing';
    try {
      const recorded = await storage.getItem(AIT_FIRST_TOUCH_STORAGE_KEY);
      if (recorded == null || recorded === '') {
        // 플래그를 먼저 저장해 재시작/중복 초기화 때 생애 1회 이벤트가 재발화하지 않게 한다.
        await storage.setItem(AIT_FIRST_TOUCH_STORAGE_KEY, '1');
        // lifecycle 계측 도입 전부터 client_id가 있던 기존 사용자를 신규 코호트로 오염시키지 않는다.
        if (isNewClient) {
          track('ait_first_touch', { lifecycle_source: 'first_install' });
          firstTouch = 'recorded';
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';
      track('ait_session_start', { session_source: 'initialization' });
      initialized = true;
      return { status: 'ready', firstTouch: 'storage_error', reason };
    }

    track('ait_session_start', { session_source: 'initialization' });
    initialized = true;
    return { status: 'ready', firstTouch };
  }

  function handleAppStateChange(nextState: AppStateStatus): void {
    const currentTimeMs = now();

    if (nextState === 'background' || nextState === 'inactive') {
      // iOS의 inactive -> background 연속 콜백이 30분 기준점을 뒤로 미루지 않게 한다.
      backgroundedAtMs ??= currentTimeMs;
      flush();
      return;
    }

    if (nextState !== 'active' || backgroundedAtMs == null) {
      return;
    }

    const backgroundDurationMs = Math.max(0, currentTimeMs - backgroundedAtMs);
    backgroundedAtMs = null;
    if (!initialized || backgroundDurationMs < sessionTimeoutMs) {
      return;
    }

    startNewSession();
    track('ait_session_start', {
      session_source: 'foreground_resume',
      background_duration_ms: backgroundDurationMs,
    });
  }

  return { initialize, handleAppStateChange };
}
