// 실제 Platform SDK로 조합 지점을 불러와 세션 교환과 이벤트 전송이 Granite 번들의 __DEV__에
// 따라 X-Seori-Build를 붙이는지 확인한다. 출시용 `ait build`는 `granite build`를 dev=false로
// 돌려 __DEV__를 false로 고정한다. 조합 지점은 debugBuild를 넘기지 않으므로 SDK 기본값이
// 그대로 쓰여야 한다.
jest.mock('@apps-in-toss/framework', () => ({
  getAnonymousKey: async () => ({ hash: 'anonymous-hash', type: 'HASH' }),
}));

jest.mock('../firebaseWeb/analyticsIdentity', () => ({
  getAppsInTossGa4ClientId: () => 'stable-ga4-client-id',
}));

type FetchMock = jest.Mock<Promise<unknown>, [string, RequestInit?]>;

const SESSION = {
  platformToken: 'platform-token',
  refreshToken: 'refresh-token',
  platformUserId: 'platform-user',
  supportCode: 'SUPPORT',
  appUserId: 'app-user',
  isAnonymous: true,
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

describe('AppsInToss Platform SDK 빌드 표식', () => {
  const runtime = globalThis as unknown as { __DEV__: boolean; fetch: typeof fetch };
  const originalDev = runtime.__DEV__;
  const originalFetch = runtime.fetch;

  afterEach(() => {
    runtime.__DEV__ = originalDev;
    runtime.fetch = originalFetch;
  });

  // SDK client와 bind된 fetch는 모듈 로드 시 만들어지므로 __DEV__와 fetch를 바꾼 뒤
  // 격리된 registry에서 다시 불러온다.
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
    await expect(isolated?.ensureAppsInTossPlatformSession()).resolves.toBe(true);
    isolated?.trackAppsInTossPlatformEvent('game_start', { source: 'test' });
    await isolated?.flushAppsInTossPlatformEvents();

    const requests = fetchMock.mock.calls.map(([url, init]) => ({
      path: new URL(url).pathname,
      build: (init?.headers as Record<string, string> | undefined)?.['X-Seori-Build'],
    }));
    expect(requests.map((request) => request.path).sort()).toEqual(['/v1/auth/session', '/v1/events']);
    for (const request of requests) {
      expect(request).toEqual({ path: request.path, build: expected });
    }
  }, 60_000);
});

// 다른 테스트 파일과 최상위 이름이 섞이지 않도록 모듈로 둔다.
export {};
