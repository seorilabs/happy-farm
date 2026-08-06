import { createPlatform } from '@seorilabs/platform-sdk';
import { Platform } from 'react-native';

import {
  PLATFORM_EVENT_ALLOWLIST,
  RELEASE_INFO,
  type TrackGameEvent,
} from '../../../packages/farm-core/src';
import { detectRuntimeLocale } from '../../../packages/farm-ui/src';

const PLATFORM_API_URL = 'https://platform-api-306278488979.asia-northeast3.run.app';
const PLATFORM_INGEST_URL = 'https://platform-ingest-306278488979.asia-northeast3.run.app';

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
