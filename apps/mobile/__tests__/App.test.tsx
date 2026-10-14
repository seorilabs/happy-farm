/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {
  AdEventType,
  AdsConsent,
  InterstitialAd,
  RewardedAd,
  RewardedAdEventType,
} from 'react-native-google-mobile-ads';
import App from '../App';
import { FarmStartup } from '../../../packages/farm-ui/src';
import {
  MOBILE_REWARDED_AD_LOAD_TIMEOUT_MS,
  MOBILE_REWARDED_AD_SHOW_TIMEOUT_MS,
  createPlatformAdMobAdapter,
  useAdMobRewardedAd,
} from '../src/ads/adMobRewardedAd';
import { MOBILE_INTERSTITIAL_SHOW_TIMEOUT_MS, useAdMobInterstitialAd } from '../src/ads/adMobInterstitialAd';
import { resetAdMobConsentStateForTests } from '../src/ads/adMobConsent';

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
  getIdToken: jest.fn(() => Promise.resolve('firebase-id-token')),
  signInAnonymously: jest.fn(() => Promise.resolve({ user: { uid: 'test-user', isAnonymous: true } })),
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

jest.mock('react-native/Libraries/Settings/Settings', () => ({
  __esModule: true,
  default: { get: jest.fn(), set: jest.fn() },
}));

jest.mock('react-native-google-mobile-ads', () => {
  return {
    __esModule: true,
    default: jest.fn(() => ({ initialize: jest.fn(() => Promise.resolve()) })),
    AdEventType: { CLOSED: 'closed', ERROR: 'error', LOADED: 'loaded', OPENED: 'opened' },
    AdsConsent: {
      gatherConsent: jest.fn(() =>
        Promise.resolve({
          canRequestAds: true,
          privacyOptionsRequirementStatus: 'NOT_REQUIRED',
        })
      ),
      getConsentInfo: jest.fn(() =>
        Promise.resolve({
          canRequestAds: true,
          privacyOptionsRequirementStatus: 'NOT_REQUIRED',
        })
      ),
      showPrivacyOptionsForm: jest.fn(() => Promise.resolve()),
    },
    AdsConsentPrivacyOptionsRequirementStatus: {
      NOT_REQUIRED: 'NOT_REQUIRED',
      REQUIRED: 'REQUIRED',
      UNKNOWN: 'UNKNOWN',
    },
    InterstitialAd: {
      createForAdRequest: jest.fn(() => ({
        addAdEventsListener: jest.fn(() => jest.fn()),
        load: jest.fn(),
        removeAllListeners: jest.fn(),
        show: jest.fn(() => Promise.resolve()),
      })),
    },
    RewardedAd: {
      createForAdRequest: jest.fn(() => ({
        addAdEventsListener: jest.fn(() => jest.fn()),
        load: jest.fn(),
        removeAllListeners: jest.fn(),
        show: jest.fn(() => Promise.resolve()),
      })),
    },
    RewardedAdEventType: { EARNED_REWARD: 'earned_reward', LOADED: 'loaded' },
    TestIds: { INTERSTITIAL: 'test-interstitial', REWARDED: 'test-rewarded' },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../src/platformEvents', () => ({
  ensureMobilePlatformSession: jest.fn(() => Promise.resolve(false)),
  handleMobilePlatformAppStateChange: jest.fn(),
  mobilePlatformAds: { policy: jest.fn(), createClaim: jest.fn(), claim: jest.fn(), ack: jest.fn() },
  shutdownMobilePlatformEvents: jest.fn(() => Promise.resolve()),
  startMobilePlatformEvents: jest.fn(),
  trackMobilePlatformEvent: jest.fn(),
}));

type MockRewardedAd = {
  addAdEventsListener: jest.Mock;
  load: jest.Mock;
  removeAllListeners: jest.Mock;
  show: jest.Mock<Promise<void>, []>;
};
type MobileRewardedAdController = ReturnType<typeof useAdMobRewardedAd>;

function getLatestAdMock(createForAdRequest: unknown) {
  const create = createForAdRequest as jest.Mock;
  const lastResult = create.mock.results[create.mock.results.length - 1];
  if (lastResult?.type !== 'return') {
    throw new Error('createForAdRequest was not called.');
  }
  return lastResult.value as MockRewardedAd;
}

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
  resetAdMobConsentStateForTests();
});

afterEach(() => {
  jest.useRealTimers();
});

test('renders correctly', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    await Promise.resolve();
  });

  const createRewardedAd = RewardedAd.createForAdRequest as jest.Mock;
  expect(createRewardedAd).not.toHaveBeenCalled();
  expect(AdsConsent.gatherConsent).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => {
    const startup = renderer!.root.findByType(FarmStartup);
    startup.findByProps({ testID: 'title-start' }).props.onPress();
  });
  expect(createRewardedAd).toHaveBeenCalledWith('test-rewarded', {
    requestNonPersonalizedAdsOnly: true,
  });
  const platformEvents = jest.requireMock('../src/platformEvents') as {
    startMobilePlatformEvents: jest.Mock;
    shutdownMobilePlatformEvents: jest.Mock;
  };
  expect(platformEvents.startMobilePlatformEvents).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(async () => {
    renderer?.unmount();
  });
  expect(platformEvents.shutdownMobilePlatformEvents).toHaveBeenCalledTimes(1);
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
  expect(rewardedAd.load).toHaveBeenCalledTimes(1);
  expect(RewardedAd.createForAdRequest).toHaveBeenCalledTimes(2);
  expect(getLatestRewardedAdMock().load).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(async () => {
    renderer?.unmount();
  });
});

test('ensureAdReady waits for the actual mobile loaded event', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  let controller: MobileRewardedAdController | undefined;
  function Harness() {
    controller = useAdMobRewardedAd();
    return null;
  }

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Harness />);
    await Promise.resolve();
  });
  const rewardedAd = getLatestRewardedAdMock();
  const emit = getRewardedAdEventListener(rewardedAd);
  let ready: boolean | null = null;
  if (controller == null) throw new Error('controller not provided');
  let readyPromise!: Promise<void>;
  ReactTestRenderer.act(() => {
    readyPromise = controller!.ensureAdReady().then((value) => { ready = value; });
  });
  await Promise.resolve();
  expect(ready).toBeNull();

  await ReactTestRenderer.act(async () => {
    emit({ type: RewardedAdEventType.LOADED });
    await readyPromise;
  });
  expect(ready).toBe(true);
  expect(controller?.isAdReady).toBe(true);

  await ReactTestRenderer.act(async () => { renderer?.unmount(); });
});

test('ensureAdReady resolves false when mobile loading times out', async () => {
  jest.useFakeTimers();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  let controller: MobileRewardedAdController | undefined;
  function Harness() {
    controller = useAdMobRewardedAd();
    return null;
  }

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Harness />);
    await Promise.resolve();
  });
  if (controller == null) throw new Error('controller not provided');
  let readyPromise!: Promise<boolean>;
  ReactTestRenderer.act(() => {
    readyPromise = controller!.ensureAdReady();
  });
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(MOBILE_REWARDED_AD_LOAD_TIMEOUT_MS);
    await Promise.resolve();
  });
  await expect(readyPromise).resolves.toBe(false);

  await ReactTestRenderer.act(async () => { renderer?.unmount(); });
});

test('ensureAdReady applies its own timeout while the default mobile load remains in flight', async () => {
  jest.useFakeTimers();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  let controller: MobileRewardedAdController | undefined;
  function Harness() {
    controller = useAdMobRewardedAd();
    return null;
  }

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Harness />);
    await Promise.resolve();
  });
  const rewardedAd = getLatestRewardedAdMock();
  const emit = getRewardedAdEventListener(rewardedAd);
  if (controller == null) throw new Error('controller not provided');

  let readyPromise!: Promise<boolean>;
  ReactTestRenderer.act(() => {
    readyPromise = controller!.ensureAdReady(250);
  });
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(250);
    await Promise.resolve();
  });

  await expect(readyPromise).resolves.toBe(false);
  expect(rewardedAd.load).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(async () => {
    emit({ type: RewardedAdEventType.LOADED });
  });
  expect(controller?.isAdReady).toBe(true);

  await ReactTestRenderer.act(async () => { renderer?.unmount(); });
});

test('rejects a duplicate mobile show without replacing the in-flight request', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  let controller: MobileRewardedAdController | undefined;
  function Harness() {
    controller = useAdMobRewardedAd();
    return null;
  }

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Harness />);
    await Promise.resolve();
  });
  const rewardedAd = getLatestRewardedAdMock();
  const emit = getRewardedAdEventListener(rewardedAd);
  await ReactTestRenderer.act(async () => { emit({ type: RewardedAdEventType.LOADED }); });

  if (controller == null) throw new Error('controller not provided');
  let first!: ReturnType<MobileRewardedAdController['showAd']>;
  let second!: ReturnType<MobileRewardedAdController['showAd']>;
  ReactTestRenderer.act(() => {
    first = controller!.showAd();
    second = controller!.showAd();
  });
  await expect(second).resolves.toEqual({ status: 'notReady' });
  expect(rewardedAd.show).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => { emit({ type: AdEventType.CLOSED }); });
  await expect(first).resolves.toEqual({ status: 'dismissed' });

  await ReactTestRenderer.act(async () => { renderer?.unmount(); });
});

test('preserves mobile SDK error code and message', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  let controller: MobileRewardedAdController | undefined;
  function Harness() {
    controller = useAdMobRewardedAd();
    return null;
  }

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Harness />);
    await Promise.resolve();
  });
  const rewardedAd = getLatestRewardedAdMock();
  const emit = getRewardedAdEventListener(rewardedAd);
  await ReactTestRenderer.act(async () => { emit({ type: RewardedAdEventType.LOADED }); });
  if (controller == null) throw new Error('controller not provided');
  let resultPromise!: ReturnType<MobileRewardedAdController['showAd']>;
  ReactTestRenderer.act(() => {
    resultPromise = controller!.showAd();
  });
  await ReactTestRenderer.act(async () => {
    emit({ type: AdEventType.ERROR, payload: { code: 3, message: 'No fill' } });
  });
  await expect(resultPromise).resolves.toEqual({ status: 'failed', error: '3: No fill' });

  await ReactTestRenderer.act(async () => { renderer?.unmount(); });
});

test('mobile terminal timeout preserves an earned reward when close is missing', async () => {
  jest.useFakeTimers();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  let controller: MobileRewardedAdController | undefined;
  function Harness() {
    controller = useAdMobRewardedAd();
    return null;
  }

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Harness />);
    await Promise.resolve();
  });
  const rewardedAd = getLatestRewardedAdMock();
  const emit = getRewardedAdEventListener(rewardedAd);
  await ReactTestRenderer.act(async () => { emit({ type: RewardedAdEventType.LOADED }); });
  if (controller == null) throw new Error('controller not provided');
  let resultPromise!: ReturnType<MobileRewardedAdController['showAd']>;
  ReactTestRenderer.act(() => {
    resultPromise = controller!.showAd();
  });
  await ReactTestRenderer.act(async () => {
    emit({ type: RewardedAdEventType.EARNED_REWARD, payload: { type: 'coin', amount: 1 } });
    jest.advanceTimersByTime(MOBILE_REWARDED_AD_SHOW_TIMEOUT_MS);
    await Promise.resolve();
  });
  await expect(resultPromise).resolves.toEqual({ status: 'earned', reward: { type: 'coin', amount: 1 } });

  await ReactTestRenderer.act(async () => { renderer?.unmount(); });
});

test('ignores late events from a timed-out mobile ad after the next show starts', async () => {
  jest.useFakeTimers();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  let controller: MobileRewardedAdController | undefined;
  function Harness() {
    controller = useAdMobRewardedAd();
    return null;
  }

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Harness />);
    await Promise.resolve();
  });

  const adA = getLatestRewardedAdMock();
  const emitA = getRewardedAdEventListener(adA);
  await ReactTestRenderer.act(async () => {
    emitA({ type: RewardedAdEventType.LOADED });
  });
  if (controller == null) throw new Error('controller not provided');

  let showA!: ReturnType<MobileRewardedAdController['showAd']>;
  ReactTestRenderer.act(() => {
    showA = controller!.showAd();
  });
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(MOBILE_REWARDED_AD_SHOW_TIMEOUT_MS);
    await Promise.resolve();
  });
  await expect(showA).resolves.toEqual({ status: 'failed', error: 'show_timeout' });
  expect(adA.removeAllListeners).toHaveBeenCalledTimes(1);

  const adB = getLatestRewardedAdMock();
  expect(adB).not.toBe(adA);
  const emitB = getRewardedAdEventListener(adB);
  await ReactTestRenderer.act(async () => {
    emitB({ type: RewardedAdEventType.LOADED });
  });

  let showBSettled = false;
  let showB!: ReturnType<MobileRewardedAdController['showAd']>;
  ReactTestRenderer.act(() => {
    showB = controller!.showAd();
    void showB.then(() => {
      showBSettled = true;
    });
  });

  await ReactTestRenderer.act(async () => {
    emitA({ type: RewardedAdEventType.EARNED_REWARD, payload: { type: 'coin', amount: 99 } });
    emitA({ type: AdEventType.CLOSED });
    emitA({ type: AdEventType.ERROR, payload: { code: 3, message: 'late A error' } });
    await Promise.resolve();
  });
  expect(showBSettled).toBe(false);

  await ReactTestRenderer.act(async () => {
    emitB({ type: AdEventType.CLOSED });
    await showB;
  });
  await expect(showB).resolves.toEqual({ status: 'dismissed' });

  await ReactTestRenderer.act(async () => { renderer?.unmount(); });
});

// AC-16: once the full-screen ad is on screen only the player can end it. Settling on the
// show timeout let the game close the sheet under the ad, which left an empty sheet that
// swallowed every touch (E2E E7, iPhone 12 Pro, 2026-10-14).
test('AC-16 waits for an opened rewarded ad to close even past the show timeout', async () => {
  jest.useFakeTimers();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  let controller: MobileRewardedAdController | undefined;
  function Harness() {
    controller = useAdMobRewardedAd();
    return null;
  }

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Harness />);
    await Promise.resolve();
  });
  const rewardedAd = getLatestRewardedAdMock();
  const emit = getRewardedAdEventListener(rewardedAd);
  await ReactTestRenderer.act(async () => { emit({ type: RewardedAdEventType.LOADED }); });
  if (controller == null) throw new Error('controller not provided');

  let settled = false;
  let resultPromise!: ReturnType<MobileRewardedAdController['showAd']>;
  ReactTestRenderer.act(() => {
    resultPromise = controller!.showAd();
    void resultPromise.then(() => {
      settled = true;
    });
  });
  await ReactTestRenderer.act(async () => {
    emit({ type: AdEventType.OPENED });
    emit({ type: RewardedAdEventType.EARNED_REWARD, payload: { type: 'coin', amount: 1 } });
    jest.advanceTimersByTime(MOBILE_REWARDED_AD_SHOW_TIMEOUT_MS * 2);
    await Promise.resolve();
  });
  expect(settled).toBe(false);

  await ReactTestRenderer.act(async () => {
    emit({ type: AdEventType.CLOSED });
    await Promise.resolve();
  });
  await expect(resultPromise).resolves.toEqual({ status: 'earned', reward: { type: 'coin', amount: 1 } });

  await ReactTestRenderer.act(async () => { renderer?.unmount(); });
});

test('AC-16 the store-build rewarded adapter waits for an opened ad to close', async () => {
  jest.useFakeTimers();
  const adapter = createPlatformAdMobAdapter('store-rewarded');
  let loaded!: Promise<boolean>;
  await ReactTestRenderer.act(async () => {
    loaded = adapter.load({ customData: 'claim', userId: 'player' });
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
  const rewardedAd = getLatestRewardedAdMock();
  const loadListener = rewardedAd.addAdEventsListener.mock.calls[0]?.[0] as (event: { type: string }) => void;
  loadListener({ type: RewardedAdEventType.LOADED });
  await expect(loaded).resolves.toBe(true);

  let settled = false;
  const shown = adapter.show();
  void shown.then(() => {
    settled = true;
  });
  const emit = rewardedAd.addAdEventsListener.mock.calls[1]?.[0] as (event: { type: string; payload?: unknown }) => void;
  emit({ type: AdEventType.OPENED });
  emit({ type: RewardedAdEventType.EARNED_REWARD, payload: { type: 'coin', amount: 1 } });
  jest.advanceTimersByTime(MOBILE_REWARDED_AD_SHOW_TIMEOUT_MS * 2);
  await Promise.resolve();
  expect(settled).toBe(false);

  emit({ type: AdEventType.CLOSED });
  await expect(shown).resolves.toEqual({ status: 'earned', reward: { type: 'coin', amount: 1 } });
});

test('AC-16 the store-build rewarded adapter still times out an ad that never opens', async () => {
  jest.useFakeTimers();
  const adapter = createPlatformAdMobAdapter('store-rewarded');
  let loaded!: Promise<boolean>;
  await ReactTestRenderer.act(async () => {
    loaded = adapter.load({ customData: 'claim', userId: 'player' });
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
  const rewardedAd = getLatestRewardedAdMock();
  const loadListener = rewardedAd.addAdEventsListener.mock.calls[0]?.[0] as (event: { type: string }) => void;
  loadListener({ type: RewardedAdEventType.LOADED });
  await expect(loaded).resolves.toBe(true);

  const shown = adapter.show();
  jest.advanceTimersByTime(MOBILE_REWARDED_AD_SHOW_TIMEOUT_MS);
  await expect(shown).resolves.toEqual({ status: 'failed', error: 'show_timeout' });
});

test('AC-16 waits for an opened interstitial to close even past the show timeout', async () => {
  jest.useFakeTimers();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  let controller: ReturnType<typeof useAdMobInterstitialAd> | undefined;
  function Harness() {
    controller = useAdMobInterstitialAd();
    return null;
  }

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Harness />);
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
  const interstitial = getLatestAdMock(InterstitialAd.createForAdRequest);
  const emit = getRewardedAdEventListener(interstitial);
  await ReactTestRenderer.act(async () => { emit({ type: AdEventType.LOADED }); });
  if (controller == null) throw new Error('controller not provided');
  expect(controller.isAdReady).toBe(true);

  let settled = false;
  let resultPromise!: ReturnType<NonNullable<typeof controller>['showAd']>;
  ReactTestRenderer.act(() => {
    resultPromise = controller!.showAd();
    void resultPromise.then(() => {
      settled = true;
    });
  });
  await ReactTestRenderer.act(async () => {
    emit({ type: AdEventType.OPENED });
    jest.advanceTimersByTime(MOBILE_INTERSTITIAL_SHOW_TIMEOUT_MS * 2);
    await Promise.resolve();
  });
  expect(settled).toBe(false);

  await ReactTestRenderer.act(async () => {
    emit({ type: AdEventType.CLOSED });
    await Promise.resolve();
  });
  await expect(resultPromise).resolves.toEqual({ status: 'dismissed' });

  await ReactTestRenderer.act(async () => { renderer?.unmount(); });
});
