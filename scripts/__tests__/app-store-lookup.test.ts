import { appStoreLookupUrl, lookupAppStoreVersion, normalizeAppStoreResponse } from '../app-store-lookup';

const BUNDLE = 'com.seorilabs.happyfarm';
const RELEASED = '2026-10-15T02:35:00Z';
const result = (fields: Record<string, unknown> = {}) => ({ bundleId: BUNDLE, version: '1.12.2', currentVersionReleaseDate: RELEASED, ...fields });
const payload = (fields: Record<string, unknown> = {}) => ({ resultCount: 1, results: [result(fields)] });

describe('App Store 공개 Lookup', () => {
  afterEach(() => jest.useRealTimers());
  test('v 접두어만 정규화하고 현재 버전 공개일을 유지한다', () => {
    expect(normalizeAppStoreResponse(BUNDLE, payload({ version: 'v1.12.2', releaseDate: '2020-01-01T00:00:00Z' }))).toEqual({ version: '1.12.2', releasedAt: RELEASED });
    expect(appStoreLookupUrl(BUNDLE)).toBe(`https://itunes.apple.com/lookup?bundleId=${BUNDLE}&country=kr`);
  });
  test.each([
    null, {}, { resultCount: 0, results: [] }, { resultCount: 1, results: [] }, { resultCount: 2, results: [result(), result()] },
    payload({ bundleId: 'another.app' }), payload({ version: '1.2' }), payload({ version: '01.2.3' }), payload({ version: '1.2.3-beta' }),
    payload({ version: ' 1.2.3' }), payload({ currentVersionReleaseDate: 'invalid' }), payload({ currentVersionReleaseDate: '2026-02-30T00:00:00Z' }),
    payload({ currentVersionReleaseDate: undefined, releaseDate: RELEASED }),
  ])('불완전한 공개 결과를 채택하지 않는다: %p', (data) => {
    expect(normalizeAppStoreResponse(BUNDLE, data)).toBeNull();
  });
  test.each(['http', 'json', 'network'])('%s 오류이면 null을 반환한다', async (kind) => {
    const fetchImpl = jest.fn(async () => {
      if (kind === 'network') throw new Error('offline');
      return { ok: kind !== 'http', json: async () => { throw new Error('invalid JSON'); } };
    });
    expect(await lookupAppStoreVersion(BUNDLE, { fetchImpl })).toBeNull();
  });
  test('느린 fetch는 10초에 중단하고 AbortSignal에 알린다', async () => {
    jest.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchImpl = jest.fn((_url: string, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise<{ ok: boolean; json: () => Promise<unknown> }>(() => {});
    });
    const pending = lookupAppStoreVersion(BUNDLE, { fetchImpl });
    await jest.advanceTimersByTimeAsync(9_999);
    expect(signal?.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(await pending).toBeNull();
    expect(signal?.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });
  test('응답 JSON이 늦어도 10초에 중단한다', async () => {
    jest.useFakeTimers();
    const fetchImpl = jest.fn(async () => ({ ok: true, json: () => new Promise<unknown>(() => {}) }));
    const pending = lookupAppStoreVersion(BUNDLE, { fetchImpl });
    await jest.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });
  test('성공하면 timeout을 해제하고 빈 bundleId는 통신하지 않는다', async () => {
    jest.useFakeTimers();
    const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => payload() }));
    expect(await lookupAppStoreVersion(BUNDLE, { fetchImpl })).toEqual({ version: '1.12.2', releasedAt: RELEASED });
    expect(jest.getTimerCount()).toBe(0);
    expect(await lookupAppStoreVersion('', { fetchImpl })).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
