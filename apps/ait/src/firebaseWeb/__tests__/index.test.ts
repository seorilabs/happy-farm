/// <reference types="jest" />

const mockInitRemoteConfig = jest.fn();
const mockGetRemoteBoolean = jest.fn(() => true);
const mockSetAnalyticsCollectionEnabled = jest.fn();
const mockInitAnalytics = jest.fn(async () => ({ status: 'ready' as const }));

jest.mock('../app', () => ({
  getAppsInTossFirebaseApp: () => ({}),
}));

jest.mock('../analytics', () => ({
  appsInTossFarmAnalytics: {},
  initializeAppsInTossAnalytics: mockInitAnalytics,
  setAppsInTossAnalyticsCollectionEnabled: mockSetAnalyticsCollectionEnabled,
}));

jest.mock('../remoteConfig', () => ({
  initializeAppsInTossRemoteConfig: mockInitRemoteConfig,
  getAppsInTossRemoteBoolean: mockGetRemoteBoolean,
}));

function loadIndex() {
  return jest.requireActual<typeof import('../index')>('../index');
}

beforeEach(() => {
  jest.resetModules();
  mockSetAnalyticsCollectionEnabled.mockReset();
  mockGetRemoteBoolean.mockReset().mockReturnValue(true);
  mockInitAnalytics.mockReset().mockResolvedValue({ status: 'ready' as const });
  mockInitRemoteConfig.mockReset();
});

describe('initializeAppsInTossFirebaseServices', () => {
  test('원격 설정이 ready면 analytics 수집 토글을 원격값으로 적용한다', async () => {
    mockInitRemoteConfig.mockResolvedValue({ status: 'ready', adsEnabled: true });
    mockGetRemoteBoolean.mockReturnValue(false);

    const { initializeAppsInTossFirebaseServices } = loadIndex();
    await initializeAppsInTossFirebaseServices();

    expect(mockGetRemoteBoolean).toHaveBeenCalledWith('analytics_collection_enabled');
    expect(mockSetAnalyticsCollectionEnabled).toHaveBeenCalledTimes(1);
    expect(mockSetAnalyticsCollectionEnabled).toHaveBeenCalledWith(false);
  });

  test('원격 설정이 미지원/오류면 비권위적 기본값으로 토글을 강제하지 않는다', async () => {
    for (const status of ['unsupported', 'error'] as const) {
      mockSetAnalyticsCollectionEnabled.mockClear();
      mockInitRemoteConfig.mockResolvedValue({ status, adsEnabled: true, reason: 'x' });

      const { initializeAppsInTossFirebaseServices } = loadIndex();
      await initializeAppsInTossFirebaseServices();

      expect(mockSetAnalyticsCollectionEnabled).not.toHaveBeenCalled();
    }
  });
});
