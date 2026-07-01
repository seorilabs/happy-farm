/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { AdEventType, RewardedAd, RewardedAdEventType } from 'react-native-google-mobile-ads';
import App from '../App';
import { useAdMobRewardedAd } from '../src/ads/adMobRewardedAd';

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

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: jest.fn(() => ({ currentUser: null })),
  signInAnonymously: jest.fn(() => Promise.resolve({ user: { uid: 'test-user', isAnonymous: true } })),
}));

jest.mock('@react-native-firebase/crashlytics', () => ({
  getCrashlytics: jest.fn(() => ({})),
  log: jest.fn(),
  recordError: jest.fn(),
  setCrashlyticsCollectionEnabled: jest.fn(() => Promise.resolve()),
}));

jest.mock('@react-native-firebase/firestore', () => ({
  deleteDoc: jest.fn(() => Promise.resolve()),
  doc: jest.fn((_firestore, ...path: string[]) => ({ path })),
  getDoc: jest.fn(() => Promise.resolve({ exists: () => false, data: () => null })),
  getFirestore: jest.fn(() => ({})),
  serverTimestamp: jest.fn(() => 'server-timestamp'),
  setDoc: jest.fn(() => Promise.resolve()),
}));

jest.mock('@react-native-firebase/remote-config', () => ({
  fetchAndActivate: jest.fn(() => Promise.resolve(false)),
  getBoolean: jest.fn((_remoteConfig, key: string) => key !== 'cloud_save_backup_enabled'),
  getNumber: jest.fn(() => 1),
  getRemoteConfig: jest.fn(() => ({})),
  getString: jest.fn(() => ''),
  setConfigSettings: jest.fn(() => Promise.resolve()),
  setDefaults: jest.fn(() => Promise.resolve()),
}));

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    cancelTriggerNotification: jest.fn(() => Promise.resolve()),
    createChannel: jest.fn(() => Promise.resolve('harvest-ready')),
    createTriggerNotification: jest.fn(() => Promise.resolve('happy-farm-harvest-ready')),
    requestPermission: jest.fn(() => Promise.resolve({ authorizationStatus: 1 })),
    getInitialNotification: jest.fn(() => Promise.resolve(null)),
    onForegroundEvent: jest.fn(() => jest.fn()),
  },
  AndroidImportance: { DEFAULT: 3 },
  AuthorizationStatus: { AUTHORIZED: 1, PROVISIONAL: 2 },
  EventType: { DISMISSED: 0, PRESS: 1, ACTION_PRESS: 2, DELIVERED: 3 },
  TriggerType: { TIMESTAMP: 0 },
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

type MockRewardedAd = {
  addAdEventsListener: jest.Mock;
  load: jest.Mock;
  removeAllListeners: jest.Mock;
  show: jest.Mock<Promise<void>, []>;
};
type MobileRewardedAdController = ReturnType<typeof useAdMobRewardedAd>;

function getLatestRewardedAdMock() {
  const createRewardedAd = RewardedAd.createForAdRequest as jest.Mock;
  const lastResult = createRewardedAd.mock.results[createRewardedAd.mock.results.length - 1];
  if (lastResult?.type !== 'return') {
    throw new Error('RewardedAd.createForAdRequest was not called.');
  }
  return lastResult.value as MockRewardedAd;
}

function getRewardedAdEventListener(rewardedAd: MockRewardedAd) {
  const listener = rewardedAd.addAdEventsListener.mock.calls[0]?.[0];
  if (typeof listener !== 'function') {
    throw new Error('Rewarded ad event listener was not registered.');
  }
  return listener as (event: { type: string; payload?: unknown }) => void;
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('renders correctly', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    await Promise.resolve();
  });

  const createRewardedAd = RewardedAd.createForAdRequest as jest.Mock;
  expect(createRewardedAd).toHaveBeenCalledWith('test-rewarded', {
    requestNonPersonalizedAdsOnly: true,
  });

  await ReactTestRenderer.act(async () => {
    renderer?.unmount();
  });
}, 30000);

test('waits for rewarded ad close before resolving an earned reward', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  let controller: MobileRewardedAdController | undefined;

  function RewardedAdHarness() {
    controller = useAdMobRewardedAd();
    return null;
  }

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<RewardedAdHarness />);
    await Promise.resolve();
    await Promise.resolve();
  });

  const rewardedAd = getLatestRewardedAdMock();
  const emitRewardedAdEvent = getRewardedAdEventListener(rewardedAd);

  await ReactTestRenderer.act(async () => {
    emitRewardedAdEvent({ type: RewardedAdEventType.LOADED });
  });

  expect(controller?.isAdReady).toBe(true);

  let settled = false;
  let result: Awaited<ReturnType<MobileRewardedAdController['showAd']>> | undefined;
  let showPromise: ReturnType<MobileRewardedAdController['showAd']> | undefined;

  await ReactTestRenderer.act(async () => {
    showPromise = controller?.showAd();
    void showPromise?.then((nextResult) => {
      settled = true;
      result = nextResult;
    });
    await Promise.resolve();
  });

  expect(rewardedAd.show).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(async () => {
    emitRewardedAdEvent({ type: RewardedAdEventType.EARNED_REWARD, payload: { type: 'coin', amount: 1 } });
    await Promise.resolve();
  });

  expect(settled).toBe(false);

  await ReactTestRenderer.act(async () => {
    emitRewardedAdEvent({ type: AdEventType.CLOSED });
    await showPromise;
  });

  expect(settled).toBe(true);
  expect(result).toEqual({ status: 'earned', reward: { type: 'coin', amount: 1 } });
  expect(rewardedAd.load).toHaveBeenCalledTimes(2);

  await ReactTestRenderer.act(async () => {
    renderer?.unmount();
  });
});
