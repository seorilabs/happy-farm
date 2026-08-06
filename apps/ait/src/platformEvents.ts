import { createPlatform } from '@seorilabs/platform-sdk';

import {
  PLATFORM_EVENT_ALLOWLIST,
  RELEASE_INFO,
  type TrackGameEvent,
} from '../../../packages/farm-core/src';
import { detectRuntimeLocale } from '../../../packages/farm-ui/src';

const PLATFORM_API_URL = 'https://platform-api-306278488979.asia-northeast3.run.app';
const PLATFORM_INGEST_URL = 'https://platform-ingest-306278488979.asia-northeast3.run.app';

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
