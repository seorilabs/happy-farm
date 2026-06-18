/// <reference types="jest" />

import balance from '../balance.json';
import {
  CROPS,
  DEFAULT_GOLD,
  FARM_AREAS,
  GROWTH_AD_COOLDOWN_MS,
  HARVEST_BONUS_AD_COOLDOWN_MS,
  HARVEST_BONUS_BOOST_DURATION_MS,
  HARVEST_BONUS_MULTIPLIER,
  INITIAL_AREA_KEYS,
  INITIAL_PLOTS,
  MAX_PLOTS,
  REWARDED_GOLD_MAX_USES_PER_WINDOW,
  REWARDED_GOLD_WINDOW_MS,
  canUnlockArea,
  createInitialAdUsage,
  createInitialState,
  getRewardedGoldAmount,
  REWARDED_GOLD_AMOUNT,
  formatMoney,
  getAreaUnlockRequirementText,
  getCropEconomyEstimate,
  getFarmProductivityEstimate,
  getHarvestBonusBoostStatus,
  getHarvestBonusPromptStatus,
  getPlotCost,
  getProfitMultiplier,
  getRewardedAdLimitStatus,
  getSpeedMultiplier,
  getUpgradeCost,
  migrateLoadedState,
  normalizeAdUsage,
  recordHarvestBonusAdPrompt,
  recordRewardedAdUsage,
} from '../constants';
import type { CropKey, GameState } from '../types';

const NOW = Date.parse('2026-05-27T03:00:00.000Z');

function cropKeys() {
  return Object.keys(CROPS) as CropKey[];
}

function areaKeys() {
  return FARM_AREAS.map((area) => area.key);
}

describe('farm balance and model invariants', () => {
  test('initial state follows canonical balance data', () => {
    const state = createInitialState();

    expect(state.gold).toBe(DEFAULT_GOLD);
    expect(state.unlockedPlotCount).toBe(INITIAL_PLOTS);
    expect(state.unlockedAreas).toEqual(INITIAL_AREA_KEYS);
    expect(state.harvestedCropKeys).toEqual([]);
    expect(state.upgrades).toEqual({ speed: 1, profit: 1 });
    expect(state.plots).toHaveLength(MAX_PLOTS);
    expect(state.plots.map((plot) => plot.id)).toEqual(Array.from({ length: MAX_PLOTS }, (_, index) => index));
    expect(state.plots.every((plot) => plot.cropType == null && plot.startTime == null && plot.state === 0)).toBe(
      true
    );
  });

  test('balance entries stay usable through late-game progression', () => {
    expect(cropKeys()).toHaveLength(balance.crops.length);

    for (const area of FARM_AREAS) {
      expect(area.name.length).toBeGreaterThan(0);
      expect(area.unlock.cost).toBeGreaterThanOrEqual(0);
      expect(area.unlock.requiredHarvestedCropCount).toBeGreaterThanOrEqual(0);
      expect(area.unlock.requiredUpgradeLevel).toBeGreaterThanOrEqual(1);
    }

    for (const cropKey of cropKeys()) {
      const crop = CROPS[cropKey]!;
      expect(areaKeys()).toContain(crop.area);
      expect(crop.cost).toBeGreaterThan(0);
      expect(crop.sell).toBeGreaterThan(crop.cost);
      expect(crop.growTime).toBeGreaterThan(0);
      expect(crop.name.length).toBeGreaterThan(0);
      expect(crop.icon.length).toBeGreaterThan(0);
    }

    const plotCosts = Array.from({ length: MAX_PLOTS - INITIAL_PLOTS }, (_, index) =>
      getPlotCost(INITIAL_PLOTS + index)
    );
    expect(plotCosts.every((cost) => Number.isFinite(cost) && cost > 0)).toBe(true);
    expect(plotCosts).toEqual([...plotCosts].sort((a, b) => a - b));

    for (const level of [1, 2, 8, 24, 100]) {
      expect(getUpgradeCost('speed', level)).toBeGreaterThan(0);
      expect(getUpgradeCost('profit', level)).toBeGreaterThan(0);
      expect(Number.isFinite(getSpeedMultiplier(level))).toBe(true);
      expect(Number.isFinite(getProfitMultiplier(level))).toBe(true);
    }

    for (const amount of [0, 9999, 10000, 1e8, 1e12, 1e16, 1e20, 9.876e23]) {
      expect(formatMoney(amount)).not.toMatch(/[eE]|Infinity|NaN/);
    }
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('0');
  });

  test('area unlock checks require gold, harvested variety, and minimum research level', () => {
    const state = createInitialState();
    const nextArea = FARM_AREAS.find((area) => area.unlock.cost > 0);
    expect(nextArea).toBeDefined();

    const lockedState: GameState = {
      ...state,
      gold: nextArea!.unlock.cost,
      harvestedCropKeys: cropKeys().slice(0, Math.max(0, nextArea!.unlock.requiredHarvestedCropCount - 1)),
      upgrades: {
        speed: nextArea!.unlock.requiredUpgradeLevel,
        profit: nextArea!.unlock.requiredUpgradeLevel,
      },
    };
    expect(canUnlockArea(lockedState, nextArea!.key)).toBe(false);

    const unlockableState: GameState = {
      ...lockedState,
      harvestedCropKeys: cropKeys().slice(0, nextArea!.unlock.requiredHarvestedCropCount),
    };
    expect(canUnlockArea(unlockableState, nextArea!.key)).toBe(true);

    expect(
      canUnlockArea({ ...unlockableState, unlockedAreas: [...unlockableState.unlockedAreas, nextArea!.key] }, nextArea!.key)
    ).toBe(false);
  });

  test('area unlock text shows the required research level without repeating the current level', () => {
    const state: GameState = {
      ...createInitialState(),
      upgrades: { speed: 1, profit: 1 },
    };
    const area = FARM_AREAS.find((candidate) => candidate.unlock.requiredUpgradeLevel > 1);
    expect(area).toBeDefined();

    const text = getAreaUnlockRequirementText(state, area!.key);

    expect(text).toContain(`연구 Lv.${area!.unlock.requiredUpgradeLevel} 필요`);
    expect(text).not.toContain(`연구 Lv.1/${area!.unlock.requiredUpgradeLevel}`);
  });

  test('crop economy estimates expose ROI and hourly productivity', () => {
    const carrotEstimate = getCropEconomyEstimate('carrot', { speedMultiplier: 1, profitMultiplier: 1 });
    const carrot = CROPS.carrot;
    if (carrot == null) {
      throw new Error('Farm balance must include carrot.');
    }
    const expectedNetProfit = carrot.sell - carrot.cost;
    const expectedRoiPercent = (expectedNetProfit / carrot.cost) * 100;
    const expectedNetProfitPerHour = (expectedNetProfit / carrot.growTime) * 60 * 60 * 1000;

    expect(carrotEstimate.harvestValue).toBe(carrot.sell);
    expect(carrotEstimate.netProfit).toBe(expectedNetProfit);
    expect(carrotEstimate.roiPercent).toBeCloseTo(expectedRoiPercent);
    expect(carrotEstimate.netProfitPerHour).toBeCloseTo(expectedNetProfitPerHour);

    const state = createInitialState();
    const productivity = getFarmProductivityEstimate(state, { speedMultiplier: 1, profitMultiplier: 1 });

    expect(productivity.bestCropKey).not.toBeNull();
    expect(productivity.plotCount).toBe(state.unlockedPlotCount);
    expect(productivity.netProfitPerHour).toBeGreaterThan(0);
  });
});

describe('farm save migration', () => {
  test('normalizes old, corrupt, and over-progressed save data', () => {
    const base = createInitialState();
    const loaded = {
      gold: 987_654_321_000,
      unlockedPlotCount: MAX_PLOTS + 200,
      unlockedAreas: ['starter_field', 'starter_field', 'ghost_area', 'legend_field'],
      harvestedCropKeys: ['carrot', 'carrot', 'ghost_crop', 'world_tree'],
      upgrades: { speed: 42.8, profit: Number.NaN },
      adUsage: {
        dailyKey: '2026-05-26',
        rewardedGoldTimestamps: [NOW - 1000, NOW - REWARDED_GOLD_WINDOW_MS - 1, NOW + 1000, Number.NaN],
        rewardedGoldDailyCount: 99,
        growthAd: { lastUsedAt: NOW + 1000, dailyCount: 9 },
        harvestBonusAd: {
          lastUsedAt: NOW - 1000,
          lastPromptedAt: NOW - 2000,
          boostEndsAt: NOW + HARVEST_BONUS_BOOST_DURATION_MS,
          dailyCount: 3,
        },
      },
      plots: [
        { id: 999, cropType: 'ghost_crop', startTime: 'bad', state: 9 },
        { id: 999, cropType: 'carrot', startTime: NOW - 500, state: 1 },
        { id: 999, cropType: 'wheat', startTime: null, state: 2 },
      ],
    } as unknown as Partial<GameState>;

    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    const migrated = migrateLoadedState(loaded, base);

    expect(migrated.gold).toBe(987_654_321_000);
    expect(migrated.unlockedPlotCount).toBe(MAX_PLOTS);
    expect(migrated.unlockedAreas).toEqual(['starter_field', 'legend_field']);
    expect(migrated.harvestedCropKeys).toEqual(['carrot', 'world_tree']);
    expect(migrated.upgrades).toEqual({ speed: 42, profit: 1 });
    expect(migrated.plots).toHaveLength(MAX_PLOTS);
    expect(migrated.plots[0]).toEqual({ id: 0, cropType: null, startTime: null, state: 0 });
    expect(migrated.plots[1]).toEqual({ id: 1, cropType: 'carrot', startTime: NOW - 500, state: 1 });
    expect(migrated.plots[2]).toEqual({ id: 2, cropType: 'wheat', startTime: null, state: 2 });
    expect(migrated.plots[MAX_PLOTS - 1]).toEqual({
      id: MAX_PLOTS - 1,
      cropType: null,
      startTime: null,
      state: 0,
    });
    expect(migrated.adUsage).toEqual({
      dailyKey: '2026-05-27',
      rewardedGoldTimestamps: [NOW - 1000],
      rewardedGoldDailyCount: 0,
      growthAd: { lastUsedAt: null, dailyCount: 0 },
      harvestBonusAd: {
        lastUsedAt: NOW - 1000,
        lastPromptedAt: NOW - 2000,
        boostEndsAt: NOW + HARVEST_BONUS_BOOST_DURATION_MS,
        dailyCount: 0,
      },
    });
  });

  test('falls back to safe defaults for invalid numeric fields', () => {
    const base = createInitialState();
    const migrated = migrateLoadedState(
      {
        gold: Number.POSITIVE_INFINITY,
        unlockedPlotCount: -10,
        upgrades: { speed: 0, profit: -3 },
      },
      base
    );

    expect(migrated.gold).toBe(base.gold);
    expect(migrated.unlockedPlotCount).toBe(INITIAL_PLOTS);
    expect(migrated.upgrades).toEqual({ speed: 1, profit: 1 });
  });
});

describe('farm ad limits', () => {
  test('rewarded gold enforces both rolling-window and daily limits', () => {
    let state: GameState = { ...createInitialState(), adUsage: createInitialAdUsage(NOW) };

    for (let index = 0; index < REWARDED_GOLD_MAX_USES_PER_WINDOW; index += 1) {
      const timestamp = NOW + index;
      state = { ...state, adUsage: recordRewardedAdUsage(state, 'rewardedGold', timestamp) };
    }
    expect(getRewardedAdLimitStatus(state, 'rewardedGold', NOW + REWARDED_GOLD_MAX_USES_PER_WINDOW).allowed).toBe(
      false
    );
    expect(getRewardedAdLimitStatus(state, 'rewardedGold', NOW + REWARDED_GOLD_WINDOW_MS + 1).allowed).toBe(true);

    state = { ...createInitialState(), adUsage: createInitialAdUsage(NOW) };
    for (let index = 0; index < 4; index += 1) {
      const timestamp = NOW + index * (REWARDED_GOLD_WINDOW_MS + 1);
      state = { ...state, adUsage: recordRewardedAdUsage(state, 'rewardedGold', timestamp) };
    }
    const dailyLimit = getRewardedAdLimitStatus(state, 'rewardedGold', NOW + 4 * (REWARDED_GOLD_WINDOW_MS + 1));
    expect(dailyLimit.allowed).toBe(false);
    expect(dailyLimit.reason).toContain('오늘 이용 가능한 횟수');
  });

  test('growth ad cooldown resets after the configured duration', () => {
    const state: GameState = {
      ...createInitialState(),
      adUsage: recordRewardedAdUsage(createInitialState(), 'growthAd', NOW),
    };

    expect(getRewardedAdLimitStatus(state, 'growthAd', NOW + 1).allowed).toBe(false);
    expect(getRewardedAdLimitStatus(state, 'growthAd', NOW + GROWTH_AD_COOLDOWN_MS + 1).allowed).toBe(true);
  });

  test('ad usage normalization rejects future and non-finite timestamps', () => {
    const adUsage = normalizeAdUsage(
      {
        dailyKey: '2026-05-27',
        rewardedGoldTimestamps: [NOW - 1, NOW + 1, NOW - REWARDED_GOLD_WINDOW_MS - 1, Number.NaN],
        rewardedGoldDailyCount: -5,
        growthAd: { lastUsedAt: NOW + 1, dailyCount: Number.NaN },
        harvestBonusAd: {
          lastUsedAt: NOW - 1,
          lastPromptedAt: NOW + 1,
          boostEndsAt: Number.NaN,
          dailyCount: 2,
        },
      },
      NOW
    );

    expect(adUsage.rewardedGoldTimestamps).toEqual([NOW - 1]);
    expect(adUsage.rewardedGoldDailyCount).toBe(0);
    expect(adUsage.growthAd).toEqual({ lastUsedAt: null, dailyCount: 0 });
    expect(adUsage.harvestBonusAd).toEqual({
      lastUsedAt: NOW - 1,
      lastPromptedAt: null,
      boostEndsAt: null,
      dailyCount: 2,
    });
  });

  test('harvest bonus prompt uses a long exposure cooldown', () => {
    let state: GameState = { ...createInitialState(), adUsage: createInitialAdUsage(NOW) };

    expect(getHarvestBonusPromptStatus(state, NOW).allowed).toBe(true);

    state = { ...state, adUsage: recordHarvestBonusAdPrompt(state, NOW) };

    const blocked = getHarvestBonusPromptStatus(state, NOW + 1);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain('12시간');
    expect(getHarvestBonusPromptStatus(state, NOW + HARVEST_BONUS_AD_COOLDOWN_MS + 1).allowed).toBe(true);
  });

  test('harvest bonus ad activates a timed reward multiplier', () => {
    const state: GameState = {
      ...createInitialState(),
      adUsage: recordRewardedAdUsage(createInitialState(), 'harvestBonusAd', NOW),
    };

    const activeBoost = getHarvestBonusBoostStatus(state, NOW + 1);
    expect(activeBoost.active).toBe(true);
    expect(activeBoost.multiplier).toBe(HARVEST_BONUS_MULTIPLIER);
    expect(activeBoost.remainingMs).toBe(HARVEST_BONUS_BOOST_DURATION_MS - 1);
    expect(getHarvestBonusBoostStatus(state, NOW + HARVEST_BONUS_BOOST_DURATION_MS + 1).active).toBe(false);
  });
});

describe('getRewardedGoldAmount', () => {
  test('returns REWARDED_GOLD_AMOUNT floor when next goal scales below it', () => {
    // Initial state: only starter_field unlocked, next goal = vegetable_field (300G)
    // 5 % of 300 = 15 < 100 floor
    const state = createInitialState();
    expect(getRewardedGoldAmount(state)).toBe(REWARDED_GOLD_AMOUNT);
  });

  test('scales with next non-gated area cost once vegetable_field is unlocked', () => {
    // vegetable_field unlocked → next goal = fruit_field (15 000G)
    // 5 % of 15 000 = 750 > 100 floor
    const vegetableArea = FARM_AREAS.find((a) => a.key === 'vegetable_field')!;
    const state: GameState = {
      ...createInitialState(),
      unlockedAreas: [...createInitialState().unlockedAreas, vegetableArea.key],
    };
    const expected = Math.floor(balance.areas.find((a) => a.key === 'fruit_field')!.unlock.cost * balance.ads.rewardedGoldScaling.nextGoalRatio);
    expect(getRewardedGoldAmount(state)).toBe(expected);
    expect(getRewardedGoldAmount(state)).toBeGreaterThan(REWARDED_GOLD_AMOUNT);
  });

  test('scales with orchard cost when fruit_field is already unlocked', () => {
    const state: GameState = {
      ...createInitialState(),
      unlockedAreas: [...createInitialState().unlockedAreas, 'vegetable_field', 'fruit_field'],
    };
    const orchardCost = balance.areas.find((a) => a.key === 'orchard')!.unlock.cost;
    const expected = Math.floor(orchardCost * balance.ads.rewardedGoldScaling.nextGoalRatio);
    expect(getRewardedGoldAmount(state)).toBe(expected);
  });

  test('uses prestige graduation cost when all non-gated areas are unlocked', () => {
    const nonGatedAreaKeys = balance.areas
      .filter((a) => a.unlock.gate == null)
      .map((a) => a.key) as GameState['unlockedAreas'];
    const state: GameState = {
      ...createInitialState(),
      unlockedAreas: nonGatedAreaKeys,
      prestige: { ...createInitialState().prestige, level: 0 },
    };
    const graduationCost = balance.regions.graduation.costBase;
    const expected = Math.floor(graduationCost * balance.ads.rewardedGoldScaling.nextGoalRatio);
    expect(getRewardedGoldAmount(state)).toBe(expected);
    expect(getRewardedGoldAmount(state)).toBeGreaterThan(REWARDED_GOLD_AMOUNT);
  });

  test('reward grows proportionally at higher prestige levels', () => {
    const nonGatedAreaKeys = balance.areas
      .filter((a) => a.unlock.gate == null)
      .map((a) => a.key) as GameState['unlockedAreas'];
    const stateLevel0: GameState = {
      ...createInitialState(),
      unlockedAreas: nonGatedAreaKeys,
      prestige: { ...createInitialState().prestige, level: 0 },
    };
    const stateLevel1: GameState = {
      ...stateLevel0,
      prestige: { ...stateLevel0.prestige, level: 1 },
    };
    expect(getRewardedGoldAmount(stateLevel1)).toBeGreaterThan(getRewardedGoldAmount(stateLevel0));
  });
});
