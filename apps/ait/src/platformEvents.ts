import { appLogin, getAnonymousKey } from '@apps-in-toss/framework';
import { createPlatform, type Credential } from '@seorilabs/platform-sdk';
import type { AppStateStatus } from 'react-native';

import {
  RELEASE_INFO,
  withStandardAnalyticsParams,
  type TrackGameEvent,
} from '../../../packages/farm-core/src';
import { detectRuntimeLocale } from '../../../packages/farm-ui/src';
import { PlatformAdsClient } from '../../../packages/farm-core/src';
import { getAppsInTossGa4ClientId } from './firebaseWeb/analyticsIdentity';

const PLATFORM_API_URL = 'https://platform-api-306278488979.asia-northeast3.run.app';
const PLATFORM_INGEST_URL = 'https://platform-ingest-306278488979.asia-northeast3.run.app';
export const PLATFORM_ADS_URL = 'https://platform-ads-306278488979.asia-northeast3.run.app';

// 브라우저 fetch는 Window를 receiver로 유지해야 한다. SDK의 메서드 호출에도 안전하다.
const browserFetch = globalThis.fetch.bind(globalThis);

const appsInTossPlatform = createPlatform({
  fetchImpl: browserFetch,
  appId: 'happy-farm',
  baseUrl: PLATFORM_API_URL,
  ingestBaseUrl: PLATFORM_INGEST_URL,
  eventContext: () => ({
    platform: 'ait',
    appVersion: RELEASE_INFO.versionName,
    locale: detectRuntimeLocale(),
    ga4ClientId: getAppsInTossGa4ClientId(),
    // 위치 파생용 원 요청 IP는 제품 분석 동의를 별도로 받기 전까지 전달하지 않는다.
    analyticsConsent: false,
  }),
  // Presence는 Platform/Backoffice 운영 gate가 끝난 릴리스에서만 opt-in한다.
  // 기본값을 조합 지점에 명시해 SDK 업그레이드만으로 네트워크가 열리지 않게 한다.
  presenceEnabled: false,
  presenceContext: () => ({
    platform: 'ait',
    appVersion: RELEASE_INFO.versionName,
  }),
});

const appsInTossAdsPlatform = createPlatform({
  appId: 'happy-farm',
  baseUrl: PLATFORM_ADS_URL,
  fetchImpl: browserFetch,
});

export const appsInTossPlatformAds = new PlatformAdsClient({
  appId: 'happy-farm',
  baseUrl: PLATFORM_ADS_URL,
  getToken: () => appsInTossAdsPlatform.session.token(),
  fetch: browserFetch,
});

let platformSessionPromise: Promise<boolean> | null = null;
export type AppsInTossAdsSessionResult =
  | { ok: true }
  | { ok: false; stage: 'login' | 'session_exchange'; reason: AdsSessionFailureReason };

type AdsSessionFailureReason =
  | 'cancelled' | 'network' | 'unauthorized' | 'rate_limited' | 'server' | 'unknown';

// 코드·토큰·원문 메시지는 계측하지 않고 고정된 분류만 전달한다.
function classifyAdsSessionFailure(error: unknown): AdsSessionFailureReason {
  if (typeof error !== 'object' || error == null) return 'unknown';
  const { status, code } = error as { status?: unknown; code?: unknown };
  if (code === 'CANCELLED' || code === 'USER_CANCELLED') return 'cancelled';
  if (status === 0 || code === 'network_error') return 'network';
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 429) return 'rate_limited';
  if (typeof status === 'number' && status >= 500 && status <= 599) return 'server';
  return 'unknown';
}

let adsSessionPromise: Promise<AppsInTossAdsSessionResult> | null = null;
let analyticsSessionId = Date.now();

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
      // 진단 문자열이라 locale catalog를 쓰지 않는다. 사용자에게 노출되지 않는다.
      throw new Error(`getAnonymousKey returned no key: ${String(anonymousKey)}`);
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

export function ensureAppsInTossAdsSession(): Promise<AppsInTossAdsSessionResult> {
  adsSessionPromise ??= (async (): Promise<AppsInTossAdsSessionResult> => {
    try {
      await appsInTossAdsPlatform.session.token();
      return { ok: true };
    } catch {
      // 세션이 없거나 갱신할 수 없을 때만 새 authorization code를 요청한다.
    }
    let login: Awaited<ReturnType<typeof appLogin>>;
    try {
      login = await appLogin();
    } catch (error) {
      return { ok: false, stage: 'login', reason: classifyAdsSessionFailure(error) };
    }
    const { authorizationCode, referrer } = login;
    // SDK 런타임은 credential 객체를 그대로 전달한다. referrer는 Platform Ads
    // 계약 필드이며 원문 authorization code는 세션 교환 뒤 버린다.
    const credential: Credential & { referrer: 'DEFAULT' | 'SANDBOX' } = {
      kind: 'ait-login',
      value: authorizationCode,
      referrer,
    };
    try {
      await appsInTossAdsPlatform.signIn(credential);
      return { ok: true };
    } catch (error) {
      return { ok: false, stage: 'session_exchange', reason: classifyAdsSessionFailure(error) };
    }
  })().finally(() => {
    adsSessionPromise = null;
  });
  return adsSessionPromise;
}

export const trackAppsInTossPlatformEvent: TrackGameEvent = (name, params = {}) => {
  appsInTossPlatform.events.track({
    name,
    params: withStandardAnalyticsParams(
      {
        appMarket: 'apps_in_toss',
        runtimePlatform: 'web',
        releaseVersion: RELEASE_INFO.versionName,
      },
      params,
      {
        session_id: analyticsSessionId,
        engagement_time_msec: 1,
      },
    ),
  });
};

export function startNewAppsInTossAnalyticsSession(): void {
  analyticsSessionId = Date.now();
}

export function startAppsInTossPlatformEvents(): void {
  appsInTossPlatform.start();
}

export async function flushAppsInTossPlatformEvents(): Promise<void> {
  await appsInTossPlatform.events.flush();
}

export function handleAppsInTossPlatformAppStateChange(nextState: AppStateStatus): void {
  if (nextState === 'active') {
    // start와 resume 모두 즉시 반환한다. foreground 전환은 제품 흐름을 기다리게 하지 않는다.
    appsInTossPlatform.presence.start();
    appsInTossPlatform.presence.resume();
    return;
  }

  appsInTossPlatform.presence.stop();
  void appsInTossPlatform.events.flush();
}

export async function shutdownAppsInTossPlatformEvents(): Promise<void> {
  await appsInTossPlatform.shutdown();
}
