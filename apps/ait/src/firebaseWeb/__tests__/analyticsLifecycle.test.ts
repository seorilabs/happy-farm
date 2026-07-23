/// <reference types="jest" />

import {
  AIT_ANALYTICS_SESSION_TIMEOUT_MS,
  AIT_FIRST_TOUCH_STORAGE_KEY,
  createAppsInTossAnalyticsLifecycle,
} from '../analyticsLifecycle';

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: jest.fn(async (key: string) => map.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      map.set(key, value);
    }),
  };
}

describe('AppsInToss analytics lifecycle (#395)', () => {
  test('WEB 최초 실행은 영속 저장 기반 생애 1회 ait_first_touch를 발화하고 재시작 시 재발화하지 않는다', async () => {
    const storage = createMemoryStorage();
    const firstTrack = jest.fn();
    const firstLifecycle = createAppsInTossAnalyticsLifecycle({
      storage,
      track: firstTrack,
      startNewSession: jest.fn(),
      flush: jest.fn(),
    });

    await firstLifecycle.initialize(true);

    expect(storage.setItem).toHaveBeenCalledWith(AIT_FIRST_TOUCH_STORAGE_KEY, '1');
    expect(firstTrack).toHaveBeenCalledWith('ait_first_touch', { lifecycle_source: 'first_install' });

    const restartedTrack = jest.fn();
    const restartedLifecycle = createAppsInTossAnalyticsLifecycle({
      storage,
      track: restartedTrack,
      startNewSession: jest.fn(),
      flush: jest.fn(),
    });
    await restartedLifecycle.initialize(false);

    expect(restartedTrack).not.toHaveBeenCalledWith('ait_first_touch', expect.anything());
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  test('초기화는 ait_session_start를 한 번만 발화한다', async () => {
    const track = jest.fn();
    const lifecycle = createAppsInTossAnalyticsLifecycle({
      storage: createMemoryStorage(),
      track,
      startNewSession: jest.fn(),
      flush: jest.fn(),
    });

    await lifecycle.initialize(true);
    await lifecycle.initialize(true);

    expect(track.mock.calls.filter(([name]) => name === 'ait_session_start')).toEqual([
      ['ait_session_start', { session_source: 'initialization' }],
    ]);
  });

  test('30분 미만 복귀는 세션을 유지하고 30분 이상 복귀만 새 session_id와 이벤트를 만든다', async () => {
    let currentTimeMs = 1_700_000_000_000;
    const track = jest.fn();
    const startNewSession = jest.fn();
    const flush = jest.fn();
    const lifecycle = createAppsInTossAnalyticsLifecycle({
      storage: createMemoryStorage(),
      track,
      startNewSession,
      flush,
      now: () => currentTimeMs,
    });
    await lifecycle.initialize(true);
    track.mockClear();

    lifecycle.handleAppStateChange('inactive');
    currentTimeMs += 10_000;
    lifecycle.handleAppStateChange('background');
    currentTimeMs += AIT_ANALYTICS_SESSION_TIMEOUT_MS - 10_001;
    lifecycle.handleAppStateChange('active');

    expect(startNewSession).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();

    lifecycle.handleAppStateChange('background');
    currentTimeMs += AIT_ANALYTICS_SESSION_TIMEOUT_MS;
    lifecycle.handleAppStateChange('active');
    lifecycle.handleAppStateChange('active');

    expect(flush).toHaveBeenCalledTimes(3);
    expect(startNewSession).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('ait_session_start', {
      session_source: 'foreground_resume',
      background_duration_ms: AIT_ANALYTICS_SESSION_TIMEOUT_MS,
    });
  });

  test('기존 client_id 사용자는 first-touch 플래그만 마이그레이션하고 신규 코호트로 기록하지 않는다', async () => {
    const storage = createMemoryStorage();
    const track = jest.fn();
    const lifecycle = createAppsInTossAnalyticsLifecycle({
      storage,
      track,
      startNewSession: jest.fn(),
      flush: jest.fn(),
    });

    await lifecycle.initialize(false);

    expect(storage.setItem).toHaveBeenCalledWith(AIT_FIRST_TOUCH_STORAGE_KEY, '1');
    expect(track).not.toHaveBeenCalledWith('ait_first_touch', expect.anything());
    expect(track).toHaveBeenCalledWith('ait_session_start', { session_source: 'initialization' });
  });

  test('AppState inactive→background 중복 콜백은 최초 inactive 세션 기준점을 뒤로 미루지 않는다', async () => {
    const initialTimeMs = 1_700_000_000_000;
    let currentTimeMs = initialTimeMs;
    const track = jest.fn();
    const startNewSession = jest.fn();
    const lifecycle = createAppsInTossAnalyticsLifecycle({
      storage: createMemoryStorage(),
      track,
      startNewSession,
      flush: jest.fn(),
      now: () => currentTimeMs,
    });
    await lifecycle.initialize(true);
    track.mockClear();

    lifecycle.handleAppStateChange('inactive');
    currentTimeMs += 10_000;
    lifecycle.handleAppStateChange('background');
    currentTimeMs = initialTimeMs + AIT_ANALYTICS_SESSION_TIMEOUT_MS;
    lifecycle.handleAppStateChange('active');

    // inactive 기준으로는 정확히 30분, background 기준으로는 29분 50초다.
    // 최초 inactive 시각을 보존해야만 새 세션이 시작된다.
    expect(startNewSession).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('ait_session_start', {
      session_source: 'foreground_resume',
      background_duration_ms: AIT_ANALYTICS_SESSION_TIMEOUT_MS,
    });
  });
});
