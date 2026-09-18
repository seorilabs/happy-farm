import { getAnalytics, setAnalyticsCollectionEnabled } from '@react-native-firebase/analytics';
import { getCrashlytics, setCrashlyticsCollectionEnabled } from '@react-native-firebase/crashlytics';

import { isFirebaseConfigured } from './app';
import { mobileFarmAnalytics } from './analytics';
import { recordNonFatalError } from './crashlytics';

export { mobileFarmAnalytics };
export { ensureMobileAnonymousUser } from './auth';

export async function initializeMobileFirebaseServices() {
  if (!isFirebaseConfigured()) {
    return { status: 'skipped' as const };
  }

  // 수집 여부는 빌드에 고정한다. 원격 토글을 두면 앱이 어떤 상태로 동작하는지
  // 저장소만 봐서는 알 수 없고, 실제로는 계속 켜 둔 채 운영해 왔다.
  try {
    await setAnalyticsCollectionEnabled(getAnalytics(), true);
  } catch (error) {
    recordNonFatalError(error, 'analytics:set_collection_enabled');
  }

  try {
    await setCrashlyticsCollectionEnabled(getCrashlytics(), true);
  } catch (error) {
    recordNonFatalError(error, 'crashlytics:set_collection_enabled');
  }

  return { status: 'ready' as const };
}
