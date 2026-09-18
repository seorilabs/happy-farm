import { getAnalytics, setAnalyticsCollectionEnabled } from '@react-native-firebase/analytics';

import { logDevWarning } from '../../../../packages/farm-core/src';
import { isFirebaseConfigured } from './app';
import { mobileFarmAnalytics } from './analytics';

export { mobileFarmAnalytics };

export async function initializeMobileFirebaseServices() {
  if (!isFirebaseConfigured()) {
    return { status: 'skipped' as const };
  }

  // Firebase에서 쓰는 기능은 GA4 하나다. 수집 여부는 빌드에 고정한다.
  try {
    await setAnalyticsCollectionEnabled(getAnalytics(), true);
  } catch (error) {
    logDevWarning('[analytics] set collection enabled failed', error);
  }

  return { status: 'ready' as const };
}
