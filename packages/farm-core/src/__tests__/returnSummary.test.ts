/// <reference types="jest" />

import {
  createInitialState,
  getCropEconomyEstimate,
  getProfitMultiplier,
  getSpeedMultiplier,
  OFFLINE_INCOME_CAP_MS,
  OFFLINE_INCOME_EFFICIENCY_RATIO,
} from '../constants';
import {
  getActiveFarmOfflineGold,
  getReturnSummary,
  RETURN_SUMMARY_MIN_AWAY_MS,
} from '../returnSummary';
import { CHAIN_OFFLINE_CAP_MS } from '../prestige';
import type { CropKey, GameState } from '../types';

const NOW = Date.parse('2026-06-13T03:00:00.000Z');
const MS_PER_HOUR = 60 * 60 * 1000;

const READY_CROP_KEY = 'carrot' as CropKey;

function withReadyCrop(plotIndex: number, base: GameState): GameState {
  const plots = base.plots.map((plot, index) =>
    index === plotIndex
      ? { ...plot, cropType: READY_CROP_KEY, startTime: NOW - MS_PER_HOUR, state: 2 as const }
      : plot
  );
  return { ...base, plots };
}

// Plant a growing crop (state 1) in a plot so it contributes pre-prestige
// offline income.
function withGrowingCrop(plotIndex: number, cropKey: CropKey, base: GameState): GameState {
  const plots = base.plots.map((plot, index) =>
    index === plotIndex ? { ...plot, cropType: cropKey, startTime: NOW, state: 1 as const } : plot
  );
  return { ...base, plots };
}

// Expected hourly pre-prestige rate for a set of growing crops at base upgrades.
function expectedGoldPerHour(cropKeys: CropKey[], base: GameState): number {
  const speedMultiplier = getSpeedMultiplier(base.upgrades.speed);
  const profitMultiplier = getProfitMultiplier(base.upgrades.profit);
  const sum = cropKeys.reduce(
    (acc, cropKey) =>
      acc + getCropEconomyEstimate(cropKey, { speedMultiplier, profitMultiplier }).netProfitPerHour,
    0
  );
  return sum * OFFLINE_INCOME_EFFICIENCY_RATIO;
}

function withChainFarm(goldPerHour: number, lastCollectedAt: number, base: GameState): GameState {
  return {
    ...base,
    chainFarms: [{ id: 1, archetype: 'plains', goldPerHour, lastCollectedAt }],
  };
}

describe('getReturnSummary', () => {
  test('returns null when no game state is available', () => {
    const lastSeen = NOW - 2 * MS_PER_HOUR;
    expect(getReturnSummary(null, lastSeen, NOW)).toBeNull();
    expect(getReturnSummary(undefined, lastSeen, NOW)).toBeNull();
  });

  test('returns null without a prior session timestamp', () => {
    const state = withReadyCrop(0, createInitialState());
    expect(getReturnSummary(state, null, NOW)).toBeNull();
    expect(getReturnSummary(state, 0, NOW)).toBeNull();
    expect(getReturnSummary(state, Number.NaN, NOW)).toBeNull();
  });

  test('returns null for short away windows', () => {
    const state = withReadyCrop(0, createInitialState());
    const lastSeen = NOW - (RETURN_SUMMARY_MIN_AWAY_MS - 1000);
    expect(getReturnSummary(state, lastSeen, NOW)).toBeNull();
  });

  test('returns null when nothing is waiting after a long absence', () => {
    const state = createInitialState();
    const lastSeen = NOW - 5 * MS_PER_HOUR;
    expect(getReturnSummary(state, lastSeen, NOW)).toBeNull();
  });

  test('surfaces ready crops after a long absence', () => {
    const state = withReadyCrop(2, withReadyCrop(0, createInitialState()));
    const lastSeen = NOW - 2 * MS_PER_HOUR;
    const summary = getReturnSummary(state, lastSeen, NOW);
    expect(summary).not.toBeNull();
    expect(summary?.readyCropCount).toBe(2);
    expect(summary?.offlineGold).toBe(0);
    expect(summary?.awayMs).toBe(2 * MS_PER_HOUR);
  });

  test('surfaces accrued offline chain gold', () => {
    const state = withChainFarm(3600, NOW - 2 * MS_PER_HOUR, createInitialState());
    const lastSeen = NOW - 2 * MS_PER_HOUR;
    const summary = getReturnSummary(state, lastSeen, NOW);
    expect(summary).not.toBeNull();
    expect(summary?.offlineGold).toBe(7200);
    expect(summary?.readyCropCount).toBe(0);
  });

  test('offline gold respects the chain accrual cap', () => {
    const state = withChainFarm(3600, NOW - 100 * MS_PER_HOUR, createInitialState());
    const lastSeen = NOW - 100 * MS_PER_HOUR;
    const summary = getReturnSummary(state, lastSeen, NOW);
    expect(summary?.offlineGold).toBe((3600 * CHAIN_OFFLINE_CAP_MS) / MS_PER_HOUR);
  });

  test('accrues pre-prestige offline gold from growing plots even without chain farms', () => {
    const base = createInitialState();
    const state = withGrowingCrop(1, 'wheat', withGrowingCrop(0, 'wheat', base));
    const lastSeen = NOW - 2 * MS_PER_HOUR;

    const summary = getReturnSummary(state, lastSeen, NOW);
    expect(summary).not.toBeNull();
    const expected = Math.floor((expectedGoldPerHour(['wheat', 'wheat'], base) * 2 * MS_PER_HOUR) / MS_PER_HOUR);
    expect(expected).toBeGreaterThan(0);
    expect(summary?.offlineGold).toBe(expected);
  });

  test('pre-prestige offline gold is capped at the offline window', () => {
    const base = createInitialState();
    const state = withGrowingCrop(0, 'wheat', base);
    // Away far beyond the cap: accrual must clamp to OFFLINE_INCOME_CAP_MS.
    const lastSeen = NOW - 1000 * MS_PER_HOUR;

    const summary = getReturnSummary(state, lastSeen, NOW);
    const cappedExpected = Math.floor((expectedGoldPerHour(['wheat'], base) * OFFLINE_INCOME_CAP_MS) / MS_PER_HOUR);
    expect(summary?.offlineGold).toBe(cappedExpected);

    // A longer absence must not pay more than the cap.
    const longerSummary = getReturnSummary(state, NOW - 5000 * MS_PER_HOUR, NOW);
    expect(longerSummary?.offlineGold).toBe(cappedExpected);
  });

  test('pre-prestige offline gold adds to chain income', () => {
    const base = createInitialState();
    const withChain = withChainFarm(3600, NOW - 2 * MS_PER_HOUR, base);
    const state = withGrowingCrop(0, 'wheat', withChain);
    const lastSeen = NOW - 2 * MS_PER_HOUR;

    const summary = getReturnSummary(state, lastSeen, NOW);
    const activeFarm = Math.floor((expectedGoldPerHour(['wheat'], base) * 2 * MS_PER_HOUR) / MS_PER_HOUR);
    expect(summary?.offlineGold).toBe(7200 + activeFarm);
  });

  test('getActiveFarmOfflineGold is pure and defends against bad windows and empty farms', () => {
    const base = createInitialState();
    const planted = withGrowingCrop(0, 'wheat', base);

    // Empty/idle farm earns nothing (no growing plots).
    expect(getActiveFarmOfflineGold(base, 2 * MS_PER_HOUR)).toBe(0);
    // Ready (state 2) crops are not "growing" and do not accrue.
    expect(getActiveFarmOfflineGold(withReadyCrop(0, base), 2 * MS_PER_HOUR)).toBe(0);
    // Non-positive / non-finite away windows are rejected.
    expect(getActiveFarmOfflineGold(planted, 0)).toBe(0);
    expect(getActiveFarmOfflineGold(planted, -5 * MS_PER_HOUR)).toBe(0);
    expect(getActiveFarmOfflineGold(planted, Number.NaN)).toBe(0);
    expect(getActiveFarmOfflineGold(planted, Number.POSITIVE_INFINITY)).toBe(0);

    // A finite, very long window clamps to the cap (sanity vs the Infinity guard).
    expect(getActiveFarmOfflineGold(planted, 10 * OFFLINE_INCOME_CAP_MS)).toBe(
      Math.floor((expectedGoldPerHour(['wheat'], base) * OFFLINE_INCOME_CAP_MS) / MS_PER_HOUR)
    );
  });

  test('flags daily bonus as available when it has never been claimed', () => {
    const state = withReadyCrop(0, createInitialState());
    const lastSeen = NOW - 2 * MS_PER_HOUR;
    const summary = getReturnSummary(state, lastSeen, NOW);
    expect(summary?.dailyBonusAvailable).toBe(true);
  });

  test('flags daily bonus as unavailable when claimed within the cooldown', () => {
    const base = createInitialState();
    const state = withReadyCrop(0, {
      ...base,
      dailyBonusState: { lastClaimedAt: NOW - 1000, streak: 1 },
    });
    const lastSeen = NOW - 2 * MS_PER_HOUR;
    const summary = getReturnSummary(state, lastSeen, NOW);
    // 수확할 작물이 있어 카드는 노출되지만, 데일리는 쿨다운 중이라 CTA 비노출.
    expect(summary).not.toBeNull();
    expect(summary?.dailyBonusAvailable).toBe(false);
  });
});
