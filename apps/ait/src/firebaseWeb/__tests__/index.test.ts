/// <reference types="jest" />

const mockInitAnalytics = jest.fn(async () => ({ status: 'ready' as const }));

jest.mock('../analytics', () => ({
  appsInTossFarmAnalytics: {},
  initializeAppsInTossAnalytics: mockInitAnalytics,
}));

function loadIndex() {
  return jest.requireActual<typeof import('../index')>('../index');
}

beforeEach(() => {
  jest.resetModules();
  mockInitAnalytics.mockReset().mockResolvedValue({ status: 'ready' as const });
});

describe('initializeAppsInTossFirebaseServices', () => {
  test('analytics만 초기화하고 그 결과를 그대로 돌려준다', async () => {
    // 원격 설정을 걷어낸 뒤 이 초기화가 하는 일은 Platform relay용 analytics 준비뿐이다.
    const { initializeAppsInTossFirebaseServices } = loadIndex();

    await expect(initializeAppsInTossFirebaseServices()).resolves.toEqual({
      status: 'ready',
      analytics: { status: 'ready' },
    });
    expect(mockInitAnalytics).toHaveBeenCalledTimes(1);
  });
});
