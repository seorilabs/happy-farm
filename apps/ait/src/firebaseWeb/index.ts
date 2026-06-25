import { getAppsInTossFirebaseApp } from './app';
import {
  appsInTossFarmAnalytics,
  initializeAppsInTossAnalytics,
  setAppsInTossAnalyticsCollectionEnabled,
} from './analytics';
import { getAppsInTossRemoteBoolean, initializeAppsInTossRemoteConfig } from './remoteConfig';

export async function initializeAppsInTossFirebaseServices() {
  const app = getAppsInTossFirebaseApp();
  const analytics = await initializeAppsInTossAnalytics(app);
  const remoteConfig = await initializeAppsInTossRemoteConfig(app);

  // 원격값(analytics_collection_enabled)을 실제 동작에 반영: 활성화 후 수집 토글 적용.
  // 미수신/오류 시에는 어댑터가 안전 기본값(true)으로 폴백한다.
  setAppsInTossAnalyticsCollectionEnabled(getAppsInTossRemoteBoolean('analytics_collection_enabled'));

  return { status: 'ready' as const, analytics, remoteConfig };
}

export { appsInTossFarmAnalytics };
