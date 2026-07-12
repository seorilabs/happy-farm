/// <reference types="jest" />

import remoteConfigTemplate from '../../../../../remoteconfig.template.json';

// AIT는 Granite RN 런타임이라 firebase/remote-config 대신 Remote Config REST fetch로
// 원격값을 받는다. 테스트는 AppsInToss Storage와 전역 fetch를 모의한다.

const mockStorage = {
  getItem: jest.fn<Promise<string | null>, [string]>(),
  setItem: jest.fn<Promise<void>, [string, string]>(),
  removeItem: jest.fn<Promise<void>, [string]>(),
};

jest.mock('@apps-in-toss/framework', () => ({
  Storage: mockStorage,
}));

// 모듈은 initializePromise/activeEntries 등 모듈 스코프 상태를 가지므로
// 테스트마다 resetModules로 새 인스턴스를 받아 상태 오염을 막는다.
function loadAdapter() {
  return jest.requireActual<typeof import('../remoteConfig')>('../remoteConfig');
}

const mockFetch = jest.fn();

function respondWith(entries: Record<string, string>) {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ entries, state: 'UPDATE', templateVersion: '1' }),
  } as unknown as Response);
}

beforeEach(() => {
  jest.resetModules();
  mockStorage.getItem.mockReset().mockResolvedValue(null);
  mockStorage.setItem.mockReset().mockResolvedValue(undefined);
  mockStorage.removeItem.mockReset().mockResolvedValue(undefined);
  mockFetch.mockReset();
  respondWith({ mobile_ads_global_enabled: 'true' });
  (globalThis as { fetch: typeof fetch }).fetch = mockFetch as unknown as typeof fetch;
});

describe('AppsInToss Remote Config 어댑터 (REST)', () => {
  test('초기화 전에는 원격 게터가 안전 기본값으로 폴백하고 네트워크를 치지 않는다', async () => {
    const adapter = loadAdapter();
    expect(adapter.getAppsInTossRemoteBoolean('mobile_ads_global_enabled')).toBe(true);
    expect(adapter.getAppsInTossRemoteBoolean('analytics_collection_enabled')).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('활성화 후에는 원격값을 읽어 반영한다', async () => {
    respondWith({ mobile_ads_global_enabled: 'false' });
    const adapter = loadAdapter();

    const result = await adapter.initializeAppsInTossRemoteConfig();

    expect(result.status).toBe('ready');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(adapter.getAppsInTossRemoteBoolean('mobile_ads_global_enabled')).toBe(false);
    // 광고 enabled 상태도 원격값으로 갱신된다.
    expect(adapter.getAppsInTossAdsEnabled()).toBe(false);
  });

  test('불리언은 truthy 토큰(1/true/yes 등)을 인정하고 그 외는 false다', async () => {
    respondWith({ mobile_ads_global_enabled: '1', analytics_collection_enabled: 'no' });
    const adapter = loadAdapter();
    await adapter.initializeAppsInTossRemoteConfig();

    expect(adapter.getAppsInTossRemoteBoolean('mobile_ads_global_enabled')).toBe(true);
    expect(adapter.getAppsInTossRemoteBoolean('analytics_collection_enabled')).toBe(false);
  });

  test('숫자/문자열 게터도 활성화 후 원격값을 반환한다', async () => {
    respondWith({ mobile_ads_global_enabled: '42', analytics_collection_enabled: 'remote' });
    const adapter = loadAdapter();
    await adapter.initializeAppsInTossRemoteConfig();

    expect(adapter.getAppsInTossRemoteNumber('mobile_ads_global_enabled')).toBe(42);
    expect(adapter.getAppsInTossRemoteString('analytics_collection_enabled')).toBe('remote');
  });

  test('응답에 없는 키는 안전 기본값으로 폴백한다', async () => {
    respondWith({ mobile_ads_global_enabled: 'false' });
    const adapter = loadAdapter();
    await adapter.initializeAppsInTossRemoteConfig();

    // 응답에 없는 문자열 키 → 기본값('')
    expect(adapter.getAppsInTossRemoteString('appsintoss_interstitial_ad_group_id')).toBe('');
  });

  test('fetch 오류 시 error로 종료하고 기본값으로 폴백한다', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    const adapter = loadAdapter();

    const result = await adapter.initializeAppsInTossRemoteConfig();

    expect(result.status).toBe('error');
    expect(adapter.getAppsInTossRemoteBoolean('mobile_ads_global_enabled')).toBe(true);
  });

  test('non-2xx 응답도 error로 종료하고 기본값으로 폴백한다', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403, text: async () => 'forbidden' } as unknown as Response);
    const adapter = loadAdapter();

    const result = await adapter.initializeAppsInTossRemoteConfig();

    expect(result.status).toBe('error');
    expect(adapter.getAppsInTossRemoteBoolean('mobile_ads_global_enabled')).toBe(true);
  });

  test('초기화 실패(error) 후에도 재시도가 가능하다', async () => {
    const adapter = loadAdapter();
    // 1차: 일시 오류
    mockFetch.mockRejectedValueOnce(new Error('network'));
    const first = await adapter.initializeAppsInTossRemoteConfig();
    expect(first.status).toBe('error');

    // 2차: 정상 활성화(메모이즈가 해제되어 재시도된다)
    respondWith({ mobile_ads_global_enabled: 'false' });
    const second = await adapter.initializeAppsInTossRemoteConfig();
    expect(second.status).toBe('ready');
    expect(adapter.getAppsInTossRemoteBoolean('mobile_ads_global_enabled')).toBe(false);
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
    const defaults = adapter.APPS_IN_TOSS_REMOTE_CONFIG_DEFAULTS as Record<string, boolean | string>;
    for (const [key, value] of Object.entries(defaults)) {
      if (typeof value !== 'boolean') continue;
      const param = templateParams[key];
      expect(param).toBeDefined();
      if (param == null) continue;
      expect(param.valueType).toBe('BOOLEAN');
      expect(param.defaultValue.value).toBe(String(value));
    }
  });

  test('문자열 기본값은 템플릿 valueType(STRING)/defaultValue와 일치한다', async () => {
    const adapter = loadAdapter();
    const defaults = adapter.APPS_IN_TOSS_REMOTE_CONFIG_DEFAULTS as Record<string, boolean | string>;
    for (const [key, value] of Object.entries(defaults)) {
      if (typeof value !== 'string') continue;
      const param = templateParams[key];
      expect(param).toBeDefined();
      if (param == null) continue;
      expect(param.valueType).toBe('STRING');
      expect(param.defaultValue.value).toBe(value);
    }
  });

  test('전면 광고 그룹 ID 기본값은 빈 문자열이다(미설정 시 지면 비활성)', async () => {
    const adapter = loadAdapter();
    expect(adapter.APPS_IN_TOSS_REMOTE_CONFIG_DEFAULTS.appsintoss_interstitial_ad_group_id).toBe('');
  });
});
