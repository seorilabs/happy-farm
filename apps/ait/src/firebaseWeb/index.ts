import {
  appsInTossFarmAnalytics,
  initializeAppsInTossAnalytics,
} from './analytics';

export async function initializeAppsInTossFirebaseServices() {
  // Analytics는 Platform relay용 client ID/lifecycle을 준비한다. 브라우저 전용
  // Firebase JS SDK나 FirebaseApp 인스턴스는 필요 없다.
  const analytics = await initializeAppsInTossAnalytics();

  return { status: 'ready' as const, analytics };
}

export { appsInTossFarmAnalytics };
