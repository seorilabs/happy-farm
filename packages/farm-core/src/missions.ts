// 일일 미션(오늘의 목표) 로직.
// UTC 하루마다 3종 미션(작물 수확 / 특정 구역 수확 / 광고 시청)으로 능동적 플레이를 유도한다.
// 목표치는 날짜 해시로 결정되고, harvest_area 미션의 "오늘의 구역"은 하루가 시작될 때(롤오버)
// 플레이어의 해금 구역에서 한 번 뽑아 DailyMissionState.areaKeys에 고정한다. 이렇게 하면 같은
// 날 동안 해금 상태가 바뀌어도 미션 구역이 흔들리지 않아, 표시(snapshot)·진행도 기록(record)·
// 수령(claim)이 모두 동일한 구역을 공유한다. 진행도/수령/구역 스냅샷만 메타 레이어에 저장하며,
// cropOfTheDay·weeklyEvent의 결정론 해시 설계를 따른다(자정 경계는 코드베이스 공통 UTC 기준).

import balance from './balance.json';
import type { AreaKey, GameState } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export type MissionType = (typeof balance.missions.slots)[number]['type'];

export type DailyMission = {
  // 슬롯 인덱스(0..N-1). 진행도/수령 추적의 안정적 키.
  slot: number;
  type: MissionType;
  // 완료에 필요한 목표 수치(수확 횟수 / 광고 시청 횟수).
  target: number;
  // harvest_area 미션이 가리키는 "오늘의 구역". 그 외 타입은 null.
  areaKey: AreaKey | null;
  rewardGold: number;
};

export type DailyMissionState = {
  // 현재 progress/claimedSlots/areaKeys가 속한 날짜 키. 날이 바뀌면 롤오버로 갱신된다.
  dayKey: string;
  // 슬롯별로 이 날 고정된 "오늘의 구역"(harvest_area만 값, 그 외 null). 롤오버 시 한 번만 뽑아
  // 하루 동안 불변. 표시/기록/수령이 같은 구역을 보게 하는 핵심 필드.
  areaKeys: (AreaKey | null)[];
  // 슬롯별 진행도(인덱스 = slot).
  progress: number[];
  // 이미 보상을 수령한 슬롯 목록.
  claimedSlots: number[];
};

type MissionSlotConfig = {
  type: MissionType;
  targets: number[];
  rewardGold: number;
};

const MISSION_SLOTS = balance.missions.slots as readonly MissionSlotConfig[];
const DAILY_MISSION_COUNT = MISSION_SLOTS.length;

// 미션 추첨 풀(선언 순서 유지). harvest_area의 "오늘의 구역"을 여기서 뽑는다.
const FEATURABLE_AREAS = balance.areas.map((area) => area.key) as AreaKey[];
const FEATURABLE_AREA_SET = new Set<AreaKey>(FEATURABLE_AREAS);
// 처음부터 열려 있는 무료·비게이트 구역. 해금 목록이 비어 있는 손상 상태의 폴백.
const STARTER_AREAS = balance.areas
  .filter((area) => area.unlock?.cost === 0 && area.unlock?.gate == null)
  .map((area) => area.key) as AreaKey[];

// FNV-1a 기반 32-bit 문자열 해시. 날짜 키처럼 인접한 입력이 슬롯/목표/구역에 고르게
// 흩어지도록 마지막에 한 번 더 섞는다.
function hashString(input: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  return h >>> 0;
}

// now가 속한 UTC 캘린더 날짜 키(에포크 일수 문자열). cropOfTheDay·weeklyEvent와 동일한 UTC
// 자정 경계를 쓴다(오늘의 작물/주말 이벤트와 같은 시각에 갱신되도록 일부러 통일).
export function getMissionDayKey(now = Date.now()): string {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  return String(Math.floor(safeNow / DAY_MS));
}

// "오늘의 구역" 추첨 풀: 해금 목록을 넘기면 그 구역만 후보로 삼아 항상 도달 가능한 구역이
// 선택되게 한다. 손상/빈 해금 목록(정상 세이브에선 발생하지 않음 — 마이그레이션이 starter를
// 보장)일 때만 starter로 폴백해 미션 구역이 항상 정의되도록 한다. 인자가 없으면(순수 시간 쿼리)
// 전체 풀을 쓴다.
function getEligibleAreas(unlockedAreas?: readonly AreaKey[]): AreaKey[] {
  if (unlockedAreas == null) {
    return FEATURABLE_AREAS;
  }
  const unlocked = new Set(unlockedAreas);
  const eligible = FEATURABLE_AREAS.filter((key) => unlocked.has(key));
  if (eligible.length > 0) {
    return eligible;
  }
  return STARTER_AREAS.length > 0 ? STARTER_AREAS : FEATURABLE_AREAS;
}

// 슬롯별 "오늘의 구역"을 결정한다(harvest_area만 값, 그 외 null). 롤오버 시 한 번 호출해
// areaKeys에 고정하므로, 같은 날 unlockedAreas가 변해도 재계산되지 않는다.
function pickFeaturedAreas(dayKey: string, unlockedAreas?: readonly AreaKey[]): (AreaKey | null)[] {
  const areaPool = getEligibleAreas(unlockedAreas);
  return MISSION_SLOTS.map((slot, index) =>
    slot.type === 'harvest_area' && areaPool.length > 0
      ? (areaPool[hashString(`${dayKey}@${index}`) % areaPool.length] ?? null)
      : null
  );
}

// 날짜 키 + 고정된 areaKeys로부터 미션 목록을 결정론적으로 구성한다. 목표치는 날짜 해시로
// 정해지며(watch_ad는 targets=[1] 고정 — 매일 1회 시청), 구역은 areaKeys 스냅샷을 그대로 쓴다.
function resolveMissions(dayKey: string, areaKeys: readonly (AreaKey | null)[]): DailyMission[] {
  return MISSION_SLOTS.map((slot, index) => {
    const target = slot.targets[hashString(`${dayKey}#${index}`) % slot.targets.length] ?? slot.targets[0] ?? 1;
    const areaKey = slot.type === 'harvest_area' ? (areaKeys[index] ?? null) : null;
    return { slot: index, type: slot.type, target, areaKey, rewardGold: slot.rewardGold };
  });
}

// 해당 날짜의 미션 3종 "미리보기"를 결정론적으로 반환한다(구역을 즉석에서 추첨). 실제 진행도
// 기록/표시는 DailyMissionState.areaKeys에 고정된 구역을 쓰므로, 이 함수는 UI 프리뷰/테스트
// 용도다. 같은 (dayKey, unlockedAreas)면 항상 동일.
export function getDailyMissions(dayKey: string, unlockedAreas?: readonly AreaKey[]): DailyMission[] {
  return resolveMissions(dayKey, pickFeaturedAreas(dayKey, unlockedAreas));
}

export function createInitialDailyMissionState(): DailyMissionState {
  return {
    dayKey: '',
    areaKeys: new Array(DAILY_MISSION_COUNT).fill(null),
    progress: new Array(DAILY_MISSION_COUNT).fill(0),
    claimedSlots: [],
  };
}

function isKnownArea(value: unknown): value is AreaKey {
  return typeof value === 'string' && FEATURABLE_AREA_SET.has(value as AreaKey);
}

// 직렬화된 unknown 값을 안전한 DailyMissionState로 정규화한다. 배열은 슬롯 수에 맞추고,
// 알 수 없는 구역 키와 잘못된 진행도/슬롯을 걸러낸다.
export function normalizeDailyMissionState(value: unknown): DailyMissionState {
  if (typeof value !== 'object' || value == null) {
    return createInitialDailyMissionState();
  }
  const raw = value as Record<string, unknown>;
  const dayKey = typeof raw.dayKey === 'string' ? raw.dayKey : '';
  const areaKeysArr = Array.isArray(raw.areaKeys) ? raw.areaKeys : [];
  const areaKeys = Array.from({ length: DAILY_MISSION_COUNT }, (_, index) => {
    const candidate = areaKeysArr[index];
    return isKnownArea(candidate) ? candidate : null;
  });
  const progressArr = Array.isArray(raw.progress) ? raw.progress : [];
  const progress = Array.from({ length: DAILY_MISSION_COUNT }, (_, index) => {
    const candidate = progressArr[index];
    return typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0
      ? Math.floor(candidate)
      : 0;
  });
  const claimedSlots = Array.isArray(raw.claimedSlots)
    ? [
        ...new Set(
          raw.claimedSlots.filter(
            (slot): slot is number =>
              typeof slot === 'number' && Number.isInteger(slot) && slot >= 0 && slot < DAILY_MISSION_COUNT
          )
        ),
      ]
    : [];
  return { dayKey, areaKeys, progress, claimedSlots };
}

// 날짜가 바뀌었으면(또는 구역 스냅샷이 비정상이면) "오늘의 구역"을 새로 뽑고 진행도/수령을
// 초기화한다. 같은 날이면 areaKeys·진행도를 그대로 보존해 하루 동안 미션이 불변이다.
export function rolloverDailyMissions(
  state: DailyMissionState,
  dayKey: string,
  unlockedAreas?: readonly AreaKey[]
): DailyMissionState {
  if (state.dayKey === dayKey && state.areaKeys.length === DAILY_MISSION_COUNT) {
    return state;
  }
  return {
    dayKey,
    areaKeys: pickFeaturedAreas(dayKey, unlockedAreas),
    progress: new Array(DAILY_MISSION_COUNT).fill(0),
    claimedSlots: [],
  };
}

function recordProgressForMatches(
  state: DailyMissionState,
  now: number,
  unlockedAreas: readonly AreaKey[] | undefined,
  matches: (mission: DailyMission) => boolean
): DailyMissionState {
  const dayKey = getMissionDayKey(now);
  const rolled = rolloverDailyMissions(state, dayKey, unlockedAreas);
  // 진행도 매칭은 이 날 고정된 areaKeys 기준 — unlockedAreas 시점 차이에 영향받지 않는다.
  const missions = resolveMissions(rolled.dayKey, rolled.areaKeys);
  let progress = rolled.progress;
  for (const mission of missions) {
    if (!matches(mission)) {
      continue;
    }
    if (progress === rolled.progress) {
      progress = [...rolled.progress];
    }
    progress[mission.slot] = (progress[mission.slot] ?? 0) + 1;
  }
  return progress === rolled.progress ? rolled : { ...rolled, progress };
}

// 작물 1회 수확을 미션 진행도에 반영한다: harvest 미션은 항상 +1, harvest_area 미션은
// 수확 구역이 이 날 고정된 "오늘의 구역"과 일치할 때 +1. 자정 롤오버를 포함한다.
// unlockedAreas는 새 날 첫 호출 시 "오늘의 구역"을 뽑는 데만 쓰인다.
export function recordHarvestProgress(
  state: DailyMissionState,
  areaKey: AreaKey,
  now = Date.now(),
  unlockedAreas?: readonly AreaKey[]
): DailyMissionState {
  return recordProgressForMatches(
    state,
    now,
    unlockedAreas,
    (mission) =>
      mission.type === 'harvest' || (mission.type === 'harvest_area' && mission.areaKey === areaKey)
  );
}

// 보상형 광고 1회 시청을 watch_ad 미션 진행도에 반영한다. unlockedAreas는 새 날 첫 호출 시
// "오늘의 구역" 고정을 위해 받는다(광고가 그날의 첫 행동일 수 있으므로).
export function recordAdWatchProgress(
  state: DailyMissionState,
  now = Date.now(),
  unlockedAreas?: readonly AreaKey[]
): DailyMissionState {
  return recordProgressForMatches(state, now, unlockedAreas, (mission) => mission.type === 'watch_ad');
}

export type DailyMissionView = DailyMission & {
  progress: number;
  completed: boolean;
  claimed: boolean;
  // 완료됐고 아직 수령하지 않은 상태(보상 수령 버튼 활성 조건).
  claimable: boolean;
};

export type DailyMissionsSnapshot = {
  // 롤오버가 반영된 상태. 진행도를 바꾸는 경로(record/claim)는 이 결과를 GameState에 저장하므로
  // 자정 갱신이 영속화된다. 표시 전용 호출은 저장하지 않아도 결정론적이라 반복 호출이 안전하다.
  state: DailyMissionState;
  dayKey: string;
  missions: DailyMissionView[];
};

// 화면 표시용 스냅샷. now 기준으로 롤오버를 적용한 뒤 각 미션의 진행도·완료·수령·수령가능 여부를 계산한다.
export function getDailyMissionsSnapshot(
  state: DailyMissionState,
  now = Date.now(),
  unlockedAreas?: readonly AreaKey[]
): DailyMissionsSnapshot {
  const dayKey = getMissionDayKey(now);
  const rolled = rolloverDailyMissions(state, dayKey, unlockedAreas);
  const missions = resolveMissions(rolled.dayKey, rolled.areaKeys).map((mission) => {
    const progress = rolled.progress[mission.slot] ?? 0;
    const completed = progress >= mission.target;
    const claimed = rolled.claimedSlots.includes(mission.slot);
    return { ...mission, progress, completed, claimed, claimable: completed && !claimed };
  });
  return { state: rolled, dayKey, missions };
}

// 해당 슬롯의 보상을 지금 수령할 수 있는지(완료 && 미수령) 여부.
export function canClaimMission(
  state: DailyMissionState,
  slot: number,
  now = Date.now(),
  unlockedAreas?: readonly AreaKey[]
): boolean {
  const snapshot = getDailyMissionsSnapshot(state, now, unlockedAreas);
  return snapshot.missions.some((mission) => mission.slot === slot && mission.claimable);
}

// 미션 보상을 수령해 골드를 지급하고 새 GameState를 반환한다. 미완료·이미 수령·잘못된 슬롯이면
// null을 반환해 중복 수령/과지급을 막는다. 함수형 업데이터 안에서 호출하면 동시 탭에도 1회만 지급된다.
export function claimMission(gameState: GameState, slot: number, now = Date.now()): GameState | null {
  const snapshot = getDailyMissionsSnapshot(gameState.dailyMissionState, now, gameState.unlockedAreas);
  const mission = snapshot.missions.find((candidate) => candidate.slot === slot);
  if (mission == null || !mission.claimable) {
    return null;
  }
  return {
    ...gameState,
    gold: gameState.gold + mission.rewardGold,
    dailyMissionState: {
      ...snapshot.state,
      claimedSlots: [...snapshot.state.claimedSlots, slot],
    },
  };
}
