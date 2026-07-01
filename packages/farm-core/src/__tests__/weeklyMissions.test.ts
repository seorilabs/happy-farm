/// <reference types="jest" />

import {
  canClaimWeeklyMission,
  claimWeeklyMission,
  createInitialWeeklyMissionState,
  getMissionWeekKey,
  getWeeklyMissions,
  getWeeklyMissionsSnapshot,
  normalizeWeeklyMissionState,
  recordWeeklyAdWatchProgress,
  recordWeeklyHarvestProgress,
  rolloverWeeklyMissions,
  type WeeklyMissionState,
} from '../weeklyMissions';
import { CROPS, createInitialState, migrateLoadedState } from '../constants';
import { createPrestigedState } from '../prestige';
import type { AreaKey, CropKey, GameState } from '../types';
import { META_LAYER_KEYS } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const ALL_AREAS = [...new Set((Object.keys(CROPS) as CropKey[]).map((key) => CROPS[key]!.area))] as AreaKey[];

// The UTC-Monday-00:00 start of the week containing `now`, derived from the same
// formula as getMissionWeekKey (week index = floor((epochDays + 3) / 7)).
function weekStartMs(now: number): number {
  const days = Math.floor(now / DAY_MS);
  const weekIndex = Math.floor((days + 3) / 7);
  return (weekIndex * 7 - 3) * DAY_MS;
}

const MON = weekStartMs(Date.UTC(2026, 6, 1)); // a concrete week start
const WEEK_COUNT = getWeeklyMissions(getMissionWeekKey(MON), ALL_AREAS).length;

describe('getMissionWeekKey (UTC Monday boundary)', () => {
  test('the derived week start is actually a Monday 00:00 UTC', () => {
    expect(new Date(MON).getUTCDay()).toBe(1); // 1 = Monday
    expect(MON % DAY_MS).toBe(0);
  });

  test('is stable across the whole Mon→Sun week and flips at the next Monday', () => {
    const key = getMissionWeekKey(MON);
    expect(getMissionWeekKey(MON + WEEK_MS - 1)).toBe(key); // Sunday 23:59:59.999
    expect(getMissionWeekKey(MON - 1)).not.toBe(key); // previous Sunday
    expect(getMissionWeekKey(MON + WEEK_MS)).not.toBe(key); // next Monday
    // Numerically consecutive.
    expect(Number(getMissionWeekKey(MON + WEEK_MS))).toBe(Number(key) + 1);
  });
});

describe('getWeeklyMissions determinism', () => {
  test('same week + unlocked areas → identical missions', () => {
    const key = getMissionWeekKey(MON);
    expect(getWeeklyMissions(key, ALL_AREAS)).toEqual(getWeeklyMissions(key, ALL_AREAS));
  });

  test('exposes fixed targets and a featured area only for the harvest_area slot', () => {
    const missions = getWeeklyMissions(getMissionWeekKey(MON), ALL_AREAS);
    expect(missions.length).toBeGreaterThanOrEqual(3);
    for (const mission of missions) {
      expect(mission.target).toBeGreaterThan(0);
      expect(mission.rewardGold).toBeGreaterThan(0);
      if (mission.type === 'harvest_area') {
        expect(mission.areaKey).not.toBeNull();
        expect(ALL_AREAS).toContain(mission.areaKey);
      } else {
        expect(mission.areaKey).toBeNull();
      }
    }
  });

  test('weekly reward gold is larger than the daily mission rewards', () => {
    const weeklyMin = Math.min(...getWeeklyMissions(getMissionWeekKey(MON), ALL_AREAS).map((m) => m.rewardGold));
    // Daily rewards top out at 400G; weekly is intentionally a bigger, week-long payout.
    expect(weeklyMin).toBeGreaterThan(400);
  });
});

describe('rollover on the week boundary', () => {
  test('resets progress and claims when the week changes, preserves them within a week', () => {
    const keyA = getMissionWeekKey(MON);
    const started = rolloverWeeklyMissions(createInitialWeeklyMissionState(), keyA, ALL_AREAS);
    const dirtied: WeeklyMissionState = { ...started, progress: started.progress.map(() => 5), claimedSlots: [0] };

    // Same week → untouched.
    expect(rolloverWeeklyMissions(dirtied, keyA, ALL_AREAS)).toBe(dirtied);

    // Next week → fresh progress/claims.
    const keyB = getMissionWeekKey(MON + WEEK_MS);
    const rolled = rolloverWeeklyMissions(dirtied, keyB, ALL_AREAS);
    expect(rolled.weekKey).toBe(keyB);
    expect(rolled.progress).toEqual(new Array(WEEK_COUNT).fill(0));
    expect(rolled.claimedSlots).toEqual([]);
  });
});

describe('progress accumulation from existing event paths', () => {
  const featuredArea = (now: number) =>
    getWeeklyMissions(getMissionWeekKey(now), ALL_AREAS).find((m) => m.type === 'harvest_area')!.areaKey!;

  test('a harvest bumps the total-harvest slot and the featured-area slot when it matches', () => {
    const area = featuredArea(MON);
    const s1 = recordWeeklyHarvestProgress(createInitialWeeklyMissionState(), area, false, MON, ALL_AREAS);
    const missions = getWeeklyMissionsSnapshot(s1, MON, ALL_AREAS).missions;
    expect(missions.find((m) => m.type === 'harvest')!.progress).toBe(1);
    expect(missions.find((m) => m.type === 'harvest_area')!.progress).toBe(1);
    // A different area only advances the total-harvest slot.
    const otherArea = ALL_AREAS.find((a) => a !== area)!;
    const s2 = recordWeeklyHarvestProgress(s1, otherArea, false, MON, ALL_AREAS);
    const missions2 = getWeeklyMissionsSnapshot(s2, MON, ALL_AREAS).missions;
    expect(missions2.find((m) => m.type === 'harvest')!.progress).toBe(2);
    expect(missions2.find((m) => m.type === 'harvest_area')!.progress).toBe(1);
  });

  test('a donated harvest also advances the donate slot', () => {
    const area = featuredArea(MON);
    const donatedOnce = recordWeeklyHarvestProgress(createInitialWeeklyMissionState(), area, true, MON, ALL_AREAS);
    const missions = getWeeklyMissionsSnapshot(donatedOnce, MON, ALL_AREAS).missions;
    expect(missions.find((m) => m.type === 'donate')!.progress).toBe(1);
    // A non-donated harvest leaves the donate slot untouched.
    const thenSold = recordWeeklyHarvestProgress(donatedOnce, area, false, MON, ALL_AREAS);
    expect(getWeeklyMissionsSnapshot(thenSold, MON, ALL_AREAS).missions.find((m) => m.type === 'donate')!.progress).toBe(1);
  });

  test('an ad watch advances only the watch_ad slot', () => {
    const s = recordWeeklyAdWatchProgress(createInitialWeeklyMissionState(), MON, ALL_AREAS);
    const missions = getWeeklyMissionsSnapshot(s, MON, ALL_AREAS).missions;
    expect(missions.find((m) => m.type === 'watch_ad')!.progress).toBe(1);
    expect(missions.find((m) => m.type === 'harvest')!.progress).toBe(0);
  });

  test('recording after the week rolls over starts a fresh count', () => {
    const area = featuredArea(MON);
    const thisWeek = recordWeeklyHarvestProgress(createInitialWeeklyMissionState(), area, false, MON, ALL_AREAS);
    const nextWeek = recordWeeklyHarvestProgress(thisWeek, area, false, MON + WEEK_MS, ALL_AREAS);
    expect(getWeeklyMissionsSnapshot(nextWeek, MON + WEEK_MS, ALL_AREAS).missions.find((m) => m.type === 'harvest')!.progress).toBe(1);
  });

  test('is pure: the input state is not mutated', () => {
    const state = createInitialWeeklyMissionState();
    recordWeeklyHarvestProgress(state, ALL_AREAS[0]!, true, MON, ALL_AREAS);
    expect(state).toEqual(createInitialWeeklyMissionState());
  });
});

describe('claimWeeklyMission', () => {
  function stateWithSlotComplete(slot: number): GameState {
    const base = createInitialState();
    const rolled = rolloverWeeklyMissions(base.weeklyMissionState, getMissionWeekKey(MON), base.unlockedAreas);
    const target = getWeeklyMissions(getMissionWeekKey(MON), base.unlockedAreas)[slot]!.target;
    const progress = rolled.progress.map((value, index) => (index === slot ? target : value));
    return { ...base, gold: 0, weeklyMissionState: { ...rolled, progress } };
  }

  test('pays the reward gold once and blocks a second claim', () => {
    const state = stateWithSlotComplete(0);
    const reward = getWeeklyMissions(getMissionWeekKey(MON), state.unlockedAreas)[0]!.rewardGold;
    expect(canClaimWeeklyMission(state.weeklyMissionState, 0, MON, state.unlockedAreas)).toBe(true);

    const claimed = claimWeeklyMission(state, 0, MON);
    expect(claimed).not.toBeNull();
    expect(claimed!.gold).toBe(reward);
    expect(claimed!.weeklyMissionState.claimedSlots).toContain(0);

    // Second claim of the same slot is rejected (no double payout).
    expect(claimWeeklyMission(claimed!, 0, MON)).toBeNull();
  });

  test('an incomplete slot cannot be claimed', () => {
    const base = createInitialState();
    expect(canClaimWeeklyMission(base.weeklyMissionState, 0, MON, base.unlockedAreas)).toBe(false);
    expect(claimWeeklyMission(base, 0, MON)).toBeNull();
  });
});

describe('normalization, migration & prestige', () => {
  test('weeklyMissionState is a meta-layer field', () => {
    expect(META_LAYER_KEYS).toContain('weeklyMissionState');
  });

  test('normalizeWeeklyMissionState falls back for non-objects and repairs arrays', () => {
    expect(normalizeWeeklyMissionState(null)).toEqual(createInitialWeeklyMissionState());
    expect(normalizeWeeklyMissionState('nope')).toEqual(createInitialWeeklyMissionState());
    const repaired = normalizeWeeklyMissionState({
      weekKey: 'w',
      areaKeys: ['not_an_area', ALL_AREAS[0]],
      progress: [-1, 3, 'x', 2],
      claimedSlots: [0, 0, 999, -1],
    });
    expect(repaired.progress.length).toBe(WEEK_COUNT);
    expect(repaired.progress[0]).toBe(0); // negative → 0
    expect(repaired.claimedSlots).toEqual([0]); // dedup + out-of-range dropped
  });

  test('a save without weeklyMissionState migrates to the initial state', () => {
    const migrated = migrateLoadedState({} as Partial<GameState>, createInitialState());
    expect(migrated.weeklyMissionState).toEqual(createInitialWeeklyMissionState());
  });

  test('weekly progress survives prestige (meta layer preserved)', () => {
    const base = createInitialState();
    const withProgress: GameState = {
      ...base,
      weeklyMissionState: {
        weekKey: getMissionWeekKey(MON),
        areaKeys: new Array(WEEK_COUNT).fill(null),
        progress: new Array(WEEK_COUNT).fill(7),
        claimedSlots: [1],
      },
    };
    expect(createPrestigedState(withProgress).weeklyMissionState).toEqual(withProgress.weeklyMissionState);
  });
});
