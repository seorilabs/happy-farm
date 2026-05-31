import { getAppsInTossFirebaseApp } from './app';
import { appsInTossFarmAnalytics, initializeAppsInTossAnalytics } from './analytics';

export async function initializeAppsInTossFirebaseServices() {
  const app = getAppsInTossFirebaseApp();
  const analytics = await initializeAppsInTossAnalytics(app);

  return { status: 'ready' as const, analytics };
}

export { appsInTossFarmAnalytics };
