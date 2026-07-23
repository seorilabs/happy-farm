/// <reference types="jest" />

export {};

import {
  GA4_CLIENT_ID_STORAGE_KEY,
  createGa4MeasurementProtocolClient,
  type Ga4MeasurementProtocolOptions,
} from '../measurementProtocol';

// 주입 가능한 스토리지 모의. 값은 메모리 맵에 보관한다.
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

type SentBody = { client_id: string; events: Array<{ name: string; params: Record<string, unknown> }> };
type Posted = { url: string; body: SentBody };

function at<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`no item at index ${index}`);
  }
  return item;
}

function createHarness(overrides: Partial<Ga4MeasurementProtocolOptions> = {}) {
  const posted: Posted[] = [];
  const storage = overrides.storage ?? createMemoryStorage();
  const post = jest.fn(async (url: string, body: string) => {
    posted.push({ url, body: JSON.parse(body) });
  });
  const client = createGa4MeasurementProtocolClient({
    measurementId: 'G-TEST',
    apiSecret: 'secret-123',
    storage,
    post,
    now: () => 1_700_000_000_000,
    generateClientId: () => 'client-fixed',
    // 테스트는 debounce 타이머 대신 flush()를 직접 호출해 결정적으로 검증한다.
    scheduleFlush: () => 0,
    cancelFlush: () => undefined,
    ...overrides,
  });
  return { client, post, posted, storage: storage as ReturnType<typeof createMemoryStorage> };
}

describe('createGa4MeasurementProtocolClient — 설정/초기화', () => {
  test('measurementId 또는 apiSecret이 비면 disabled이고 전송은 no-op이다', async () => {
    const { client, post } = createHarness({ apiSecret: '' });

    const result = await client.initialize();
    expect(result).toEqual({ status: 'disabled', reason: 'no_config' });

    client.track('crop_planted', { crop: 'wheat' });
    client.flush();
    expect(post).not.toHaveBeenCalled();
  });

  test('client_id가 없으면 생성해 스토리지에 저장한다', async () => {
    const { client, storage } = createHarness();

    const result = await client.initialize();

    expect(result).toEqual({ status: 'ready', isNewClient: true });
    expect(storage.setItem).toHaveBeenCalledWith(GA4_CLIENT_ID_STORAGE_KEY, 'client-fixed');
  });

  test('저장된 client_id가 있으면 재사용하고 새로 만들지 않는다', async () => {
    const storage = createMemoryStorage({ [GA4_CLIENT_ID_STORAGE_KEY]: 'persisted-id' });
    const { client, post } = createHarness({ storage });

    await client.initialize();
    client.track('game_start');
    client.flush();

    expect(storage.setItem).not.toHaveBeenCalled();
    expect(at(post.mock.calls, 0)[1].includes('persisted-id')).toBe(true);
  });

  test('저장된 client_id가 있으면 기존 client로 초기화 결과에 표시한다', async () => {
    const storage = createMemoryStorage({ [GA4_CLIENT_ID_STORAGE_KEY]: 'persisted-id' });
    const { client } = createHarness({ storage });

    await expect(client.initialize()).resolves.toEqual({ status: 'ready', isNewClient: false });
  });

  test('스토리지 접근이 실패하면 error를 반환한다', async () => {
    const storage = createMemoryStorage();
    storage.getItem.mockRejectedValueOnce(new Error('storage down'));
    const { client } = createHarness({ storage });

    const result = await client.initialize();

    expect(result).toEqual({ status: 'error', reason: 'storage down' });
  });
});

describe('createGa4MeasurementProtocolClient — 큐잉/전송', () => {
  test('초기화 전 이벤트는 큐잉되었다가 ready 시점에 전송된다', async () => {
    const { client, post, posted } = createHarness();

    client.track('crop_planted', { crop: 'wheat' });
    client.track('crop_harvested', { crop: 'wheat' });
    expect(post).not.toHaveBeenCalled();

    await client.initialize();

    // ready 시 flush가 자동 호출되어 큐가 한 배치로 전송된다.
    expect(post).toHaveBeenCalledTimes(1);
    const body = at(posted, 0).body;
    expect(body.client_id).toBe('client-fixed');
    expect(body.events.map((event) => event.name)).toEqual(['crop_planted', 'crop_harvested']);
  });

  test('전송 페이로드에 session_id와 engagement_time_msec가 실린다', async () => {
    const { client, posted } = createHarness();
    await client.initialize();

    client.track('game_start', { level: 3 });
    client.flush();

    const event = at(at(posted, 0).body.events, 0);
    expect(event.params).toMatchObject({
      level: 3,
      session_id: '1700000000000',
      engagement_time_msec: 100,
    });
  });

  test('30분 세션 경계에서 startNewSession이 이후 이벤트에 새 session_id를 적용한다 (#395)', async () => {
    let currentTimeMs = 1_700_000_000_000;
    const { client, posted } = createHarness({ now: () => currentTimeMs });
    await client.initialize();

    client.track('game_start');
    client.flush();
    currentTimeMs += 30 * 60 * 1000;
    client.startNewSession();
    client.track('ait_session_start');
    client.flush();

    expect(at(at(posted, 0).body.events, 0).params.session_id).toBe('1700000000000');
    expect(at(at(posted, 1).body.events, 0).params.session_id).toBe('1700001800000');
  });

  test('URL에 measurement_id와 api_secret이 쿼리로 실린다', async () => {
    const { client, posted } = createHarness();
    await client.initialize();
    client.track('game_start');
    client.flush();

    expect(at(posted, 0).url).toBe(
      'https://www.google-analytics.com/mp/collect?measurement_id=G-TEST&api_secret=secret-123',
    );
  });

  test('한 요청 상한(25개)을 넘으면 여러 배치로 나눠 보낸다', async () => {
    const { client, post } = createHarness();
    await client.initialize();

    for (let i = 0; i < 60; i += 1) {
      client.track('evt', { seq: i });
    }
    client.flush();

    // 60개 → 25 + 25 + 10 = 3배치.
    expect(post).toHaveBeenCalledTimes(3);
  });

  test('수집을 끄면 이벤트를 버퍼에 쌓지 않고 무시한다', async () => {
    const { client, post } = createHarness();
    await client.initialize();

    client.setCollectionEnabled(false);
    client.track('crop_planted', { crop: 'wheat' });
    client.flush();

    expect(post).not.toHaveBeenCalled();
  });

  test('boolean/비유한 값은 스칼라로 정규화되어 전송된다', async () => {
    const { client, posted } = createHarness();
    await client.initialize();

    client.track('crop_harvested', { is_first: true, revenue: Number.POSITIVE_INFINITY });
    client.flush();

    const params = at(at(posted, 0).body.events, 0).params;
    expect(params.is_first).toBe(1);
    expect(params.revenue).toBe(0);
  });
});
