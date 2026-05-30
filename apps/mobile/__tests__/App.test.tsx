/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

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

  ReactTestRenderer.act(() => {
    renderer?.unmount();
  });
});
