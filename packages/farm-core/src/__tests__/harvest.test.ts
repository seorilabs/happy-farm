/// <reference types="jest" />

import { CROPS, createInitialState, getGrowthAdSkipMs } from '../constants';
import { getCropPurchaseCost } from '../modifiers';
import {
  applyGrowthAdSkip,
  getPlantAllPreview,
  getPlotRemainingGrowthMs,
  getReadyPlotCount,
  performHarvest,
  performHarvestAll,
  performHarvestAndReplant,
  performPlantAll,
} from '../harvest';
import type { CropKey, GameState, PlotState } from '../types';

// A crop whose area is NOT unlocked at game start — used to exercise the
// "unplantable crop" guards in plant-all helpers.
const LOCKED_AREA_CROP: CropKey = (Object.keys(CROPS) as CropKey[]).find(
  (key) => CROPS[key]!.area !== 'starter_field'
)!;

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

describe('getPlantAllPreview', () => {
  const NOW = 10_000;

  test('counts empty unlocked plots and clamps the affordable count to gold', () => {
    const base = createInitialState(); // gold 50, 6 empty unlocked plots
    const cost = getCropPurchaseCost(base, 'carrot', NOW);
    const preview = getPlantAllPreview(base, 'carrot', NOW);

    expect(preview.emptyPlotCount).toBe(base.unlockedPlotCount);
    const affordable = Math.floor(base.gold / cost);
    expect(preview.plantableCount).toBe(Math.min(base.unlockedPlotCount, affordable));
    expect(preview.totalCost).toBe(preview.plantableCount * cost);
    // Sanity: 6 empty plots but only 5 affordable at 50 gold / 10 cost.
    expect(preview.plantableCount).toBeLessThan(preview.emptyPlotCount);
  });

  test('plantableCount equals empty plots when gold is plentiful', () => {
    const base = { ...createInitialState(), gold: 1_000_000 };
    const preview = getPlantAllPreview(base, 'carrot', NOW);
    expect(preview.plantableCount).toBe(base.unlockedPlotCount);
    expect(preview.emptyPlotCount).toBe(base.unlockedPlotCount);
  });

  test('returns zeros for a crop whose area is not unlocked (still counts empty plots)', () => {
    const base = { ...createInitialState(), gold: 1_000_000 };
    const preview = getPlantAllPreview(base, LOCKED_AREA_CROP, NOW);
    expect(preview.plantableCount).toBe(0);
    expect(preview.totalCost).toBe(0);
    expect(preview.emptyPlotCount).toBe(base.unlockedPlotCount);
  });
});

describe('performPlantAll', () => {
  const NOW = 10_000;

  test('plants every empty unlocked plot when gold suffices and deducts exact cost', () => {
    const base = { ...createInitialState(), gold: 1_000_000 };
    const cost = getCropPurchaseCost(base, 'carrot', NOW);
    const result = performPlantAll(base, 'carrot', NOW);

    expect(result.plantedCount).toBe(base.unlockedPlotCount);
    expect(result.state.gold).toBe(base.gold - base.unlockedPlotCount * cost);
    for (let id = 0; id < base.unlockedPlotCount; id += 1) {
      const plot = result.state.plots.find((p) => p.id === id)!;
      expect(plot.state).toBe(1);
      expect(plot.cropType).toBe('carrot');
      expect(plot.startTime).toBe(NOW);
    }
  });

  test('plants only as many as gold allows and never goes negative', () => {
    const base = createInitialState(); // gold 50
    const cost = getCropPurchaseCost(base, 'carrot', NOW);
    const affordable = Math.floor(base.gold / cost);
    const result = performPlantAll(base, 'carrot', NOW);

    expect(result.plantedCount).toBe(affordable);
    expect(result.state.gold).toBe(base.gold - affordable * cost);
    expect(result.state.gold).toBeGreaterThanOrEqual(0);
    // At least one empty plot remains unplanted because gold ran out.
    const stillEmpty = result.state.plots.filter(
      (p) => p.id < base.unlockedPlotCount && p.state === 0
    ).length;
    expect(stillEmpty).toBe(base.unlockedPlotCount - affordable);
  });

  test('skips locked plots and plots that are not empty', () => {
    const base = { ...createInitialState(), gold: 1_000_000 };
    const lockedId = base.unlockedPlotCount; // first locked plot
    const seeded: GameState = {
      ...base,
      plots: base.plots.map((plot) => {
        if (plot.id === 0) return { ...plot, cropType: 'carrot', startTime: 0, state: 1 as PlotState };
        if (plot.id === 1) return { ...plot, cropType: 'carrot', startTime: 0, state: 2 as PlotState };
        return plot;
      }),
    };
    const result = performPlantAll(seeded, 'carrot', NOW);

    // Only the 4 empty unlocked plots (ids 2..5) get sown.
    expect(result.plantedCount).toBe(base.unlockedPlotCount - 2);
    // Growing/ripe plots are untouched.
    expect(result.state.plots.find((p) => p.id === 0)!.state).toBe(1);
    expect(result.state.plots.find((p) => p.id === 1)!.state).toBe(2);
    // Locked plot stays empty even though it is idle.
    const lockedPlot = result.state.plots.find((p) => p.id === lockedId)!;
    expect(lockedPlot.state).toBe(0);
    expect(lockedPlot.cropType).toBeNull();
  });

  test('unplantable crop plants nothing and leaves state unchanged', () => {
    const base = { ...createInitialState(), gold: 1_000_000 };
    const result = performPlantAll(base, LOCKED_AREA_CROP, NOW);
    expect(result.plantedCount).toBe(0);
    expect(result.state).toBe(base);
  });
});

describe('performHarvestAndReplant (#252)', () => {
  const NOW = 10_000;
  const allPlotIndices = (state: GameState) => Array.from({ length: state.unlockedPlotCount }, (_, i) => i);

  test('harvests every ripe plot then re-sows them with the crop (enough gold)', () => {
    const base = { ...createInitialState(), gold: 1_000_000 };
    const ripe = withRipePlots(base, allPlotIndices(base), 'carrot');

    const result = performHarvestAndReplant(ripe, 'carrot', { now: NOW, rng: noMutationRng });

    expect(result.harvest.harvestedCount).toBe(base.unlockedPlotCount);
    expect(result.plantedCount).toBe(base.unlockedPlotCount);
    // 방금 수확한 밭이 같은 작물로 다시 심겨 성장 중(state 1)이다.
    for (const i of allPlotIndices(base)) {
      const plot = result.state.plots.find((p) => p.id === i)!;
      expect(plot.state).toBe(1);
      expect(plot.cropType).toBe('carrot');
    }
  });

  test('nothing ripe is a no-op — never plants on its own (distinct from Plant All)', () => {
    // 빈 밭만 있는 상태: 수확할 게 없으면 재심기도 하지 않는다.
    const base = { ...createInitialState(), gold: 1_000_000 };
    const result = performHarvestAndReplant(base, 'carrot', { now: NOW, rng: noMutationRng });
    expect(result.harvest.harvestedCount).toBe(0);
    expect(result.plantedCount).toBe(0);
    expect(result.state).toBe(base);
    // 빈 밭이 심기지 않고 그대로다.
    expect(result.state.plots.every((p) => p.state === 0)).toBe(true);
  });

  test('gold-limited: replants only the affordable count; freed-but-unplanted plots stay empty', () => {
    // 값싼 carrot을 수확해(적은 수입) 비싼 onion으로 재심기 → 예산이 모자라 일부만.
    const base = { ...createInitialState(), gold: 0 };
    const ripe = withRipePlots(base, allPlotIndices(base), 'carrot');

    const result = performHarvestAndReplant(ripe, 'onion', { now: NOW, rng: noMutationRng });

    // 부분 성공: 심은 수 < 수확한 수.
    expect(result.harvest.harvestedCount).toBe(base.unlockedPlotCount);
    expect(result.plantedCount).toBeLessThan(result.harvest.harvestedCount);
    // 심은 수는 정확히 수확 후 상태의 '지불 가능 수량'과 일치한다(골드 제한 불변식).
    expect(result.plantedCount).toBe(getPlantAllPreview(result.harvest.state, 'onion', NOW).plantableCount);
    // 재심되지 못한 밭은 빈 채로 남는다(state 0).
    const emptyAfter = result.state.plots.filter((p) => p.id < base.unlockedPlotCount && p.state === 0).length;
    expect(emptyAfter).toBe(base.unlockedPlotCount - result.plantedCount);
  });

  test('unplantable replant crop still harvests; plants nothing', () => {
    const base = { ...createInitialState(), gold: 1_000_000 };
    const ripe = withRipePlots(base, allPlotIndices(base), 'carrot');

    const result = performHarvestAndReplant(ripe, LOCKED_AREA_CROP, { now: NOW, rng: noMutationRng });

    expect(result.harvest.harvestedCount).toBe(base.unlockedPlotCount);
    expect(result.plantedCount).toBe(0);
    // 수확은 됐고(밭이 비었고), 미해금 작물이라 재심기는 안 됐다.
    expect(result.state.plots.every((p) => p.id >= base.unlockedPlotCount || p.state === 0)).toBe(true);
  });

  test('replant reuses the same rolls as harvest-all (deterministic outcomes)', () => {
    const base = { ...createInitialState(), gold: 1_000_000 };
    const ripe = withRipePlots(base, allPlotIndices(base), 'carrot');
    const rollFor = () => 0.999999; // 변이 없음
    const a = performHarvestAndReplant(ripe, 'carrot', { now: NOW, rollFor });
    const b = performHarvestAndReplant(ripe, 'carrot', { now: NOW, rollFor });
    expect(a.state).toEqual(b.state);
    expect(a.harvest.totalGoldGained).toBe(b.harvest.totalGoldGained);
  });
});
