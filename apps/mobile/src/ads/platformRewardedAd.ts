import type { RewardedAdRequest, RewardedAdReward, RewardedAdShowResult } from '../../../../packages/farm-core/src';
import type { PlatformAdClaim, PlatformAdsClient } from '../../../../packages/farm-core/src';

export type AdMobSSV = { customData: string; userId: string };

export type PlatformAdMobAdapter = {
  load(ssv: AdMobSSV): Promise<boolean>;
  show(): Promise<RewardedAdShowResult>;
};

export type PlatformRewardedAdDependencies = {
  ensureSession: () => Promise<boolean>;
  ads: Pick<PlatformAdsClient, 'policy' | 'createClaim' | 'claim'>;
  adapter: PlatformAdMobAdapter;
  clientPlatform: 'android' | 'ios';
  requestId: () => string;
  wait?: (milliseconds: number) => Promise<void>;
  maxPolls?: number;
};

/** AdMob은 SSV가 server_verified가 되기 전에는 절대로 earned를 반환하지 않는다. */
export async function showPlatformAdMobReward(
  request: RewardedAdRequest,
  dependencies: PlatformRewardedAdDependencies
): Promise<RewardedAdShowResult> {
  try {
    if (!(await dependencies.ensureSession())) {
      return { status: 'unsupported' };
    }
    const beforeLoad = await dependencies.ads.policy();
    if (!beforeLoad.appUsesAds || !beforeLoad.adsEnabled) {
      return { status: 'unsupported' };
    }
    const claim = await dependencies.ads.createClaim({
      requestId: dependencies.requestId(),
      placement: request.placement,
      provider: 'admob',
      clientPlatform: dependencies.clientPlatform,
    });
    if (claim.admobSsv == null || !(await dependencies.adapter.load(claim.admobSsv))) {
      return { status: 'notReady' };
    }
    const beforeShow = await dependencies.ads.policy();
    if (!beforeShow.adsEnabled) {
      return { status: 'unsupported' };
    }
    const shown = await dependencies.adapter.show();
    if (shown.status !== 'earned') {
      return shown;
    }

    const wait = dependencies.wait ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    let verified: PlatformAdClaim | null = null;
    for (let index = 0; index < (dependencies.maxPolls ?? 60); index += 1) {
      const current = await dependencies.ads.claim(claim.claimId);
      if ((current.state === 'confirmed' || current.state === 'delivered') && current.assurance === 'server_verified') {
        verified = current;
        break;
      }
      if (current.state === 'expired') {
        break;
      }
      await wait(2_000);
    }
    if (verified == null) {
      return { status: 'failed', error: 'server_verification_pending' };
    }
    return { status: 'earned', reward: shown.reward as RewardedAdReward | undefined, claimId: claim.claimId };
  } catch {
    // 정책·세션·claim 조회 실패는 fail-closed다. SDK load/show 호출은 위 단계가
    // 통과한 뒤에만 일어난다.
    return { status: 'failed', error: 'platform_ads_unavailable' };
  }
}
