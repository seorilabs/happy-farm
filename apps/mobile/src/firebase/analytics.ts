import { getAnalytics, logEvent } from '@react-native-firebase/analytics';

import {
  combineTrackers,
  createFarmAnalytics,
  toFirebaseAnalyticsParams,
  type TrackGameEvent,
} from '../../../../packages/farm-core/src';

import { isFirebaseConfigured } from './app';
import { recordNonFatalError } from './crashlytics';
import { trackMobilePlatformEvent } from '../platformEvents';

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

// 기존 Firebase Analytics는 그대로 유지하고, 합의한 저빈도 이벤트만 Platform tracker에
// 두 번째 sink로 전달한다. 각 sink의 실패는 combineTrackers가 격리한다.
export const mobileFarmAnalytics = createFarmAnalytics(
  combineTrackers(trackFirebaseGameEvent, trackMobilePlatformEvent),
);
