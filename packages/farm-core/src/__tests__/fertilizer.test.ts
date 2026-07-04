/// <reference types="jest" />

import { CROPS, createInitialState, getCropEconomyEstimate } from '../constants';
import { getCropModifiers } from '../modifiers';
import { applyGrowthAdSkip, getPlotRemainingWallClockMs } from '../harvest';
import {
  FERTILIZER_COST_MULTIPLIER,
  FERTILIZER_MIN_COST,
  applyFertilizer,
  getFertilizerCost,
} from '../fertilizer';
import type { CropKey, GameState, PlotState } from '../types';

const NOW = 1_700_000_000_000;
const STARTER_CROP: CropKey = 'carrot';
const MS_PER_HOUR = 60 * 60 * 1000;

// Force plot `id` into the actively-growing state (state 1) with the given crop,
// started at `startTime`, so the fertilizer helpers run without real grow timers.
function withGrowingPlot(
  state: GameState,
  id: number,
  cropKey: CropKey,
  startTime: number
): GameState {
  const plots = state.plots.map((plot) =>
    plot.id === id ? { ...plot, cropType: cropKey, startTime, state: 1 as PlotState } : plot
  );
  return { ...state, plots };
}

// The net gold the crop would earn over the plot's remaining (wall-clock) grow
// time — the "time value" the price invariant must strictly exceed. Mirrors the
// formula getFertilizerCost derives its cost from.
function timeValueGold(state: GameState, plotId: number, now: number): number {
  const plot = state.plots.find((candidate) => candidate.id === plotId)!;
  const remainingWallClockMs = getPlotRemainingWallClockMs(state, plot, now);
  const modifiers = getCropModifiers(state, plot.cropType!, now);
  const economy = getCropEconomyEstimate(plot.cropType!, {
    speedMultiplier: modifiers.speedMultiplier,
    profitMultiplier: modifiers.profitMultiplier,
    harvestMultiplier: modifiers.harvestMultiplier,
    costMultiplier: modifiers.cropCostMultiplier,
  });
  return Math.max(0, economy.netProfitPerHour) * (remainingWallClockMs / MS_PER_HOUR);
}

describe('getFertilizerCost', () => {
  test('is deterministic for the same (state, plot, now)', () => {
    const state = withGrowingPlot(
      { ...createInitialState(), gold: 1_000_000 },
      0,
      STARTER_CROP,
      NOW
    );
    const plot = state.plots[0]!;
    const first = getFertilizerCost(state, plot, NOW);
    const second = getFertilizerCost(state, plot, NOW);
    expect(first).toBe(second);
    expect(first).toBeGreaterThan(0);
  });

  test('returns 0 for a non-growing plot (empty or already ripe)', () => {
    const base = createInitialState();
    // Empty starter plot (state 0).
    expect(getFertilizerCost(base, base.plots[0]!, NOW)).toBe(0);
    // Ripe plot (state 2).
    const ripe: GameState = {
      ...base,
      plots: base.plots.map((plot) =>
        plot.id === 0 ? { ...plot, cropType: STARTER_CROP, startTime: 0, state: 2 as PlotState } : plot
      ),
    };
    expect(getFertilizerCost(ripe, ripe.plots[0]!, NOW)).toBe(0);
  });

  test('never charges below the minimum floor', () => {
    const state = withGrowingPlot(
      { ...createInitialState(), gold: 1_000_000 },
      0,
      STARTER_CROP,
      NOW
    );
    expect(getFertilizerCost(state, state.plots[0]!, NOW)).toBeGreaterThanOrEqual(FERTILIZER_MIN_COST);
  });

  test('price invariant: cost strictly exceeds the time value of the skipped growth', () => {
    // Check across every crop so a new crop can't silently break the "no net
    // progress gain" invariant (the same one check-balance.mjs enforces on data).
    for (const cropKey of Object.keys(CROPS) as CropKey[]) {
      const crop = CROPS[cropKey]!;
      const state = withGrowingPlot(
        {
          ...createInitialState(),
          gold: 1e18,
          // Unlock every area so any crop can sit in a plot for the estimate.
          unlockedAreas: Array.from(new Set([...createInitialState().unlockedAreas, crop.area])),
        },
        0,
        cropKey,
        NOW
      );
      const cost = getFertilizerCost(state, state.plots[0]!, NOW);
      const value = timeValueGold(state, 0, NOW);
      expect(cost).toBeGreaterThan(value);
      // And the cost is exactly the ceil(value × multiplier) floored at the minimum.
      expect(cost).toBe(Math.max(FERTILIZER_MIN_COST, Math.ceil(value * FERTILIZER_COST_MULTIPLIER)));
    }
  });
});

describe('applyFertilizer', () => {
  test('deducts gold and completes the growth when affordable', () => {
    const state = withGrowingPlot(
      { ...createInitialState(), gold: 1_000_000 },
      0,
      STARTER_CROP,
      NOW
    );
    const cost = getFertilizerCost(state, state.plots[0]!, NOW);
    const result = applyFertilizer(state, 0, NOW);

    expect(result.applied).toBe(true);
    expect(result.cost).toBe(cost);
    expect(result.state.gold).toBe(1_000_000 - cost);
    // Growth is completed immediately: the plot is now ripe (state 2).
    expect(result.state.plots[0]!.state).toBe(2);
    expect(result.state.plots[0]!.cropType).toBe(STARTER_CROP);
    // Pure: the input state is untouched.
    expect(state.gold).toBe(1_000_000);
    expect(state.plots[0]!.state).toBe(1);
  });

  test('is a no-op when gold is insufficient (state unchanged, cost reported)', () => {
    const growing = withGrowingPlot(
      { ...createInitialState(), gold: 1_000_000 },
      0,
      STARTER_CROP,
      NOW
    );
    const cost = getFertilizerCost(growing, growing.plots[0]!, NOW);
    const poor: GameState = { ...growing, gold: cost - 1 };

    const result = applyFertilizer(poor, 0, NOW);
    expect(result.applied).toBe(false);
    expect(result.cost).toBe(cost);
    expect(result.state).toBe(poor);
    expect(result.state.gold).toBe(cost - 1);
    expect(result.state.plots[0]!.state).toBe(1);
  });

  test('is a no-op on an empty plot', () => {
    const base = { ...createInitialState(), gold: 1_000_000 };
    const result = applyFertilizer(base, 0, NOW);
    expect(result.applied).toBe(false);
    expect(result.cost).toBe(0);
    expect(result.state).toBe(base);
  });

  test('is a no-op on an already ripe plot', () => {
    const base = createInitialState();
    const ripe: GameState = {
      ...base,
      gold: 1_000_000,
      plots: base.plots.map((plot) =>
        plot.id === 0 ? { ...plot, cropType: STARTER_CROP, startTime: 0, state: 2 as PlotState } : plot
      ),
    };
    const result = applyFertilizer(ripe, 0, NOW);
    expect(result.applied).toBe(false);
    expect(result.cost).toBe(0);
    expect(result.state).toBe(ripe);
  });

  test('is a no-op for an unknown plot id', () => {
    const state = withGrowingPlot(
      { ...createInitialState(), gold: 1_000_000 },
      0,
      STARTER_CROP,
      NOW
    );
    const result = applyFertilizer(state, 9999, NOW);
    expect(result.applied).toBe(false);
    expect(result.cost).toBe(0);
    expect(result.state).toBe(state);
  });

  // 완료 경로 대칭성: 비료 완료와 광고 스킵 완료가 동일한 ripe 플롯을 만든다.
  // 변이/마스터리/오프라인 수익 등 "수확 후" 처리는 두 함수 어디에도 없고 수확 시점
  // (state===2 기준)에 동일하게 계산되므로, 완료 경로가 비대칭일 여지가 없음을 못박는다.
  test('completion parity: fertilizing yields the same ripe plot as a full growth-ad skip', () => {
    const crop = CROPS[STARTER_CROP]!;
    // 남은 성장이 한 번의 광고 스킵으로 전부 덮여 완료되도록(짧게) 세팅한다.
    const startTime = NOW - crop.growTime + 30_000;
    const state = withGrowingPlot(
      { ...createInitialState(), gold: 1_000_000 },
      0,
      STARTER_CROP,
      startTime
    );

    const adResult = applyGrowthAdSkip(state, 0, NOW);
    const fertResult = applyFertilizer(state, 0, NOW);

    // like-for-like 비교를 위해 광고 스킵이 완전 완료되는 케이스여야 한다.
    expect(adResult.completed).toBe(true);
    expect(fertResult.applied).toBe(true);

    // 두 완료 경로의 플롯은 완전히 동일하다(비료가 광고 스킵보다 덜한 후처리를 하지
    // 않음). 유일한 차이는 비료의 골드 차감뿐이다.
    expect(fertResult.state.plots[0]).toEqual(adResult.state.plots[0]);
    expect(fertResult.state.plots[0]!.state).toBe(2);
  });
});
