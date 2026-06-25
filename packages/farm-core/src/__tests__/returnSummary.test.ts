/// <reference types="jest" />

import { createInitialState } from '../constants';
import { getReturnSummary, RETURN_SUMMARY_MIN_AWAY_MS } from '../returnSummary';
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
