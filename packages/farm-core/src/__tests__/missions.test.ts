/// <reference types="jest" />

import {
  canClaimMission,
  claimMission,
  createInitialDailyMissionState,
  getDailyMissions,
  getDailyMissionsSnapshot,
  getMissionDayKey,
  normalizeDailyMissionState,
  recordAdWatchProgress,
  recordHarvestProgress,
  rolloverDailyMissions,
  type DailyMissionState,
} from '../missions';
import { CROPS, createInitialState, migrateLoadedState } from '../constants';
import { performHarvest } from '../harvest';
import { createPrestigedState } from '../prestige';
import type { AreaKey, CropKey, GameState } from '../types';
import { META_LAYER_KEYS } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_A = Date.UTC(2026, 5, 30, 9); // 2026-06-30 09:00 UTC
const DAY_B = DAY_A + DAY_MS; // next calendar day
const ALL_AREAS = [...new Set((Object.keys(CROPS) as CropKey[]).map((key) => CROPS[key]!.area))] as AreaKey[];

describe('getDailyMissions determinism', () => {
  test('returns 3 missions with distinct types, stable for a given day', () => {
    const keyA = getMissionDayKey(DAY_A);
    const a1 = getDailyMissions(keyA, ALL_AREAS);
    const a2 = getDailyMissions(keyA, ALL_AREAS);
    expect(a1).toHaveLength(3);
    expect(a1).toEqual(a2);
    expect(new Set(a1.map((m) => m.type)).size).toBe(3);
    for (const mission of a1) {
      expect(mission.target).toBeGreaterThan(0);
      expect(mission.rewardGold).toBeGreaterThan(0);
    }
    const areaMission = a1.find((m) => m.type === 'harvest_area');
    expect(areaMission?.areaKey).not.toBeNull();
  });

  test('different days can produce different mission configs', () => {
    // Sample a span of days; targets/areas should not be identical on every day.
    const configs = Array.from({ length: 14 }, (_, i) =>
      JSON.stringify(getDailyMissions(getMissionDayKey(DAY_A + i * DAY_MS), ALL_AREAS))
    );
    expect(new Set(configs).size).toBeGreaterThan(1);
  });

  test('featured area is always drawn from unlocked areas', () => {
    const unlocked: AreaKey[] = [ALL_AREAS[0]!];
    const missions = getDailyMissions(getMissionDayKey(DAY_A), unlocked);
    const areaMission = missions.find((m) => m.type === 'harvest_area');
    expect(areaMission?.areaKey).toBe(unlocked[0]);
  });
});

describe('progress tracking', () => {
  test('harvest progress increments total and matching-area missions', () => {
    const start = createInitialDailyMissionState();
    const missions = getDailyMissions(getMissionDayKey(DAY_A), ALL_AREAS);
    const areaMission = missions.find((m) => m.type === 'harvest_area')!;
    const harvestMission = missions.find((m) => m.type === 'harvest')!;

    // Harvest in the featured area: both the total and the area mission advance.
    const after = recordHarvestProgress(start, areaMission.areaKey!, DAY_A, ALL_AREAS);
    expect(after.progress[harvestMission.slot]).toBe(1);
    expect(after.progress[areaMission.slot]).toBe(1);
  });

  test('harvest in a non-featured area advances only the total mission', () => {
    const start = createInitialDailyMissionState();
    const missions = getDailyMissions(getMissionDayKey(DAY_A), ALL_AREAS);
    const areaMission = missions.find((m) => m.type === 'harvest_area')!;
    const harvestMission = missions.find((m) => m.type === 'harvest')!;
    const otherArea = ALL_AREAS.find((a) => a !== areaMission.areaKey)!;

    const after = recordHarvestProgress(start, otherArea, DAY_A, ALL_AREAS);
    expect(after.progress[harvestMission.slot]).toBe(1);
    expect(after.progress[areaMission.slot]).toBe(0);
  });

  test('ad-watch progress increments only the watch_ad mission', () => {
    const start = createInitialDailyMissionState();
    const missions = getDailyMissions(getMissionDayKey(DAY_A), ALL_AREAS);
    const adMission = missions.find((m) => m.type === 'watch_ad')!;
    const after = recordAdWatchProgress(start, DAY_A, ALL_AREAS);
    expect(after.progress[adMission.slot]).toBe(1);
  });

  test('performHarvest feeds daily-mission progress through the canonical pipeline', () => {
    let state = createInitialState();
    const cropKey = Object.keys(CROPS)[0] as CropKey;
    const area = CROPS[cropKey]!.area;
    // Plant + ripen a plot.
    state = { ...state, plots: state.plots.map((p, i) => (i === 0 ? { ...p, cropType: cropKey, startTime: DAY_A, state: 2 } : p)) };
    const outcome = performHarvest(state, 0, { now: DAY_A, rng: () => 0.999 });
    expect(outcome).not.toBeNull();
    const snapshot = getDailyMissionsSnapshot(outcome!.state.dailyMissionState, DAY_A, outcome!.state.unlockedAreas);
    const harvestMission = snapshot.missions.find((m) => m.type === 'harvest')!;
    expect(harvestMission.progress).toBeGreaterThanOrEqual(1);
    expect(area).toBeDefined();
  });
});

describe('featured area is frozen for the day', () => {
  test('rollover keeps the same areaKeys when the day is unchanged, even if unlocks change', () => {
    const rolled = rolloverDailyMissions(createInitialDailyMissionState(), getMissionDayKey(DAY_A), ALL_AREAS);
    // Same day but a shrunken unlocked set must NOT re-pick the featured area.
    const sameDay = rolloverDailyMissions(rolled, getMissionDayKey(DAY_A + 5000), [ALL_AREAS[0]!]);
    expect(sameDay).toBe(rolled);
    expect(sameDay.areaKeys).toEqual(rolled.areaKeys);
  });

  test('display and harvest recording agree on the frozen area regardless of unlock drift', () => {
    const rolled = rolloverDailyMissions(createInitialDailyMissionState(), getMissionDayKey(DAY_A), ALL_AREAS);
    const snapshot = getDailyMissionsSnapshot(rolled, DAY_A, [ALL_AREAS[0]!]);
    const areaView = snapshot.missions.find((m) => m.type === 'harvest_area')!;
    // Harvest in the frozen featured area while unlocks look different — progress still lands.
    const after = recordHarvestProgress(rolled, areaView.areaKey!, DAY_A, [ALL_AREAS[0]!]);
    expect(after.progress[areaView.slot]).toBe(1);
  });
});

describe('midnight rollover', () => {
  test('same-day re-evaluation preserves progress', () => {
    const start = recordAdWatchProgress(createInitialDailyMissionState(), DAY_A, ALL_AREAS);
    const sameDay = rolloverDailyMissions(start, getMissionDayKey(DAY_A + 1000));
    expect(sameDay).toBe(start); // unchanged reference
  });

  test('crossing midnight resets progress and claims', () => {
    let state = recordAdWatchProgress(createInitialDailyMissionState(), DAY_A, ALL_AREAS);
    state = { ...state, claimedSlots: [0] };
    const nextDay = rolloverDailyMissions(state, getMissionDayKey(DAY_B));
    expect(nextDay.dayKey).toBe(getMissionDayKey(DAY_B));
    expect(nextDay.progress.every((p) => p === 0)).toBe(true);
    expect(nextDay.claimedSlots).toEqual([]);
  });
});

describe('claim guard', () => {
  function completedStateForSlot(now: number, slot: number): GameState {
    const base = createInitialState();
    const mission = getDailyMissions(getMissionDayKey(now), base.unlockedAreas).find((m) => m.slot === slot)!;
    const progress = new Array(3).fill(0);
    progress[slot] = mission.target;
    const dailyMissionState: DailyMissionState = {
      dayKey: getMissionDayKey(now),
      areaKeys: new Array(3).fill(null),
      progress,
      claimedSlots: [],
    };
    return { ...base, dailyMissionState };
  }

  test('cannot claim an incomplete mission', () => {
    const base = createInitialState();
    expect(canClaimMission(base.dailyMissionState, 0, DAY_A, base.unlockedAreas)).toBe(false);
    expect(claimMission(base, 0, DAY_A)).toBeNull();
  });

  test('claiming a completed mission pays the reward exactly once', () => {
    const state = completedStateForSlot(DAY_A, 0);
    const mission = getDailyMissions(getMissionDayKey(DAY_A), state.unlockedAreas).find((m) => m.slot === 0)!;
    expect(canClaimMission(state.dailyMissionState, 0, DAY_A, state.unlockedAreas)).toBe(true);

    const claimed = claimMission(state, 0, DAY_A);
    expect(claimed).not.toBeNull();
    expect(claimed!.gold).toBe(state.gold + mission.rewardGold);
    expect(claimed!.dailyMissionState.claimedSlots).toEqual([0]);

    // A second claim against the updated state is a no-op (no double pay).
    expect(claimMission(claimed!, 0, DAY_A)).toBeNull();
  });
});

describe('save migration & prestige', () => {
  test('dailyMissionState is a meta-layer field', () => {
    expect(META_LAYER_KEYS).toContain('dailyMissionState');
  });

  test('migration normalizes a malformed mission state', () => {
    const base = createInitialState();
    const loaded = {
      dailyMissionState: { dayKey: 5, progress: [3, 'x', -1], claimedSlots: [0, 99, 1, 1] },
    } as unknown as Partial<GameState>;
    const migrated = migrateLoadedState(loaded, base);
    expect(migrated.dailyMissionState.dayKey).toBe('');
    expect(migrated.dailyMissionState.progress).toHaveLength(3);
    expect(migrated.dailyMissionState.progress[0]).toBe(3);
    expect(migrated.dailyMissionState.progress[1]).toBe(0);
    expect(migrated.dailyMissionState.progress[2]).toBe(0);
    expect(migrated.dailyMissionState.claimedSlots).toEqual([0, 1]);
  });

  test('a save without dailyMissionState loads as the initial state', () => {
    const base = createInitialState();
    const migrated = migrateLoadedState({} as Partial<GameState>, base);
    expect(migrated.dailyMissionState).toEqual(createInitialDailyMissionState());
  });

  test('mission progress survives prestige (meta layer preserved)', () => {
    const base = createInitialState();
    const withProgress: GameState = {
      ...base,
      dailyMissionState: {
        dayKey: getMissionDayKey(DAY_A),
        areaKeys: new Array(3).fill(null),
        progress: [4, 2, 1],
        claimedSlots: [2],
      },
    };
    const prestiged = createPrestigedState(withProgress);
    expect(prestiged.dailyMissionState).toEqual(withProgress.dailyMissionState);
  });

  test('normalizeDailyMissionState falls back for non-objects', () => {
    expect(normalizeDailyMissionState(null)).toEqual(createInitialDailyMissionState());
    expect(normalizeDailyMissionState('nope')).toEqual(createInitialDailyMissionState());
  });
});
