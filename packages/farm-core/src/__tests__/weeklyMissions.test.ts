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
import balance from '../balance.json';
import { getResetDayIndex, getResetDayStart } from '../resetBoundary';
import { CROPS, createInitialState, migrateLoadedState } from '../constants';
import { createPrestigedState } from '../prestige';
import type { AreaKey, CropKey, GameState } from '../types';
import { META_LAYER_KEYS } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const ALL_AREAS = [...new Set((Object.keys(CROPS) as CropKey[]).map((key) => CROPS[key]!.area))] as AreaKey[];

// The reset-week start (absolute ms) of the week containing `now`, derived from
// the same formula as getMissionWeekKey (week index = floor((resetDays + 3) / 7))
// but through the shared reset-boundary helpers so it tracks the offset (#251).
function weekStartMs(now: number): number {
  const days = getResetDayIndex(now);
  const weekIndex = Math.floor((days + 3) / 7);
  return getResetDayStart(weekIndex * 7 - 3);
}

const MON = weekStartMs(Date.UTC(2026, 6, 1)); // a concrete reset-week start
const WEEK_COUNT = getWeeklyMissions(getMissionWeekKey(MON), ALL_AREAS).length;

describe('getMissionWeekKey (reset-week boundary)', () => {
  test('the derived week start is aligned to a reset-day boundary and is a flip point', () => {
    // MON은 리셋 일 경계에 정렬돼 있다(오프셋 반영).
    expect(getResetDayStart(getResetDayIndex(MON))).toBe(MON);
    // 그 직전(리셋 주의 마지막 순간)과는 다른 주 키다.
    expect(getMissionWeekKey(MON - 1)).not.toBe(getMissionWeekKey(MON));
  });

  test('is stable across the whole reset week and flips at the next boundary', () => {
    const key = getMissionWeekKey(MON);
    expect(getMissionWeekKey(MON + WEEK_MS - 1)).toBe(key); // 주 마지막 순간
    expect(getMissionWeekKey(MON - 1)).not.toBe(key); // 이전 주
    expect(getMissionWeekKey(MON + WEEK_MS)).not.toBe(key); // 다음 주 시작
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

  test('same week with shorter arrays (a slot was added later) preserves progress instead of wiping', () => {
    const key = getMissionWeekKey(MON);
    // A save persisted before a new weekly slot existed: arrays shorter than the
    // current slot count. Entering the same week must NOT reset accumulated data.
    const legacy: WeeklyMissionState = { weekKey: key, areaKeys: [null], progress: [42], claimedSlots: [0] };
    const rolled = rolloverWeeklyMissions(legacy, key, ALL_AREAS);
    expect(rolled.weekKey).toBe(key);
    expect(rolled.progress.length).toBe(WEEK_COUNT);
    expect(rolled.progress[0]).toBe(42); // preserved, not reset to 0
    expect(rolled.progress[WEEK_COUNT - 1]).toBe(0); // newly added slot starts at 0
    expect(rolled.claimedSlots).toContain(0);
    // Newly padded slots are NOT re-drawn from featured — they stay null (inert)
    // until the next real week rollover assigns an area from unlocked areas.
    expect(rolled.areaKeys.length).toBe(WEEK_COUNT);
    expect(rolled.areaKeys.every((area) => area === null)).toBe(true);
  });

  test('same-week resize keeps existing featured areas verbatim (no re-draw) while preserving progress', () => {
    const key = getMissionWeekKey(MON);
    const missions = getWeeklyMissions(key, ALL_AREAS);
    const areaSlot = missions.findIndex((m) => m.type === 'harvest_area');
    const existingArea = missions[areaSlot]!.areaKey!;
    // Full-length areaKeys carrying the real featured area, but a short progress
    // array (a partially-migrated save) → triggers the resize branch.
    const state: WeeklyMissionState = {
      weekKey: key,
      areaKeys: missions.map((m) => (m.type === 'harvest_area' ? existingArea : null)),
      progress: [7],
      claimedSlots: [],
    };
    const rolled = rolloverWeeklyMissions(state, key, ALL_AREAS);
    // Existing featured area is kept as-is (not re-drawn), progress[0] preserved.
    expect(rolled.areaKeys[areaSlot]).toBe(existingArea);
    expect(rolled.progress[0]).toBe(7);
    expect(rolled.progress.length).toBe(WEEK_COUNT);
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

  test('normalizeWeeklyMissionState preserves clean loaded array references (no needless re-allocation)', () => {
    const clean: WeeklyMissionState = {
      weekKey: getMissionWeekKey(MON),
      areaKeys: new Array(WEEK_COUNT).fill(null),
      progress: Array.from({ length: WEEK_COUNT }, (_, index) => index), // 0 이상 정수
      claimedSlots: [0, 1],
    };
    const normalized = normalizeWeeklyMissionState(clean);
    // 정규 형태의 배열은 새로 복사하지 않고 입력 참조를 그대로 보존한다.
    expect(normalized.areaKeys).toBe(clean.areaKeys);
    expect(normalized.progress).toBe(clean.progress);
    expect(normalized.claimedSlots).toBe(clean.claimedSlots);
  });

  test('normalizeWeeklyMissionState rebuilds only the corrupt field, preserving the rest by reference', () => {
    const dirty = {
      weekKey: 'w',
      areaKeys: new Array(WEEK_COUNT).fill(null),
      progress: new Array(WEEK_COUNT).fill(2.5), // 비정수 → 재생성
      claimedSlots: [0],
    };
    const normalized = normalizeWeeklyMissionState(dirty);
    expect(normalized.progress).not.toBe(dirty.progress);
    expect(normalized.progress[0]).toBe(2); // floored
    // 손상되지 않은 필드는 참조를 유지한다.
    expect(normalized.areaKeys).toBe(dirty.areaKeys);
    expect(normalized.claimedSlots).toBe(dirty.claimedSlots);
  });

  test('normalizeWeeklyMissionState falls back to the provided base for non-objects', () => {
    const base = createInitialWeeklyMissionState();
    expect(normalizeWeeklyMissionState(null, base)).toBe(base);
    expect(normalizeWeeklyMissionState('nope', base)).toBe(base);
    // base 미지정 시에도 값 동등성은 초기 상태와 일치한다.
    expect(normalizeWeeklyMissionState(null)).toEqual(createInitialWeeklyMissionState());
  });

  test('migrateLoadedState threads base and preserves a clean weeklyMissionState by reference', () => {
    const base = createInitialState();
    const clean: WeeklyMissionState = {
      weekKey: getMissionWeekKey(MON),
      areaKeys: new Array(WEEK_COUNT).fill(null),
      progress: new Array(WEEK_COUNT).fill(3),
      claimedSlots: [1],
    };
    const migrated = migrateLoadedState({ ...base, weeklyMissionState: clean }, base);
    expect(migrated.weeklyMissionState.areaKeys).toBe(clean.areaKeys);
    expect(migrated.weeklyMissionState.progress).toBe(clean.progress);
    expect(migrated.weeklyMissionState.claimedSlots).toBe(clean.claimedSlots);
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

// #207: 주간 미션 보상 진행도 스케일링. 일일과 동일한 공식(max(하한, floor(광고보상 × 비율)))
// 이되, 주간 비율은 1 이상(한 주의 노력 > 광고 1회)이며 check-balance가 상한(≤5)을 강제한다.
describe('progress-scaled weekly rewards (#207)', () => {
  const SLOTS = balance.missions.weekly.slots;
  const weekKey = getMissionWeekKey(MON);

  test('주입이 없으면 슬롯별 하한(rewardGoldMin)이 그대로 지급된다(기존 고정 보상과 동일)', () => {
    const missions = getWeeklyMissions(weekKey, ALL_AREAS);
    expect(missions.map((m) => m.rewardGold)).toEqual(SLOTS.map((slot) => slot.rewardGoldMin));
  });

  test('광고 보상이 커지면 보상이 비율대로 스케일되고 일일 미션보다 크다(주간 ≥ 광고 1회)', () => {
    const adGold = 1_000_000;
    const missions = getWeeklyMissions(weekKey, ALL_AREAS, adGold);
    missions.forEach((mission, index) => {
      expect(mission.rewardGold).toBe(Math.floor(adGold * SLOTS[index]!.adRewardRatio));
      // 주간 비율 ≥ 1 계약: 한 주의 노력 보상은 광고 1회 이상의 가치.
      expect(mission.rewardGold).toBeGreaterThanOrEqual(adGold);
    });
  });

  test('비정상 주입값(NaN/0/음수)은 기본 광고 보상으로 폴백해 하한이 지급된다', () => {
    for (const bad of [Number.NaN, 0, -5]) {
      const missions = getWeeklyMissions(weekKey, ALL_AREAS, bad);
      expect(missions.map((m) => m.rewardGold)).toEqual(SLOTS.map((slot) => slot.rewardGoldMin));
    }
  });

  test('수령 시 주입된 광고 보상 기준으로 지급되고 스냅샷 표시 금액과 일치한다', () => {
    const base = createInitialState();
    const rolled = rolloverWeeklyMissions(base.weeklyMissionState, weekKey, base.unlockedAreas);
    const target = getWeeklyMissions(weekKey, base.unlockedAreas)[0]!.target;
    const progress = rolled.progress.map((value, index) => (index === 0 ? target : value));
    const state: GameState = { ...base, gold: 0, weeklyMissionState: { ...rolled, progress } };

    const adGold = 250_000;
    const shown = getWeeklyMissionsSnapshot(state.weeklyMissionState, MON, state.unlockedAreas, adGold).missions.find(
      (m) => m.slot === 0
    )!;
    const claimed = claimWeeklyMission(state, 0, MON, adGold);
    expect(claimed).not.toBeNull();
    expect(claimed!.gold).toBe(shown.rewardGold);
    expect(claimed!.gold).toBe(Math.floor(adGold * SLOTS[0]!.adRewardRatio));
  });

  test('기존 세이브(고정 rewardGold 시절 진행 상태)도 오류 없이 수령된다', () => {
    const base = createInitialState();
    const rolled = rolloverWeeklyMissions(base.weeklyMissionState, weekKey, base.unlockedAreas);
    const target = getWeeklyMissions(weekKey, base.unlockedAreas)[0]!.target;
    const legacy = {
      weeklyMissionState: { ...rolled, progress: rolled.progress.map((v, i) => (i === 0 ? target : v)) },
    } as unknown as Partial<GameState>;
    const migrated = migrateLoadedState(legacy, base);
    const claimed = claimWeeklyMission(migrated, 0, MON);
    expect(claimed).not.toBeNull();
    expect(claimed!.gold - migrated.gold).toBe(SLOTS[0]!.rewardGoldMin);
  });
});

describe('광고 미지원 시 주간 watch_ad 제외 (#366)', () => {
  const weekKey = getMissionWeekKey(MON);

  test('adSupported 기본값(true)은 기존 동작과 동일하다(회귀 없음)', () => {
    const missions = getWeeklyMissions(weekKey, ALL_AREAS);
    expect(missions).toEqual(getWeeklyMissions(weekKey, ALL_AREAS, undefined, true));
    expect(missions).toHaveLength(WEEK_COUNT);
    expect(missions.some((m) => m.type === 'watch_ad')).toBe(true);
  });

  test('adSupported=false면 주간 watch_ad 슬롯이 제외되고 나머지는 그대로다', () => {
    const withAd = getWeeklyMissions(weekKey, ALL_AREAS, undefined, true);
    const withoutAd = getWeeklyMissions(weekKey, ALL_AREAS, undefined, false);
    expect(withoutAd.some((m) => m.type === 'watch_ad')).toBe(false);
    expect(withoutAd).toHaveLength(WEEK_COUNT - 1);
    expect(withoutAd).toEqual(withAd.filter((m) => m.type !== 'watch_ad'));
  });

  test('snapshot도 adSupported=false면 watch_ad를 제외한다', () => {
    const snap = getWeeklyMissionsSnapshot(
      createInitialWeeklyMissionState(),
      MON,
      ALL_AREAS,
      undefined,
      false
    );
    expect(snap.missions.some((m) => m.type === 'watch_ad')).toBe(false);
    expect(snap.missions).toHaveLength(WEEK_COUNT - 1);
  });

  test('광고 미지원 환경에서 남은 주간 미션을 모두 완료·수령해 100% 완주가 가능하다', () => {
    const shown = getWeeklyMissions(weekKey, ALL_AREAS, undefined, false);
    expect(shown.every((m) => m.type !== 'watch_ad')).toBe(true);

    const rolled = rolloverWeeklyMissions(createInitialWeeklyMissionState(), weekKey, ALL_AREAS);
    const progress = [...rolled.progress];
    for (const mission of shown) {
      progress[mission.slot] = mission.target;
    }
    let gameState: GameState = { ...createInitialState(), weeklyMissionState: { ...rolled, progress } };

    for (const mission of shown) {
      const next = claimWeeklyMission(gameState, mission.slot, MON, undefined, false);
      expect(next).not.toBeNull();
      gameState = next!;
    }
    const finalSnap = getWeeklyMissionsSnapshot(gameState.weeklyMissionState, MON, ALL_AREAS, undefined, false);
    expect(finalSnap.missions.every((m) => m.claimed)).toBe(true);
    expect(finalSnap.missions.some((m) => m.claimable)).toBe(false);
  });

  test('adSupported=false면 주간 watch_ad 슬롯은 완료돼 있어도 수령할 수 없다(광고 지원 시엔 수령 가능)', () => {
    const adSlot = getWeeklyMissions(weekKey, ALL_AREAS, undefined, true).find((m) => m.type === 'watch_ad')!;
    const rolled = rolloverWeeklyMissions(createInitialWeeklyMissionState(), weekKey, ALL_AREAS);
    const progress = [...rolled.progress];
    progress[adSlot.slot] = adSlot.target;
    const gameState: GameState = { ...createInitialState(), weeklyMissionState: { ...rolled, progress } };

    expect(claimWeeklyMission(gameState, adSlot.slot, MON, undefined, false)).toBeNull();
    expect(claimWeeklyMission(gameState, adSlot.slot, MON, undefined, true)).not.toBeNull();
  });
});
