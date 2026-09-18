/// <reference types="jest" />

import {
  DEFAULT_AD_LIMITS,
  canShowReturnInterstitial,
  createInitialState,
  getAdLimits,
  getResetDayStart,
  getRewardedAdLimitStatus,
  recordRewardedAdUsage,
  spinBonusWheel,
  spinWheel,
  type GameState,
} from '../';

const NOW = 1_700_000_000_000;

describe('adLimits 해석기', () => {
  test('balance.json 기본값을 그대로 돌려준다', () => {
    // 원격 오버라이드를 걷어낸 뒤로 이 설정은 런타임에 바뀌지 않는다. 빈도를
    // 조정하려면 balance.json을 고쳐 배포한다.
    expect(getAdLimits()).toEqual(DEFAULT_AD_LIMITS);
    expect(getAdLimits()).toBe(DEFAULT_AD_LIMITS);
  });
});

describe('게이팅 함수가 balance 기본값을 소비한다', () => {
  test('rewardedGold는 슬라이딩 윈도우 한도에 도달하면 차단된다', () => {
    let state: GameState = createInitialState();
    for (let i = 0; i < DEFAULT_AD_LIMITS.rewardedGoldMaxUsesPerWindow; i += 1) {
      state = { ...state, adUsage: recordRewardedAdUsage(state, 'rewardedGold', NOW + i) };
    }
    expect(getRewardedAdLimitStatus(state, 'rewardedGold', NOW + 10).allowed).toBe(false);
  });

  test('복귀 전면은 기본 쿨다운이 지나야 다시 노출된다', () => {
    const base = createInitialState();
    const cooldown = DEFAULT_AD_LIMITS.returnInterstitialCooldownMs;
    const shown: GameState = { ...base, adUsage: { ...base.adUsage, returnInterstitialAt: NOW } };

    expect(canShowReturnInterstitial(shown, NOW + cooldown - 1)).toBe(false);
    expect(canShowReturnInterstitial(shown, NOW + cooldown)).toBe(true);
  });

  test('복귀 2배 광고는 기본 쿨다운 동안 막힌다', () => {
    const base = createInitialState();
    const cooldown = DEFAULT_AD_LIMITS.offlineBonusAdCooldownMs;
    const shown: GameState = { ...base, adUsage: recordRewardedAdUsage(base, 'offlineBonusAd', NOW) };

    expect(getRewardedAdLimitStatus(shown, 'offlineBonusAd', NOW + cooldown - 1).allowed).toBe(false);
  });

  test('복귀 2배 광고는 리셋 경계 직후에도 6시간 쿨다운을 유지한다', () => {
    const resetStart = getResetDayStart(NOW);
    const nextReset = resetStart + 24 * 60 * 60 * 1000;
    const usedAt = nextReset - 1;
    const base = createInitialState();
    const shown: GameState = { ...base, adUsage: recordRewardedAdUsage(base, 'offlineBonusAd', usedAt) };

    // 일일 count는 다음 리셋일로 넘어가 0이지만 lastUsedAt 기반 cooldown은 유지된다.
    expect(getRewardedAdLimitStatus(shown, 'offlineBonusAd', nextReset + 1).allowed).toBe(false);
  });

  test('룰렛 광고 cap은 중복 AdUsage가 아니라 WheelState를 source of truth로 쓴다', () => {
    const base = createInitialState();
    const free = spinWheel(base.wheelState, 1_000, NOW, () => 0)!;
    const afterFree: GameState = { ...base, wheelState: free.newState };
    expect(getRewardedAdLimitStatus(afterFree, 'wheelBonusAd', NOW + 1).allowed).toBe(true);

    const bonus = spinBonusWheel(afterFree.wheelState, 1_000, NOW + 2, () => 0)!;
    const afterBonus: GameState = { ...afterFree, wheelState: bonus.newState };
    expect(getRewardedAdLimitStatus(afterBonus, 'wheelBonusAd', NOW + 3).allowed).toBe(false);

    const usage = recordRewardedAdUsage(afterBonus, 'wheelBonusAd', NOW + 3);
    expect(usage.harvestBonusAd).toEqual(base.adUsage.harvestBonusAd);
    expect(usage.rewardedGoldDailyCount).toBe(0);
    expect(usage.growthAd.dailyCount).toBe(0);
  });
});

describe('보상형 광고 빈도 게이트 정합성(check-balance 가드와 동일 불변식)', () => {
  // 일일 한도/쿨다운이 짝지어진 보상 광고들.
  const gates = [
    { limit: 'growthAdDailyLimit', cooldown: 'growthAdCooldownMs' },
    { limit: 'harvestBonusAdDailyLimit', cooldown: 'harvestBonusAdCooldownMs' },
    { limit: 'plotDiscountAdDailyLimit', cooldown: 'plotDiscountAdCooldownMs' },
    { limit: 'offlineBonusAdDailyLimit', cooldown: 'offlineBonusAdCooldownMs' },
    { limit: 'wheelBonusAdDailyLimit', cooldown: 'wheelBonusAdCooldownMs' },
  ] as const;

  test('각 보상 광고의 일일 한도는 1 이상 정수, 쿨다운은 0 이상 유한 값', () => {
    for (const { limit, cooldown } of gates) {
      expect(Number.isInteger(DEFAULT_AD_LIMITS[limit])).toBe(true);
      expect(DEFAULT_AD_LIMITS[limit]).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(DEFAULT_AD_LIMITS[cooldown])).toBe(true);
      expect(DEFAULT_AD_LIMITS[cooldown]).toBeGreaterThanOrEqual(0);
    }
  });

  test('일일 한도가 2 이상인 보상 광고는 쿨다운이 0보다 크다(같은 날 연타 방지)', () => {
    for (const { limit, cooldown } of gates) {
      if (DEFAULT_AD_LIMITS[limit] >= 2) {
        expect(DEFAULT_AD_LIMITS[cooldown]).toBeGreaterThan(0);
      }
    }
  });

  test('plotDiscountAd는 일일 한도 1이라 쿨다운 0이 허용된다(하루 단위 캡이 곧 게이트)', () => {
    expect(DEFAULT_AD_LIMITS.plotDiscountAdDailyLimit).toBe(1);
    expect(DEFAULT_AD_LIMITS.plotDiscountAdCooldownMs).toBe(0);
  });

  test('wheelBonusAd도 일일 한도 1이라 쿨다운 0이 허용된다', () => {
    expect(DEFAULT_AD_LIMITS.wheelBonusAdDailyLimit).toBe(1);
    expect(DEFAULT_AD_LIMITS.wheelBonusAdCooldownMs).toBe(0);
  });

  test('offlineBonusAd는 일일 한도 1과 리셋 경계 방어용 6시간 쿨다운을 쓴다', () => {
    expect(DEFAULT_AD_LIMITS.offlineBonusAdDailyLimit).toBe(1);
    expect(DEFAULT_AD_LIMITS.offlineBonusAdCooldownMs).toBe(6 * 60 * 60 * 1000);
  });
});
