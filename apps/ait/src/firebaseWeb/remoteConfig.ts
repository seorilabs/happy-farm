import type { FirebaseApp } from 'firebase/app';
import {
  fetchAndActivate,
  getBoolean,
  getNumber,
  getString,
  getRemoteConfig,
  isSupported,
  type RemoteConfig,
} from 'firebase/remote-config';
import { useEffect, useState } from 'react';

import { getAppsInTossFirebaseApp } from './app';

// 원격값 미수신/미지원/오류 시 사용할 안전 기본값(키·타입·기본값은 mobile 어댑터 및
// remoteconfig.template.json과 일치시켜 플랫폼 간 동작이 갈리지 않게 한다).
// A/B 토대: 새 파라미터는 이 맵에 추가하면 타입드 게터로 즉시 소비할 수 있다.
export const APPS_IN_TOSS_REMOTE_CONFIG_DEFAULTS = {
  mobile_ads_global_enabled: true,
  analytics_collection_enabled: true,
} as const;

export type AppsInTossRemoteConfigKey = keyof typeof APPS_IN_TOSS_REMOTE_CONFIG_DEFAULTS;

const ADS_ENABLED_KEY: AppsInTossRemoteConfigKey = 'mobile_ads_global_enabled';
const CONFIG_FETCH_TIMEOUT_MS = 10_000;
const DEV_MINIMUM_FETCH_INTERVAL_MS = 5 * 60 * 1000;
const RELEASE_MINIMUM_FETCH_INTERVAL_MS = 15 * 60 * 1000;

type AppsInTossRemoteConfigInitResult =
  | { status: 'ready'; adsEnabled: boolean }
  | { status: 'unsupported'; adsEnabled: boolean }
  | { status: 'error'; adsEnabled: boolean; reason: string };

const subscribers = new Set<(adsEnabled: boolean) => void>();
let adsEnabled: boolean = Boolean(APPS_IN_TOSS_REMOTE_CONFIG_DEFAULTS[ADS_ENABLED_KEY]);
let initializePromise: Promise<AppsInTossRemoteConfigInitResult> | null = null;
// 활성화(fetchAndActivate) 완료된 RemoteConfig 인스턴스. 초기화 전/미지원/오류 시 null이며,
// 이 경우 타입드 게터는 모두 안전 기본값으로 폴백한다.
let activeRemoteConfig: RemoteConfig | null = null;

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

/**
 * 불리언 원격값을 읽되, 미초기화/오류 시 안전 기본값으로 폴백한다.
 */
export function getAppsInTossRemoteBoolean(key: AppsInTossRemoteConfigKey): boolean {
  const fallback = Boolean(APPS_IN_TOSS_REMOTE_CONFIG_DEFAULTS[key]);
  if (activeRemoteConfig == null) {
    return fallback;
  }
  try {
    return getBoolean(activeRemoteConfig, key);
  } catch {
    return fallback;
  }
}

/**
 * 숫자 원격값을 읽되, 미초기화/오류 시 안전 기본값으로 폴백한다.
 */
export function getAppsInTossRemoteNumber(key: AppsInTossRemoteConfigKey): number {
  const fallback = Number(APPS_IN_TOSS_REMOTE_CONFIG_DEFAULTS[key]);
  if (activeRemoteConfig == null) {
    return fallback;
  }
  try {
    return getNumber(activeRemoteConfig, key);
  } catch {
    return fallback;
  }
}

/**
 * 문자열 원격값을 읽되, 미초기화/오류 시 안전 기본값으로 폴백한다.
 */
export function getAppsInTossRemoteString(key: AppsInTossRemoteConfigKey): string {
  const fallback = String(APPS_IN_TOSS_REMOTE_CONFIG_DEFAULTS[key]);
  if (activeRemoteConfig == null) {
    return fallback;
  }
  try {
    return getString(activeRemoteConfig, key);
  } catch {
    return fallback;
  }
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
    remoteConfig.defaultConfig = { ...APPS_IN_TOSS_REMOTE_CONFIG_DEFAULTS };

    await fetchAndActivate(remoteConfig);
    activeRemoteConfig = remoteConfig;
    publishAdsEnabled(getAppsInTossRemoteBoolean(ADS_ENABLED_KEY));

    return { status: 'ready', adsEnabled };
  } catch (error) {
    return { status: 'error', adsEnabled, reason: normalizeErrorReason(error) };
  }
}

export function initializeAppsInTossRemoteConfig(app: FirebaseApp = getAppsInTossFirebaseApp()) {
  // 성공(ready)만 메모이즈한다. 미지원/일시 오류(fetch 실패 등)는 메모이즈를 해제해
  // 다음 호출에서 재시도할 수 있게 한다(초기화 실패 후 영구 차단 방지).
  initializePromise ??= initializeRemoteConfig(app).then((result) => {
    if (result.status !== 'ready') {
      initializePromise = null;
    }
    return result;
  });
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
