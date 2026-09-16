import { createPlatform } from '@seorilabs/platform-sdk';
import { Platform, type AppStateStatus } from 'react-native';

import {
  PLATFORM_EVENT_ALLOWLIST,
  RELEASE_INFO,
  withStandardAnalyticsParams,
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
  // Presence는 Platform/Backoffice 운영 gate가 끝난 릴리스에서만 opt-in한다.
  // 기본값을 조합 지점에 명시해 SDK 업그레이드만으로 네트워크가 열리지 않게 한다.
  presenceEnabled: false,
  presenceContext: () => ({
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    appVersion: RELEASE_INFO.versionName,
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
  const isIos = Platform.OS === 'ios';
  mobilePlatform.events.track({
    name,
    params: withStandardAnalyticsParams(
      {
        appMarket: isIos ? 'app_store' : 'google_play',
        runtimePlatform: isIos ? 'ios' : 'android',
        releaseVersion: RELEASE_INFO.versionName,
      },
      params,
    ),
  });
};

export function startMobilePlatformEvents(): void {
  mobilePlatform.start();
}

export async function flushMobilePlatformEvents(): Promise<void> {
  await mobilePlatform.events.flush();
}

export function handleMobilePlatformAppStateChange(nextState: AppStateStatus): void {
  if (nextState === 'active') {
    // start와 resume 모두 즉시 반환한다. foreground 전환은 제품 흐름을 기다리게 하지 않는다.
    mobilePlatform.presence.start();
    mobilePlatform.presence.resume();
    return;
  }

  mobilePlatform.presence.stop();
  void mobilePlatform.events.flush();
}

export async function shutdownMobilePlatformEvents(): Promise<void> {
  await mobilePlatform.shutdown();
}
