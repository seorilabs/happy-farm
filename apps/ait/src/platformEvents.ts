import { getAnonymousKey } from '@apps-in-toss/framework';
import { createPlatform, type Credential } from '@seorilabs/platform-sdk';
import type { AppStateStatus } from 'react-native';

import {
  RELEASE_INFO,
  withStandardAnalyticsParams,
  type TrackGameEvent,
} from '../../../packages/farm-core/src';
import { detectRuntimeLocale } from '../../../packages/farm-ui/src';
import { getAppsInTossGa4ClientId } from './firebaseWeb/analyticsIdentity';

const PLATFORM_API_URL = 'https://platform-api-306278488979.asia-northeast3.run.app';
const PLATFORM_INGEST_URL = 'https://platform-ingest-306278488979.asia-northeast3.run.app';

// 브라우저 fetch는 Window를 receiver로 유지해야 한다. SDK의 메서드 호출에도 안전하다.
const browserFetch = globalThis.fetch.bind(globalThis);

// SDK client는 debugBuild를 생략해 Granite 번들의 `__DEV__`를 따른다. `ait build` 번들은 false다.
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

let platformSessionPromise: Promise<boolean> | null = null;
let analyticsSessionId = Date.now();

// 분석용 익명 세션은 UI 없이 열며 광고 SDK 로드·표시와 독립적으로 동작한다.
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
