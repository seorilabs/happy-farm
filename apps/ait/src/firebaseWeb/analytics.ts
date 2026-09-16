import { Storage } from '@apps-in-toss/framework';

import {
  createFarmAnalytics,
  type TrackGameEvent,
} from '../../../../packages/farm-core/src';

import { createAppsInTossAnalyticsLifecycle } from './analyticsLifecycle';
import { initializeAppsInTossAnalyticsIdentity } from './analyticsIdentity';
import {
  flushAppsInTossPlatformEvents,
  startNewAppsInTossAnalyticsSession,
  trackAppsInTossPlatformEvent,
} from '../platformEvents';

type AppsInTossAnalyticsInitResult =
  | { status: 'ready'; firstTouch: 'recorded' | 'existing' }
  | { status: 'ready'; firstTouch: 'storage_error'; reason: string }
  | { status: 'error'; reason: string };

let collectionEnabled = true;
let initializePromise: Promise<AppsInTossAnalyticsInitResult> | null = null;

export const trackAppsInTossAnalyticsEvent: TrackGameEvent = (name, params = {}) => {
  if (!collectionEnabled) {
    return;
  }
  trackAppsInTossPlatformEvent(name, params);
};

const analyticsLifecycle = createAppsInTossAnalyticsLifecycle({
  storage: {
    getItem: (key) => Storage.getItem(key),
    setItem: (key, value) => Storage.setItem(key, value),
  },
  track: trackAppsInTossAnalyticsEvent,
  startNewSession: startNewAppsInTossAnalyticsSession,
  flush: () => {
    void flushAppsInTossPlatformEvents();
  },
});

async function initializeAnalytics(): Promise<AppsInTossAnalyticsInitResult> {
  try {
    const identity = await initializeAppsInTossAnalyticsIdentity();
    if (identity.storageStatus === 'error') {
      console.warn('[ait-analytics] client id storage unavailable; using an in-memory id');
    }
    return await analyticsLifecycle.initialize(identity.isNewClient);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown';
    console.warn(`[ait-analytics] init error: ${reason}`);
    return { status: 'error', reason };
  }
}

export function initializeAppsInTossAnalytics(): Promise<AppsInTossAnalyticsInitResult> {
  initializePromise ??= initializeAnalytics().then((result) => {
    if (result.status === 'error') {
      initializePromise = null;
    }
    return result;
  });
  return initializePromise;
}

export function setAppsInTossAnalyticsCollectionEnabled(enabled: boolean): void {
  collectionEnabled = enabled;
}

export const handleAppsInTossAnalyticsAppStateChange = analyticsLifecycle.handleAppStateChange;

// AIT 커스텀 이벤트의 GA4 경로는 Platform relay 하나뿐이다. 직접 Measurement Protocol
// 전송을 함께 두지 않아 동일 이벤트가 이중 발화하지 않게 한다.
export const appsInTossFarmAnalytics = createFarmAnalytics(trackAppsInTossAnalyticsEvent);
