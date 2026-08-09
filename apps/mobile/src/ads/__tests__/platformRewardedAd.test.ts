import { showPlatformAdMobReward, type PlatformRewardedAdDependencies } from '../platformRewardedAd';

const request = { type: 'rewardedGold' as const, placement: 'shop_gold_reward' as const };

function dependencies(): PlatformRewardedAdDependencies {
  return {
    ensureSession: jest.fn(async () => true),
    ads: {
      policy: jest.fn(async () => ({ appUsesAds: true, adsEnabled: true, disabledBy: [], checkedAt: new Date().toISOString() })),
      createClaim: jest.fn(async () => ({ claimId: 'cl_1', admobSsv: { customData: 'cl_1', userId: 'pu_1' } } as never)),
      claim: jest.fn(async () => ({ claimId: 'cl_1', state: 'confirmed', assurance: 'server_verified' } as never)),
    },
    adapter: { load: jest.fn(async () => true), show: jest.fn(async () => ({ status: 'earned' as const })) },
    clientPlatform: 'android',
    requestId: () => 'req-1',
    wait: async () => undefined,
    maxPolls: 1,
  };
}

describe('showPlatformAdMobReward', () => {
  test('정책 조회 실패면 실제 SDK load/show가 0회다', async () => {
    const deps = dependencies();
    (deps.ads.policy as jest.Mock).mockRejectedValueOnce(new Error('down'));
    await expect(showPlatformAdMobReward(request, deps)).resolves.toEqual({ status: 'failed', error: 'platform_ads_unavailable' });
    expect(deps.adapter.load).not.toHaveBeenCalled();
    expect(deps.adapter.show).not.toHaveBeenCalled();
  });

  test('노출 직전 정책이 차단되면 show를 호출하지 않는다', async () => {
    const deps = dependencies();
    (deps.ads.policy as jest.Mock)
      .mockResolvedValueOnce({ appUsesAds: true, adsEnabled: true, disabledBy: [], checkedAt: '' })
      .mockResolvedValueOnce({ appUsesAds: true, adsEnabled: false, disabledBy: ['ad_free'], checkedAt: '' });
    await expect(showPlatformAdMobReward(request, deps)).resolves.toEqual({ status: 'unsupported' });
    expect(deps.adapter.load).toHaveBeenCalledTimes(1);
    expect(deps.adapter.show).not.toHaveBeenCalled();
  });

  test('AdMob SSV 확인 뒤에만 claim ID와 earned를 반환한다', async () => {
    const deps = dependencies();
    await expect(showPlatformAdMobReward(request, deps)).resolves.toEqual({ status: 'earned', claimId: 'cl_1' });
    expect(deps.ads.claim).toHaveBeenCalledWith('cl_1');
  });

  test('client_confirmed는 AdMob 보상으로 인정하지 않는다', async () => {
    const deps = dependencies();
    (deps.ads.claim as jest.Mock).mockResolvedValue({ claimId: 'cl_1', state: 'confirmed', assurance: 'client_confirmed' });
    await expect(showPlatformAdMobReward(request, deps)).resolves.toEqual({ status: 'failed', error: 'server_verification_pending' });
  });
});
