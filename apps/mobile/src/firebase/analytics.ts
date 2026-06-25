import { getAnalytics, logEvent } from '@react-native-firebase/analytics';

import {
  createFarmAnalytics,
  toFirebaseAnalyticsParams,
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

const trackFirebaseGameEvent: TrackGameEvent = (name, params = {}) => {
  if (!isFirebaseConfigured()) {
    return;
  }

  try {
    void logFirebaseEvent(getAnalytics(), name, toFirebaseAnalyticsParams(params)).catch((error: unknown) => {
      recordNonFatalError(error, `analytics:${name}`);
    });
  } catch (error) {
    recordNonFatalError(error, `analytics:${name}`);
  }
};

export const mobileFarmAnalytics = createFarmAnalytics(trackFirebaseGameEvent);
