import { getAnalytics, setAnalyticsCollectionEnabled } from '@react-native-firebase/analytics';
import { getCrashlytics, setCrashlyticsCollectionEnabled } from '@react-native-firebase/crashlytics';

import { isFirebaseConfigured } from './app';
import { mobileFarmAnalytics } from './analytics';
import { recordNonFatalError } from './crashlytics';
import { getRemoteBoolean, initializeMobileRemoteConfig } from './remoteConfig';

export { mobileFarmAnalytics };
export { getRemoteBoolean, getRemoteNumber, getRemoteString, MOBILE_REMOTE_CONFIG_DEFAULTS } from './remoteConfig';

export async function initializeMobileFirebaseServices() {
  if (!isFirebaseConfigured()) {
    return { status: 'skipped' as const };
  }

  const remoteConfigResult = await initializeMobileRemoteConfig();

  try {
    await setAnalyticsCollectionEnabled(getAnalytics(), getRemoteBoolean('analytics_collection_enabled'));
  } catch (error) {
    recordNonFatalError(error, 'analytics:set_collection_enabled');
  }

  try {
    await setCrashlyticsCollectionEnabled(getCrashlytics(), getRemoteBoolean('crashlytics_collection_enabled'));
  } catch (error) {
    recordNonFatalError(error, 'crashlytics:set_collection_enabled');
  }

  return { status: 'ready' as const, remoteConfig: remoteConfigResult };
}
