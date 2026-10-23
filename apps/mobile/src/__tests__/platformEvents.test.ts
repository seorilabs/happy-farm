type MockPlatformOptions = {
  appId: string;
  baseUrl: string;
  ingestBaseUrl?: string;
  eventAllowlist?: readonly string[];
  eventContext?: () => Record<string, string>;
  presenceEnabled?: boolean;
  presenceContext?: () => Record<string, string>;
  sessionStore?: unknown;
  gateStore?: { load: () => Promise<unknown>; save: (log: { version: string; promptedAt: number }) => Promise<void> };
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

jest.mock('react-native/Libraries/Settings/Settings', () => ({
  __esModule: true,
  default: { get: jest.fn(), set: jest.fn() },
}));

jest.mock('@seorilabs/platform-sdk', () => {
  const platform = {
    events: {
      track: jest.fn(),
      flush: jest.fn(() => Promise.resolve()),
    },
    presence: {
      start: jest.fn(),
      stop: jest.fn(),
      resume: jest.fn(),
    },
    session: { token: jest.fn(() => Promise.resolve('platform-token')) },
    config: {
      fetch: jest.fn(async () => undefined),
      gate: jest.fn(() => ({ kind: 'recommended', message: 'SDK fallback', recommendedVersion: '1.13.0' })),
      current: jest.fn(() => ({ sdk: { message: '' } })),
      shouldPrompt: jest.fn(async () => true),
      markPrompted: jest.fn(async () => undefined),
    },
    iap: {},
    signIn: jest.fn(() => Promise.resolve()),
    start: jest.fn(),
    shutdown: jest.fn(() => Promise.resolve()),
  };
  return {
    __esModule: true,
    createPlatform: jest.fn(() => platform),
  };
});

jest.mock('../firebase/auth', () => ({
  getMobileFirebaseIdToken: jest.fn(() => Promise.resolve('firebase-id-token')),
}));

import { Platform, Settings } from 'react-native';
import { PLATFORM_EVENT_ALLOWLIST, RELEASE_INFO } from '../../../../packages/farm-core/src';
import {
  flushMobilePlatformEvents,
  handleMobilePlatformAppStateChange,
  shutdownMobilePlatformEvents,
  startMobilePlatformEvents,
  trackMobilePlatformEvent,
  mobileUpdateGate,
} from '../platformEvents';

const platformSdkMock = jest.requireMock('@seorilabs/platform-sdk') as {
  createPlatform: jest.MockedFunction<(options: MockPlatformOptions) => {
    events: { track: jest.Mock; flush: jest.Mock };
    presence: { start: jest.Mock; stop: jest.Mock; resume: jest.Mock };
    start: jest.Mock;
    shutdown: jest.Mock;
    config: { fetch: jest.Mock; gate: jest.Mock; current: jest.Mock; shouldPrompt: jest.Mock; markPrompted: jest.Mock };
  }>;
};
const mockCreatePlatform = platformSdkMock.createPlatform;
const mockPlatform = mockCreatePlatform.mock.results[0]?.value;

describe('Mobile Platform events', () => {
  test('이벤트 OS 언어는 저장된 UI 언어로 요청한 config locale와 별도로 유지한다', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    const setting = jest.spyOn(Settings, 'get').mockImplementation((key: string) => key === 'AppleLanguages' ? ['ko-KR'] : undefined);
    try {
      await mobileUpdateGate.load('en-US');
      expect(mockCreatePlatform.mock.calls[0]?.[0]?.eventContext?.().locale).toBe('ko-KR');
      expect(mockPlatform.config.fetch).toHaveBeenLastCalledWith(expect.objectContaining({ locale: 'en-US' }));
    } finally {
      setting.mockRestore();
      os.restore();
    }
  });
  test('설정 조회와 노출 이력 판단을 실제 SDK 계약에 위임하고 빈 메시지는 현지화용으로 남긴다', async () => {
    const state = await mobileUpdateGate.load('en-US');
    expect(mockPlatform.config.fetch).toHaveBeenCalledWith({ appVersion: RELEASE_INFO.versionName, platform: Platform.OS === 'ios' ? 'ios' : 'android', locale: 'en-US' });
    expect(state).toEqual({ kind: 'recommended', message: '', recommendedVersion: '1.13.0' });
    expect(await mobileUpdateGate.shouldPrompt(state)).toBe(true);
    await mobileUpdateGate.markPrompted(state);
    expect(mockPlatform.config.shouldPrompt).toHaveBeenCalledWith(state);
    expect(mockPlatform.config.markPrompted).toHaveBeenCalledWith(state);
    expect(mockCreatePlatform.mock.calls[0]?.[0]?.gateStore).toMatchObject({ load: expect.any(Function), save: expect.any(Function) });
  });
  test('실제 OS context와 고정 allowlist로 SDK를 생성한다', () => {
    expect(mockCreatePlatform).toHaveBeenCalledTimes(2);
    const options = mockCreatePlatform.mock.calls[0]?.[0];
    expect(options).toMatchObject({
      appId: 'happy-farm',
      baseUrl: 'https://platform-api-306278488979.asia-northeast3.run.app',
      ingestBaseUrl: 'https://platform-ingest-306278488979.asia-northeast3.run.app',
      eventAllowlist: PLATFORM_EVENT_ALLOWLIST,
      presenceEnabled: false,
    });
    expect(options?.eventContext?.()).toEqual({
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      appVersion: RELEASE_INFO.versionName,
      locale: expect.any(String),
    });
    expect(options?.presenceContext?.()).toEqual({
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      appVersion: RELEASE_INFO.versionName,
    });
    expect(options).not.toHaveProperty('sessionStore');
  });

  test('tracker와 lifecycle을 SDK에 위임한다', async () => {
    trackMobilePlatformEvent('game_start', { source: 'test' });
    startMobilePlatformEvents();
    await flushMobilePlatformEvents();
    await shutdownMobilePlatformEvents();

    expect(mockPlatform?.events.track).toHaveBeenCalledWith({
      name: 'game_start',
      params: {
        app_market: Platform.OS === 'ios' ? 'app_store' : 'google_play',
        runtime_platform: Platform.OS === 'ios' ? 'ios' : 'android',
        release_version: RELEASE_INFO.versionName,
        source: 'test',
      },
    });
    expect(mockPlatform?.start).toHaveBeenCalledTimes(1);
    expect(mockPlatform?.events.flush).toHaveBeenCalledTimes(1);
    expect(mockPlatform?.shutdown).toHaveBeenCalledTimes(1);
  });

  test('background에서 Presence를 멈추고 foreground에서 비차단 재개한다', () => {
    mockPlatform?.events.flush.mockClear();
    mockPlatform?.presence.start.mockClear();
    mockPlatform?.presence.stop.mockClear();
    mockPlatform?.presence.resume.mockClear();

    handleMobilePlatformAppStateChange('background');
    handleMobilePlatformAppStateChange('active');

    expect(mockPlatform?.presence.stop).toHaveBeenCalledTimes(1);
    expect(mockPlatform?.events.flush).toHaveBeenCalledTimes(1);
    expect(mockPlatform?.presence.start).toHaveBeenCalledTimes(1);
    expect(mockPlatform?.presence.resume).toHaveBeenCalledTimes(1);
  });
});

describe('Mobile Platform Ads 빌드 표식', () => {
  const runtime = globalThis as unknown as { __DEV__: boolean; fetch: typeof fetch };
  const originalDev = runtime.__DEV__;
  const originalFetch = runtime.fetch;

  afterEach(() => {
    runtime.__DEV__ = originalDev;
    runtime.fetch = originalFetch;
  });

  // 광고 client는 모듈 로드 시 생성되므로 __DEV__를 바꾼 뒤 격리된 registry에서 다시 불러온다.
  test.each([
    [true, 'debug'],
    [false, undefined],
  ])('__DEV__=%s 빌드의 광고 요청 X-Seori-Build는 %s', async (dev, expected) => {
    runtime.__DEV__ = dev;
    const fetchMock = jest.fn<Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>, [string, RequestInit?]>(
      async () => ({ ok: true, status: 200, json: async () => ({ ok: true, result: {} }) }),
    );
    runtime.fetch = fetchMock as unknown as typeof fetch;

    let isolated: typeof import('../platformEvents') | undefined;
    jest.isolateModules(() => {
      isolated = jest.requireActual<typeof import('../platformEvents')>('../platformEvents');
    });
    await isolated?.mobilePlatformAds.policy();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers['X-Seori-App']).toBe('happy-farm');
    expect(headers['X-Seori-Build']).toBe(expected);
  });
});
