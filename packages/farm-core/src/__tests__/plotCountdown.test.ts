/// <reference types="jest" />

// Countdown unit tests isolate upgrade math. Daily weather integration is
// covered separately in weatherModifier.test.ts.
jest.mock('../weather', () => ({
  getWeatherSpeedMultiplier: () => 1,
  getWeatherSellMultiplier: () => 1,
}));

import { createInitialState } from '../constants';
import {
  getPlotGrowthDisplay,
  getPlotGrowthRatio,
  getPlotRemainingGrowthMs,
  getPlotRemainingWallClockMs,
  performPlant,
} from '../harvest';
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

  it('holds a stable remaining time when growth is frozen (speedMultiplier 0)', () => {
    // speed level -9 -> getSpeedMultiplier = 1 + (-9 - 1) * 0.1 = 0, which freezes
    // growth. This branch is unreachable in the shipped balance, but the fallback
    // must report a fixed remaining that does NOT tick down with wall-clock time.
    const state = plantedState(-9, 0);
    const plot = state.plots[0]!;

    expect(getPlotRemainingWallClockMs(state, plot, 0)).toBe(2000);
    expect(getPlotRemainingWallClockMs(state, plot, 1000)).toBe(2000);
    expect(getPlotRemainingWallClockMs(state, plot, 100000)).toBe(2000);

    // Progress bar and countdown must agree: 0% grown with the full time still
    // remaining (not a misleading "ready" 100%).
    const display = getPlotGrowthDisplay(state, plot, 1000);
    expect(display.growthRatio).toBe(0);
    expect(display.remainingWallClockMs).toBe(2000);
    expect(getPlotGrowthRatio(state, plot, 1000)).toBe(0);
  });

  it('does not run backwards when the multiplier is negative', () => {
    // speed level -20 -> getSpeedMultiplier = 1 + (-21) * 0.1 = -1.1 (negative).
    // The frozen-branch constant must not climb as wall-clock time passes.
    const state = plantedState(-20, 0);
    const plot = state.plots[0]!;

    expect(getPlotRemainingWallClockMs(state, plot, 0)).toBe(2000);
    expect(getPlotRemainingWallClockMs(state, plot, 10000)).toBe(2000);
  });

  it('clamps to 0 once wall-clock elapsed passes the full grow duration', () => {
    // speed level 11 -> multiplier 2, so the wall-clock duration is 1000ms; well
    // past that the countdown must stay pinned at 0 rather than go negative.
    const state = plantedState(11, 0);
    const plot = state.plots[0]!;
    expect(getPlotRemainingWallClockMs(state, plot, 5000)).toBe(0);
  });

  it('returns 0 for empty and ready plots', () => {
    const emptyState = createInitialState();
    expect(getPlotRemainingWallClockMs(emptyState, emptyState.plots[0]!, 0)).toBe(0);

    const grown = plantedState(1, 0);
    expect(getPlotRemainingWallClockMs(grown, grown.plots[0]!, 5000)).toBe(0);
  });
});

describe('getPlotGrowthDisplay', () => {
  // The grid swapped two per-tile calls (getPlotGrowthRatio + getPlotRemainingWallClockMs)
  // for this single-pass helper to avoid resolving crop modifiers twice. It must
  // stay field-for-field identical to the originals across growth states, speeds,
  // and timestamps, otherwise the visible progress bar or countdown would drift.
  it('matches getPlotGrowthRatio and getPlotRemainingWallClockMs everywhere', () => {
    const speedLevels = [1, 4, 11, -9, -20];
    const times = [0, 250, 1000, 2000, 5000, 100000];

    for (const speed of speedLevels) {
      const state = plantedState(speed, 0);
      const plot = state.plots[0]!;
      for (const now of times) {
        const display = getPlotGrowthDisplay(state, plot, now);
        expect(display.growthRatio).toBe(getPlotGrowthRatio(state, plot, now));
        expect(display.remainingWallClockMs).toBe(getPlotRemainingWallClockMs(state, plot, now));
      }
    }

    // Empty and ready plots too.
    const empty = createInitialState();
    const emptyPlot = empty.plots[0]!;
    expect(getPlotGrowthDisplay(empty, emptyPlot, 0)).toEqual({
      growthRatio: getPlotGrowthRatio(empty, emptyPlot, 0),
      remainingWallClockMs: getPlotRemainingWallClockMs(empty, emptyPlot, 0),
    });
  });
});
