/// <reference types="jest" />

import balance from '../balance.json';
import { CROPS, createInitialState, migrateLoadedState } from '../constants';
import { performHarvest, performHarvestAll } from '../harvest';
import {
  MASTERY_RANKS,
  MUTATION_KINDS,
  getHarvestedCropKeysInSync,
  getMasteryStatus,
  getMasterySellMultiplier,
  getMasterySpeedMultiplier,
  getMasteryThresholds,
  getMutationChance,
  getMutationCollectionSummary,
  getMutationDiscoveryPityStatus,
  normalizeHarvestCounts,
  normalizeMutationsDiscovered,
  rollMutation,
} from '../mastery';
import type { CropKey, GameState } from '../types';

function stateWithCounts(counts: Partial<Record<CropKey, number>>): GameState {
  return { ...createInitialState(), harvestCounts: counts };
}

function getRank(key: string) {
  const rank = MASTERY_RANKS.find((candidate) => candidate.key === key);
  if (rank == null) {
    throw new Error(`Mastery balance must include the ${key} rank.`);
  }
  return rank;
}

function getMutationKind(key: string) {
  const kind = MUTATION_KINDS.find((candidate) => candidate.key === key);
  if (kind == null) {
    throw new Error(`Mutation balance must include the ${key} kind.`);
  }
  return kind;
}

describe('mastery balance invariants', () => {
  test('every crop tier has strictly increasing thresholds for every rank', () => {
    const tiers = new Set(balance.crops.map((crop) => crop.tier));
    for (const tier of tiers) {
      const thresholds = balance.mastery.thresholdsByTier[
        String(tier) as keyof typeof balance.mastery.thresholdsByTier
      ];
      expect(thresholds).toBeDefined();
      expect(thresholds).toHaveLength(MASTERY_RANKS.length);
      expect(thresholds.every((threshold) => threshold > 0)).toBe(true);
      expect([...thresholds].sort((a, b) => a - b)).toEqual(thresholds);
    }
  });

  test('rank bonuses grow with rank', () => {
    const sellBonuses = MASTERY_RANKS.map((rank) => rank.sellBonus);
    expect([...sellBonuses].sort((a, b) => a - b)).toEqual(sellBonuses);
  });

  test('configured first-discovery ceilings are positive whole harvest counts', () => {
    const configured = MUTATION_KINDS.filter((kind) => kind.firstDiscoveryPityHarvests != null);
    expect(configured.map((kind) => kind.key)).toEqual(['prism']);
    expect(configured[0]!.firstDiscoveryPityHarvests).toBe(240);
  });
});

describe('mastery status', () => {
  test('rank thresholds are inclusive boundaries', () => {
    const thresholds = getMasteryThresholds('carrot');
    const firstThreshold = thresholds[0]!;

    const below = getMasteryStatus(stateWithCounts({ carrot: firstThreshold - 1 }), 'carrot');
    expect(below.rank).toBeNull();
    expect(below.nextThreshold).toBe(firstThreshold);

    const exact = getMasteryStatus(stateWithCounts({ carrot: firstThreshold }), 'carrot');
    expect(exact.rank?.key).toBe('bronze');
    expect(exact.nextThreshold).toBe(thresholds[1]);
  });

  test('top rank reports full progress and no next threshold', () => {
    const thresholds = getMasteryThresholds('carrot');
    const status = getMasteryStatus(stateWithCounts({ carrot: thresholds[thresholds.length - 1]! }), 'carrot');

    expect(status.rank?.key).toBe(MASTERY_RANKS[MASTERY_RANKS.length - 1]?.key);
    expect(status.nextThreshold).toBeNull();
    expect(status.progressRatio).toBe(1);
  });

  test('mastery multiplies sell and speed per crop only', () => {
    const thresholds = getMasteryThresholds('carrot');
    const state = stateWithCounts({ carrot: thresholds[1]! });
    const silver = getRank('silver');

    expect(getMasterySellMultiplier(state, 'carrot')).toBeCloseTo(1 + silver.sellBonus);
    expect(getMasterySpeedMultiplier(state, 'carrot')).toBeCloseTo(1 + silver.speedBonus);
    expect(getMasterySellMultiplier(state, 'wheat')).toBe(1);
  });
});

describe('mutations', () => {
  test('mutations stay locked below their minimum mastery rank', () => {
    const golden = getMutationKind('golden');
    const noRankState = stateWithCounts({});

    expect(getMutationChance(noRankState, 'carrot', golden)).toBe(0);
    expect(rollMutation(noRankState, 'carrot', 0)).toBeNull();
  });

  test('mutation chance grows per rank above the minimum', () => {
    const golden = getMutationKind('golden');
    const thresholds = getMasteryThresholds('carrot');

    const bronzeState = stateWithCounts({ carrot: thresholds[0]! });
    const prismState = stateWithCounts({ carrot: thresholds[3]! });

    expect(getMutationChance(bronzeState, 'carrot', golden)).toBeCloseTo(golden.baseChance);
    expect(getMutationChance(prismState, 'carrot', golden)).toBeCloseTo(
      golden.baseChance + golden.chancePerRankAboveMin * 3
    );
  });

  test('mutation studies multiply the chance of already unlocked mutations', () => {
    const golden = getMutationKind('golden');
    const thresholds = getMasteryThresholds('carrot');
    const base = stateWithCounts({ carrot: thresholds[0]! });
    const researched: GameState = {
      ...base,
      research: {
        ...base.research,
        nodeLevels: { mutation_studies: 2 },
        unlockedNodes: ['mutation_studies'],
      },
    };

    expect(getMutationChance(researched, 'carrot', golden)).toBeCloseTo(golden.baseChance * 1.1);
  });

  test('a single roll resolves rarest mutation first', () => {
    const thresholds = getMasteryThresholds('carrot');
    const silverState = stateWithCounts({ carrot: thresholds[1]! });
    const rainbow = getMutationKind('rainbow');

    expect(rollMutation(silverState, 'carrot', 0)?.key).toBe('rainbow');
    expect(rollMutation(silverState, 'carrot', getMutationChance(silverState, 'carrot', rainbow) + 1e-9)?.key).toBe(
      'golden'
    );
    expect(rollMutation(silverState, 'carrot', 0.999)).toBeNull();
  });

  test('gold-gated giant mutation stays locked until the gold rank', () => {
    const giant = getMutationKind('giant');
    const thresholds = getMasteryThresholds('carrot');

    // thresholds: [0]=bronze, [1]=silver, [2]=gold, [3]=prism.
    const silverState = stateWithCounts({ carrot: thresholds[1]! });
    const goldState = stateWithCounts({ carrot: thresholds[2]! });
    const prismState = stateWithCounts({ carrot: thresholds[3]! });

    // 실버 이하에선 발견 불가(확률 0).
    expect(getMutationChance(silverState, 'carrot', giant)).toBe(0);
    // 골드에서 baseChance로 열리고, 상위 랭크(프리즘)에서 랭크당 가산이 붙는다.
    expect(getMutationChance(goldState, 'carrot', giant)).toBeCloseTo(giant.baseChance);
    expect(getMutationChance(prismState, 'carrot', giant)).toBeCloseTo(
      giant.baseChance + giant.chancePerRankAboveMin * 1
    );
  });

  test('prism-gated prism mutation only appears at the prism rank', () => {
    const prism = getMutationKind('prism');
    const thresholds = getMasteryThresholds('carrot');

    const goldState = stateWithCounts({ carrot: thresholds[2]! });
    const prismState = stateWithCounts({ carrot: thresholds[3]! });

    // 최상위 랭크 미만에선 확률 0.
    expect(getMutationChance(goldState, 'carrot', prism)).toBe(0);
    // 프리즘 랭크에서 baseChance로 열린다(위 랭크가 없어 가산은 항상 0).
    expect(getMutationChance(prismState, 'carrot', prism)).toBeCloseTo(prism.baseChance);
  });

  test('prism first-discovery protection exposes progress and guarantees the final eligible harvest (#464)', () => {
    const prism = getMutationKind('prism');
    const prismRankIndex = MASTERY_RANKS.findIndex((rank) => rank.key === 'prism');
    const unlockThreshold = getMasteryThresholds('starfruit')[prismRankIndex]!;
    const target = prism.firstDiscoveryPityHarvests!;

    const locked = stateWithCounts({ starfruit: unlockThreshold - 1 });
    expect(getMutationDiscoveryPityStatus(locked, 'starfruit', prism)).toBeNull();

    const justUnlocked = stateWithCounts({ starfruit: unlockThreshold });
    expect(getMutationDiscoveryPityStatus(justUnlocked, 'starfruit', prism)).toEqual({
      mutationKey: 'prism',
      targetHarvests: target,
      eligibleHarvests: 0,
      remainingHarvests: target,
    });

    const beforeCeiling = stateWithCounts({ starfruit: unlockThreshold + target - 2 });
    expect(getMutationDiscoveryPityStatus(beforeCeiling, 'starfruit', prism)?.remainingHarvests).toBe(2);
    expect(rollMutation(beforeCeiling, 'starfruit', 0.999)).toBeNull();

    const atCeiling = stateWithCounts({ starfruit: unlockThreshold + target - 1 });
    expect(getMutationDiscoveryPityStatus(atCeiling, 'starfruit', prism)?.remainingHarvests).toBe(1);
    expect(rollMutation(atCeiling, 'starfruit', 0.999)?.key).toBe('prism');

    const legacyPastCeiling = stateWithCounts({ starfruit: unlockThreshold + target + 500 });
    expect(getMutationDiscoveryPityStatus(legacyPastCeiling, 'starfruit', prism)?.remainingHarvests).toBe(1);
    expect(rollMutation(legacyPastCeiling, 'starfruit', 0.999)?.key).toBe('prism');

    const discovered: GameState = {
      ...legacyPastCeiling,
      mutationsDiscovered: { starfruit: ['prism'] },
    };
    expect(getMutationDiscoveryPityStatus(discovered, 'starfruit', prism)).toBeNull();
    expect(rollMutation(discovered, 'starfruit', 0.999)).toBeNull();
  });
});

describe('performHarvest with mastery and mutations', () => {
  function readyCarrotState(counts: Partial<Record<CropKey, number>>): GameState {
    const base = createInitialState();
    return {
      ...base,
      harvestedCropKeys: Object.keys(counts) as CropKey[],
      harvestCounts: counts,
      plots: base.plots.map((plot, index) =>
        index === 0 ? { ...plot, cropType: 'carrot' as const, startTime: 0, state: 2 as const } : plot
      ),
    };
  }

  test('applies the mastery sell bonus to the final price', () => {
    const thresholds = getMasteryThresholds('carrot');
    const state = readyCarrotState({ carrot: thresholds[0]! });
    const bronze = getRank('bronze');

    const outcome = performHarvest(state, 0, { now: 1000, rng: () => 0.999 });
    expect(outcome).not.toBeNull();
    expect(outcome!.goldGained).toBe(Math.floor(CROPS.carrot!.sell * (1 + bronze.sellBonus)));
    expect(outcome!.mutation).toBeNull();
  });

  test('increments the harvest counter and reports rank-ups exactly at thresholds', () => {
    const thresholds = getMasteryThresholds('carrot');
    const state = readyCarrotState({ carrot: thresholds[0]! - 1 });

    const outcome = performHarvest(state, 0, { now: 1000, rng: () => 0.999 });
    expect(outcome!.state.harvestCounts.carrot).toBe(thresholds[0]);
    expect(outcome!.newMasteryRank?.key).toBe('bronze');

    const again = performHarvest(
      { ...outcome!.state, plots: state.plots },
      0,
      { now: 2000, rng: () => 0.999 }
    );
    expect(again!.newMasteryRank).toBeNull();
  });

  test('a mutation multiplies the price and records a one-time discovery', () => {
    const thresholds = getMasteryThresholds('carrot');
    const state = readyCarrotState({ carrot: thresholds[0]! });
    const golden = getMutationKind('golden');
    const bronze = getRank('bronze');

    const outcome = performHarvest(state, 0, { now: 1000, rng: () => 0 });
    expect(outcome!.mutation?.key).toBe('golden');
    expect(outcome!.isNewMutationDiscovery).toBe(true);
    expect(outcome!.goldGained).toBe(Math.floor(CROPS.carrot!.sell * (1 + bronze.sellBonus) * golden.sellMultiplier));
    expect(outcome!.state.mutationsDiscovered.carrot).toEqual(['golden']);

    const repeat = performHarvest({ ...outcome!.state, plots: state.plots }, 0, { now: 2000, rng: () => 0 });
    expect(repeat!.mutation?.key).toBe('golden');
    expect(repeat!.isNewMutationDiscovery).toBe(false);
  });

  test('a batch consumes prism first-discovery protection once and preserves plot order (#464)', () => {
    const prism = getMutationKind('prism');
    const prismRankIndex = MASTERY_RANKS.findIndex((rank) => rank.key === 'prism');
    const unlockThreshold = getMasteryThresholds('starfruit')[prismRankIndex]!;
    const base = createInitialState();
    const state: GameState = {
      ...base,
      harvestedCropKeys: ['starfruit'],
      harvestCounts: { starfruit: unlockThreshold + prism.firstDiscoveryPityHarvests! - 1 },
      plots: base.plots.map((plot, index) =>
        index < 2 ? { ...plot, cropType: 'starfruit' as const, startTime: 0, state: 2 as const } : plot
      ),
    };

    const result = performHarvestAll(state, { now: 1000, rng: () => 0.999 });

    expect(result.harvests).toHaveLength(2);
    expect(result.harvests[0]!.outcome.mutation?.key).toBe('prism');
    expect(result.harvests[0]!.outcome.mutationPityTriggered).toBe(true);
    expect(result.harvests[0]!.outcome.isNewMutationDiscovery).toBe(true);
    expect(result.harvests[1]!.outcome.mutation).toBeNull();
    expect(result.harvests[1]!.outcome.mutationPityTriggered).toBe(false);
    expect(result.state.mutationsDiscovered.starfruit).toEqual(['prism']);
  });

  test('the same roll replays to the same outcome (updater determinism)', () => {
    const thresholds = getMasteryThresholds('carrot');
    const state = readyCarrotState({ carrot: thresholds[1]! });

    const first = performHarvest(state, 0, { now: 1000, rng: () => 0.001 });
    const second = performHarvest(state, 0, { now: 1000, rng: () => 0.001 });
    expect(second).toEqual(first);
  });

  test('mutation collection summary counts discoveries across all crops', () => {
    const state: GameState = {
      ...createInitialState(),
      mutationsDiscovered: { carrot: ['golden', 'rainbow'], wheat: ['golden'] },
    };
    const summary = getMutationCollectionSummary(state);

    expect(summary.discoveredCount).toBe(3);
    // 신규 gold/prism 변이(giant/prism)까지 포함해 컬렉션 총량이 산정된다.
    expect(MUTATION_KINDS.map((kind) => kind.key)).toEqual(
      expect.arrayContaining(['golden', 'rainbow', 'giant', 'prism'])
    );
    expect(summary.totalCount).toBe(balance.crops.length * MUTATION_KINDS.length);
  });
});

describe('mastery save migration', () => {
  test('derives counts from legacy discovery lists and keeps them in sync', () => {
    const base = createInitialState();
    const migrated = migrateLoadedState(
      {
        harvestedCropKeys: ['carrot', 'wheat'],
        harvestCounts: { wheat: 25, potato: 3, ghost_crop: 7, melon: Number.NaN } as never,
      },
      base
    );

    expect(migrated.harvestCounts).toEqual({ carrot: 1, wheat: 25, potato: 3 });
    expect(migrated.harvestedCropKeys).toEqual(['carrot', 'wheat', 'potato']);
  });

  test('drops unknown mutation entries and dedupes discovered keys', () => {
    const migrated = migrateLoadedState(
      {
        mutationsDiscovered: {
          carrot: ['golden', 'golden', 'ghost_mutation'],
          ghost_crop: ['golden'],
          wheat: 'not-an-array',
        } as never,
      },
      createInitialState()
    );

    expect(migrated.mutationsDiscovered).toEqual({ carrot: ['golden'] });
  });

  test('migration is idempotent for mastery fields', () => {
    const once = migrateLoadedState(
      { harvestedCropKeys: ['carrot'], harvestCounts: { wheat: 4 } },
      createInitialState()
    );
    const twice = migrateLoadedState(once, createInitialState());

    expect(twice.harvestCounts).toEqual(once.harvestCounts);
    expect(twice.harvestedCropKeys).toEqual(once.harvestedCropKeys);
    expect(twice.mutationsDiscovered).toEqual(once.mutationsDiscovered);
  });

  test('normalizers reject garbage payloads outright', () => {
    expect(normalizeHarvestCounts('garbage', [])).toEqual({});
    expect(normalizeHarvestCounts({ carrot: -5 }, [])).toEqual({});
    expect(normalizeMutationsDiscovered(42)).toEqual({});
    expect(getHarvestedCropKeysInSync(['carrot'], { carrot: 2 })).toEqual(['carrot']);
  });
});
