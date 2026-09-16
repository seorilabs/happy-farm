import { Storage } from '@apps-in-toss/framework';

export const GA4_CLIENT_ID_STORAGE_KEY = 'ait_ga4_client_id';

export type AppsInTossAnalyticsIdentity = {
  clientId: string;
  isNewClient: boolean;
  storageStatus: 'ready' | 'error';
};

let cachedIdentity: AppsInTossAnalyticsIdentity | null = null;
let initializePromise: Promise<AppsInTossAnalyticsIdentity> | null = null;

function generateClientId(): string {
  const globalCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

async function initializeIdentity(): Promise<AppsInTossAnalyticsIdentity> {
  try {
    const stored = await Storage.getItem(GA4_CLIENT_ID_STORAGE_KEY);
    if (stored != null && stored !== '') {
      return { clientId: stored, isNewClient: false, storageStatus: 'ready' };
    }

    const clientId = generateClientId();
    await Storage.setItem(GA4_CLIENT_ID_STORAGE_KEY, clientId);
    return { clientId, isNewClient: true, storageStatus: 'ready' };
  } catch {
    // 저장소 장애가 제품 흐름이나 Platform 원장 수집을 막으면 안 된다. 이번 실행에서만
    // 쓰는 ID로 GA4 relay를 유지하되 신규 코호트 이벤트는 만들지 않는다.
    return { clientId: generateClientId(), isNewClient: false, storageStatus: 'error' };
  }
}

export function initializeAppsInTossAnalyticsIdentity(): Promise<AppsInTossAnalyticsIdentity> {
  initializePromise ??= initializeIdentity().then((identity) => {
    cachedIdentity = identity;
    return identity;
  });
  return initializePromise;
}

export function getAppsInTossGa4ClientId(): string | undefined {
  return cachedIdentity?.clientId;
}
