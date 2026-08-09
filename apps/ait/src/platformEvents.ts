import { appLogin } from '@apps-in-toss/framework';
import { createPlatform, type Credential } from '@seorilabs/platform-sdk';

import {
  PLATFORM_EVENT_ALLOWLIST,
  RELEASE_INFO,
  type TrackGameEvent,
} from '../../../packages/farm-core/src';
import { detectRuntimeLocale } from '../../../packages/farm-ui/src';
import { PlatformAdsClient } from '../../../packages/farm-core/src';

const PLATFORM_API_URL = 'https://platform-api-306278488979.asia-northeast3.run.app';
const PLATFORM_INGEST_URL = 'https://platform-ingest-306278488979.asia-northeast3.run.app';
export const PLATFORM_ADS_URL = 'https://platform-ads-306278488979.asia-northeast3.run.app';

const appsInTossPlatform = createPlatform({
  appId: 'happy-farm',
  baseUrl: PLATFORM_API_URL,
  ingestBaseUrl: PLATFORM_INGEST_URL,
  eventAllowlist: PLATFORM_EVENT_ALLOWLIST,
  eventContext: () => ({
    platform: 'ait',
    appVersion: RELEASE_INFO.versionName,
    locale: detectRuntimeLocale(),
  }),
});

const appsInTossAdsPlatform = createPlatform({ appId: 'happy-farm', baseUrl: PLATFORM_ADS_URL });

export const appsInTossPlatformAds = new PlatformAdsClient({
  appId: 'happy-farm',
  baseUrl: PLATFORM_ADS_URL,
  getToken: () => appsInTossAdsPlatform.session.token(),
});

let adsSessionPromise: Promise<boolean> | null = null;

export function ensureAppsInTossAdsSession(): Promise<boolean> {
  adsSessionPromise ??= (async () => {
    try {
      await appsInTossAdsPlatform.session.token();
      return true;
    } catch {
      // 세션이 없거나 갱신할 수 없을 때만 새 authorization code를 요청한다.
    }
    const { authorizationCode, referrer } = await appLogin();
    // SDK 0.1의 런타임은 credential 객체를 그대로 전달한다. referrer는 Platform
    // Ads 계약에 새로 추가된 필드이며 원문 authorization code는 세션 교환 뒤 버린다.
    const credential: Credential & { referrer: 'DEFAULT' | 'SANDBOX' } = {
      kind: 'ait-login',
      value: authorizationCode,
      referrer,
    };
    await appsInTossAdsPlatform.signIn(credential);
    return true;
  })().catch(() => false).finally(() => {
    adsSessionPromise = null;
  });
  return adsSessionPromise;
}

export const trackAppsInTossPlatformEvent: TrackGameEvent = (name, params = {}) => {
  appsInTossPlatform.events.track({ name, params });
};

export function startAppsInTossPlatformEvents(): void {
  appsInTossPlatform.start();
}

export async function flushAppsInTossPlatformEvents(): Promise<void> {
  await appsInTossPlatform.events.flush();
}

export async function shutdownAppsInTossPlatformEvents(): Promise<void> {
  await appsInTossPlatform.shutdown();
}
