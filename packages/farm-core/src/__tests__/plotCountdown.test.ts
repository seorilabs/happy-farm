/// <reference types="jest" />

import { createInitialState } from '../constants';
import { getPlotRemainingGrowthMs, getPlotRemainingWallClockMs, performPlant } from '../harvest';
import type { GameState } from '../types';

// carrot is a starter crop with a 2000ms grow time (balance.json).
const CARROT = 'carrot';

function plantedState(speedLevel: number, startTime: number): GameState {
  const base = createInitialState();
  const withUpgrade: GameState = { ...base, upgrades: { ...base.upgrades, speed: speedLevel } };
  const planted = performPlant(withUpgrade, 0, CARROT, startTime);
  if (planted == null) {
    throw new Error('Expected carrot to be plantable on a starter plot.');
  }
  return planted;
}

describe('getPlotRemainingWallClockMs', () => {
  it('matches the raw grow-time remaining when the speed multiplier is 1', () => {
    const state = plantedState(1, 0);
    const plot = state.plots[0]!;

    expect(getPlotRemainingWallClockMs(state, plot, 0)).toBe(2000);
    expect(getPlotRemainingGrowthMs(state, plot, 0)).toBe(2000);
    expect(getPlotRemainingWallClockMs(state, plot, 1000)).toBe(1000);
  });

  it('divides by the speed multiplier so the countdown tracks real elapsed time', () => {
    // speed level 11 -> multiplier 2 (1 + (11 - 1) * 0.1).
    const state = plantedState(11, 0);
    const plot = state.plots[0]!;

    // Grow-time scale still reports the full 2000ms window the ad skip uses...
    expect(getPlotRemainingGrowthMs(state, plot, 0)).toBe(2000);
    // ...but the player-facing countdown halves to real time.
    expect(getPlotRemainingWallClockMs(state, plot, 0)).toBe(1000);
    expect(getPlotRemainingWallClockMs(state, plot, 500)).toBe(500);
  });

  it('always rounds up to whole milliseconds so the display stays clean', () => {
    // speed level 4 -> multiplier 1.3, which yields a fractional raw division.
    const state = plantedState(4, 0);
    const plot = state.plots[0]!;

    const remaining = getPlotRemainingWallClockMs(state, plot, 0);
    // 2000 / 1.3 = 1538.46... -> ceil 1539.
    expect(remaining).toBe(1539);
    expect(Number.isInteger(remaining)).toBe(true);
  });

  it('returns 0 for empty and ready plots', () => {
    const emptyState = createInitialState();
    expect(getPlotRemainingWallClockMs(emptyState, emptyState.plots[0]!, 0)).toBe(0);

    const grown = plantedState(1, 0);
    expect(getPlotRemainingWallClockMs(grown, grown.plots[0]!, 5000)).toBe(0);
  });
});
