// 실제 Platform SDK로 조합 지점을 불러와 세션 교환과 이벤트 전송이 Metro __DEV__에 따라
// X-Seori-Build를 붙이는지 확인한다. 조합 지점은 debugBuild를 넘기지 않으므로 SDK 기본값이
// 그대로 쓰여야 한다. 누군가 debugBuild를 고정값으로 넘기면 한쪽 경우가 실패한다.
jest.mock('../firebase/auth', () => ({
  getMobileFirebaseIdToken: jest.fn(() => Promise.resolve('firebase-id-token')),
}));

type FetchMock = jest.Mock<Promise<unknown>, [string, RequestInit?]>;

const SESSION = {
  platformToken: 'platform-token',
  refreshToken: 'refresh-token',
  platformUserId: 'platform-user',
  supportCode: 'SUPPORT',
  appUserId: 'app-user',
  isAnonymous: false,
  expiresIn: 3600,
};

function platformResponse(path: string) {
  const result = path === '/v1/auth/session' ? SESSION : {};
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify({ ok: true, result }),
  };
}

describe('Mobile Platform SDK 빌드 표식', () => {
  const runtime = globalThis as unknown as { __DEV__: boolean; fetch: typeof fetch };
  const originalDev = runtime.__DEV__;
  const originalFetch = runtime.fetch;

  afterEach(() => {
    runtime.__DEV__ = originalDev;
    runtime.fetch = originalFetch;
  });

  // SDK client는 모듈 로드 시 생성되므로 __DEV__를 바꾼 뒤 격리된 registry에서 다시 불러온다.
  // 조합 지점 전체를 처음 변환하면 기본 5초를 넘길 수 있어 시간 한도를 넉넉히 둔다.
  test.each([
    [true, 'debug'],
    [false, undefined],
  ])('__DEV__=%s 빌드의 세션·이벤트 요청 X-Seori-Build는 %s', async (dev, expected) => {
    runtime.__DEV__ = dev;
    const fetchMock: FetchMock = jest.fn(async (url: string) => platformResponse(new URL(url).pathname));
    runtime.fetch = fetchMock as unknown as typeof fetch;

    let isolated: typeof import('../platformEvents') | undefined;
    jest.isolateModules(() => {
      isolated = jest.requireActual<typeof import('../platformEvents')>('../platformEvents');
    });
    await expect(isolated?.ensureMobilePlatformSession()).resolves.toBe(true);
    isolated?.trackMobilePlatformEvent('game_start', { source: 'test' });
    await isolated?.flushMobilePlatformEvents();

    const requests = fetchMock.mock.calls.map(([url, init]) => ({
      path: new URL(url).pathname,
      build: (init?.headers as Record<string, string> | undefined)?.['X-Seori-Build'],
    }));
    expect(requests.map((request) => request.path).sort()).toEqual([
      '/v1/auth/session',
      '/v1/auth/session',
      '/v1/events',
    ]);
    for (const request of requests) {
      expect(request).toEqual({ path: request.path, build: expected });
    }
  }, 60_000);
});

// 다른 테스트 파일과 최상위 이름이 섞이지 않도록 모듈로 둔다.
export {};
