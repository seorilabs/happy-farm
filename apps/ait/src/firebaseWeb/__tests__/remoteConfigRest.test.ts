/// <reference types="jest" />

export {};

import {
  REMOTE_CONFIG_CACHE_STORAGE_KEY,
  REMOTE_CONFIG_INSTANCE_ID_STORAGE_KEY,
  createFirebaseRemoteConfigRestClient,
  type FirebaseRemoteConfigRestOptions,
} from '../remoteConfigRest';

function at<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`no item at index ${index}`);
  }
  return item;
}

function createMemoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: jest.fn(async (key: string) => map.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      map.set(key, value);
    }),
  };
}

function createHarness(overrides: Partial<FirebaseRemoteConfigRestOptions> = {}) {
  let time = 1_000_000;
  const storage = overrides.storage ?? createMemoryStorage();
  const post = jest.fn<Promise<string>, [string, string, number]>(
    async () => JSON.stringify({ entries: { mobile_ads_global_enabled: 'false' } }),
  );
  const client = createFirebaseRemoteConfigRestClient({
    apiKey: 'api-key',
    projectNumber: '1874344437',
    appId: 'app-id',
    storage,
    post,
    now: () => time,
    generateInstanceId: () => 'instance-fixed',
    minimumFetchIntervalMs: 1000,
    ...overrides,
  });
  return {
    client,
    post,
    storage: storage as ReturnType<typeof createMemoryStorage>,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe('createFirebaseRemoteConfigRestClient', () => {
  test('첫 fetch는 네트워크를 치고 entries를 반환하며 instance_id를 영속한다', async () => {
    const { client, post, storage } = createHarness();

    const result = await client.fetchEntries();

    expect(result).toEqual({ status: 'ready', entries: { mobile_ads_global_enabled: 'false' } });
    expect(post).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(REMOTE_CONFIG_INSTANCE_ID_STORAGE_KEY, 'instance-fixed');
    // 요청 바디에 app_id와 영속된 app_instance_id가 실린다.
    const body = JSON.parse(at(post.mock.calls, 0)[1]) as { app_id: string; app_instance_id: string };
    expect(body).toEqual({ app_id: 'app-id', app_instance_id: 'instance-fixed' });
  });

  test('minimumFetchInterval 이내 재요청은 캐시를 반환하고 네트워크를 생략한다', async () => {
    const { client, post, advance } = createHarness();

    await client.fetchEntries();
    advance(500); // < 1000ms throttle
    const second = await client.fetchEntries();

    expect(second.status).toBe('ready');
    expect(post).toHaveBeenCalledTimes(1); // 두 번째는 네트워크 생략
  });

  test('throttle 간격이 지나면 다시 네트워크를 친다', async () => {
    const { client, post, advance } = createHarness();

    await client.fetchEntries();
    advance(1500); // > 1000ms
    await client.fetchEntries();

    expect(post).toHaveBeenCalledTimes(2);
  });

  test('네트워크 실패 시 캐시가 있으면 stale 캐시를 반환한다', async () => {
    const { client, post, advance } = createHarness();

    await client.fetchEntries(); // 캐시 적재
    advance(2000); // throttle 만료 → 네트워크 시도
    post.mockRejectedValueOnce(new Error('network down'));

    const result = await client.fetchEntries();

    expect(result).toEqual({ status: 'ready', entries: { mobile_ads_global_enabled: 'false' } });
  });

  test('캐시도 없고 네트워크도 실패하면 error를 반환한다', async () => {
    const { client, post } = createHarness();
    post.mockRejectedValueOnce(new Error('network down'));

    const result = await client.fetchEntries();

    expect(result).toEqual({ status: 'error', reason: 'network down' });
  });

  test('저장된 instance_id가 있으면 재사용한다', async () => {
    const storage = createMemoryStorage({ [REMOTE_CONFIG_INSTANCE_ID_STORAGE_KEY]: 'persisted-instance' });
    const { client, post } = createHarness({ storage });

    await client.fetchEntries();

    const body = JSON.parse(at(post.mock.calls, 0)[1]) as { app_instance_id: string };
    expect(body.app_instance_id).toBe('persisted-instance');
    expect(storage.setItem).not.toHaveBeenCalledWith(REMOTE_CONFIG_INSTANCE_ID_STORAGE_KEY, expect.anything());
  });

  test('캐시는 entries와 fetchedAt으로 저장된다', async () => {
    const { client, storage } = createHarness();

    await client.fetchEntries();

    const cached = storage.map.get(REMOTE_CONFIG_CACHE_STORAGE_KEY);
    expect(cached).toBeDefined();
    const parsed = JSON.parse(cached as string) as { entries: Record<string, string>; fetchedAt: number };
    expect(parsed.entries).toEqual({ mobile_ads_global_enabled: 'false' });
    expect(parsed.fetchedAt).toBe(1_000_000);
  });
});
