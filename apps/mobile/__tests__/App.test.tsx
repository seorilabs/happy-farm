/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { RewardedAd } from 'react-native-google-mobile-ads';
import App from '../App';
import { isInternalTestBuild } from '../src/buildChannel';

jest.mock('../src/audio/assets/harvest_coin.wav', () => 1);
jest.mock('../src/audio/assets/farm_bgm_loop.wav', () => 2);

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-sound', () => {
  class MockSound {
    static MAIN_BUNDLE = '';
    static setCategory = jest.fn();

    play = jest.fn(() => this);
    pause = jest.fn(() => this);
    release = jest.fn(() => this);
    setCurrentTime = jest.fn(() => this);
    setNumberOfLoops = jest.fn(() => this);
    setVolume = jest.fn(() => this);
    stop = jest.fn((callback?: () => void) => {
      callback?.();
      return this;
    });

    constructor(_asset: string, _basePath?: string, callback?: (error?: unknown) => void) {
      void Promise.resolve().then(() => callback?.());
    }

    isLoaded() {
      return true;
    }

    isPlaying() {
      return false;
    }
  }

  return {
    __esModule: true,
    default: MockSound,
  };
});

jest.mock('@react-native-firebase/app', () => ({
  getApps: jest.fn(() => []),
}));

jest.mock('@react-native-firebase/analytics', () => ({
  getAnalytics: jest.fn(() => ({})),
  logEvent: jest.fn(() => Promise.resolve()),
  setAnalyticsCollectionEnabled: jest.fn(() => Promise.resolve()),
}));

jest.mock('@react-native-firebase/crashlytics', () => ({
  getCrashlytics: jest.fn(() => ({})),
  log: jest.fn(),
  recordError: jest.fn(),
  setCrashlyticsCollectionEnabled: jest.fn(() => Promise.resolve()),
}));

jest.mock('@react-native-firebase/remote-config', () => ({
  fetchAndActivate: jest.fn(() => Promise.resolve(false)),
  getBoolean: jest.fn(() => true),
  getNumber: jest.fn(() => 1),
  getRemoteConfig: jest.fn(() => ({})),
  getString: jest.fn(() => ''),
  setConfigSettings: jest.fn(() => Promise.resolve()),
  setDefaults: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-google-mobile-ads', () => {
  const rewardedAd = {
    addAdEventsListener: jest.fn(() => jest.fn()),
    load: jest.fn(),
    removeAllListeners: jest.fn(),
    show: jest.fn(() => Promise.resolve()),
  };

  return {
    __esModule: true,
    default: jest.fn(() => ({ initialize: jest.fn(() => Promise.resolve()) })),
    AdEventType: { CLOSED: 'closed', ERROR: 'error' },
    RewardedAd: { createForAdRequest: jest.fn(() => rewardedAd) },
    RewardedAdEventType: { EARNED_REWARD: 'earned_reward', LOADED: 'loaded' },
    TestIds: { REWARDED: 'test-rewarded' },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

test('renders correctly', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    await Promise.resolve();
  });

  const createRewardedAd = RewardedAd.createForAdRequest as jest.Mock;
  if (isInternalTestBuild) {
    expect(createRewardedAd).not.toHaveBeenCalled();
  } else {
    expect(createRewardedAd).toHaveBeenCalled();
  }

  ReactTestRenderer.act(() => {
    renderer?.unmount();
  });
});
