import { useEffect, useState } from 'react';

import { Storage } from '@apps-in-toss/framework';

import { applyAdLimitsOverrides, parseAdLimitsOverrides } from '../../../../packages/farm-core/src';
import { FIREBASE_PROJECT_NUMBER, FIREBASE_WEB_API_KEY, FIREBASE_WEB_APP_ID } from './firebaseWebConfig';
import {
  createFirebaseRemoteConfigRestClient,
  type RemoteConfigEntries,
} from './remoteConfigRest';

// AIT 빌드는 Granite RN 런타임(브라우저 DOM 없음)이라 브라우저 전용 firebase/remote-config
// 를 쓰지 못한다(isSupported()가 false → 원격값을 한 번도 못 받고 항상 기본값). 그래서
// Remote Config REST fetch를 직접 호출한다. 응답은 { key: stringValue } 맵이며, 타입드
// 게터가 안전 기본값으로 폴백하며 소비한다.

// 원격값 미수신/오류 시 사용할 안전 기본값(키·타입·기본값은 mobile 어댑터 및
// remoteconfig.template.json과 일치시켜 플랫폼 간 동작이 갈리지 않게 한다).
// A/B 토대: 새 파라미터는 이 맵에 추가하면 타입드 게터로 즉시 소비할 수 있다.
export const APPS_IN_TOSS_REMOTE_CONFIG_DEFAULTS = {
  mobile_ads_global_enabled: true,
  analytics_collection_enabled: true,
  // 전면/복귀(welcomeBack) 광고 그룹 ID. 빈 문자열이면 fullScreenAd 경로가 미지원으로
  // 동작해 전면 광고가 노출되지 않는다(운영에서 실제 AppsInToss 광고 인벤토리 ID를
  // 주입하면 코드 변경 없이 즉시 활성화된다).
  appsintoss_interstitial_ad_group_id: '',
  // 광고 빈도·cap 오버라이드(JSON 오브젝트 문자열). 빈 문자열/무효 시 farm-core 기본값
  // 폴백. 예: '{"rewardedGoldDailyLimit":6,"growthAdCooldownMs":300000}'.
  ad_limits_overrides: '',
} as const;

export type AppsInTossRemoteConfigKey = keyof typeof APPS_IN_TOSS_REMOTE_CONFIG_DEFAULTS;

const ADS_ENABLED_KEY: AppsInTossRemoteConfigKey = 'mobile_ads_global_enabled';
const INTERSTITIAL_AD_GROUP_ID_KEY: AppsInTossRemoteConfigKey = 'appsintoss_interstitial_ad_group_id';
const AD_LIMITS_OVERRIDES_KEY: AppsInTossRemoteConfigKey = 'ad_limits_overrides';
const DEV_MINIMUM_FETCH_INTERVAL_MS = 5 * 60 * 1000;
const RELEASE_MINIMUM_FETCH_INTERVAL_MS = 15 * 60 * 1000;

type AppsInTossRemoteConfigInitResult =
  | { status: 'ready'; adsEnabled: boolean }
  | { status: 'error'; adsEnabled: boolean; reason: string };

const subscribers = new Set<(adsEnabled: boolean) => void>();
let adsEnabled: boolean = Boolean(APPS_IN_TOSS_REMOTE_CONFIG_DEFAULTS[ADS_ENABLED_KEY]);
let initializePromise: Promise<AppsInTossRemoteConfigInitResult> | null = null;
// 마지막으로 활성화된 원격 entries. 초기화 전/오류 시 null이며, 이 경우 타입드 게터는
// 모두 안전 기본값으로 폴백한다.
let activeEntries: RemoteConfigEntries | null = null;

function isDevBuild() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

// Remote Config 불리언은 문자열로 온다. Firebase SDK와 동일하게 truthy 토큰을 인정한다.
const TRUTHY_TOKENS = new Set(['1', 'true', 't', 'yes', 'y', 'on']);

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

const restClient = createFirebaseRemoteConfigRestClient({
  apiKey: FIREBASE_WEB_API_KEY,
  projectNumber: FIREBASE_PROJECT_NUMBER,
  appId: FIREBASE_WEB_APP_ID,
  storage: {
    getItem: (key) => Storage.getItem(key),
    setItem: (key, value) => Storage.setItem(key, value),
  },
  post: async (url, body, timeoutMs) => {
    // RN fetch는 DOM AbortSignal 타입과 호환되지 않아, 타임아웃은 Promise.race로 건다.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('remote config fetch timeout')), timeoutMs);
    });
    try {
      const response = await Promise.race([
        fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        }),
        timeout,
      ]);
      if (!response.ok) {
        throw new Error(`remote config fetch failed: ${response.status}`);
      }
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  },
  minimumFetchIntervalMs: isDevBuild() ? DEV_MINIMUM_FETCH_INTERVAL_MS : RELEASE_MINIMUM_FETCH_INTERVAL_MS,
});

/**
 * 불리언 원격값을 읽되, 미초기화/미설정 시 안전 기본값으로 폴백한다.
 */
export function getAppsInTossRemoteBoolean(key: AppsInTossRemoteConfigKey): boolean {
  const fallback = Boolean(APPS_IN_TOSS_REMOTE_CONFIG_DEFAULTS[key]);
  const raw = activeEntries?.[key];
  if (raw == null) {
    return fallback;
  }
  return TRUTHY_TOKENS.has(raw.trim().toLowerCase());
}

/**
 * 숫자 원격값을 읽되, 미초기화/무효 시 안전 기본값으로 폴백한다.
 */
export function getAppsInTossRemoteNumber(key: AppsInTossRemoteConfigKey): number {
  const fallback = Number(APPS_IN_TOSS_REMOTE_CONFIG_DEFAULTS[key]);
  const raw = activeEntries?.[key];
  if (raw == null) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * 문자열 원격값을 읽되, 미초기화/미설정 시 안전 기본값으로 폴백한다.
 */
export function getAppsInTossRemoteString(key: AppsInTossRemoteConfigKey): string {
  const fallback = String(APPS_IN_TOSS_REMOTE_CONFIG_DEFAULTS[key]);
  const raw = activeEntries?.[key];
  return raw ?? fallback;
}

async function initializeRemoteConfig(): Promise<AppsInTossRemoteConfigInitResult> {
  try {
    const result = await restClient.fetchEntries();
    if (result.status === 'error') {
      return { status: 'error', adsEnabled, reason: result.reason };
    }
    activeEntries = result.entries;
    publishAdsEnabled(getAppsInTossRemoteBoolean(ADS_ENABLED_KEY));
    // 광고 빈도·cap 원격 오버라이드를 farm-core에 적용(무효/미설정 시 기본값 폴백).
    applyAdLimitsOverrides(parseAdLimitsOverrides(getAppsInTossRemoteString(AD_LIMITS_OVERRIDES_KEY)));
    return { status: 'ready', adsEnabled };
  } catch (error) {
    return { status: 'error', adsEnabled, reason: normalizeErrorReason(error) };
  }
}

export function initializeAppsInTossRemoteConfig() {
  // 성공(ready)만 메모이즈한다. 오류(fetch 실패 등)는 메모이즈를 해제해 다음 호출에서
  // 재시도할 수 있게 한다(초기화 실패 후 영구 차단 방지).
  initializePromise ??= initializeRemoteConfig().then((result) => {
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

/**
 * AIT 전면/복귀 광고에 사용할 광고 그룹 ID를 원격값에서 읽어 반환한다.
 * 원격 활성화 전/미설정 시 빈 문자열을 반환하며, 이 경우 fullScreenAd 경로가
 * 미지원으로 동작해 전면 광고가 노출되지 않는다. 초기화가 끝나면 최신 원격값으로
 * 재렌더해, 운영에서 ID를 주입하면 재배포 없이 지면이 활성화된다.
 */
export function useAppsInTossInterstitialAdGroupId(): string {
  const [adGroupId, setAdGroupId] = useState<string>(() => getAppsInTossRemoteString(INTERSTITIAL_AD_GROUP_ID_KEY));

  useEffect(() => {
    let cancelled = false;
    void initializeAppsInTossRemoteConfig().then(() => {
      if (!cancelled) {
        setAdGroupId(getAppsInTossRemoteString(INTERSTITIAL_AD_GROUP_ID_KEY));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return adGroupId;
}
