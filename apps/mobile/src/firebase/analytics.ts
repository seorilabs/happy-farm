import { getAnalytics, logEvent } from '@react-native-firebase/analytics';

import {
  combineTrackers,
  createFarmAnalytics,
  toFirebaseAnalyticsParams,
  type TrackGameEvent,
} from '../../../../packages/farm-core/src';

import { isFirebaseConfigured } from './app';
import { recordNonFatalError } from './crashlytics';
import { createMobileSelfServerTracker } from './metricsServer';

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

// Firebase(GA4) 전송에 자체 지표 서버 전송을 fanout으로 결합한다. 자체 서버 tracker가
// null(엔드포인트 미설정)이면 firebase tracker만 남아 현 동작과 동일하다.
export const mobileFarmAnalytics = createFarmAnalytics(
  combineTrackers(trackFirebaseGameEvent, createMobileSelfServerTracker()),
);
