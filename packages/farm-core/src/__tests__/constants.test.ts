/// <reference types="jest" />

import balance from '../balance.json';
import {
  CROPS,
  DEFAULT_GOLD,
  FARM_AREAS,
  GROWTH_AD_COOLDOWN_MS,
  INITIAL_AREA_KEYS,
  INITIAL_PLOTS,
  MAX_PLOTS,
  REWARDED_GOLD_MAX_USES_PER_WINDOW,
  REWARDED_GOLD_WINDOW_MS,
  canUnlockArea,
  createInitialAdUsage,
  createInitialState,
  formatMoney,
  getPlotCost,
  getProfitMultiplier,
  getRewardedAdLimitStatus,
  getSpeedMultiplier,
  getUpgradeCost,
  migrateLoadedState,
  normalizeAdUsage,
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
        harvestBonusAd: { lastUsedAt: NOW - 1000, dailyCount: 3 },
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
      harvestBonusAd: { lastUsedAt: NOW - 1000, dailyCount: 0 },
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
        harvestBonusAd: { lastUsedAt: NOW - 1, dailyCount: 2 },
      },
      NOW
    );

    expect(adUsage.rewardedGoldTimestamps).toEqual([NOW - 1]);
    expect(adUsage.rewardedGoldDailyCount).toBe(0);
    expect(adUsage.growthAd).toEqual({ lastUsedAt: null, dailyCount: 0 });
    expect(adUsage.harvestBonusAd).toEqual({ lastUsedAt: NOW - 1, dailyCount: 2 });
  });
});
