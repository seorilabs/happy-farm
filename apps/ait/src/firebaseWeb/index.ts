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

  // 원격값(analytics_collection_enabled)을 실제 수집 토글에 반영하되, 원격 설정이
  // 실제로 활성화(ready)된 경우에만 적용한다. 미지원/오류로 원격값이 비권위적인
  // 기본값 폴백일 때는 토글을 강제로 덮어쓰지 않고 플랫폼 기본 동작을 유지한다.
  if (remoteConfig.status === 'ready') {
    setAppsInTossAnalyticsCollectionEnabled(getAppsInTossRemoteBoolean('analytics_collection_enabled'));
  }

  return { status: 'ready' as const, analytics, remoteConfig };
}

export { appsInTossFarmAnalytics };
