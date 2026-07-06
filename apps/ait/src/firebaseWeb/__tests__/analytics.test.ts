/// <reference types="jest" />

// 파일을 모듈로 취급하게 해 전역 스코프 변수 충돌을 막는다.
export {};

// firebase/analytics는 헤드리스 테스트에서 직접 호출할 수 없으므로 모킹한다.
const mockIsSupported = jest.fn(async () => true);
const mockGetAnalytics = jest.fn(() => ({ __tag: 'analytics-instance' }));
const mockLogEvent = jest.fn();
const mockSetAnalyticsCollectionEnabled = jest.fn();

jest.mock('firebase/analytics', () => ({
  isSupported: mockIsSupported,
  getAnalytics: mockGetAnalytics,
  logEvent: mockLogEvent,
  setAnalyticsCollectionEnabled: mockSetAnalyticsCollectionEnabled,
}));

// 모듈 스코프 상태(firebaseAnalytics/pendingEvents/initializePromise)를 가지므로
// 테스트마다 resetModules로 새 인스턴스를 받아 상태 오염을 막는다.
function loadAnalytics() {
  return jest.requireActual<typeof import('../analytics')>('../analytics');
}

const FAKE_APP = {} as import('firebase/app').FirebaseApp;

// logEvent에 실제로 전달된 이벤트 이름 목록(초기화 마커 제외)을 추출한다.
function trackedEventNames() {
  return mockLogEvent.mock.calls
    .map((call) => call[1] as string)
    .filter((name) => name !== 'ait_firebase_initialized');
}

beforeEach(() => {
  jest.resetModules();
  mockIsSupported.mockReset().mockResolvedValue(true);
  mockGetAnalytics.mockReset().mockReturnValue({ __tag: 'analytics-instance' });
  mockLogEvent.mockReset();
  mockSetAnalyticsCollectionEnabled.mockReset();
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('trackAppsInTossAnalyticsEvent — 초기화 전 이벤트 큐잉/flush', () => {
  test('초기화 전에 발생한 이벤트는 유실되지 않고 준비 후 순서대로 flush 된다', async () => {
    const { trackAppsInTossAnalyticsEvent, initializeAppsInTossAnalytics } = loadAnalytics();

    // 초기화 전: 아직 전송되지 않고 큐에만 쌓인다.
    trackAppsInTossAnalyticsEvent('crop_planted', { crop: 'wheat' });
    trackAppsInTossAnalyticsEvent('crop_harvested', { crop: 'wheat' });
    expect(mockLogEvent).not.toHaveBeenCalled();

    await initializeAppsInTossAnalytics(FAKE_APP);

    // 준비 후: 큐에 쌓인 두 이벤트가 순서대로 전송된다.
    expect(trackedEventNames()).toEqual(['crop_planted', 'crop_harvested']);
  });

  test('초기화 완료 후 발생한 이벤트는 즉시 전송된다', async () => {
    const { trackAppsInTossAnalyticsEvent, initializeAppsInTossAnalytics } = loadAnalytics();

    await initializeAppsInTossAnalytics(FAKE_APP);
    mockLogEvent.mockClear();

    trackAppsInTossAnalyticsEvent('game_start');

    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    expect(mockLogEvent.mock.calls[0][1]).toBe('game_start');
    // 시장 공통 파라미터가 정규화되어 함께 실린다.
    expect(mockLogEvent.mock.calls[0][2]).toMatchObject({ app_market: 'apps_in_toss' });
  });

  test('큐 상한을 넘으면 가장 오래된 이벤트부터 폐기하되 최신 이벤트는 보존한다', async () => {
    const { trackAppsInTossAnalyticsEvent, initializeAppsInTossAnalytics } = loadAnalytics();

    const total = 205; // MAX_PENDING_EVENTS(200) 초과
    for (let i = 0; i < total; i += 1) {
      trackAppsInTossAnalyticsEvent('evt', { seq: i });
    }

    await initializeAppsInTossAnalytics(FAKE_APP);

    const flushedSeqs = mockLogEvent.mock.calls
      .filter((call) => call[1] === 'evt')
      .map((call) => (call[2] as { seq: number }).seq);
    // 상한만큼만 flush 되고, 폐기 대상은 가장 오래된(작은 seq) 쪽이다.
    expect(flushedSeqs).toHaveLength(200);
    expect(flushedSeqs[0]).toBe(total - 200);
    expect(flushedSeqs[flushedSeqs.length - 1]).toBe(total - 1);
  });
});

describe('initializeAppsInTossAnalytics — isSupported 폴백/미지원 처리', () => {
  test('isSupported()가 false여도 강제 초기화에 성공하면 ready로 처리하고 큐를 flush 한다', async () => {
    mockIsSupported.mockResolvedValue(false);

    const { trackAppsInTossAnalyticsEvent, initializeAppsInTossAnalytics } = loadAnalytics();
    trackAppsInTossAnalyticsEvent('crop_ready', { crop: 'wheat' });

    const result = await initializeAppsInTossAnalytics(FAKE_APP);

    expect(result).toEqual({ status: 'ready' });
    expect(mockGetAnalytics).toHaveBeenCalledTimes(1);
    expect(trackedEventNames()).toEqual(['crop_ready']);
  });

  test('강제 초기화도 실패하면 unsupported로 처리하고 이벤트는 큐에 남아 유실되지 않는다', async () => {
    mockIsSupported.mockResolvedValue(false);
    mockGetAnalytics.mockImplementation(() => {
      throw new Error('analytics unsupported in webview');
    });

    const { trackAppsInTossAnalyticsEvent, initializeAppsInTossAnalytics } = loadAnalytics();
    trackAppsInTossAnalyticsEvent('crop_ready', { crop: 'wheat' });

    const result = await initializeAppsInTossAnalytics(FAKE_APP);

    expect(result).toEqual({ status: 'unsupported' });
    // 미지원이라 전송은 없지만, 큐에 남아 있으므로 이후 재초기화 시 flush 가능하다.
    expect(mockLogEvent).not.toHaveBeenCalled();
  });

  test('initializeAppsInTossAnalytics는 여러 번 호출해도 한 번만 초기화한다(멱등)', async () => {
    const { initializeAppsInTossAnalytics } = loadAnalytics();

    const first = initializeAppsInTossAnalytics(FAKE_APP);
    const second = initializeAppsInTossAnalytics(FAKE_APP);

    await Promise.all([first, second]);

    expect(first).toBe(second);
    expect(mockGetAnalytics).toHaveBeenCalledTimes(1);
  });
});
