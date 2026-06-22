/// <reference types="jest" />

import { createInitialState, getGrowthAdSkipMs } from '../constants';
import {
  applyGrowthAdSkip,
  getPlotRemainingGrowthMs,
  getReadyPlotCount,
  performHarvest,
  performHarvestAll,
} from '../harvest';
import type { CropKey, GameState, PlotState } from '../types';

// Force a plot into the actively-growing state (state 1) with the given crop and
// start time, so the growth-skip helper can run without real grow timers.
function withGrowingPlot(
  state: GameState,
  index: number,
  cropKey: CropKey,
  startTime: number
): GameState {
  const plots = state.plots.map((plot) =>
    plot.id === index ? { ...plot, cropType: cropKey, startTime, state: 1 as PlotState } : plot
  );
  return { ...state, plots };
}

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

  test('flags the lifetime-first harvest exactly once across batches', () => {
    const ripe = withRipePlots(createInitialState(), [0, 1, 2]);
    const first = performHarvestAll(ripe, { now: 0, rng: noMutationRng });

    // A fresh save surfaces the first-harvest "aha" signal on a single outcome,
    // so the batch (Harvest All) path can fire the celebration just like a tap.
    const flagged = first.harvests.filter(({ outcome }) => outcome.isFirstMeaningfulHarvest);
    expect(flagged).toHaveLength(1);

    // Once any crop has been harvested it never fires again, keeping it one-shot.
    const moreRipe = withRipePlots(first.state, [0, 1]);
    const second = performHarvestAll(moreRipe, { now: 0, rng: noMutationRng });
    expect(second.harvests.some(({ outcome }) => outcome.isFirstMeaningfulHarvest)).toBe(false);
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

describe('applyGrowthAdSkip', () => {
  const NOW = 10_000;

  test('fully completes a near-ready crop (remaining within the flat floor)', () => {
    // Carrot grows in 2s, well under the flat skip floor, so one ad finishes it.
    const growing = withGrowingPlot(createInitialState(), 0, 'carrot', NOW);
    const remaining = getPlotRemainingGrowthMs(growing, growing.plots[0]!, NOW);
    expect(getGrowthAdSkipMs(remaining)).toBe(remaining);

    const result = applyGrowthAdSkip(growing, 0, NOW);
    expect(result.completed).toBe(true);
    expect(result.skippedMs).toBe(remaining);
    expect(result.state.plots[0]?.state).toBe(2);
  });

  test('partially skips a long crop and keeps it growing', () => {
    // Cactus grows in 1h; the tier removes a 25% share, leaving it still growing.
    const growing = withGrowingPlot(createInitialState(), 0, 'cactus', NOW);
    const before = getPlotRemainingGrowthMs(growing, growing.plots[0]!, NOW);
    const expectedSkip = getGrowthAdSkipMs(before);
    expect(expectedSkip).toBeGreaterThan(0);
    expect(expectedSkip).toBeLessThan(before);

    const result = applyGrowthAdSkip(growing, 0, NOW);
    expect(result.completed).toBe(false);
    expect(result.skippedMs).toBe(expectedSkip);
    expect(result.state.plots[0]?.state).toBe(1);

    // The countdown jumps forward by (about) the skipped amount, no more.
    const after = getPlotRemainingGrowthMs(result.state, result.state.plots[0]!, NOW);
    expect(Math.abs(after - (before - expectedSkip))).toBeLessThanOrEqual(2);
  });

  test('is a no-op on a plot that is not actively growing', () => {
    const base = createInitialState();
    const result = applyGrowthAdSkip(base, 0, NOW);
    expect(result.skippedMs).toBe(0);
    expect(result.completed).toBe(false);
    expect(result.state).toBe(base);
  });
});
