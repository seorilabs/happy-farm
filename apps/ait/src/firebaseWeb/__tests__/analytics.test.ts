/// <reference types="jest" />

// 파일을 모듈로 취급하게 해 전역 스코프 변수 충돌을 막는다.
export {};

// AIT 빌드는 Granite RN 런타임이라 firebase/analytics 대신 GA4 Measurement Protocol(fetch)
// 로 전송한다. 테스트는 AppsInToss Storage와 전역 fetch를 모의하고, 빌드 주입 secret은
// 비어 있지 않은 값으로 모킹해 ready 경로를 검증한다.

const mockStorage = {
  getItem: jest.fn<Promise<string | null>, [string]>(),
  setItem: jest.fn<Promise<void>, [string, string]>(),
  removeItem: jest.fn<Promise<void>, [string]>(),
};

jest.mock('@apps-in-toss/framework', () => ({
  Storage: mockStorage,
}));

jest.mock('../mpSecret.generated', () => ({
  GA4_MP_API_SECRET: 'test-secret',
}));

function loadAnalytics() {
  return jest.requireActual<typeof import('../analytics')>('../analytics');
}

const mockFetch = jest.fn<Promise<Response>, [string, { body: string }]>(
  async () => ({ ok: true }) as unknown as Response,
);

type SentBody = { client_id: string; events: Array<{ name: string; params: Record<string, unknown> }> };

function parseBody(callIndex: number): SentBody {
  const call = mockFetch.mock.calls[callIndex];
  if (!call) {
    throw new Error(`no fetch call at index ${callIndex}`);
  }
  return JSON.parse(call[1].body) as SentBody;
}

// fetch로 전송된 body를 파싱해 이벤트 이름 목록을 뽑는다.
function sentEventNames() {
  return mockFetch.mock.calls.flatMap((call) => {
    const body = JSON.parse(call[1].body) as SentBody;
    return body.events.map((event) => event.name);
  });
}

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  mockStorage.getItem.mockReset().mockResolvedValue(null);
  mockStorage.setItem.mockReset().mockResolvedValue(undefined);
  mockStorage.removeItem.mockReset().mockResolvedValue(undefined);
  mockFetch.mockReset().mockResolvedValue({ ok: true } as unknown as Response);
  (globalThis as { fetch: typeof fetch }).fetch = mockFetch as unknown as typeof fetch;
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('trackAppsInTossAnalyticsEvent — 큐잉/정규화/전송', () => {
  test('초기화 전에 발생한 이벤트는 유실되지 않고 준비 후 시장 공통 파라미터와 함께 전송된다', async () => {
    const { trackAppsInTossAnalyticsEvent, initializeAppsInTossAnalytics } = loadAnalytics();

    trackAppsInTossAnalyticsEvent('crop_planted', { crop: 'wheat' });
    expect(mockFetch).not.toHaveBeenCalled();

    await initializeAppsInTossAnalytics();

    // 준비 시점에 큐가 flush 되어 crop_planted가 전송된다.
    expect(sentEventNames()).toContain('crop_planted');
    const cropEvent = parseBody(0).events.find((event) => event.name === 'crop_planted');
    expect(cropEvent?.params).toMatchObject({ crop: 'wheat', app_market: 'apps_in_toss' });
  });

  test('초기화 시 web 스트림 전용 마커(ait_firebase_initialized)를 전송한다', async () => {
    const { initializeAppsInTossAnalytics } = loadAnalytics();

    await initializeAppsInTossAnalytics();
    // 마커는 debounce 타이머로 전송되므로 대기 타이머를 흘려보낸다.
    jest.runOnlyPendingTimers();

    expect(sentEventNames()).toContain('ait_firebase_initialized');
  });

  test('초기화 완료 후 발생한 이벤트도 시장 공통 파라미터가 실린다', async () => {
    const { trackAppsInTossAnalyticsEvent, initializeAppsInTossAnalytics } = loadAnalytics();

    await initializeAppsInTossAnalytics();
    mockFetch.mockClear();

    trackAppsInTossAnalyticsEvent('game_start');
    jest.runOnlyPendingTimers();

    expect(parseBody(0).events[0]?.params).toMatchObject({ app_market: 'apps_in_toss' });
  });

  test('harvest_combo_completed 직렬화 payload는 GA4 이벤트 파라미터 25개 예산을 지킨다 (#348)', async () => {
    const { appsInTossFarmAnalytics, initializeAppsInTossAnalytics } = loadAnalytics();

    await initializeAppsInTossAnalytics();
    jest.runOnlyPendingTimers();
    mockFetch.mockClear();

    appsInTossFarmAnalytics.trackHarvestComboCompleted({
      manualHarvestCount: 10,
      comboTier: 'legendary',
      durationMs: 1_200,
      baseRevenueTotal: 12_345,
      endReason: 'timeout',
      context: {
        gold: 99_999,
        plot_count: 12,
        speed_level: 4,
        profit_level: 5,
        unlocked_area_count: 3,
        harvested_crop_count: 8,
        session_elapsed_sec: 60,
        prestige_level: 2,
        prestige_stars: 7,
        research_points: 100,
        lifetime_harvests: 50,
      },
    });
    jest.runOnlyPendingTimers();

    const comboEvent = parseBody(0).events.find((event) => event.name === 'harvest_combo_completed');
    expect(comboEvent).toBeDefined();
    expect(comboEvent?.params).toMatchObject({
      manual_harvest_count: 10,
      combo_tier: 'legendary',
      duration_ms: 1_200,
      base_revenue_total: 12_345,
      end_reason: 'timeout',
      schema_version: 1,
      app_market: 'apps_in_toss',
      session_id: expect.any(String),
      engagement_time_msec: 100,
    });
    // production 22개, __DEV__에서는 debug_mode을 더해 23개다. 향후 실험 필드
    // 2개를 추가해도 GA4 Measurement Protocol 상한(25개)을 넘지 않는다.
    expect([22, 23]).toContain(Object.keys(comboEvent?.params ?? {}).length);
  });
});

describe('initializeAppsInTossAnalytics — 멱등/재사용', () => {
  test('여러 번 호출해도 client_id는 한 번만 생성한다(멱등)', async () => {
    const { initializeAppsInTossAnalytics } = loadAnalytics();

    const first = initializeAppsInTossAnalytics();
    const second = initializeAppsInTossAnalytics();
    await Promise.all([first, second]);

    expect(first).toBe(second);
    expect(mockStorage.setItem).toHaveBeenCalledTimes(1);
  });
});
