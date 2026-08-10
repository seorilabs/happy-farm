import { PlatformAdsClient, PlatformAdsClientError } from '../platformAds';

const ok = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ ok: true, result }) });

describe('PlatformAdsClient', () => {
  test('정책 오류를 광고 허용으로 바꾸지 않는다', async () => {
    const fetcher = jest.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ ok: false, error: { code: 'platform_unavailable', message: 'down' } }),
    }));
    const client = new PlatformAdsClient({ baseUrl: 'https://ads.example', appId: 'happy-farm', getToken: async () => 'token', fetch: fetcher });
    await expect(client.policy()).rejects.toEqual(expect.objectContaining<Partial<PlatformAdsClientError>>({ code: 'platform_unavailable' }));
  });

  test('claim은 placement를 고정 reward로 보낸다', async () => {
    const fetcher = jest.fn(async () => ok({ claimId: 'cl_1' }));
    const client = new PlatformAdsClient({ baseUrl: 'https://ads.example/', appId: 'happy-farm', getToken: async () => 'secret-token', fetch: fetcher });
    await client.createClaim({ requestId: 'req-1', placement: 'shop_gold_reward', provider: 'admob', clientPlatform: 'android' });
    expect(fetcher).toHaveBeenCalledWith('https://ads.example/v1/ads/reward-claims', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ requestId: 'req-1', placement: 'shop_gold_reward', provider: 'admob', clientPlatform: 'android', reward: { key: 'shop_gold_reward', amount: 1 } }),
    }));
  });

  test('ack는 원본 provider 식별자 없이 claim ID만 보낸다', async () => {
    const fetcher = jest.fn(async () => ok({ claimId: 'cl_1', state: 'delivered' }));
    const client = new PlatformAdsClient({ baseUrl: 'https://ads.example', appId: 'happy-farm', getToken: async () => 'token', fetch: fetcher });
    await client.ack('cl_1');
    const [url, init] = (fetcher.mock.calls as unknown as Array<[string, RequestInit]>)[0]!;
    expect(url).toBe('https://ads.example/v1/ads/reward-claims/cl_1/ack');
    expect(init.body).toBeUndefined();
  });
});
