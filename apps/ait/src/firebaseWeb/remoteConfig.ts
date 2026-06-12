import type { FirebaseApp } from 'firebase/app';
import { fetchAndActivate, getBoolean, getRemoteConfig, isSupported } from 'firebase/remote-config';
import { useEffect, useState } from 'react';

import { getAppsInTossFirebaseApp } from './app';

const ADS_ENABLED_KEY = 'mobile_ads_global_enabled';
const CONFIG_FETCH_TIMEOUT_MS = 10_000;
const DEV_MINIMUM_FETCH_INTERVAL_MS = 5 * 60 * 1000;
const RELEASE_MINIMUM_FETCH_INTERVAL_MS = 15 * 60 * 1000;

const APPS_IN_TOSS_REMOTE_CONFIG_DEFAULTS: Record<typeof ADS_ENABLED_KEY, boolean> = {
  [ADS_ENABLED_KEY]: true,
};

type AppsInTossRemoteConfigInitResult =
  | { status: 'ready'; adsEnabled: boolean }
  | { status: 'unsupported'; adsEnabled: boolean }
  | { status: 'error'; adsEnabled: boolean; reason: string };

const subscribers = new Set<(adsEnabled: boolean) => void>();
let adsEnabled: boolean = APPS_IN_TOSS_REMOTE_CONFIG_DEFAULTS[ADS_ENABLED_KEY];
let initializePromise: Promise<AppsInTossRemoteConfigInitResult> | null = null;

function isDevBuild() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

function normalizeErrorReason(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : 'unknown';
}

function publishAdsEnabled(nextAdsEnabled: boolean) {
  adsEnabled = nextAdsEnabled;
  subscribers.forEach((subscriber) => subscriber(adsEnabled));
}

async function initializeRemoteConfig(app: FirebaseApp): Promise<AppsInTossRemoteConfigInitResult> {
  try {
    const supported = await isSupported();
    if (!supported) {
      return { status: 'unsupported', adsEnabled };
    }

    const remoteConfig = getRemoteConfig(app);
    remoteConfig.settings = {
      fetchTimeoutMillis: CONFIG_FETCH_TIMEOUT_MS,
      minimumFetchIntervalMillis: isDevBuild() ? DEV_MINIMUM_FETCH_INTERVAL_MS : RELEASE_MINIMUM_FETCH_INTERVAL_MS,
    };
    remoteConfig.defaultConfig = APPS_IN_TOSS_REMOTE_CONFIG_DEFAULTS;

    await fetchAndActivate(remoteConfig);
    publishAdsEnabled(getBoolean(remoteConfig, ADS_ENABLED_KEY));

    return { status: 'ready', adsEnabled };
  } catch (error) {
    return { status: 'error', adsEnabled, reason: normalizeErrorReason(error) };
  }
}

export function initializeAppsInTossRemoteConfig(app: FirebaseApp = getAppsInTossFirebaseApp()) {
  initializePromise ??= initializeRemoteConfig(app);
  return initializePromise;
}

export function getAppsInTossAdsEnabled() {
  return adsEnabled;
}

export function subscribeAppsInTossAdsEnabled(subscriber: (nextAdsEnabled: boolean) => void) {
  subscribers.add(subscriber);
  subscriber(adsEnabled);

  return () => {
    subscribers.delete(subscriber);
  };
}

export function useAppsInTossAdsEnabled() {
  const [isEnabled, setIsEnabled] = useState<boolean>(getAppsInTossAdsEnabled);

  useEffect(() => {
    const unsubscribe = subscribeAppsInTossAdsEnabled(setIsEnabled);
    void initializeAppsInTossRemoteConfig();
    return unsubscribe;
  }, []);

  return isEnabled;
}
