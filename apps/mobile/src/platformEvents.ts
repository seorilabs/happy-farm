import { createPlatform } from '@seorilabs/platform-sdk';
import { Platform } from 'react-native';

import {
  PLATFORM_EVENT_ALLOWLIST,
  RELEASE_INFO,
  type TrackGameEvent,
} from '../../../packages/farm-core/src';
import { detectRuntimeLocale } from '../../../packages/farm-ui/src';
import { PlatformAdsClient } from '../../../packages/farm-core/src';
import { getMobileFirebaseIdToken } from './firebase/auth';

const PLATFORM_API_URL = 'https://platform-api-306278488979.asia-northeast3.run.app';
const PLATFORM_INGEST_URL = 'https://platform-ingest-306278488979.asia-northeast3.run.app';
export const PLATFORM_ADS_URL = 'https://platform-ads-306278488979.asia-northeast3.run.app';

const mobilePlatform = createPlatform({
  appId: 'happy-farm',
  baseUrl: PLATFORM_API_URL,
  ingestBaseUrl: PLATFORM_INGEST_URL,
  eventAllowlist: PLATFORM_EVENT_ALLOWLIST,
  eventContext: () => ({
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    appVersion: RELEASE_INFO.versionName,
    locale: detectRuntimeLocale(),
  }),
});

const mobileAdsPlatform = createPlatform({
  appId: 'happy-farm',
  baseUrl: PLATFORM_ADS_URL,
});

export const mobilePlatformAds = new PlatformAdsClient({
  appId: 'happy-farm',
  baseUrl: PLATFORM_ADS_URL,
  getToken: () => mobileAdsPlatform.session.token(),
});

let sessionPromise: Promise<boolean> | null = null;

/** Firebase ID token을 두 서비스의 짧은 플랫폼 세션으로 교환한다. */
export function ensureMobilePlatformSession(): Promise<boolean> {
  sessionPromise ??= (async () => {
    const idToken = await getMobileFirebaseIdToken();
    if (idToken == null) {
      return false;
    }
    const credential = { kind: 'firebase-id-token' as const, value: idToken };
    await Promise.all([mobilePlatform.signIn(credential), mobileAdsPlatform.signIn(credential)]);
    return true;
  })().catch(() => false).finally(() => {
    sessionPromise = null;
  });
  return sessionPromise;
}

export const mobilePlatformIap = mobilePlatform.iap;

export const trackMobilePlatformEvent: TrackGameEvent = (name, params = {}) => {
  mobilePlatform.events.track({ name, params });
};

export function startMobilePlatformEvents(): void {
  mobilePlatform.start();
}

export async function flushMobilePlatformEvents(): Promise<void> {
  await mobilePlatform.events.flush();
}

export async function shutdownMobilePlatformEvents(): Promise<void> {
  await mobilePlatform.shutdown();
}
