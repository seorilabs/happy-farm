import { getAnalytics, logEvent } from '@react-native-firebase/analytics';

import {
  createFarmAnalytics,
  type AnalyticsValue,
  type TrackGameEvent,
} from '../../../../packages/farm-core/src';

import { isFirebaseConfigured } from './app';
import { recordNonFatalError } from './crashlytics';

type FirebaseAnalyticsParams = Record<string, string | number>;
type FirebaseLogEvent = (
  analytics: ReturnType<typeof getAnalytics>,
  eventName: string,
  params?: FirebaseAnalyticsParams
) => Promise<void>;

const logFirebaseEvent = logEvent as FirebaseLogEvent;

function toFirebaseAnalyticsValue(value: AnalyticsValue) {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  return value;
}

function normalizeAnalyticsParams(params: Record<string, AnalyticsValue> = {}) {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, toFirebaseAnalyticsValue(value)])
  ) as FirebaseAnalyticsParams;
}

const trackFirebaseGameEvent: TrackGameEvent = (name, params = {}) => {
  if (!isFirebaseConfigured()) {
    return;
  }

  try {
    void logFirebaseEvent(getAnalytics(), name, normalizeAnalyticsParams(params)).catch((error: unknown) => {
      recordNonFatalError(error, `analytics:${name}`);
    });
  } catch (error) {
    recordNonFatalError(error, `analytics:${name}`);
  }
};

export const mobileFarmAnalytics = createFarmAnalytics(trackFirebaseGameEvent);
