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

  test('초기화 lifecycle 이벤트에 release_version 등 시장 공통 파라미터를 포함한다 (#395)', async () => {
    const { initializeAppsInTossAnalytics } = loadAnalytics();

    await initializeAppsInTossAnalytics();
    jest.runOnlyPendingTimers();

    const events = mockFetch.mock.calls.flatMap((_call, index) => parseBody(index).events);
    const firstTouch = events.find((event) => event.name === 'ait_first_touch');
    const sessionStart = events.find((event) => event.name === 'ait_session_start');
    expect(firstTouch?.params).toMatchObject({
      lifecycle_source: 'first_install',
      app_market: 'apps_in_toss',
      release_version: expect.any(String),
      release_build_number: expect.any(Number),
    });
    expect(sessionStart?.params).toMatchObject({
      session_source: 'initialization',
      app_market: 'apps_in_toss',
      release_version: expect.any(String),
      release_build_number: expect.any(Number),
    });
  });

  test('30분 이상 백그라운드 복귀는 새 session_id의 lifecycle 이벤트와 공통 파라미터를 전송한다 (#395)', async () => {
    jest.setSystemTime(1_700_000_000_000);
    const { handleAppsInTossAnalyticsAppStateChange, initializeAppsInTossAnalytics } = loadAnalytics();
    await initializeAppsInTossAnalytics();
    jest.runOnlyPendingTimers();
    mockFetch.mockClear();

    jest.setSystemTime(1_700_000_000_000);
    handleAppsInTossAnalyticsAppStateChange('background');
    jest.setSystemTime(1_700_001_800_000);
    handleAppsInTossAnalyticsAppStateChange('active');
    jest.runOnlyPendingTimers();

    const sessionStart = parseBody(0).events.find((event) => event.name === 'ait_session_start');
    expect(sessionStart?.params).toMatchObject({
      session_source: 'foreground_resume',
      background_duration_ms: 30 * 60 * 1000,
      session_id: '1700001800000',
      app_market: 'apps_in_toss',
      release_version: expect.any(String),
      release_build_number: expect.any(Number),
    });
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
        gold_mantissa: 9.9999,
        gold_exponent: 4,
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
    // 큰 금액 정밀도 필드를 포함해 production 24개, __DEV__에서는 debug_mode을
    // 더해 25개다. GA4 Measurement Protocol 상한(25개)을 넘지 않는다.
    const serializedParams = comboEvent?.params ?? {};
    const parameterCount = Object.keys(serializedParams).length;
    if ('debug_mode' in serializedParams) {
      expect(parameterCount).toBe(25);
    } else {
      expect(parameterCount).toBe(24);
    }
    expect(parameterCount).toBeLessThanOrEqual(25);
  });

  test('보상형 광고 최대 payload도 production/dev 모두 GA4 MP 25개 제한을 지킨다', async () => {
    const { appsInTossFarmAnalytics, initializeAppsInTossAnalytics } = loadAnalytics();

    await initializeAppsInTossAnalytics();
    jest.runOnlyPendingTimers();
    mockFetch.mockClear();
    const devGlobal = globalThis as typeof globalThis & { __DEV__?: boolean };
    const hadDevGlobal = Object.prototype.hasOwnProperty.call(devGlobal, '__DEV__');
    const originalDev = devGlobal.__DEV__;

    try {
      for (const devBuild of [false, true]) {
        devGlobal.__DEV__ = devBuild;
        appsInTossFarmAnalytics.trackAdRewardFailed(
          'rewardedGold',
          'shop_gold_reward',
          '1006: 광고가 준비되지 않았습니다',
          {
            gold: 99_999,
            gold_mantissa: 9.9999,
            gold_exponent: 4,
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
          {
            attemptId: 'session-1',
            adReady: false,
            eligible: true,
            adSupported: true,
            rewardKind: 'festival_delivery_points',
            rewardKey: 'festival_delivery_point',
            rewardValue: 1,
            ctaPosition: 'shop_rewards_primary',
            retryCount: 1,
            failureFamily: 'not_ready',
          }
        );
        jest.runOnlyPendingTimers();

        const event = parseBody(0).events.find((candidate) => candidate.name === 'ad_reward_failed');
        expect(event?.params).toMatchObject({
          reward_kind: 'festival_delivery_points',
          failure_family: 'not_ready',
          prestige_level: 2,
          gold_mantissa: 9.9999,
          app_market: 'apps_in_toss',
          session_id: expect.any(String),
          engagement_time_msec: 100,
        });
        expect(event?.params).not.toHaveProperty('speed_level');
        expect(event?.params).not.toHaveProperty('lifetime_harvests');
        expect(Object.keys(event?.params ?? {})).toHaveLength(devBuild ? 25 : 24);
        mockFetch.mockClear();
      }
    } finally {
      if (hadDevGlobal) {
        devGlobal.__DEV__ = originalDev;
      } else {
        delete devGlobal.__DEV__;
      }
    }
  });
});

describe('initializeAppsInTossAnalytics — 멱등/재사용', () => {
  test('기존 ait_ga4_client_id 사용자는 first-touch 플래그만 마이그레이션하고 이벤트를 발화하지 않는다 (#395 AC-2)', async () => {
    mockStorage.getItem.mockImplementation(async (key) => {
      if (key === 'ait_ga4_client_id') {
        return 'persisted-client-id';
      }
      return null;
    });
    const { initializeAppsInTossAnalytics } = loadAnalytics();

    await initializeAppsInTossAnalytics();
    jest.runOnlyPendingTimers();

    expect(mockStorage.setItem).not.toHaveBeenCalledWith('ait_ga4_client_id', expect.anything());
    expect(mockStorage.setItem).toHaveBeenCalledWith('ait_ga4_first_touch_recorded', '1');
    expect(sentEventNames()).not.toContain('ait_first_touch');
    expect(sentEventNames()).toContain('ait_session_start');
  });

  test('여러 번 호출해도 client_id는 한 번만 생성한다(멱등)', async () => {
    const { initializeAppsInTossAnalytics } = loadAnalytics();

    const first = initializeAppsInTossAnalytics();
    const second = initializeAppsInTossAnalytics();
    await Promise.all([first, second]);

    expect(first).toBe(second);
    expect(mockStorage.setItem.mock.calls.filter(([key]) => key === 'ait_ga4_client_id')).toHaveLength(1);
    expect(mockStorage.setItem.mock.calls.filter(([key]) => key === 'ait_ga4_first_touch_recorded')).toHaveLength(1);
  });
});
