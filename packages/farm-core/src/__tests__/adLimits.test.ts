/// <reference types="jest" />

import {
  DEFAULT_AD_LIMITS,
  applyAdLimitsOverrides,
  canShowReturnInterstitial,
  createInitialState,
  getAdLimits,
  getResetDayStart,
  getRewardedAdLimitStatus,
  parseAdLimitsOverrides,
  recordRewardedAdUsage,
  resetAdLimits,
  spinBonusWheel,
  spinWheel,
  type GameState,
} from '../';

const NOW = 1_700_000_000_000;

afterEach(() => {
  // 모듈 스코프 상태이므로 테스트 간 오염을 막기 위해 항상 기본값으로 되돌린다.
  resetAdLimits();
});

describe('adLimits 해석기', () => {
  test('오버라이드 적용 전에는 기본값을 반환한다', () => {
    expect(getAdLimits()).toEqual(DEFAULT_AD_LIMITS);
  });

  test('유효한 부분 오버라이드만 병합되고 나머지는 기본값을 유지한다', () => {
    const resolved = applyAdLimitsOverrides({
      rewardedGoldDailyLimit: 6,
      growthAdCooldownMs: 300_000,
      offlineBonusAdCooldownMs: 900_000,
    });
    expect(resolved.rewardedGoldDailyLimit).toBe(6);
    expect(resolved.growthAdCooldownMs).toBe(300_000);
    expect(resolved.offlineBonusAdCooldownMs).toBe(900_000);
    // 지정하지 않은 필드는 기본값 유지.
    expect(resolved.plotDiscountAdDailyLimit).toBe(DEFAULT_AD_LIMITS.plotDiscountAdDailyLimit);
    expect(getAdLimits()).toEqual(resolved);
  });

  test('무효값(음수/소수/문자열/NaN)은 해당 필드 기본값으로 폴백한다', () => {
    const resolved = applyAdLimitsOverrides({
      rewardedGoldDailyLimit: -1,
      growthAdCooldownMs: 1.5,
      harvestBonusAdDailyLimit: '3' as unknown as number,
      returnInterstitialCooldownMs: Number.NaN,
      interstitialMilestoneCooldownMs: Infinity,
    });
    expect(resolved.rewardedGoldDailyLimit).toBe(DEFAULT_AD_LIMITS.rewardedGoldDailyLimit);
    expect(resolved.growthAdCooldownMs).toBe(DEFAULT_AD_LIMITS.growthAdCooldownMs);
    expect(resolved.harvestBonusAdDailyLimit).toBe(DEFAULT_AD_LIMITS.harvestBonusAdDailyLimit);
    expect(resolved.returnInterstitialCooldownMs).toBe(DEFAULT_AD_LIMITS.returnInterstitialCooldownMs);
    expect(resolved.interstitialMilestoneCooldownMs).toBe(DEFAULT_AD_LIMITS.interstitialMilestoneCooldownMs);
  });

  test('0은 유효값으로 인정한다(지면 사실상 비활성화)', () => {
    const resolved = applyAdLimitsOverrides({ rewardedGoldDailyLimit: 0 });
    expect(resolved.rewardedGoldDailyLimit).toBe(0);
  });

  test('null/undefined 오버라이드는 전부 기본값으로 폴백한다', () => {
    expect(applyAdLimitsOverrides(null)).toEqual(DEFAULT_AD_LIMITS);
    expect(applyAdLimitsOverrides(undefined)).toEqual(DEFAULT_AD_LIMITS);
  });

  test('resetAdLimits는 적용된 오버라이드를 기본값으로 되돌린다', () => {
    applyAdLimitsOverrides({ rewardedGoldDailyLimit: 9 });
    expect(getAdLimits().rewardedGoldDailyLimit).toBe(9);
    expect(resetAdLimits()).toEqual(DEFAULT_AD_LIMITS);
    expect(getAdLimits()).toEqual(DEFAULT_AD_LIMITS);
  });
});

describe('parseAdLimitsOverrides', () => {
  test('JSON 오브젝트 문자열을 오버라이드 맵으로 파싱한다', () => {
    expect(parseAdLimitsOverrides('{"rewardedGoldDailyLimit":6}')).toEqual({ rewardedGoldDailyLimit: 6 });
  });

  test('빈 문자열/공백/null/undefined는 빈 맵을 반환한다', () => {
    expect(parseAdLimitsOverrides('')).toEqual({});
    expect(parseAdLimitsOverrides('   ')).toEqual({});
    expect(parseAdLimitsOverrides(null)).toEqual({});
    expect(parseAdLimitsOverrides(undefined)).toEqual({});
  });

  test('파싱 실패/비오브젝트(배열·원시값)는 빈 맵을 반환한다', () => {
    expect(parseAdLimitsOverrides('{not json')).toEqual({});
    expect(parseAdLimitsOverrides('[1,2,3]')).toEqual({});
    expect(parseAdLimitsOverrides('42')).toEqual({});
    expect(parseAdLimitsOverrides('null')).toEqual({});
  });
});

describe('게이팅 함수가 적용된 오버라이드를 소비한다', () => {
  test('rewardedGold 일일 한도를 원격값으로 낮출 수 있다', () => {
    applyAdLimitsOverrides({ rewardedGoldDailyLimit: 1, rewardedGoldMaxUsesPerWindow: 5 });
    let state: GameState = createInitialState();
    // 한 번 시청하면 일일 한도(1)에 도달해 차단된다.
    state = { ...state, adUsage: recordRewardedAdUsage(state, 'rewardedGold', NOW) };
    expect(getRewardedAdLimitStatus(state, 'rewardedGold', NOW + 1).allowed).toBe(false);
  });

  test('복귀 전면 쿨다운을 원격값으로 늘릴 수 있다', () => {
    const base = createInitialState();
    applyAdLimitsOverrides({ returnInterstitialCooldownMs: 1_000 });
    const shown: GameState = { ...base, adUsage: { ...base.adUsage, returnInterstitialAt: NOW } };
    expect(canShowReturnInterstitial(shown, NOW + 999)).toBe(false);
    expect(canShowReturnInterstitial(shown, NOW + 1_000)).toBe(true);
  });

  test('복귀 2배 광고 한도와 쿨다운을 원격값으로 조정할 수 있다', () => {
    applyAdLimitsOverrides({ offlineBonusAdDailyLimit: 2, offlineBonusAdCooldownMs: 1_000 });
    const base = createInitialState();
    const shown: GameState = { ...base, adUsage: recordRewardedAdUsage(base, 'offlineBonusAd', NOW) };

    expect(getRewardedAdLimitStatus(shown, 'offlineBonusAd', NOW + 999).allowed).toBe(false);
    expect(getRewardedAdLimitStatus(shown, 'offlineBonusAd', NOW + 1_000).allowed).toBe(true);
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

  test('룰렛 광고 cap/cooldown은 중복 AdUsage가 아니라 WheelState를 source of truth로 쓴다', () => {
    applyAdLimitsOverrides({ wheelBonusAdDailyLimit: 1, wheelBonusAdCooldownMs: 10_000 });
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
