/**
 * @format
 */

import React from 'react';
import { Platform, Settings } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {
  AdEventType,
  AdsConsent,
  InterstitialAd,
  RewardedAd,
  RewardedAdEventType,
} from 'react-native-google-mobile-ads';
import App from '../App';
import { FarmStartup, getFarmMessages } from '../../../packages/farm-ui/src';
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
  mobileUpdateGate: {
    load: jest.fn(async () => ({ kind: 'ok' })),
    shouldPrompt: jest.fn(async () => false),
    markPrompted: jest.fn(async () => undefined),
  },
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

test('저장이 없으면 Intl 언어보다 iOS의 한국어 선택을 타이틀에 반영한다', async () => {
  const os = jest.replaceProperty(Platform, 'OS', 'ios');
  const originalIntl = Intl.DateTimeFormat().resolvedOptions();
  const intl = jest.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
    .mockReturnValue({ ...originalIntl, locale: 'en-US' });
  const getSetting = Settings.get as jest.Mock;
  const originalGet = getSetting.getMockImplementation();
  getSetting.mockImplementation((key: string) => key === 'AppleLanguages' ? ['ko-KR', 'en-US'] : undefined);
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<App />);
      await Promise.resolve();
    });
    expect(renderer!.root.findByProps({ testID: 'title-status' }).props.children)
      .toBe(getFarmMessages('ko-KR').titleReady);
  } finally {
    await ReactTestRenderer.act(async () => { renderer?.unmount(); });
    getSetting.mockImplementation(originalGet ?? (() => undefined));
    intl.mockRestore();
    os.restore();
  }
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

describe('Android rewarded event ordering (#479)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.replaceProperty(Platform, 'OS', 'android');
  });
  afterEach(() => jest.restoreAllMocks());

  async function loadedAdapter() {
    const adapter = createPlatformAdMobAdapter('android-rewarded');
    const loading = adapter.load({ customData: 'claim', userId: 'player' });
    for (let index = 0; index < 10; index += 1) await Promise.resolve();
    const ad = getLatestRewardedAdMock();
    const loadEvent = getRewardedAdEventListener(ad);
    loadEvent({ type: RewardedAdEventType.LOADED });
    await expect(loading).resolves.toBe(true);
    return { adapter, ad };
  }
  function showListener(ad: ReturnType<typeof getLatestRewardedAdMock>) {
    return ad.addAdEventsListener.mock.calls[1]?.[0] as (event: { type: string; payload?: unknown }) => void;
  }

  test.each([0, 499])('accepts reward %d ms after close, preserving close duration', async (delay) => {
    const { adapter, ad } = await loadedAdapter();
    const shown = adapter.show();
    const emit = showListener(ad);
    emit({ type: AdEventType.OPENED });
    jest.advanceTimersByTime(2_000);
    emit({ type: AdEventType.CLOSED });
    jest.advanceTimersByTime(delay);
    emit({ type: RewardedAdEventType.EARNED_REWARD, payload: { type: 'coin', amount: 1 } });
    await expect(shown).resolves.toEqual({ status: 'earned', reward: { type: 'coin', amount: 1 }, durationMs: 2_000 });
    emit({ type: AdEventType.CLOSED });
    emit({ type: RewardedAdEventType.EARNED_REWARD, payload: { type: 'coin', amount: 99 } });
    expect(ad.show).toHaveBeenCalledTimes(1);
  });

  test('dismisses at 500 ms, ignores late reward and duplicate close without extending grace', async () => {
    const { adapter, ad } = await loadedAdapter();
    const shown = adapter.show();
    const emit = showListener(ad);
    let settled = false;
    void shown.then(() => { settled = true; });
    jest.advanceTimersByTime(1_000);
    emit({ type: AdEventType.CLOSED });
    jest.advanceTimersByTime(499);
    emit({ type: AdEventType.CLOSED });
    await Promise.resolve();
    expect(settled).toBe(false);
    jest.advanceTimersByTime(1);
    emit({ type: RewardedAdEventType.EARNED_REWARD, payload: { type: 'coin', amount: 1 } });
    await expect(shown).resolves.toEqual({ status: 'dismissed', durationMs: 1_000 });
    await expect(adapter.show()).resolves.toEqual({ status: 'notReady' });
  });

  test('reward before close still waits, opened ads have no total show deadline', async () => {
    const { adapter, ad } = await loadedAdapter();
    const shown = adapter.show();
    const emit = showListener(ad);
    let settled = false;
    void shown.then(() => { settled = true; });
    emit({ type: AdEventType.OPENED });
    emit({ type: RewardedAdEventType.EARNED_REWARD, payload: { type: 'coin', amount: 1 } });
    jest.advanceTimersByTime(MOBILE_REWARDED_AD_SHOW_TIMEOUT_MS * 2);
    await Promise.resolve();
    expect(settled).toBe(false);
    emit({ type: AdEventType.CLOSED });
    await expect(shown).resolves.toMatchObject({ status: 'earned', durationMs: MOBILE_REWARDED_AD_SHOW_TIMEOUT_MS * 2 });
  });

  test('cannot show until SDK loaded or while already showing', async () => {
    const adapter = createPlatformAdMobAdapter('android-rewarded');
    const loading = adapter.load({ customData: 'claim', userId: 'player' });
    for (let index = 0; index < 10; index += 1) await Promise.resolve();
    const ad = getLatestRewardedAdMock();
    await expect(adapter.show()).resolves.toEqual({ status: 'notReady' });
    expect(ad.show).not.toHaveBeenCalled();
    getRewardedAdEventListener(ad)({ type: RewardedAdEventType.LOADED });
    await loading;
    const shown = adapter.show();
    await expect(adapter.show()).resolves.toEqual({ status: 'notReady' });
    showListener(ad)({ type: AdEventType.ERROR, payload: { code: 'googleMobileAds/no-fill', message: 'private raw message' } });
    await expect(shown).resolves.toEqual({ status: 'failed', error: 'googleMobileAds/no-fill', sdkCode: 'googleMobileAds/no-fill' });
  });

  test('show rejection drops raw messages and clears listeners', async () => {
    const { adapter, ad } = await loadedAdapter();
    ad.show.mockRejectedValueOnce({ code: 'googleMobileAds/network-error', message: 'private raw message' });
    await expect(adapter.show()).resolves.toEqual({ status: 'failed', error: 'googleMobileAds/network-error', sdkCode: 'googleMobileAds/network-error' });
    await expect(adapter.show()).resolves.toEqual({ status: 'notReady' });
  });
});

test('Android 개발 경로도 닫힘 유예 뒤 보상, 다음 요청과 unmount를 처리한다', async () => {
  jest.useFakeTimers();
  jest.replaceProperty(Platform, 'OS', 'android');
  let controller!: MobileRewardedAdController;
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  function Harness() { controller = useAdMobRewardedAd(); return null; }
  try {
    await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<Harness />); });
    const emitA = getRewardedAdEventListener(getLatestRewardedAdMock());
    await ReactTestRenderer.act(async () => { emitA({ type: RewardedAdEventType.LOADED }); });
    let shown!: Promise<Awaited<ReturnType<MobileRewardedAdController['showAd']>>>;
    ReactTestRenderer.act(() => { shown = controller.showAd(); });
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(1_000);
      emitA({ type: AdEventType.CLOSED });
      jest.advanceTimersByTime(499);
      emitA({ type: RewardedAdEventType.EARNED_REWARD, payload: { type: 'coin', amount: 1 } });
    });
    await expect(shown).resolves.toMatchObject({ status: 'earned', durationMs: 1_000 });
    const emitB = getRewardedAdEventListener(getLatestRewardedAdMock());
    await ReactTestRenderer.act(async () => { emitB({ type: RewardedAdEventType.LOADED }); });
    ReactTestRenderer.act(() => { shown = controller.showAd(); });
    await ReactTestRenderer.act(async () => {
      emitB({ type: AdEventType.CLOSED });
      emitA({ type: RewardedAdEventType.EARNED_REWARD, payload: { type: 'coin', amount: 99 } });
      renderer.unmount();
    });
    await expect(shown).resolves.toMatchObject({ status: 'dismissed' });
    jest.advanceTimersByTime(500);
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.restoreAllMocks(); }
});

test('production은 claim과 load 중 CTA를 막고 종료 후 재시도를 허용한다', async () => {
  jest.useFakeTimers();
  jest.replaceProperty(globalThis as typeof globalThis & { __DEV__: boolean }, '__DEV__', false);
  const platform = jest.requireMock('../src/platformEvents');
  platform.ensureMobilePlatformSession.mockResolvedValue(true);
  platform.mobilePlatformAds.policy.mockResolvedValue({ appUsesAds: true, adsEnabled: true });
  let resolveClaim!: (claim: unknown) => void;
  platform.mobilePlatformAds.createClaim.mockImplementation(() => new Promise((resolve) => { resolveClaim = resolve; }));
  let controller!: MobileRewardedAdController;
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  function Harness() { controller = useAdMobRewardedAd(); return null; }
  try {
    await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<Harness />); });
    expect(controller.isAdReady).toBe(true);
    expect(RewardedAd.createForAdRequest).not.toHaveBeenCalled();
    let shown!: ReturnType<MobileRewardedAdController['showAd']>;
    await ReactTestRenderer.act(async () => { shown = controller.showAd({ type: 'rewardedGold', placement: 'shop_gold_reward' }); });
    expect(controller.isAdReady).toBe(false);
    await expect(controller.showAd({ type: 'rewardedGold', placement: 'shop_gold_reward' })).resolves.toEqual({ status: 'notReady' });
    await ReactTestRenderer.act(async () => {
      resolveClaim({ claimId: 'claim', admobSsv: { customData: 'claim', userId: 'player' } });
    });
    const ad = getLatestRewardedAdMock();
    expect(ad.show).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => {
      getRewardedAdEventListener(ad)({ type: AdEventType.ERROR });
      await shown;
    });
    await expect(shown).resolves.toEqual({ status: 'notReady' });
    expect(ad.show).not.toHaveBeenCalled();
    expect(controller.isAdReady).toBe(true);
    await ReactTestRenderer.act(async () => { renderer.unmount(); });
  } finally {
    jest.restoreAllMocks();
    platform.ensureMobilePlatformSession.mockResolvedValue(false);
  }
});

test('adapter dispose는 닫힘 대기 타이머와 SDK listener를 해제한다', async () => {
  jest.useFakeTimers();
  jest.replaceProperty(Platform, 'OS', 'android');
  try {
    const adapter = createPlatformAdMobAdapter('android-rewarded');
    const loading = adapter.load({ customData: 'claim', userId: 'player' });
    for (let index = 0; index < 10; index += 1) await Promise.resolve();
    const ad = getLatestRewardedAdMock();
    getRewardedAdEventListener(ad)({ type: RewardedAdEventType.LOADED });
    await loading;
    const shown = adapter.show();
    const emit = ad.addAdEventsListener.mock.calls[1][0];
    emit({ type: AdEventType.CLOSED });
    adapter.dispose();
    await expect(shown).resolves.toMatchObject({ status: 'dismissed' });
    expect(jest.getTimerCount()).toBe(0);
    emit({ type: RewardedAdEventType.EARNED_REWARD, payload: { type: 'coin', amount: 99 } });
    await expect(adapter.show()).resolves.toEqual({ status: 'notReady' });
  } finally { jest.restoreAllMocks(); }
});
