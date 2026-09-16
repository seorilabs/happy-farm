/// <reference types="jest" />

export {};

const mockStorage = {
  getItem: jest.fn<Promise<string | null>, [string]>(),
  setItem: jest.fn<Promise<void>, [string, string]>(),
};
const mockTrackPlatform = jest.fn();
const mockFlushPlatform = jest.fn(() => Promise.resolve());
const mockStartNewSession = jest.fn();

jest.mock('@apps-in-toss/framework', () => ({ Storage: mockStorage }));
jest.mock('../../platformEvents', () => ({
  trackAppsInTossPlatformEvent: mockTrackPlatform,
  flushAppsInTossPlatformEvents: mockFlushPlatform,
  startNewAppsInTossAnalyticsSession: mockStartNewSession,
}));

function loadAnalytics() {
  return jest.requireActual<typeof import('../analytics')>('../analytics');
}

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  jest.setSystemTime(1_700_000_000_000);
  mockStorage.getItem.mockReset().mockResolvedValue(null);
  mockStorage.setItem.mockReset().mockResolvedValue(undefined);
  mockTrackPlatform.mockReset();
  mockFlushPlatform.mockClear();
  mockStartNewSession.mockClear();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('AppsInToss Platform Analytics relay', () => {
  test('새 설치는 stable GA4 client ID를 저장하고 lifecycle 이벤트를 Platform에만 보낸다', async () => {
    const { initializeAppsInTossAnalytics } = loadAnalytics();

    await expect(initializeAppsInTossAnalytics()).resolves.toMatchObject({
      status: 'ready',
      firstTouch: 'recorded',
    });

    expect(mockStorage.setItem).toHaveBeenCalledWith('ait_ga4_client_id', expect.any(String));
    expect(mockTrackPlatform).toHaveBeenCalledWith('ait_first_touch', {
      lifecycle_source: 'first_install',
    });
    expect(mockTrackPlatform).toHaveBeenCalledWith('ait_session_start', {
      session_source: 'initialization',
    });
  });

  test('기존 direct MP client ID를 재사용하고 신규 코호트를 오염시키지 않는다', async () => {
    mockStorage.getItem.mockImplementation(async (key) => {
      if (key === 'ait_ga4_client_id') return 'persisted-client-id';
      return null;
    });
    const { initializeAppsInTossAnalytics } = loadAnalytics();

    await initializeAppsInTossAnalytics();

    expect(mockStorage.setItem).not.toHaveBeenCalledWith('ait_ga4_client_id', expect.anything());
    expect(mockTrackPlatform).not.toHaveBeenCalledWith('ait_first_touch', expect.anything());
    expect(mockTrackPlatform).toHaveBeenCalledWith('ait_session_start', {
      session_source: 'initialization',
    });
  });

  test('게임 커스텀 이벤트는 직접 GA4 호출 없이 Platform sink 한 번만 사용한다', () => {
    const { appsInTossFarmAnalytics } = loadAnalytics();

    appsInTossFarmAnalytics.trackNotificationOpened({ kind: 'harvest' });

    expect(mockTrackPlatform).toHaveBeenCalledTimes(1);
    expect(mockTrackPlatform).toHaveBeenCalledWith('notification_opened', {
      notification_kind: 'harvest',
    });
  });

  test('Remote Config 수집 비활성은 이후 커스텀 이벤트를 즉시 무시한다', () => {
    const {
      setAppsInTossAnalyticsCollectionEnabled,
      trackAppsInTossAnalyticsEvent,
    } = loadAnalytics();

    setAppsInTossAnalyticsCollectionEnabled(false);
    trackAppsInTossAnalyticsEvent('game_start', { source: 'test' });

    expect(mockTrackPlatform).not.toHaveBeenCalled();
  });

  test('30분 백그라운드 복귀는 숫자 세션 정본을 갱신하고 Platform 이벤트를 남긴다', async () => {
    const {
      handleAppsInTossAnalyticsAppStateChange,
      initializeAppsInTossAnalytics,
    } = loadAnalytics();
    await initializeAppsInTossAnalytics();
    mockTrackPlatform.mockClear();

    handleAppsInTossAnalyticsAppStateChange('inactive');
    jest.setSystemTime(1_700_001_800_000);
    handleAppsInTossAnalyticsAppStateChange('active');

    expect(mockStartNewSession).toHaveBeenCalledTimes(1);
    expect(mockTrackPlatform).toHaveBeenCalledWith('ait_session_start', {
      session_source: 'foreground_resume',
      background_duration_ms: 30 * 60 * 1000,
    });
  });
});
