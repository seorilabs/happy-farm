/// <reference types="jest" />

import balance from '../balance.json';
import {
  COOKING_DISHES,
  COOKING_GRADES,
  canResolveCooking,
  canStartCooking,
  cancelCooking,
  createInitialCookingState,
  finishCookingInstantly,
  getCookingCompendiumProgress,
  getCookingCompendiumSellBonus,
  getCookingPotStatus,
  getCookingSuccessRate,
  getCookingTimerMs,
  getDiscoveredDishCount,
  getEligibleCookingGrades,
  getMaxIngredientTier,
  isKnownCookingDishKey,
  normalizeCookingState,
  resolveCooking,
  startCooking,
  type CookingDishKey,
  type CookingState,
} from '../cooking';
import { createInitialState, migrateLoadedState, getRewardedAdLimitStatus, recordRewardedAdUsage } from '../constants';
import { getGlobalModifiers } from '../modifiers';
import { RESEARCH_NODES } from '../research';
import { getPendingFeatureCoachmark, isFeatureCoachmarkAvailable } from '../featureCoachmarks';
import { getCookingDishLabel, SUPPORTED_LOCALES } from '../i18n';
import type { CropKey, GameState } from '../types';
import { META_LAYER_KEYS } from '../types';

const NOW = Date.parse('2026-08-05T03:00:00.000Z');

// 티어별 대표 작물(오름차순 카탈로그에서 탐색).
function cropOfTier(tier: number, skip: CropKey[] = []): CropKey {
  const crop = balance.crops.find((candidate) => candidate.tier === tier && !skip.includes(candidate.key as CropKey));
  if (crop == null) {
    throw new Error(`no crop of tier ${tier}`);
  }
  return crop.key as CropKey;
}

function stateWithInventory(inventory: Partial<Record<CropKey, number>>): GameState {
  const base = createInitialState();
  return { ...base, production: { ...base.production, inventory } };
}

const TIER1_A = 'carrot' as CropKey;
const TIER1_B = 'wheat' as CropKey;
const TIER7_A = 'bamboo' as CropKey;
const TIER7_B = 'ginseng' as CropKey;
const TIER7_C = 'crystal_flower' as CropKey;

describe('cooking catalog', () => {
  test('exactly 150 dishes with unique keys, valid grades/tiers, and the GDD grade split', () => {
    expect(COOKING_DISHES.length).toBe(150);
    const keys = COOKING_DISHES.map((dish) => dish.key);
    expect(new Set(keys).size).toBe(keys.length);
    const gradeKeys = new Set(COOKING_GRADES.map((grade) => grade.key));
    const countByGrade: Record<string, number> = {};
    for (const dish of COOKING_DISHES) {
      expect(gradeKeys.has(dish.grade)).toBe(true);
      expect(Number.isInteger(dish.tier) && dish.tier >= 1 && dish.tier <= 10).toBe(true);
      expect(dish.icon.length).toBeGreaterThan(0);
      countByGrade[dish.grade] = (countByGrade[dish.grade] ?? 0) + 1;
    }
    expect(countByGrade).toEqual({ common: 60, rare: 45, epic: 30, legendary: 15 });
  });

  test('every dish has a non-empty label in every supported locale', () => {
    for (const dish of COOKING_DISHES) {
      for (const locale of SUPPORTED_LOCALES) {
        const label = getCookingDishLabel(dish.key, locale);
        expect(label.name.length).toBeGreaterThan(0);
        expect(label.description.length).toBeGreaterThan(0);
      }
    }
  });

  test('each grade has a non-empty draw pool at its own unlock tier (no empty-pool draws)', () => {
    for (const grade of COOKING_GRADES) {
      for (let maxTier = grade.minMaxTier; maxTier <= 10; maxTier += 1) {
        expect(
          COOKING_DISHES.some((dish) => dish.grade === grade.key && dish.tier <= maxTier)
        ).toBe(true);
      }
    }
  });
});

describe('normalizeCookingState', () => {
  test('recovers an initial state from garbage', () => {
    expect(normalizeCookingState(undefined)).toEqual(createInitialCookingState());
    expect(normalizeCookingState(null)).toEqual(createInitialCookingState());
    expect(normalizeCookingState('nope')).toEqual(createInitialCookingState());
    expect(normalizeCookingState(42)).toEqual(createInitialCookingState());
  });

  test('drops unknown dish keys, non-positive counts, and malformed pots', () => {
    const dish = COOKING_DISHES[0]!.key;
    const normalized = normalizeCookingState({
      discoveredDishes: { [dish]: 2.9, ghost_dish: 3, [COOKING_DISHES[1]!.key]: -1 },
      pot: { ingredients: ['carrot', 'carrot', 'not_a_crop'], startedAt: NOW },
      totalCookCount: 5.7,
      totalSuccessCount: 99,
    });
    expect(normalized.discoveredDishes).toEqual({ [dish]: 2 });
    // 중복 제거 후 재료가 1종뿐이라 규격 미달 → 손상 pot은 버린다.
    expect(normalized.pot).toBeNull();
    // 성공 수는 시도 수를 넘지 못하고, 도감이 증명하는 성공 수 이상으로 복원된다.
    expect(normalized.totalCookCount).toBe(5);
    expect(normalized.totalSuccessCount).toBe(5);
  });

  test('keeps a valid in-progress pot', () => {
    const normalized = normalizeCookingState({
      discoveredDishes: {},
      pot: { ingredients: [TIER1_A, TIER1_B], startedAt: NOW },
      totalCookCount: 1,
      totalSuccessCount: 0,
    });
    expect(normalized.pot).toEqual({
      ingredients: [TIER1_A, TIER1_B],
      startedAt: NOW,
      rewardedAdBoosted: false,
    });
  });
});

describe('cooking pot transitions', () => {
  test('canStartCooking enforces distinct known crops within 2~3 kinds and 1+ stock each', () => {
    const state = stateWithInventory({ [TIER1_A]: 1, [TIER1_B]: 1, potato: 1, onion: 1 });
    expect(canStartCooking(state, [TIER1_A, TIER1_B])).toBe(true);
    expect(canStartCooking(state, [TIER1_A])).toBe(false);
    expect(canStartCooking(state, [TIER1_A, TIER1_A])).toBe(false);
    expect(canStartCooking(state, [TIER1_A, 'ghost' as CropKey])).toBe(false);
    expect(canStartCooking(state, [TIER1_A, TIER1_B, 'potato' as CropKey, 'onion' as CropKey])).toBe(false);
    expect(canStartCooking(stateWithInventory({ [TIER1_A]: 1 }), [TIER1_A, TIER1_B])).toBe(false);
  });

  test('startCooking consumes one of each ingredient and fills the pot; a busy pot rejects a second start', () => {
    const state = stateWithInventory({ [TIER1_A]: 2, [TIER1_B]: 1 });
    const started = startCooking(state, [TIER1_A, TIER1_B], NOW);
    expect(started).not.toBeNull();
    expect(started!.production.inventory).toEqual({ [TIER1_A]: 1 });
    expect(started!.cooking.pot).toEqual({
      ingredients: [TIER1_A, TIER1_B],
      startedAt: NOW,
      rewardedAdBoosted: false,
    });
    // 진행 중에는 새 조리를 시작할 수 없다.
    expect(startCooking({ ...started!, production: { ...started!.production, inventory: { [TIER1_A]: 1, [TIER1_B]: 1 } } }, [TIER1_A, TIER1_B], NOW)).toBeNull();
  });

  test('timer scales with the highest ingredient tier and phases advance deterministically', () => {
    expect(getMaxIngredientTier([TIER1_A, TIER7_A])).toBe(7);
    expect(getCookingTimerMs(createInitialState(), [TIER1_A, TIER7_A])).toBe(balance.cooking.timerPerTierMs * 7);

    const state = startCooking(stateWithInventory({ [TIER1_A]: 1, [TIER1_B]: 1 }), [TIER1_A, TIER1_B], NOW)!;
    const timerMs = getCookingTimerMs(state, [TIER1_A, TIER1_B]);
    expect(getCookingPotStatus(state, NOW).phase).toBe('cooking');
    expect(getCookingPotStatus(state, NOW).remainingMs).toBe(timerMs);
    expect(getCookingPotStatus(state, NOW + timerMs - 1).phase).toBe('cooking');
    expect(getCookingPotStatus(state, NOW + timerMs).phase).toBe('ready');
  });

  test('요리 연구는 진행 중인 조리의 남은 시간까지 줄이고 광고 즉시완성과도 맞물린다', () => {
    const cookNode = RESEARCH_NODES.find((node) => node.key === 'cooking_studies')!;
    const state = startCooking(stateWithInventory({ [TIER1_A]: 1, [TIER7_A]: 1 }), [TIER1_A, TIER7_A], NOW)!;
    const baseTimerMs = balance.cooking.timerPerTierMs * 7;
    expect(getCookingTimerMs(state, [TIER1_A, TIER7_A])).toBe(baseTimerMs);

    const studied: GameState = {
      ...state,
      research: {
        ...state.research,
        nodeLevels: { donation_amplifier: 1, cooking_studies: 4 },
        unlockedNodes: ['donation_amplifier', 'cooking_studies'],
      },
    };
    const shortened = Math.ceil(baseTimerMs / (1 + cookNode.effectPerLevel * 4));
    expect(shortened).toBeLessThan(baseTimerMs);
    expect(getCookingTimerMs(studied, [TIER1_A, TIER7_A])).toBe(shortened);

    const status = getCookingPotStatus(studied, NOW);
    expect(status.timerMs).toBe(shortened);
    expect(status.readyAt).toBe(NOW + shortened);
    expect(getCookingPotStatus(studied, NOW + shortened - 1).phase).toBe('cooking');
    expect(getCookingPotStatus(studied, NOW + shortened).phase).toBe('ready');
    // 연구가 없었다면 아직 조리 중이었을 시점에 결과를 확인할 수 있다.
    expect(canResolveCooking(state, NOW + shortened)).toBe(false);
    expect(canResolveCooking(studied, NOW + shortened)).toBe(true);
    // 광고 즉시완성은 짧아진 타이머 기준으로도 남은 시간을 정확히 0으로 만든다.
    const rushed = finishCookingInstantly(studied, NOW + 1000)!;
    expect(getCookingPotStatus(rushed, NOW + 1000).remainingMs).toBe(0);
    // 성공률은 재료 수만 따르므로 연구로 바뀌지 않는다.
    expect(status.successRate).toBe(getCookingPotStatus(state, NOW).successRate);
  });

  test('cancelCooking refunds every ingredient but only while still cooking', () => {
    const state = startCooking(stateWithInventory({ [TIER1_A]: 1, [TIER1_B]: 1 }), [TIER1_A, TIER1_B], NOW)!;
    const canceled = cancelCooking(state, NOW + 1);
    expect(canceled).not.toBeNull();
    expect(canceled!.production.inventory).toEqual({ [TIER1_A]: 1, [TIER1_B]: 1 });
    expect(canceled!.cooking.pot).toBeNull();
    // 완료된 조리는 결과를 확인해야 하며 취소할 수 없다.
    expect(cancelCooking(state, NOW + getCookingTimerMs(state, [TIER1_A, TIER1_B]))).toBeNull();
    // 미진행 상태의 취소는 no-op이다.
    expect(cancelCooking(createInitialState(), NOW)).toBeNull();
  });

  test('finishCookingInstantly zeroes the remaining time and persists a success guarantee', () => {
    const state = startCooking(stateWithInventory({ [TIER1_A]: 1, [TIER7_A]: 1 }), [TIER1_A, TIER7_A], NOW)!;
    const rushed = finishCookingInstantly(state, NOW + 1000);
    expect(rushed).not.toBeNull();
    expect(getCookingPotStatus(rushed!, NOW + 1000).phase).toBe('ready');
    expect(getCookingPotStatus(rushed!, NOW + 1000).rewardedAdBoosted).toBe(true);
    expect(normalizeCookingState(JSON.parse(JSON.stringify(rushed!.cooking)))).toEqual(rushed!.cooking);
    // 진행 중이 아니면 no-op.
    expect(finishCookingInstantly(createInitialState(), NOW)).toBeNull();
    expect(finishCookingInstantly(rushed!, NOW + 1001)).toBeNull();
  });
});

describe('resolveCooking', () => {
  function readyState(ingredients: CropKey[], now = NOW): GameState {
    const inventory: Partial<Record<CropKey, number>> = {};
    for (const crop of ingredients) {
      inventory[crop] = 1;
    }
    const started = startCooking(stateWithInventory(inventory), ingredients, now);
    if (started == null) {
      throw new Error('failed to start cooking in fixture');
    }
    return started;
  }

  test('returns null before the timer completes and prevents double resolution', () => {
    const state = readyState([TIER1_A, TIER1_B]);
    expect(canResolveCooking(state, NOW)).toBe(false);
    expect(resolveCooking(state, NOW, () => 0)).toBeNull();

    const readyAt = NOW + getCookingTimerMs(state, [TIER1_A, TIER1_B]);
    const resolution = resolveCooking(state, readyAt, () => 0)!;
    expect(resolution).not.toBeNull();
    expect(resolveCooking(resolution.state, readyAt, () => 0)).toBeNull();
  });

  test('a success registers the dish in the compendium and only draws from tier-eligible pools', () => {
    const state = readyState([TIER1_A, TIER1_B]);
    const readyAt = NOW + getCookingTimerMs(state, [TIER1_A, TIER1_B]);
    // rng 0: 성공 판정(0 < 0.9) → 등급 첫 후보 → 풀 첫 메뉴.
    const resolution = resolveCooking(state, readyAt, () => 0)!;
    const result = resolution.result;
    expect(result.outcome).toBe('success');
    if (result.outcome !== 'success') {
      return;
    }
    expect(isKnownCookingDishKey(result.dishKey)).toBe(true);
    expect(result.isNew).toBe(true);
    // 티어 1 재료만 썼으므로 추첨된 메뉴도 티어 1 이하여야 한다.
    const drawn = COOKING_DISHES.find((candidate) => candidate.key === result.dishKey)!;
    expect(drawn.tier).toBeLessThanOrEqual(1);
    expect(resolution.state.cooking.pot).toBeNull();
    expect(resolution.state.cooking.totalCookCount).toBe(1);
    expect(resolution.state.cooking.totalSuccessCount).toBe(1);
    expect(getDiscoveredDishCount(resolution.state)).toBe(1);
  });

  test('a failure refunds floor(count × failRefundRatio) lowest-tier ingredients', () => {
    const state = readyState([TIER7_A, TIER1_A]);
    const readyAt = NOW + getCookingTimerMs(state, [TIER7_A, TIER1_A]);
    // 성공률 0.9보다 큰 roll → 실패.
    const resolution = resolveCooking(state, readyAt, () => 0.95)!;
    expect(resolution.result.outcome).toBe('fail');
    if (resolution.result.outcome !== 'fail') {
      return;
    }
    // floor(2 × 0.5) = 1개, 저티어(carrot) 우선 환급.
    expect(resolution.result.refundedCrops).toEqual([TIER1_A]);
    expect(resolution.state.production.inventory).toEqual({ [TIER1_A]: 1 });
    expect(resolution.state.cooking.totalCookCount).toBe(1);
    expect(resolution.state.cooking.totalSuccessCount).toBe(0);
    expect(resolution.state.cooking.pot).toBeNull();
  });

  test('rewarded-ad boost guarantees success once without guaranteeing a new dish', () => {
    const discoveredDish = COOKING_DISHES.find((dish) => dish.grade === 'common' && dish.tier <= 1)!;
    const base = readyState([TIER1_A, TIER1_B]);
    const alreadyDiscovered: GameState = {
      ...base,
      cooking: {
        ...base.cooking,
        discoveredDishes: { [discoveredDish.key]: 1 },
        totalCookCount: 1,
        totalSuccessCount: 1,
      },
    };
    const rushed = finishCookingInstantly(alreadyDiscovered, NOW + 1000)!;
    // 첫 roll 0.99는 일반 2재료 성공률 90%를 넘지만 광고 boost가 성공시킨다.
    // 이후 roll 0은 common 첫 메뉴를 다시 뽑아 신규 메뉴는 보장하지 않음을 확인한다.
    const rolls = [0.99, 0, 0];
    let index = 0;
    const resolution = resolveCooking(rushed, NOW + 1000, () => rolls[index++]!)!;

    expect(resolution.result).toEqual({
      outcome: 'success',
      dishKey: discoveredDish.key,
      grade: 'common',
      isNew: false,
      rewardedAdBoosted: true,
    });
    expect(resolution.state.cooking.pot).toBeNull();
  });

  test('grade eligibility follows minMaxTier and minIngredients gates', () => {
    // 티어 1 재료 2종: common만.
    expect(getEligibleCookingGrades([TIER1_A, TIER1_B]).map((grade) => grade.key)).toEqual(['common']);
    // 티어 7 재료 2종: 전설은 3종 요구라 빠진다.
    expect(getEligibleCookingGrades([TIER7_A, TIER1_A]).map((grade) => grade.key)).toEqual([
      'common',
      'rare',
      'epic',
    ]);
    // 티어 7 재료 3종: 전설 포함.
    expect(getEligibleCookingGrades([TIER7_A, TIER7_B, TIER7_C]).map((grade) => grade.key)).toEqual([
      'common',
      'rare',
      'epic',
      'legendary',
    ]);
  });

  test('success rate table follows the GDD bands and clamps out-of-range counts', () => {
    expect(getCookingSuccessRate(2)).toBe(0.9);
    expect(getCookingSuccessRate(3)).toBe(0.45);
    expect(getCookingSuccessRate(1)).toBe(0.9);
    expect(getCookingSuccessRate(99)).toBe(0.45);
  });

  test('QA: many random cooks across mixed-tier combos never crash and always yield a valid state', () => {
    // 결정적 의사난수(LCG)로 다수의 조합/추첨을 돌려 크래시·무효 상태가 없는지 확인한다.
    let seed = 42;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const tiers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let state = createInitialState();
    for (let round = 0; round < 200; round += 1) {
      const tierA = tiers[round % tiers.length]!;
      const tierB = tiers[(round + 3) % tiers.length]!;
      const cropA = cropOfTier(tierA);
      const cropB = cropOfTier(tierB, [cropA]);
      const ingredients: CropKey[] = [cropA, cropB];
      if (round % 3 === 0) {
        ingredients.push(cropOfTier(tiers[(round + 5) % tiers.length]!, ingredients));
      }
      const inventory: Partial<Record<CropKey, number>> = {};
      for (const crop of ingredients) {
        inventory[crop] = 1;
      }
      state = { ...state, production: { ...state.production, inventory } };
      const started = startCooking(state, ingredients, NOW + round);
      expect(started).not.toBeNull();
      const readyAt = NOW + round + getCookingTimerMs(started!, ingredients);
      const resolution = resolveCooking(started!, readyAt, rng);
      expect(resolution).not.toBeNull();
      state = resolution!.state;
      // 정규화 왕복(저장/로드)이 손실 없이 유지된다.
      const roundTripped = normalizeCookingState(JSON.parse(JSON.stringify(state.cooking)));
      expect(roundTripped).toEqual(state.cooking);
    }
    expect(state.cooking.totalCookCount).toBe(200);
    expect(getDiscoveredDishCount(state)).toBeGreaterThan(0);
  });
});

describe('compendium progress and permanent sell bonus', () => {
  function stateWithDiscoveries(count: number): GameState {
    const base = createInitialState();
    const discoveredDishes: Partial<Record<CookingDishKey, number>> = {};
    for (const dish of COOKING_DISHES.slice(0, count)) {
      discoveredDishes[dish.key] = 1;
    }
    const cooking: CookingState = {
      ...base.cooking,
      discoveredDishes,
      totalCookCount: count,
      totalSuccessCount: count,
    };
    return { ...base, cooking };
  }

  test('milestone bonuses accumulate and are capped at +10% at full completion', () => {
    expect(getCookingCompendiumSellBonus(stateWithDiscoveries(0))).toBe(0);
    expect(getCookingCompendiumSellBonus(stateWithDiscoveries(10))).toBeCloseTo(0.01);
    expect(getCookingCompendiumSellBonus(stateWithDiscoveries(60))).toBeCloseTo(0.05);
    expect(getCookingCompendiumSellBonus(stateWithDiscoveries(150))).toBeCloseTo(0.1);
  });

  test('the compendium bonus multiplies the global profit multiplier', () => {
    const baseline = getGlobalModifiers(stateWithDiscoveries(0), NOW).profitMultiplier;
    const complete = getGlobalModifiers(stateWithDiscoveries(150), NOW).profitMultiplier;
    expect(complete / baseline).toBeCloseTo(1.1);
  });

  test('progress summary tracks per-grade discovery and the next milestone', () => {
    const progress = getCookingCompendiumProgress(stateWithDiscoveries(10));
    expect(progress.totalDishes).toBe(150);
    expect(progress.discoveredCount).toBe(10);
    expect(progress.milestones[0]).toEqual({ count: 10, sellBonus: 0.01, reached: true });
    expect(progress.nextMilestone).toEqual({ count: 30, sellBonus: 0.02, reached: false });
    const full = getCookingCompendiumProgress(stateWithDiscoveries(150));
    expect(full.nextMilestone).toBeNull();
    expect(full.discoveredByGrade).toEqual(full.totalByGrade);
  });
});

describe('save integration', () => {
  test('cooking is a meta-layer field (survives prestige) and migrates safely', () => {
    expect(META_LAYER_KEYS).toContain('cooking');

    const base = createInitialState();
    const migratedWithout = migrateLoadedState({}, createInitialState());
    expect(migratedWithout.cooking).toEqual(createInitialCookingState());

    const dish = COOKING_DISHES[0]!.key;
    const migrated = migrateLoadedState(
      {
        ...base,
        cooking: {
          discoveredDishes: { [dish]: 3, bogus: 1 } as CookingState['discoveredDishes'],
          pot: null,
          totalCookCount: 4,
          totalSuccessCount: 3,
        },
      },
      createInitialState()
    );
    expect(migrated.cooking.discoveredDishes).toEqual({ [dish]: 3 });
    expect(migrated.cooking.totalCookCount).toBe(4);
    expect(migrated.cooking.totalSuccessCount).toBe(3);
  });

  test('cookingSpeedAd is gated by its daily limit and cooldown', () => {
    let state = createInitialState();
    expect(getRewardedAdLimitStatus(state, 'cookingSpeedAd', NOW).allowed).toBe(true);
    state = { ...state, adUsage: recordRewardedAdUsage(state, 'cookingSpeedAd', NOW) };
    expect(state.adUsage.cookingSpeedAd.dailyCount).toBe(1);
    // 쿨다운 중에는 차단되고, 쿨다운이 지나면 다시 허용된다.
    expect(getRewardedAdLimitStatus(state, 'cookingSpeedAd', NOW + 1000).allowed).toBe(false);
    expect(
      getRewardedAdLimitStatus(state, 'cookingSpeedAd', NOW + balance.ads.cookingSpeedAdCooldownMs).allowed
    ).toBe(true);
    // 일일 한도 소진 시 차단된다.
    for (let i = 1; i < balance.ads.cookingSpeedAdDailyLimit; i += 1) {
      state = {
        ...state,
        adUsage: recordRewardedAdUsage(state, 'cookingSpeedAd', NOW + i * balance.ads.cookingSpeedAdCooldownMs),
      };
    }
    expect(
      getRewardedAdLimitStatus(
        state,
        'cookingSpeedAd',
        NOW + balance.ads.cookingSpeedAdDailyLimit * balance.ads.cookingSpeedAdCooldownMs
      ).allowed
    ).toBe(false);
  });

  test('the cooking feature coachmark opens once enough distinct ingredients are stocked', () => {
    const empty = createInitialState();
    expect(isFeatureCoachmarkAvailable(empty, 'cooking')).toBe(false);
    const stocked = stateWithInventory({ [TIER1_A]: 1, [TIER1_B]: 1 });
    expect(isFeatureCoachmarkAvailable(stocked, 'cooking')).toBe(true);
    // 코치마크 대기열에도 순서대로 잡힌다(선행 키가 이미 확인된 상태 가정).
    const acknowledged: GameState = {
      ...stocked,
      seenFeatureCoachmarks: ['animals', 'workshop'],
    };
    expect(getPendingFeatureCoachmark(acknowledged)).toBe('cooking');
  });
});
