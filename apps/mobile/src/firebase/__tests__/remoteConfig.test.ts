import { fetchAndActivate, getRemoteConfig } from '@react-native-firebase/remote-config';

import { isFirebaseConfigured } from '../app';
import { initializeMobileRemoteConfig, MOBILE_REMOTE_CONFIG_DEFAULTS } from '../remoteConfig';

// RN Firebase v25 는 setConfigSettings/setDefaults 함수를 제거하고 인스턴스 속성
// (settings/defaultConfig) 할당 방식으로 바꿨다. 이 테스트는 그 마이그레이션이
// 실제로 인스턴스에 반영되는지, 그리고 settings 키(fetchTimeoutMillis 등)가
// 오타/변경으로 조용히 폴백되지 않는지를 고정한다.
jest.mock('@react-native-firebase/remote-config', () => ({
  getRemoteConfig: jest.fn(),
  fetchAndActivate: jest.fn(),
  getString: jest.fn(() => ''),
  getBoolean: jest.fn(),
  getNumber: jest.fn(),
}));
jest.mock('../app', () => ({ isFirebaseConfigured: jest.fn() }));
jest.mock('../crashlytics', () => ({ recordNonFatalError: jest.fn() }));
jest.mock('../../../../../packages/farm-core/src', () => ({
  applyAdLimitsOverrides: jest.fn(),
  parseAdLimitsOverrides: jest.fn(() => ({})),
}));

const mockedGetRemoteConfig = jest.mocked(getRemoteConfig);
const mockedFetchAndActivate = jest.mocked(fetchAndActivate);
const mockedIsFirebaseConfigured = jest.mocked(isFirebaseConfigured);

type MutableRemoteConfig = ReturnType<typeof getRemoteConfig>;

function createMockRemoteConfig(): MutableRemoteConfig {
  return {} as MutableRemoteConfig;
}

describe('initializeMobileRemoteConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('configured 상태에서 v25 인스턴스 속성(settings/defaultConfig)을 할당하고 activate 한다', async () => {
    mockedIsFirebaseConfigured.mockReturnValue(true);
    const remoteConfig = createMockRemoteConfig();
    mockedGetRemoteConfig.mockReturnValue(remoteConfig);
    mockedFetchAndActivate.mockResolvedValue(true);

    const result = await initializeMobileRemoteConfig();

    // v25 API: setConfigSettings/setDefaults 가 아니라 속성 할당이 실제로 일어났는지.
    // 키명이 오타/변경되면 이 toEqual 이 깨져 조용한 폴백을 차단한다.
    expect(remoteConfig.settings).toEqual({
      fetchTimeoutMillis: 10_000,
      minimumFetchIntervalMillis: expect.any(Number),
    });
    expect(remoteConfig.defaultConfig).toEqual(MOBILE_REMOTE_CONFIG_DEFAULTS);
    expect(mockedFetchAndActivate).toHaveBeenCalledWith(remoteConfig);
    expect(result).toEqual({ status: 'ready', activated: true });
  });

  it('firebase 미설정이면 원격 설정을 건드리지 않고 skip 한다', async () => {
    mockedIsFirebaseConfigured.mockReturnValue(false);

    const result = await initializeMobileRemoteConfig();

    expect(result).toEqual({ status: 'skipped', activated: false });
    expect(mockedGetRemoteConfig).not.toHaveBeenCalled();
    expect(mockedFetchAndActivate).not.toHaveBeenCalled();
  });

  it('activate 가 실패하면 error 상태를 반환한다', async () => {
    mockedIsFirebaseConfigured.mockReturnValue(true);
    mockedGetRemoteConfig.mockReturnValue(createMockRemoteConfig());
    mockedFetchAndActivate.mockRejectedValue(new Error('network down'));

    const result = await initializeMobileRemoteConfig();

    expect(result).toEqual({ status: 'error', activated: false });
  });
});
