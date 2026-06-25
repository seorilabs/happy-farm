/// <reference types="jest" />

import remoteConfigTemplate from '../../../../../remoteconfig.template.json';

// firebase/remote-config는 헤드리스 테스트에서 직접 호출할 수 없으므로 모킹한다.
const mockGetBoolean = jest.fn();
const mockGetNumber = jest.fn();
const mockGetString = jest.fn();
const mockFetchAndActivate = jest.fn(async () => true);
const mockIsSupported = jest.fn(async () => true);
const mockGetRemoteConfig = jest.fn(() => ({ settings: {}, defaultConfig: {} }));

jest.mock('firebase/remote-config', () => ({
  fetchAndActivate: mockFetchAndActivate,
  getBoolean: mockGetBoolean,
  getNumber: mockGetNumber,
  getString: mockGetString,
  getRemoteConfig: mockGetRemoteConfig,
  isSupported: mockIsSupported,
}));

jest.mock('../app', () => ({
  getAppsInTossFirebaseApp: () => ({}),
}));

// 모듈은 initializePromise/activeRemoteConfig 등 모듈 스코프 상태를 가지므로
// 테스트마다 resetModules로 새 인스턴스를 받아 상태 오염을 막는다.
function loadAdapter() {
  return jest.requireActual<typeof import('../remoteConfig')>('../remoteConfig');
}

beforeEach(() => {
  jest.resetModules();
  mockGetBoolean.mockReset();
  mockGetNumber.mockReset();
  mockGetString.mockReset();
  mockFetchAndActivate.mockReset().mockResolvedValue(true);
  mockIsSupported.mockReset().mockResolvedValue(true);
  mockGetRemoteConfig.mockReset().mockReturnValue({ settings: {}, defaultConfig: {} });
});

describe('AppsInToss Remote Config 어댑터', () => {
  test('초기화 전에는 원격 게터가 안전 기본값으로 폴백한다', async () => {
    const adapter = loadAdapter();
    expect(adapter.getAppsInTossRemoteBoolean('mobile_ads_global_enabled')).toBe(true);
    expect(adapter.getAppsInTossRemoteBoolean('analytics_collection_enabled')).toBe(true);
    // 초기화 전에는 firebase 게터를 호출하지 않는다.
    expect(mockGetBoolean).not.toHaveBeenCalled();
  });

  test('활성화 후에는 원격값을 읽어 반영한다', async () => {
    const adapter = loadAdapter();
    mockGetBoolean.mockReturnValue(false);

    const result = await adapter.initializeAppsInTossRemoteConfig({} as never);

    expect(result.status).toBe('ready');
    expect(mockFetchAndActivate).toHaveBeenCalledTimes(1);
    expect(adapter.getAppsInTossRemoteBoolean('mobile_ads_global_enabled')).toBe(false);
    // 광고 enabled 상태도 원격값으로 갱신된다.
    expect(adapter.getAppsInTossAdsEnabled()).toBe(false);
  });

  test('원격 게터가 던지면 안전 기본값으로 폴백한다', async () => {
    const adapter = loadAdapter();
    await adapter.initializeAppsInTossRemoteConfig({} as never);
    mockGetBoolean.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(adapter.getAppsInTossRemoteBoolean('mobile_ads_global_enabled')).toBe(true);
  });

  test('숫자/문자열 게터도 활성화 후 원격값을 반환한다', async () => {
    const adapter = loadAdapter();
    mockGetNumber.mockReturnValue(42);
    mockGetString.mockReturnValue('remote');
    await adapter.initializeAppsInTossRemoteConfig({} as never);
    expect(adapter.getAppsInTossRemoteNumber('mobile_ads_global_enabled')).toBe(42);
    expect(adapter.getAppsInTossRemoteString('analytics_collection_enabled')).toBe('remote');
  });

  test('미지원 환경에서는 unsupported로 종료하고 기본값을 유지한다', async () => {
    mockIsSupported.mockResolvedValue(false);
    const adapter = loadAdapter();

    const result = await adapter.initializeAppsInTossRemoteConfig({} as never);

    expect(result.status).toBe('unsupported');
    expect(mockFetchAndActivate).not.toHaveBeenCalled();
    // 활성화 인스턴스가 없으므로 게터는 기본값으로 폴백한다.
    expect(adapter.getAppsInTossRemoteBoolean('mobile_ads_global_enabled')).toBe(true);
  });

  test('fetch 오류 시 error로 종료하고 기본값으로 폴백한다', async () => {
    mockFetchAndActivate.mockRejectedValue(new Error('network'));
    const adapter = loadAdapter();

    const result = await adapter.initializeAppsInTossRemoteConfig({} as never);

    expect(result.status).toBe('error');
    expect(adapter.getAppsInTossRemoteBoolean('mobile_ads_global_enabled')).toBe(true);
  });

  test('초기화 실패(error) 후에도 재시도가 가능하다', async () => {
    const adapter = loadAdapter();
    // 1차: 일시 오류
    mockFetchAndActivate.mockRejectedValueOnce(new Error('network'));
    const first = await adapter.initializeAppsInTossRemoteConfig({} as never);
    expect(first.status).toBe('error');

    // 2차: 정상 활성화(메모이즈가 해제되어 재시도된다)
    mockGetBoolean.mockReturnValue(false);
    const second = await adapter.initializeAppsInTossRemoteConfig({} as never);
    expect(second.status).toBe('ready');
    expect(mockFetchAndActivate).toHaveBeenCalledTimes(2);
    expect(adapter.getAppsInTossRemoteBoolean('mobile_ads_global_enabled')).toBe(false);
  });

  test('미지원으로 끝난 뒤 환경이 바뀌면 재시도로 활성화된다', async () => {
    mockIsSupported.mockResolvedValueOnce(false);
    const adapter = loadAdapter();
    const first = await adapter.initializeAppsInTossRemoteConfig({} as never);
    expect(first.status).toBe('unsupported');

    const second = await adapter.initializeAppsInTossRemoteConfig({} as never);
    expect(second.status).toBe('ready');
  });
});

describe('어댑터 기본값과 remoteconfig.template.json 정합성', () => {
  const templateParams = remoteConfigTemplate.parameters as Record<
    string,
    { valueType: string; defaultValue: { value: string } } | undefined
  >;

  test('AIT가 소비하는 모든 키는 템플릿에 정의되어 있다', async () => {
    const adapter = loadAdapter();
    for (const key of Object.keys(adapter.APPS_IN_TOSS_REMOTE_CONFIG_DEFAULTS)) {
      expect(templateParams[key]).toBeDefined();
    }
  });

  test('불리언 기본값은 템플릿 valueType(BOOLEAN)/defaultValue와 일치한다', async () => {
    const adapter = loadAdapter();
    const defaults = adapter.APPS_IN_TOSS_REMOTE_CONFIG_DEFAULTS as Record<string, boolean>;
    for (const [key, value] of Object.entries(defaults)) {
      const param = templateParams[key];
      expect(param).toBeDefined();
      if (param == null) continue;
      expect(param.valueType).toBe('BOOLEAN');
      expect(param.defaultValue.value).toBe(String(value));
    }
  });
});
