import { appLogin, getAnonymousKey } from '@apps-in-toss/framework';
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

let platformSessionPromise: Promise<boolean> | null = null;
let adsSessionPromise: Promise<boolean> | null = null;

// 신규 사용자마다 Platform 계정을 연다. Platform은 identity를 처음 만들 때만
// identity.created 운영 이벤트를 내보내고, 그게 Backoffice의 신규가입 알림을
// 만드는 유일한 입력이다. 지금까지 세션을 여는 경로가 광고 표시 시점의
// ensureAppsInTossAdsSession뿐이라 대부분의 사용자가 계정 없이 이탈했다.
//
// 광고 경로의 appLogin은 토스 인증 화면으로 사용자를 보내는 인터랙티브 흐름이라
// 부팅 경로에 쓸 수 없다. getAnonymousKey는 UI 없이 미니앱 스코프 사용자 키만
// 돌려주므로 첫 화면을 막지 않는다. Platform은 이 신원을 anonymous로 표시하고
// IAP 같은 민감 경로는 별도로 거부하므로, 광고·결제 경로는 그대로 ait-login을 쓴다.
export function ensureAppsInTossPlatformSession(): Promise<boolean> {
  platformSessionPromise ??= (async () => {
    try {
      await appsInTossPlatform.session.token();
      return true;
    } catch {
      // 세션이 없거나 갱신할 수 없을 때만 익명 키로 새 세션을 연다.
    }
    const anonymousKey = await getAnonymousKey();
    if (anonymousKey == null || anonymousKey === 'ERROR') {
      throw new Error(`getAnonymousKey가 키를 주지 않았다: ${String(anonymousKey)}`);
    }
    const credential: Credential = { kind: 'anonymous', value: anonymousKey.hash };
    await appsInTossPlatform.signIn(credential);
    return true;
  })()
    .catch((error: unknown) => {
      // 실패를 조용히 삼키면 신규가입 알림이 왜 끊겼는지 알 수 없다.
      console.warn('[ait] Platform session bootstrap failed', error);
      return false;
    })
    .finally(() => {
      platformSessionPromise = null;
    });
  return platformSessionPromise;
}

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
