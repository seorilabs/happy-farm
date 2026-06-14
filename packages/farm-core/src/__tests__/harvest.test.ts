/// <reference types="jest" />

import { createInitialState } from '../constants';
import { getReadyPlotCount, performHarvest, performHarvestAll } from '../harvest';
import type { CropKey, GameState, PlotState } from '../types';

const STARTER_CROP: CropKey = 'carrot';

// Force the given plots ripe (state 2) so harvest helpers can run without
// waiting on real grow timers.
function withRipePlots(state: GameState, indices: number[], cropKey: CropKey = STARTER_CROP): GameState {
  const plots = state.plots.map((plot) =>
    indices.includes(plot.id)
      ? { ...plot, cropType: cropKey, startTime: 0, state: 2 as PlotState }
      : plot
  );
  return { ...state, plots };
}

// Deterministic rng that never triggers a mutation, so gold totals are stable.
const noMutationRng = () => 0.999999;

describe('getReadyPlotCount', () => {
  test('counts only unlocked, fully ripe plots', () => {
    const base = createInitialState();
    expect(getReadyPlotCount(base)).toBe(0);

    const ripe = withRipePlots(base, [0, 2, 4]);
    expect(getReadyPlotCount(ripe)).toBe(3);
  });

  test('ignores ripe plots beyond the unlocked plot count', () => {
    const base = createInitialState();
    // Mark a plot past the unlocked range ripe; it must not count.
    const lockedIndex = base.unlockedPlotCount;
    const ripe = withRipePlots(base, [0, lockedIndex]);
    expect(getReadyPlotCount(ripe)).toBe(1);
  });
});

describe('performHarvestAll', () => {
  test('harvests every ripe plot in one pass and clears them', () => {
    const ripe = withRipePlots(createInitialState(), [0, 1, 2]);
    const result = performHarvestAll(ripe, { now: 1000, rng: noMutationRng });

    expect(result.harvestedCount).toBe(3);
    expect(result.totalGoldGained).toBeGreaterThan(0);
    expect(result.state.gold).toBe(ripe.gold + result.totalGoldGained);
    // All harvested plots are emptied.
    for (const index of [0, 1, 2]) {
      expect(result.state.plots[index]?.state).toBe(0);
      expect(result.state.plots[index]?.cropType).toBeNull();
    }
  });

  test('matches the sum of individual harvests for the same rolls', () => {
    const ripe = withRipePlots(createInitialState(), [0, 1, 2, 3]);
    const batch = performHarvestAll(ripe, { now: 500, rng: noMutationRng });

    let sequential = ripe;
    let goldSum = 0;
    for (const index of [0, 1, 2, 3]) {
      const outcome = performHarvest(sequential, index, { now: 500, rng: noMutationRng });
      expect(outcome).not.toBeNull();
      sequential = outcome!.state;
      goldSum += outcome!.goldGained;
    }

    expect(batch.totalGoldGained).toBe(goldSum);
    expect(batch.state.gold).toBe(sequential.gold);
  });

  test('keys the mutation roll by plot index via rollFor', () => {
    const ripe = withRipePlots(createInitialState(), [0, 1, 2]);
    const seenIndices: number[] = [];
    const rollFor = (plotIndex: number) => {
      seenIndices.push(plotIndex);
      return 0.999999;
    };

    const first = performHarvestAll(ripe, { now: 0, rollFor });
    const second = performHarvestAll(ripe, { now: 0, rollFor });

    // Each ripe plot draws its roll under its own index, so the same plot always
    // gets the same value regardless of the surrounding ripe set.
    expect(seenIndices).toEqual(expect.arrayContaining([0, 1, 2]));
    expect(first.totalGoldGained).toBe(second.totalGoldGained);
    expect(first.state.gold).toBe(second.state.gold);
  });

  test('routes the whole batch into research points in donation mode', () => {
    const base = createInitialState();
    const donating: GameState = {
      ...base,
      automationSettings: { ...base.automationSettings, donationModeEnabled: true },
    };
    const ripe = withRipePlots(donating, [0, 1, 2]);
    const result = performHarvestAll(ripe, { now: 0, rng: noMutationRng });

    expect(result.harvestedCount).toBe(3);
    expect(result.totalGoldGained).toBe(0);
    expect(result.totalRpGained).toBeGreaterThan(0);
    expect(result.state.gold).toBe(ripe.gold);
  });

  test('is a no-op when nothing is ripe', () => {
    const base = createInitialState();
    const result = performHarvestAll(base, { now: 0, rng: noMutationRng });

    expect(result.harvestedCount).toBe(0);
    expect(result.totalGoldGained).toBe(0);
    expect(result.state).toBe(base);
  });

  test('skips ripe plots beyond the unlocked range', () => {
    const base = createInitialState();
    const lockedIndex = base.unlockedPlotCount;
    const ripe = withRipePlots(base, [0, lockedIndex]);
    const result = performHarvestAll(ripe, { now: 0, rng: noMutationRng });

    expect(result.harvestedCount).toBe(1);
    expect(result.state.plots[lockedIndex]?.state).toBe(2);
  });
});

describe('performHarvest — comboMultiplier', () => {
  test('defaults to no bonus when comboMultiplier is omitted', () => {
    const ripe = withRipePlots(createInitialState(), [0]);
    const base = performHarvest(ripe, 0, { now: 0, rng: noMutationRng });
    const withOne = performHarvest(ripe, 0, { now: 0, rng: noMutationRng, comboMultiplier: 1 });
    expect(base).not.toBeNull();
    expect(withOne).not.toBeNull();
    expect(base!.goldGained).toBe(withOne!.goldGained);
    expect(base!.comboMultiplier).toBe(1);
  });

  test('applies the great-tier bonus (×1.07) to gold', () => {
    const ripe = withRipePlots(createInitialState(), [0]);
    const normal = performHarvest(ripe, 0, { now: 0, rng: noMutationRng });
    const combo = performHarvest(ripe, 0, { now: 0, rng: noMutationRng, comboMultiplier: 1.07 });
    expect(normal).not.toBeNull();
    expect(combo).not.toBeNull();
    expect(combo!.goldGained).toBe(Math.floor(normal!.goldGained * 1.07));
    expect(combo!.comboMultiplier).toBe(1.07);
    expect(combo!.state.gold).toBe(ripe.gold + combo!.goldGained);
  });

  test('applies the legendary-tier bonus (×1.15) to gold', () => {
    const ripe = withRipePlots(createInitialState(), [0]);
    const normal = performHarvest(ripe, 0, { now: 0, rng: noMutationRng });
    const combo = performHarvest(ripe, 0, { now: 0, rng: noMutationRng, comboMultiplier: 1.15 });
    expect(normal).not.toBeNull();
    expect(combo).not.toBeNull();
    expect(combo!.goldGained).toBe(Math.floor(normal!.goldGained * 1.15));
    expect(combo!.state.gold).toBe(ripe.gold + combo!.goldGained);
  });

  test('combo bonus does not affect donation-mode harvests (gold stays 0)', () => {
    const base = createInitialState();
    const donating: GameState = {
      ...base,
      automationSettings: { ...base.automationSettings, donationModeEnabled: true },
    };
    const ripe = withRipePlots(donating, [0]);
    const outcome = performHarvest(ripe, 0, { now: 0, rng: noMutationRng, comboMultiplier: 1.15 });
    expect(outcome).not.toBeNull();
    expect(outcome!.goldGained).toBe(0);
    expect(outcome!.donated).toBe(true);
    expect(outcome!.rpGained).toBeGreaterThan(0);
  });

  test('donation mode records effective comboMultiplier as 1 regardless of input', () => {
    const base = createInitialState();
    const donating: GameState = {
      ...base,
      automationSettings: { ...base.automationSettings, donationModeEnabled: true },
    };
    const ripe = withRipePlots(donating, [0]);
    const outcome = performHarvest(ripe, 0, { now: 0, rng: noMutationRng, comboMultiplier: 1.15 });
    expect(outcome).not.toBeNull();
    expect(outcome!.comboMultiplier).toBe(1);
  });

  test('clamps invalid comboMultiplier values (NaN, Infinity, negative, <1, >2) to 1', () => {
    const ripe = withRipePlots(createInitialState(), [0]);
    const base = performHarvest(ripe, 0, { now: 0, rng: noMutationRng });
    expect(base).not.toBeNull();

    for (const badValue of [NaN, Infinity, -1, 0, 0.5, 2.01, 11, 1e308]) {
      const outcome = performHarvest(ripe, 0, { now: 0, rng: noMutationRng, comboMultiplier: badValue });
      expect(outcome).not.toBeNull();
      expect(outcome!.comboMultiplier).toBe(1);
      expect(outcome!.goldGained).toBe(base!.goldGained);
      expect(Number.isFinite(outcome!.state.gold)).toBe(true);
    }
  });
});
