type MockPlatformOptions = {
  appId: string;
  baseUrl: string;
  ingestBaseUrl: string;
  eventAllowlist: readonly string[];
  eventContext: () => Record<string, string>;
  sessionStore?: unknown;
};

const mockAppLogin = jest.fn(async () => ({
  authorizationCode: 'transient-code',
  referrer: 'SANDBOX' as const,
}));

const mockGetAnonymousKey = jest.fn<
  Promise<{ hash: string; type: 'HASH' } | 'ERROR' | undefined>,
  []
>(async () => ({ hash: 'anonymous-hash', type: 'HASH' as const }));

// 팩토리는 import 호이스팅 시점에 실행되므로 mock 함수를 그대로 넣으면 아직
// 초기화되지 않은 값이 박힌다. 호출 시점에 참조하도록 한 겹 감싼다.
jest.mock('@apps-in-toss/framework', () => ({
  appLogin: () => mockAppLogin(),
  getAnonymousKey: () => mockGetAnonymousKey(),
}));

jest.mock('@seorilabs/platform-sdk', () => {
  const platform = {
    events: {
      track: jest.fn(),
      flush: jest.fn(() => Promise.resolve()),
    },
    session: {
      token: jest.fn(() => Promise.resolve('platform-token')),
    },
    signIn: jest.fn(() => Promise.resolve()),
    start: jest.fn(),
    shutdown: jest.fn(() => Promise.resolve()),
  };
  return {
    __esModule: true,
    createPlatform: jest.fn(() => platform),
  };
});

import { PLATFORM_EVENT_ALLOWLIST, RELEASE_INFO } from '../../../../packages/farm-core/src';
import {
  ensureAppsInTossPlatformSession,
  flushAppsInTossPlatformEvents,
  shutdownAppsInTossPlatformEvents,
  startAppsInTossPlatformEvents,
  trackAppsInTossPlatformEvent,
} from '../platformEvents';

const platformSdkMock = jest.requireMock('@seorilabs/platform-sdk') as {
  createPlatform: jest.MockedFunction<(options: MockPlatformOptions) => {
    events: { track: jest.Mock; flush: jest.Mock };
    session: { token: jest.Mock };
    signIn: jest.Mock;
    start: jest.Mock;
    shutdown: jest.Mock;
  }>;
};
const mockCreatePlatform = platformSdkMock.createPlatform;
const mockPlatform = mockCreatePlatform.mock.results[0]?.value;

describe('AppsInToss Platform events', () => {
  test('익명 AIT context와 고정 allowlist로 SDK를 생성한다', () => {
    expect(mockCreatePlatform).toHaveBeenCalledTimes(2);
    const options = mockCreatePlatform.mock.calls[0]?.[0];
    expect(options).toMatchObject({
      appId: 'happy-farm',
      baseUrl: 'https://platform-api-306278488979.asia-northeast3.run.app',
      ingestBaseUrl: 'https://platform-ingest-306278488979.asia-northeast3.run.app',
      eventAllowlist: PLATFORM_EVENT_ALLOWLIST,
    });
    expect(options?.eventContext()).toEqual({
      platform: 'ait',
      appVersion: RELEASE_INFO.versionName,
      locale: expect.any(String),
    });
    expect(options).not.toHaveProperty('sessionStore');

    expect(mockCreatePlatform.mock.calls[1]?.[0]).toMatchObject({
      appId: 'happy-farm',
      baseUrl: 'https://platform-ads-306278488979.asia-northeast3.run.app',
    });
  });

  test('tracker와 lifecycle을 SDK에 위임한다', async () => {
    trackAppsInTossPlatformEvent('game_start', { source: 'test' });
    startAppsInTossPlatformEvents();
    await flushAppsInTossPlatformEvents();
    await shutdownAppsInTossPlatformEvents();

    expect(mockPlatform?.events.track).toHaveBeenCalledWith({
      name: 'game_start',
      params: { source: 'test' },
    });
    expect(mockPlatform?.start).toHaveBeenCalledTimes(1);
    expect(mockPlatform?.events.flush).toHaveBeenCalledTimes(1);
    expect(mockPlatform?.shutdown).toHaveBeenCalledTimes(1);
  });
});

describe('Platform 세션 부트스트랩', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    mockPlatform?.session.token.mockReset();
    mockPlatform?.signIn.mockReset();
    mockPlatform?.signIn.mockResolvedValue(undefined);
    mockGetAnonymousKey.mockReset();
    mockGetAnonymousKey.mockResolvedValue({ hash: 'anonymous-hash', type: 'HASH' });
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test('세션이 없으면 익명 키로 Platform 계정을 연다', async () => {
    mockPlatform?.session.token.mockRejectedValue(new Error('no session'));

    await expect(ensureAppsInTossPlatformSession()).resolves.toBe(true);

    expect(mockGetAnonymousKey).toHaveBeenCalledTimes(1);
    expect(mockPlatform?.signIn).toHaveBeenCalledWith({
      kind: 'anonymous',
      value: 'anonymous-hash',
    });
    // 부팅 경로는 토스 인증 화면을 띄우면 안 된다.
    expect(mockAppLogin).not.toHaveBeenCalled();
  });

  test('이미 세션이 있으면 익명 키를 요청하지 않는다', async () => {
    mockPlatform?.session.token.mockResolvedValue('platform-token');

    await expect(ensureAppsInTossPlatformSession()).resolves.toBe(true);

    expect(mockGetAnonymousKey).not.toHaveBeenCalled();
    expect(mockPlatform?.signIn).not.toHaveBeenCalled();
  });

  test('익명 키를 못 받으면 false를 돌려주고 실패를 남긴다', async () => {
    mockPlatform?.session.token.mockRejectedValue(new Error('no session'));
    mockGetAnonymousKey.mockResolvedValue('ERROR');

    await expect(ensureAppsInTossPlatformSession()).resolves.toBe(false);

    expect(mockPlatform?.signIn).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });
});
