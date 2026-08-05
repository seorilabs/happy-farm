/// <reference types="jest" />

import balance from '../balance.json';
import {
  CHAIN_INCOME_RATIO,
  CHAIN_OFFLINE_CAP_MS,
  PRESTIGE_SKILLS,
  REGION_ARCHETYPES,
  buySkill,
  canPrestige,
  collectChainIncome,
  createPrestigedState,
  getChainIncome,
  getOfflineCapMs,
  getPrestigeCost,
  getPrestigePreview,
  getPrestigeRequirementStatus,
  getPrestigeStarsAward,
  getSkillCost,
  getSkillEffect,
  normalizeChainFarms,
  normalizePrestigeProgress,
  prestigeFarm,
} from '../prestige';
import { getFarmHourlyProductivity, getGlobalModifiers, getCropPurchaseCost } from '../modifiers';
import { CROPS, createEmptyPlots, createInitialState as createBaseInitialState, getAreaCropKeys, migrateLoadedState } from '../constants';
import { FARM_LAYER_KEYS, META_LAYER_KEYS, type CropKey, type GameState } from '../types';

// #427: createInitialState는 이제 첫 밭에 스타터 carrot을 자동 파종한다. 프레스티지
// 리셋은 빈 밭에서 다시 시작하므로(createPrestigedState도 빈 밭 사용), 이 파일의
// 기준 상태도 밭을 비운 초기 상태로 감싸 프레스티지 후 농장 레이어와 정합시킨다.
const createInitialState = (): GameState => ({ ...createBaseInitialState(), plots: createEmptyPlots() });

const NOW = Date.parse('2026-06-11T03:00:00.000Z');
const MS_PER_HOUR = 60 * 60 * 1000;

function prestigeReadyState(): GameState {
  const base = createInitialState();
  const legendCrops = getAreaCropKeys('legend_field');
  return {
    ...base,
    gold: getPrestigeCost(0),
    harvestedCropKeys: [...legendCrops],
    harvestCounts: Object.fromEntries(legendCrops.map((cropKey) => [cropKey, 3])),
    unlockedPlotCount: 12,
    upgrades: { speed: 10, profit: 10 },
    claimedAchievements: ['harvest_total:1'],
    research: { ...base.research, points: 500, totalPointsEarned: 500, unlockedNodes: ['auto_harvest'], unlockedBreeds: [] },
    lifetimeStats: { ...base.lifetimeStats, totalHarvests: 99 },
  };
}

describe('prestige requirements', () => {
  test('requires the legend collection and the graduation cost', () => {
    const base = createInitialState();
    expect(canPrestige(base).allowed).toBe(false);

    const ready = prestigeReadyState();
    const check = canPrestige(ready);
    expect(check.collectionComplete).toBe(true);
    expect(check.goldSufficient).toBe(true);
    expect(check.allowed).toBe(true);

    expect(canPrestige({ ...ready, gold: check.cost - 1 }).allowed).toBe(false);
    expect(canPrestige({ ...ready, harvestedCropKeys: [] }).allowed).toBe(false);
  });

  test('exposes the required area, crops, missing crops, and current gold for UI', () => {
    const base = createInitialState();
    const status = getPrestigeRequirementStatus(base);
    const requiredCropKeys = getAreaCropKeys('legend_field');

    expect(status.requiredAreaKey).toBe('legend_field');
    expect(status.requiredCropKeys).toEqual(requiredCropKeys);
    expect(status.missingCropKeys).toEqual(requiredCropKeys);
    expect(status.collectionComplete).toBe(false);
    expect(status.gold).toBe(base.gold);
    expect(status.currentGold).toBe(base.gold);
    expect(status.cost).toBe(getPrestigeCost(base.prestige.level));
    expect(status.goldSufficient).toBe(false);
    expect(status.allowed).toBe(false);

    const readyStatus = getPrestigeRequirementStatus(prestigeReadyState());
    expect(readyStatus.missingCropKeys).toEqual([]);
    expect(readyStatus.allowed).toBe(true);
    expect(canPrestige(prestigeReadyState())).toEqual(readyStatus);
  });

  test('graduation cost scales per prestige level', () => {
    expect(getPrestigeCost(0)).toBe(balance.regions.graduation.costBase);
    expect(getPrestigeCost(1)).toBe(balance.regions.graduation.costBase * balance.regions.graduation.costGrowth);
    expect(getPrestigeStarsAward(0)).toBe(balance.regions.graduation.starsBase);
    expect(getPrestigeStarsAward(2)).toBe(balance.regions.graduation.starsBase + 2);
  });
});

describe('prestige reset boundary', () => {
  test('resets exactly the farm layer and preserves every meta field', () => {
    const ready = prestigeReadyState();
    const result = prestigeFarm(ready, 'tundra', NOW);
    expect(result).not.toBeNull();
    const fresh = createInitialState();

    for (const key of FARM_LAYER_KEYS) {
      if (key === 'gold') continue; // starting capital skill may alter gold
      expect(result!.state[key]).toEqual(fresh[key]);
    }
    expect(result!.state.gold).toBe(fresh.gold);

    // Fields the prestige flow itself advances are checked separately below.
    const advancedByPrestige = new Set(['prestige', 'chainFarms', 'lifetimeStats']);
    for (const key of META_LAYER_KEYS) {
      if (advancedByPrestige.has(key)) continue;
      expect(result!.state[key]).toEqual(ready[key]);
    }

    expect(result!.state.prestige.level).toBe(1);
    expect(result!.state.prestige.currentRegionArchetype).toBe('tundra');
    expect(result!.state.prestige.stars).toBe(getPrestigeStarsAward(0));
    expect(result!.state.lifetimeStats.prestigeCount).toBe(1);
    expect(result!.state.lifetimeStats.totalHarvests).toBe(ready.lifetimeStats.totalHarvests);
    expect(result!.state.chainFarms).toEqual([result!.chainFarm]);
  });

  test('the chain farm snapshot pays a ratio of the graduating farm productivity', () => {
    const ready = prestigeReadyState();
    const productivity = getFarmHourlyProductivity(ready, NOW);
    const preview = getPrestigePreview(ready, NOW);
    const result = prestigeFarm(ready, 'plains', NOW);

    expect(result!.chainFarm.goldPerHour).toBe(Math.floor(productivity.netProfitPerHour * CHAIN_INCOME_RATIO));
    expect(result!.chainFarm.goldPerHour).toBe(preview.baseChainGoldPerHour);
    expect(preview.effectiveChainGoldPerHour).toBe(result!.chainFarm.goldPerHour);
    expect(result!.chainFarm.archetype).toBe(ready.prestige.currentRegionArchetype);
    expect(result!.chainFarm.lastCollectedAt).toBe(NOW);
  });

  test('can preserve the displayed productivity snapshot while collection starts at confirmation', () => {
    const ready = prestigeReadyState();
    const previewAt = NOW;
    const confirmedAt = NOW + 60_000;
    const preview = getPrestigePreview(ready, previewAt);
    const result = prestigeFarm(ready, 'plains', confirmedAt, previewAt);

    expect(result?.chainFarm.goldPerHour).toBe(preview.baseChainGoldPerHour);
    expect(result?.chainFarm.lastCollectedAt).toBe(confirmedAt);
  });

  test('rejects unknown archetypes and unmet requirements', () => {
    expect(prestigeFarm(createInitialState(), 'plains', NOW)).toBeNull();
    expect(prestigeFarm(prestigeReadyState(), 'ghost_region' as never, NOW)).toBeNull();
  });

  test('starting capital skill raises post-prestige gold', () => {
    const ready: GameState = {
      ...prestigeReadyState(),
      prestige: { ...prestigeReadyState().prestige, skills: { starting_capital: 2 } },
    };
    const prestiged = createPrestigedState(ready);
    const preview = getPrestigePreview(ready, NOW);
    expect(prestiged.gold).toBe(preview.startingGold);
    expect(prestiged.gold).toBe(createInitialState().gold + getSkillEffect(ready, 'starting_capital'));
  });

  test('preview includes the same chain-yield rate used for collection', () => {
    const base = prestigeReadyState();
    const ready: GameState = {
      ...base,
      prestige: { ...base.prestige, skills: { chain_yield: 3 } },
    };
    const preview = getPrestigePreview(ready, NOW);
    const result = prestigeFarm(ready, 'plains', NOW)!;

    expect(preview.baseChainGoldPerHour).toBe(result.chainFarm.goldPerHour);
    expect(preview.effectiveChainGoldPerHour).toBe(getChainIncome(result.state, NOW).totalGoldPerHour);
    expect(preview.effectiveChainGoldPerHour).toBeGreaterThan(preview.baseChainGoldPerHour);
  });
});

describe('region and skill modifiers', () => {
  test('region scaling inflates sell and cost equally (ROI preserved)', () => {
    const base = createInitialState();
    const region1: GameState = {
      ...base,
      prestige: { ...base.prestige, level: 1, currentRegionArchetype: 'plains' },
    };

    const baseMods = getGlobalModifiers(base, NOW);
    const regionMods = getGlobalModifiers(region1, NOW);
    expect(regionMods.profitMultiplier).toBeCloseTo(baseMods.profitMultiplier * balance.regions.scalePerLevel);
    expect(regionMods.cropCostMultiplier).toBeCloseTo(balance.regions.scalePerLevel);
    expect(getCropPurchaseCost(region1, 'carrot', NOW)).toBe(CROPS.carrot!.cost * balance.regions.scalePerLevel);
  });

  test('archetypes trade growth time against sale price', () => {
    const base = createInitialState();
    const tundra: GameState = { ...base, prestige: { ...base.prestige, currentRegionArchetype: 'tundra' } };
    const archetype = REGION_ARCHETYPES.find((candidate) => candidate.key === 'tundra')!;

    const mods = getGlobalModifiers(tundra, NOW);
    expect(mods.profitMultiplier).toBeCloseTo(archetype.sellMult);
    expect(mods.speedMultiplier).toBeCloseTo(1 / archetype.growTimeMult);
  });

  test('global skills feed the shared modifier stack', () => {
    const base = createInitialState();
    const skilled: GameState = {
      ...base,
      prestige: { ...base.prestige, skills: { global_profit: 3, global_speed: 2 } },
    };

    const mods = getGlobalModifiers(skilled, NOW);
    expect(mods.profitMultiplier).toBeCloseTo(1 + getSkillEffect(skilled, 'global_profit'));
    expect(mods.speedMultiplier).toBeCloseTo(1 + getSkillEffect(skilled, 'global_speed'));
  });

  test('repeatable RP studies feed global profit and growth modifiers', () => {
    const base = createInitialState();
    const researched: GameState = {
      ...base,
      research: {
        ...base.research,
        nodeLevels: { market_studies: 2, growth_studies: 3 },
        unlockedNodes: ['market_studies', 'growth_studies'],
      },
    };

    const mods = getGlobalModifiers(researched, NOW);
    expect(mods.profitMultiplier).toBeCloseTo(1.06);
    expect(mods.speedMultiplier).toBeCloseTo(1.06);
  });

  test('skill purchases respect star balance, cost growth, and max level', () => {
    const skill = PRESTIGE_SKILLS.find((candidate) => candidate.key === 'global_profit')!;
    const base = createInitialState();
    const rich: GameState = { ...base, prestige: { ...base.prestige, stars: 1000 } };

    expect(getSkillCost(rich, 'global_profit')).toBe(skill.baseCost);
    const bought = buySkill(rich, 'global_profit')!;
    expect(bought.prestige.skills.global_profit).toBe(1);
    expect(bought.prestige.stars).toBe(1000 - skill.baseCost);
    expect(getSkillCost(bought, 'global_profit')).toBe(Math.floor(skill.baseCost * skill.costGrowth));

    const maxed: GameState = {
      ...base,
      prestige: { ...base.prestige, stars: 1000, skills: { global_profit: skill.maxLevel } },
    };
    expect(getSkillCost(maxed, 'global_profit')).toBeNull();
    expect(buySkill(maxed, 'global_profit')).toBeNull();

    const broke: GameState = { ...base, prestige: { ...base.prestige, stars: 0 } };
    expect(buySkill(broke, 'global_profit')).toBeNull();
  });
});

describe('chain income', () => {
  function withChainFarm(goldPerHour: number, lastCollectedAt: number): GameState {
    const base = createInitialState();
    return {
      ...base,
      chainFarms: [{ id: 0, archetype: 'plains', goldPerHour, lastCollectedAt }],
    };
  }

  test('accrues by elapsed time and stops at the offline cap', () => {
    const state = withChainFarm(3600, NOW - 2 * MS_PER_HOUR);
    expect(getChainIncome(state, NOW).accruedGold).toBe(7200);

    const longOffline = withChainFarm(3600, NOW - 100 * MS_PER_HOUR);
    expect(getChainIncome(longOffline, NOW).accruedGold).toBe((3600 * CHAIN_OFFLINE_CAP_MS) / MS_PER_HOUR);
  });

  test('offline cap and yield skills extend chain income', () => {
    const base = withChainFarm(3600, NOW - 100 * MS_PER_HOUR);
    const skilled: GameState = {
      ...base,
      prestige: { ...base.prestige, skills: { offline_cap: 1, chain_yield: 1 } },
    };

    expect(getOfflineCapMs(skilled)).toBe(CHAIN_OFFLINE_CAP_MS + getSkillEffect(skilled, 'offline_cap'));
    const yieldMult = 1 + getSkillEffect(skilled, 'chain_yield');
    expect(getChainIncome(skilled, NOW).accruedGold).toBe(
      Math.floor((3600 * yieldMult * getOfflineCapMs(skilled)) / MS_PER_HOUR)
    );
  });

  test('collecting pays gold once and resets the clock', () => {
    const state = withChainFarm(3600, NOW - MS_PER_HOUR);
    const collected = collectChainIncome(state, NOW)!;

    expect(collected.collectedGold).toBe(3600);
    expect(collected.state.gold).toBe(state.gold + 3600);
    expect(collected.state.lifetimeStats.totalGoldEarned).toBe(3600);
    expect(collected.state.chainFarms[0]!.lastCollectedAt).toBe(NOW);
    expect(collectChainIncome(collected.state, NOW)).toBeNull();
  });
});

describe('prestige save migration', () => {
  test('normalizes skills, archetype, and chain farms defensively', () => {
    const progress = normalizePrestigeProgress({
      level: 2.9,
      stars: -1,
      totalStarsEarned: 1,
      skills: { global_profit: 999, ghost_skill: 3, global_speed: -1 },
      currentRegionArchetype: 'ghost_region',
    });
    const profitSkill = PRESTIGE_SKILLS.find((candidate) => candidate.key === 'global_profit')!;

    expect(progress.level).toBe(2);
    expect(progress.stars).toBe(0);
    expect(progress.skills).toEqual({ global_profit: profitSkill.maxLevel });
    expect(progress.currentRegionArchetype).toBe(REGION_ARCHETYPES[0]!.key);

    const farms = normalizeChainFarms(
      [
        { id: 0, archetype: 'tundra', goldPerHour: 100.9, lastCollectedAt: NOW + 999999 },
        { id: 'x', archetype: 'ghost', goldPerHour: Number.NaN, lastCollectedAt: 'bad' },
        'garbage',
      ],
      NOW
    );
    expect(farms).toEqual([
      { id: 0, archetype: 'tundra', goldPerHour: 100, lastCollectedAt: NOW },
      { id: 0, archetype: REGION_ARCHETYPES[0]!.key, goldPerHour: 0, lastCollectedAt: NOW },
    ]);
  });

  test('migration is idempotent for prestige fields', () => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    try {
      const once = migrateLoadedState(
        {
          prestige: {
            level: 1,
            stars: 4,
            totalStarsEarned: 7,
            skills: { chain_yield: 2 },
            currentRegionArchetype: 'desert',
          },
          chainFarms: [{ id: 0, archetype: 'plains', goldPerHour: 500, lastCollectedAt: NOW - 1000 }],
        },
        createInitialState()
      );
      const twice = migrateLoadedState(once, createInitialState());

      expect(twice.prestige).toEqual(once.prestige);
      expect(twice.chainFarms).toEqual(once.chainFarms);
    } finally {
      jest.restoreAllMocks();
    }
  });

  test('hybrid mastery thresholds exist for prestige-scale crops', () => {
    // Guard: every crop tier present in balance has mastery thresholds, so
    // region scaling can never surface a crop without mastery data.
    const tiers = new Set(balance.crops.map((crop) => crop.tier));
    for (const tier of tiers) {
      expect(
        balance.mastery.thresholdsByTier[String(tier) as keyof typeof balance.mastery.thresholdsByTier]
      ).toBeDefined();
    }
  });
});

describe('modifier-aware productivity', () => {
  test('reflects mastery and region multipliers in the estimate', () => {
    const base = createInitialState();
    const productivity = getFarmHourlyProductivity(base, NOW);
    expect(productivity.bestCropKey).not.toBeNull();
    expect(productivity.netProfitPerHour).toBeGreaterThan(0);

    const carrotKeys = Object.keys(CROPS) as CropKey[];
    expect(carrotKeys.length).toBeGreaterThan(0);

    const region1: GameState = { ...base, prestige: { ...base.prestige, level: 1 } };
    const scaled = getFarmHourlyProductivity(region1, NOW);
    // Sell and cost inflate together, so profit-per-hour scales with the region.
    expect(scaled.netProfitPerHour).toBeGreaterThan(productivity.netProfitPerHour);
  });
});
