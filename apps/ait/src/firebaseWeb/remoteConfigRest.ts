// Firebase Remote Config REST fetch 클라이언트.
//
// 배경: AppsInToss 빌드는 Granite React Native(브라우저 DOM 없음) 런타임인데, 기존
// Remote Config는 브라우저 전용 firebase/remote-config를 사용해 isSupported()가 false를
// 반환 → 원격값을 한 번도 받지 못하고 항상 기본값으로만 동작했다(전면 광고 그룹 ID·광고
// cap 오버라이드 등을 운영에서 원격 주입해도 반영 불가). 그래서 RN fetch에서 동작하는
// Remote Config REST fetch 엔드포인트를 직접 호출한다.
//
// 엔드포인트: POST https://firebaseremoteconfig.googleapis.com/v1/projects/{projectNumber}
//            /namespaces/firebase:fetch?key={apiKey}
// 응답: { entries: { <key>: <stringValue> }, state: 'UPDATE'|'NO_TEMPLATE'|..., templateVersion }
//
// farm-core는 네트워크/스토리지에 접근하지 않으므로, 실제 전송(fetch)·영속(Storage)은
// 이 앱 레이어가 주입한다. 모든 외부 의존성은 옵션으로 주입 가능해 헤드리스 테스트가 쉽다.

const REMOTE_CONFIG_ENDPOINT = 'https://firebaseremoteconfig.googleapis.com/v1';

// app_instance_id(설치 단위 안정 식별자) 영속 키. 퍼센트 롤아웃/조건 타겟이 설치별로
// 일관되게 적용되도록 안정적으로 유지한다.
export const REMOTE_CONFIG_INSTANCE_ID_STORAGE_KEY = 'ait_rc_instance_id';
// 마지막으로 받은 entries + fetch 시각 캐시 키. 오프라인/throttle 시 재사용한다.
export const REMOTE_CONFIG_CACHE_STORAGE_KEY = 'ait_rc_cache_v1';

const DEFAULT_MINIMUM_FETCH_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

export type RemoteConfigEntries = Record<string, string>;

export type RemoteConfigFetchResult =
  | { status: 'ready'; entries: RemoteConfigEntries }
  | { status: 'error'; reason: string };

type StorageLike = {
  getItem: (key: string) => Promise<string | null> | string | null;
  setItem: (key: string, value: string) => Promise<void> | void;
};

export type FirebaseRemoteConfigRestOptions = {
  apiKey: string;
  projectNumber: string;
  appId: string;
  storage: StorageLike;
  /** HTTP POST. 응답 본문 텍스트를 반환한다(2xx가 아니면 throw). */
  post: (url: string, body: string, timeoutMs: number) => Promise<string>;
  now?: () => number;
  generateInstanceId?: () => string;
  /** 이 간격 이내 재요청은 캐시를 그대로 반환(네트워크 생략). */
  minimumFetchIntervalMs?: number;
  fetchTimeoutMs?: number;
};

export type FirebaseRemoteConfigRestClient = {
  /** 원격값을 받아 반환한다(throttle·캐시·오프라인 폴백 포함). */
  fetchEntries: () => Promise<RemoteConfigFetchResult>;
};

function defaultGenerateInstanceId(): string {
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

type CacheShape = { entries: RemoteConfigEntries; fetchedAt: number };

function parseCache(raw: string | null): CacheShape | null {
  if (raw == null || raw === '') {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<CacheShape>;
    if (parsed != null && typeof parsed === 'object' && parsed.entries != null && typeof parsed.fetchedAt === 'number') {
      return { entries: parsed.entries, fetchedAt: parsed.fetchedAt };
    }
  } catch {
    // 캐시 파싱 실패는 무시하고 캐시 없음으로 처리한다.
  }
  return null;
}

export function createFirebaseRemoteConfigRestClient(
  options: FirebaseRemoteConfigRestOptions,
): FirebaseRemoteConfigRestClient {
  const {
    apiKey,
    projectNumber,
    appId,
    storage,
    post,
    now = Date.now,
    generateInstanceId = defaultGenerateInstanceId,
    minimumFetchIntervalMs = DEFAULT_MINIMUM_FETCH_INTERVAL_MS,
    fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  } = options;

  const fetchUrl = `${REMOTE_CONFIG_ENDPOINT}/projects/${encodeURIComponent(projectNumber)}/namespaces/firebase:fetch?key=${encodeURIComponent(apiKey)}`;

  async function resolveInstanceId(): Promise<string> {
    const stored = await storage.getItem(REMOTE_CONFIG_INSTANCE_ID_STORAGE_KEY);
    if (stored != null && stored !== '') {
      return stored;
    }
    const instanceId = generateInstanceId();
    await storage.setItem(REMOTE_CONFIG_INSTANCE_ID_STORAGE_KEY, instanceId);
    return instanceId;
  }

  async function readCache(): Promise<CacheShape | null> {
    try {
      return parseCache(await storage.getItem(REMOTE_CONFIG_CACHE_STORAGE_KEY));
    } catch {
      return null;
    }
  }

  async function writeCache(entries: RemoteConfigEntries): Promise<void> {
    try {
      await storage.setItem(
        REMOTE_CONFIG_CACHE_STORAGE_KEY,
        JSON.stringify({ entries, fetchedAt: now() } satisfies CacheShape),
      );
    } catch {
      // 캐시 저장 실패는 무시한다(다음 요청에서 네트워크로 다시 받는다).
    }
  }

  async function fetchEntries(): Promise<RemoteConfigFetchResult> {
    const cache = await readCache();
    // throttle: 최근에 받은 캐시가 있으면 네트워크를 생략하고 그대로 반환한다.
    // persisted wall clock이 뒤로 이동해 fetchedAt이 미래가 된 경우에는 캐시를
    // fresh로 고정하지 않고 다시 받아 현재 시각으로 복구한다.
    if (cache != null) {
      const elapsedMs = now() - cache.fetchedAt;
      if (elapsedMs >= 0 && elapsedMs < minimumFetchIntervalMs) {
        return { status: 'ready', entries: cache.entries };
      }
    }

    try {
      const instanceId = await resolveInstanceId();
      const body = JSON.stringify({ app_id: appId, app_instance_id: instanceId });
      const responseText = await post(fetchUrl, body, fetchTimeoutMs);
      const parsed = JSON.parse(responseText) as { entries?: RemoteConfigEntries };
      const entries = parsed.entries ?? {};
      await writeCache(entries);
      return { status: 'ready', entries };
    } catch (error) {
      // 네트워크/파싱 실패 시, 캐시가 있으면 stale이라도 반환해 최소한 마지막 원격값을 쓴다.
      if (cache != null) {
        return { status: 'ready', entries: cache.entries };
      }
      const reason = error instanceof Error ? error.message : 'unknown';
      return { status: 'error', reason };
    }
  }

  return { fetchEntries };
}
