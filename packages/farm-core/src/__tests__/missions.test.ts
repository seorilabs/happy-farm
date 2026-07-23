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
  recordPlantProgress,
  rolloverDailyMissions,
  type DailyMissionState,
} from '../missions';
import balance from '../balance.json';
import { CROPS, createInitialState, migrateLoadedState } from '../constants';
import { performHarvest, performPlant } from '../harvest';
import { getWeeklyMissionsSnapshot } from '../weeklyMissions';
import { getCropPurchaseCost } from '../modifiers';

// 일일 미션 슬롯 수. 슬롯 추가 시
// balance.json이 단일 출처이므로 테스트 상태 배열 길이도 여기서 파생한다.
const SLOT_COUNT = balance.missions.slots.length;
import { createPrestigedState } from '../prestige';
import type { AreaKey, CropKey, GameState } from '../types';
import { META_LAYER_KEYS } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_A = Date.UTC(2026, 5, 30, 9); // 2026-06-30 09:00 UTC
const DAY_B = DAY_A + DAY_MS; // next calendar day
const ALL_AREAS = [...new Set((Object.keys(CROPS) as CropKey[]).map((key) => CROPS[key]!.area))] as AreaKey[];

describe('getDailyMissions determinism', () => {
  test('returns one mission per slot with distinct types, stable for a given day', () => {
    const keyA = getMissionDayKey(DAY_A);
    const a1 = getDailyMissions(keyA, ALL_AREAS);
    const a2 = getDailyMissions(keyA, ALL_AREAS);
    expect(a1).toHaveLength(SLOT_COUNT);
    expect(a1).toEqual(a2);
    expect(new Set(a1.map((m) => m.type)).size).toBe(SLOT_COUNT);
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

  test('미해금 세이브는 딥 시스템 목표를 숨기고 해금 뒤 같은 결정론 슬롯을 노출한다 (#378)', () => {
    const base = createInitialState();
    const dayKey = getMissionDayKey(DAY_A);
    const lockedTypes = getDailyMissions(dayKey, base.unlockedAreas, undefined, true, base).map(
      (mission) => mission.type
    );
    expect(lockedTypes).toContain('spend_gold');
    expect(lockedTypes).not.toContain('collect_produce');
    expect(lockedTypes).not.toContain('craft_complete');
    expect(lockedTypes).not.toContain('breed');

    const cropKey = Object.keys(CROPS)[0] as CropKey;
    const unlocked: GameState = {
      ...base,
      harvestedCropKeys: [cropKey],
      lifetimeStats: { ...base.lifetimeStats, totalHarvests: 1 },
      animals: { ...base.animals, owned: [balance.animals.kinds[0]!.key] },
      research: { ...base.research, unlockedNodes: ['breeding_lab'] },
    };
    const unlockedTypes = getDailyMissions(
      dayKey,
      unlocked.unlockedAreas,
      undefined,
      true,
      unlocked
    ).map((mission) => mission.type);
    expect(unlockedTypes).toEqual(
      expect.arrayContaining(['collect_produce', 'craft_complete', 'spend_gold', 'breed'])
    );
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

  test('plant progress increments only the plant mission (#254)', () => {
    const start = createInitialDailyMissionState();
    const missions = getDailyMissions(getMissionDayKey(DAY_A), ALL_AREAS);
    const plantMission = missions.find((m) => m.type === 'plant')!;
    const harvestMission = missions.find((m) => m.type === 'harvest')!;

    const after = recordPlantProgress(start, DAY_A, ALL_AREAS);
    expect(after.progress[plantMission.slot]).toBe(1);
    // 심기는 수확/광고 미션 진행에는 영향을 주지 않는다(타입 격리).
    expect(after.progress[harvestMission.slot]).toBe(0);
  });

  test('레거시 3-slot 세이브가 현재 슬롯 수로 늘어난 뒤 첫 심기도 진행이 보존·기록된다 (#254)', () => {
    const missions = getDailyMissions(getMissionDayKey(DAY_A), ALL_AREAS);
    const plantMission = missions.find((m) => m.type === 'plant')!;
    const harvestMission = missions.find((m) => m.type === 'harvest')!;
    // 슬롯 3개 시절 저장된 상태를 그대로 흉내 낸다: 오늘 날짜 + 길이 3 배열 + 기존 수확 진행 2.
    const legacy: DailyMissionState = {
      dayKey: getMissionDayKey(DAY_A),
      areaKeys: [null, null, null],
      progress: [2, 0, 0],
      claimedSlots: [],
    };
    const after = recordPlantProgress(legacy, DAY_A, ALL_AREAS);
    // 길이가 현재 슬롯 수로 정규화되고, 롤오버(리셋) 없이 기존 수확 진행(2)이 보존되며
    // 신규 plant 슬롯에만 +1 기록된다(길이 가드 회귀 방지).
    expect(after.progress).toHaveLength(SLOT_COUNT);
    expect(after.progress[harvestMission.slot]).toBe(2);
    expect(after.progress[plantMission.slot]).toBe(1);
  });

  test('performPlant feeds plant-mission progress through the canonical pipeline (#254)', () => {
    let state = createInitialState();
    // 심을 수 있는 초기 작물(초보 밭)을 고른다.
    const cropKey = Object.keys(CROPS)[0] as CropKey;
    // 골드가 충분하고 0번 밭이 비어 있는 초기 상태에서 심기.
    state = { ...state, gold: 100_000 };
    const planted = performPlant(state, 0, cropKey, DAY_A);
    expect(planted).not.toBeNull();
    const snapshot = getDailyMissionsSnapshot(planted!.dailyMissionState, DAY_A, planted!.unlockedAreas);
    const plantMission = snapshot.missions.find((m) => m.type === 'plant')!;
    expect(plantMission.progress).toBe(1);
    const spent = getCropPurchaseCost(state, cropKey, DAY_A);
    expect(snapshot.missions.find((m) => m.type === 'spend_gold')!.progress).toBe(spent);
    expect(
      getWeeklyMissionsSnapshot(planted!.weeklyMissionState, DAY_A, planted!.unlockedAreas).missions.find(
        (mission) => mission.type === 'spend_gold'
      )!.progress
    ).toBe(spent);
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
    const progress = new Array(SLOT_COUNT).fill(0);
    progress[slot] = mission.target;
    const dailyMissionState: DailyMissionState = {
      dayKey: getMissionDayKey(now),
      areaKeys: new Array(SLOT_COUNT).fill(null),
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
    expect(migrated.dailyMissionState.progress).toHaveLength(SLOT_COUNT);
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

// #207: 미션 보상 진행도 스케일링. 보상 = max(rewardGoldMin, floor(광고보상 × adRewardRatio)).
// 주입이 없거나 비정상이면 기본 광고 보상(초기 100G) 기준으로 계산돼 하한(기존 고정값)이
// 그대로 지급된다 — 초기 체감 유지 계약을 여기서 고정한다.
describe('progress-scaled rewards (#207)', () => {
  const SLOTS = balance.missions.slots;
  const keyA = getMissionDayKey(DAY_A);

  test('주입이 없으면 슬롯별 하한(rewardGoldMin)이 그대로 지급된다(기존 고정 보상과 동일)', () => {
    const missions = getDailyMissions(keyA, ALL_AREAS);
    expect(missions.map((m) => m.rewardGold)).toEqual(SLOTS.map((slot) => slot.rewardGoldMin));
  });

  test('광고 보상이 커지면 보상이 비율대로 스케일되고 항상 그 광고 보상보다 작다', () => {
    const adGold = 1_000_000; // 과수원 이후 수준의 진행도 스케일 광고 보상
    const missions = getDailyMissions(keyA, ALL_AREAS, adGold);
    missions.forEach((mission, index) => {
      expect(mission.rewardGold).toBe(Math.floor(adGold * SLOTS[index]!.adRewardRatio));
      // 일일 비율 < 1 계약(check-balance invariant와 쌍): 미션이 광고 시청을 대체하지 않는다.
      expect(mission.rewardGold).toBeLessThan(adGold);
    });
  });

  test('비정상 주입값(NaN/0/음수)은 기본 광고 보상으로 폴백해 하한이 지급된다', () => {
    for (const bad of [Number.NaN, 0, -5]) {
      const missions = getDailyMissions(keyA, ALL_AREAS, bad);
      expect(missions.map((m) => m.rewardGold)).toEqual(SLOTS.map((slot) => slot.rewardGoldMin));
    }
  });

  test('수령 시 주입된 광고 보상 기준으로 지급되고 스냅샷 표시 금액과 일치한다', () => {
    const base = createInitialState();
    const mission = getDailyMissions(keyA, base.unlockedAreas).find((m) => m.slot === 0)!;
    const progress = new Array(SLOT_COUNT).fill(0);
    progress[0] = mission.target;
    const state: GameState = {
      ...base,
      dailyMissionState: {
        dayKey: keyA,
        areaKeys: new Array(SLOT_COUNT).fill(null),
        progress,
        claimedSlots: [],
      },
    };
    const adGold = 250_000;
    const shown = getDailyMissionsSnapshot(state.dailyMissionState, DAY_A, state.unlockedAreas, adGold).missions.find(
      (m) => m.slot === 0
    )!;
    const claimed = claimMission(state, 0, DAY_A, adGold);
    expect(claimed).not.toBeNull();
    expect(claimed!.gold - state.gold).toBe(shown.rewardGold);
    expect(claimed!.gold - state.gold).toBe(Math.floor(adGold * SLOTS[0]!.adRewardRatio));
  });

  test('기존 세이브(고정 rewardGold 시절 진행 상태)도 오류 없이 수령된다', () => {
    // 구 스키마 세이브에는 보상 관련 필드가 저장되지 않으므로(진행도/수령만 저장),
    // 로드 후 수령이 현행 하한 보상으로 정상 동작함을 고정한다.
    const base = createInitialState();
    const legacy = {
      dailyMissionState: {
        dayKey: keyA,
        areaKeys: [null, null, null],
        progress: [999, 0, 0],
        claimedSlots: [],
      },
    } as unknown as Partial<GameState>;
    const migrated = migrateLoadedState(legacy, base);
    const claimed = claimMission(migrated, 0, DAY_A);
    expect(claimed).not.toBeNull();
    expect(claimed!.gold - migrated.gold).toBe(SLOTS[0]!.rewardGoldMin);
  });
});

describe('광고 미지원 시 watch_ad 제외 (#366)', () => {
  const dayKey = getMissionDayKey(DAY_A);

  test('adSupported 두 경로를 한 번에 커버한다: true면 watch_ad 포함, false면 제외', () => {
    const withAd = getDailyMissions(dayKey, ALL_AREAS, undefined, true);
    const withoutAd = getDailyMissions(dayKey, ALL_AREAS, undefined, false);
    // true 경로: watch_ad 포함.
    expect(withAd.some((m) => m.type === 'watch_ad')).toBe(true);
    // false 경로: watch_ad 제외.
    expect(withoutAd.some((m) => m.type === 'watch_ad')).toBe(false);
  });

  test('adSupported 기본값(true)은 기존 동작과 동일하다(회귀 없음)', () => {
    const missions = getDailyMissions(dayKey, ALL_AREAS);
    expect(missions).toEqual(getDailyMissions(dayKey, ALL_AREAS, undefined, true));
    expect(missions).toHaveLength(SLOT_COUNT);
    expect(missions.some((m) => m.type === 'watch_ad')).toBe(true);
  });

  test('adSupported=false면 watch_ad 슬롯이 제외되고 나머지는 그대로다', () => {
    const withAd = getDailyMissions(dayKey, ALL_AREAS, undefined, true);
    const withoutAd = getDailyMissions(dayKey, ALL_AREAS, undefined, false);
    expect(withoutAd.some((m) => m.type === 'watch_ad')).toBe(false);
    expect(withoutAd).toHaveLength(SLOT_COUNT - 1);
    // 제외 외에는 슬롯/타깃/보상이 불변.
    expect(withoutAd).toEqual(withAd.filter((m) => m.type !== 'watch_ad'));
  });

  test('adSupported=false 목록도 결정적이다(같은 dayKey·adSupported → 같은 목록)', () => {
    expect(getDailyMissions(dayKey, ALL_AREAS, undefined, false)).toEqual(
      getDailyMissions(dayKey, ALL_AREAS, undefined, false)
    );
  });

  test('snapshot도 adSupported=false면 watch_ad를 제외한다', () => {
    const snap = getDailyMissionsSnapshot(
      createInitialDailyMissionState(),
      DAY_A,
      ALL_AREAS,
      undefined,
      false
    );
    expect(snap.missions.some((m) => m.type === 'watch_ad')).toBe(false);
    expect(snap.missions).toHaveLength(SLOT_COUNT - 1);
  });

  test('광고 미지원 환경에서 남은 미션을 모두 완료·수령해 100% 완주가 가능하다', () => {
    const base = createInitialState();
    const shown = getDailyMissions(dayKey, ALL_AREAS, undefined, false, base);
    expect(shown.every((m) => m.type !== 'watch_ad')).toBe(true);

    // 표시되는 미션들의 진행도를 target까지 채운 상태를 구성한다.
    const rolled = rolloverDailyMissions(createInitialDailyMissionState(), dayKey, ALL_AREAS);
    const progress = [...rolled.progress];
    for (const mission of shown) {
      progress[mission.slot] = mission.target;
    }
    let gameState: GameState = { ...base, dailyMissionState: { ...rolled, progress } };

    // 표시되는 모든 슬롯을 수령 → 전부 성공(영구 미완 슬롯 없음).
    for (const mission of shown) {
      const next = claimMission(gameState, mission.slot, DAY_A, undefined, false);
      expect(next).not.toBeNull();
      gameState = next!;
    }
    const finalSnap = getDailyMissionsSnapshot(
      gameState.dailyMissionState,
      DAY_A,
      ALL_AREAS,
      undefined,
      false,
      gameState
    );
    expect(finalSnap.missions.every((m) => m.claimed)).toBe(true);
    expect(finalSnap.missions.some((m) => m.claimable)).toBe(false);
  });

  test('adSupported=false면 watch_ad 슬롯은 완료돼 있어도 수령할 수 없다(광고 지원 시엔 수령 가능)', () => {
    const adSlot = getDailyMissions(dayKey, ALL_AREAS, undefined, true).find((m) => m.type === 'watch_ad')!;
    const rolled = rolloverDailyMissions(createInitialDailyMissionState(), dayKey, ALL_AREAS);
    const progress = [...rolled.progress];
    progress[adSlot.slot] = adSlot.target;
    const gameState: GameState = { ...createInitialState(), dailyMissionState: { ...rolled, progress } };

    // 광고 미지원: watch_ad 슬롯이 목록에서 빠져 수령 불가.
    expect(claimMission(gameState, adSlot.slot, DAY_A, undefined, false)).toBeNull();
    // 광고 지원: 동일 상태에서 수령 가능(회귀 없음).
    expect(claimMission(gameState, adSlot.slot, DAY_A, undefined, true)).not.toBeNull();
  });
});
