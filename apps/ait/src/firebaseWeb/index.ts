import { getAppsInTossFirebaseApp } from './app';
import { appsInTossFarmAnalytics, initializeAppsInTossAnalytics } from './analytics';
import { initializeAppsInTossRemoteConfig } from './remoteConfig';

export async function initializeAppsInTossFirebaseServices() {
  const app = getAppsInTossFirebaseApp();
  const analytics = await initializeAppsInTossAnalytics(app);
  const remoteConfig = await initializeAppsInTossRemoteConfig(app);

  return { status: 'ready' as const, analytics, remoteConfig };
}

export { appsInTossFarmAnalytics };
