type MockPlatformOptions = {
  appId: string;
  baseUrl: string;
  ingestBaseUrl: string;
  eventAllowlist: readonly string[];
  eventContext: () => Record<string, string>;
  sessionStore?: unknown;
};

jest.mock('@seorilabs/platform-sdk', () => {
  const platform = {
    events: {
      track: jest.fn(),
      flush: jest.fn(() => Promise.resolve()),
    },
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
  flushAppsInTossPlatformEvents,
  shutdownAppsInTossPlatformEvents,
  startAppsInTossPlatformEvents,
  trackAppsInTossPlatformEvent,
} from '../platformEvents';

const platformSdkMock = jest.requireMock('@seorilabs/platform-sdk') as {
  createPlatform: jest.MockedFunction<(options: MockPlatformOptions) => {
    events: { track: jest.Mock; flush: jest.Mock };
    start: jest.Mock;
    shutdown: jest.Mock;
  }>;
};
const mockCreatePlatform = platformSdkMock.createPlatform;
const mockPlatform = mockCreatePlatform.mock.results[0]?.value;

describe('AppsInToss Platform events', () => {
  test('익명 AIT context와 고정 allowlist로 SDK를 생성한다', () => {
    expect(mockCreatePlatform).toHaveBeenCalledTimes(1);
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
