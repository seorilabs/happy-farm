// 주간 미션 트랙.
// 일일 미션(오늘의 목표) 위에 "주(週)" 시간 지평을 얹어, 하루 3슬롯을 다 마쳐도 며칠에 걸쳐
// 이어갈 장기 목표를 제공한다. UTC 월요일 자정 경계로 주가 바뀌며(cropOfTheDay/일일 미션과 같은
// UTC 일수 기반), 목표는 balance.missions.weekly.slots의 고정 목표를 쓰고 harvest_area의
// "이번 주 구역"만 주 단위로 결정론적으로 회전한다. 진행도/수령/구역 스냅샷만 메타 레이어에 저장한다.
//
// 진행은 기존 이벤트 경로를 재사용해 누적한다: 수확 파이프라인(harvest 슬롯 +1, harvest_area는
// 이번 주 구역과 일치 시 +1, donate 슬롯은 기부 모드 수확 시 +1)과 보상형 광고 시청(watch_ad).

import balance from './balance.json';
import type { AreaKey, GameState } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export type WeeklyMissionType = (typeof balance.missions.weekly.slots)[number]['type'];

export type WeeklyMission = {
  // 슬롯 인덱스(0..N-1). 진행도/수령 추적의 안정적 키.
  slot: number;
  type: WeeklyMissionType;
  // 완료에 필요한 목표 수치(주간 누적 카운트).
  target: number;
  // harvest_area 미션이 가리키는 "이번 주 구역". 그 외 타입은 null.
  areaKey: AreaKey | null;
  rewardGold: number;
};

export type WeeklyMissionState = {
  // 현재 progress/claimedSlots/areaKeys가 속한 주(週) 키. 주가 바뀌면 롤오버로 갱신된다.
  weekKey: string;
  // 슬롯별로 이 주에 고정된 "이번 주 구역"(harvest_area만 값, 그 외 null).
  areaKeys: (AreaKey | null)[];
  // 슬롯별 진행도(인덱스 = slot).
  progress: number[];
  // 이미 보상을 수령한 슬롯 목록.
  claimedSlots: number[];
};

type WeeklySlotConfig = { type: WeeklyMissionType; target: number; rewardGold: number };

const WEEKLY_SLOTS = balance.missions.weekly.slots as readonly WeeklySlotConfig[];
const WEEKLY_MISSION_COUNT = WEEKLY_SLOTS.length;

// 미션 추첨 풀(선언 순서 유지). harvest_area의 "이번 주 구역"을 여기서 뽑는다.
const FEATURABLE_AREAS = balance.areas.map((area) => area.key) as AreaKey[];
const FEATURABLE_AREA_SET = new Set<AreaKey>(FEATURABLE_AREAS);
// 처음부터 열려 있는 무료·비게이트 구역. 해금 목록이 비어 있는 손상 상태의 폴백.
const STARTER_AREAS = balance.areas
  .filter((area) => area.unlock?.cost === 0 && area.unlock?.gate == null)
  .map((area) => area.key) as AreaKey[];

// FNV-1a 기반 32-bit 문자열 해시(missions.ts와 동일). 주 키가 구역에 고르게 흩어지도록 섞는다.
function hashString(input: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  return h >>> 0;
}

// now가 속한 UTC 주(週) 키(월요일 경계). epoch(1970-01-01)는 목요일이므로 +3일 보정하면
// 월요일마다 주 인덱스가 1씩 증가한다(월요일 00:00 UTC가 주 경계).
export function getMissionWeekKey(now = Date.now()): string {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const days = Math.floor(safeNow / DAY_MS);
  return String(Math.floor((days + 3) / 7));
}

// "이번 주 구역" 추첨 풀: 해금 목록을 넘기면 그 구역만 후보로 삼는다. 손상/빈 해금 목록일 때만
// starter로 폴백한다. 인자가 없으면(순수 시간 쿼리) 전체 풀을 쓴다. (missions.ts와 동일 규칙.)
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

// 슬롯별 "이번 주 구역"을 결정한다(harvest_area만 값). 롤오버 시 한 번 호출해 areaKeys에 고정하므로,
// 같은 주에 unlockedAreas가 변해도 재계산되지 않는다.
function pickFeaturedAreas(weekKey: string, unlockedAreas?: readonly AreaKey[]): (AreaKey | null)[] {
  const areaPool = getEligibleAreas(unlockedAreas);
  return WEEKLY_SLOTS.map((slot, index) =>
    slot.type === 'harvest_area' && areaPool.length > 0
      ? (areaPool[hashString(`${weekKey}@${index}`) % areaPool.length] ?? null)
      : null
  );
}

// 고정된 areaKeys로부터 미션 목록을 결정론적으로 구성한다. 목표치는 슬롯별 고정값이며(주 해시
// 불필요), 구역은 areaKeys 스냅샷을 그대로 쓴다.
function resolveMissions(areaKeys: readonly (AreaKey | null)[]): WeeklyMission[] {
  return WEEKLY_SLOTS.map((slot, index) => ({
    slot: index,
    type: slot.type,
    target: slot.target,
    areaKey: slot.type === 'harvest_area' ? (areaKeys[index] ?? null) : null,
    rewardGold: slot.rewardGold,
  }));
}

// 해당 주의 주간 미션 "미리보기"를 결정론적으로 반환한다(구역을 즉석 추첨). 같은
// (weekKey, unlockedAreas)면 항상 동일. UI 프리뷰/테스트용.
export function getWeeklyMissions(weekKey: string, unlockedAreas?: readonly AreaKey[]): WeeklyMission[] {
  return resolveMissions(pickFeaturedAreas(weekKey, unlockedAreas));
}

export function createInitialWeeklyMissionState(): WeeklyMissionState {
  return {
    weekKey: '',
    areaKeys: new Array(WEEKLY_MISSION_COUNT).fill(null),
    progress: new Array(WEEKLY_MISSION_COUNT).fill(0),
    claimedSlots: [],
  };
}

function isKnownArea(value: unknown): value is AreaKey {
  return typeof value === 'string' && FEATURABLE_AREA_SET.has(value as AreaKey);
}

// 직렬화된 unknown 값을 안전한 WeeklyMissionState로 정규화한다(missions.ts의 정규화와 동일 규칙).
export function normalizeWeeklyMissionState(value: unknown): WeeklyMissionState {
  if (typeof value !== 'object' || value == null) {
    return createInitialWeeklyMissionState();
  }
  const raw = value as Record<string, unknown>;
  const weekKey = typeof raw.weekKey === 'string' ? raw.weekKey : '';
  const areaKeysArr = Array.isArray(raw.areaKeys) ? raw.areaKeys : [];
  const areaKeys = Array.from({ length: WEEKLY_MISSION_COUNT }, (_, index) => {
    const candidate = areaKeysArr[index];
    return isKnownArea(candidate) ? candidate : null;
  });
  const progressArr = Array.isArray(raw.progress) ? raw.progress : [];
  const progress = Array.from({ length: WEEKLY_MISSION_COUNT }, (_, index) => {
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
              typeof slot === 'number' && Number.isInteger(slot) && slot >= 0 && slot < WEEKLY_MISSION_COUNT
          )
        ),
      ]
    : [];
  return { weekKey, areaKeys, progress, claimedSlots };
}

// 주가 바뀌었으면 "이번 주 구역"을 새로 뽑고 진행도/수령을 초기화한다. 같은 주면 진행도/수령을
// 절대 리셋하지 않는다 — 슬롯 수(WEEKLY_MISSION_COUNT)가 balance 변경으로 늘어나 기존 세이브의
// 배열 길이가 달라져도, 같은 주 안에서는 누적 진행도/수령을 보존하고 배열 길이만 현재 슬롯 수에
// 맞춘다(새 슬롯은 null/0으로 패딩, 삭제된 슬롯은 뒤에서 잘림). 이렇게 하지 않으면 새 슬롯 도입
// 직후 같은 주에 접속만 해도 진행/수령 메타가 통째로 유실된다.
export function rolloverWeeklyMissions(
  state: WeeklyMissionState,
  weekKey: string,
  unlockedAreas?: readonly AreaKey[]
): WeeklyMissionState {
  if (state.weekKey !== weekKey) {
    return {
      weekKey,
      areaKeys: pickFeaturedAreas(weekKey, unlockedAreas),
      progress: new Array(WEEKLY_MISSION_COUNT).fill(0),
      claimedSlots: [],
    };
  }
  // 같은 주 + 배열 길이도 일치 → 그대로(참조 보존).
  if (state.areaKeys.length === WEEKLY_MISSION_COUNT && state.progress.length === WEEKLY_MISSION_COUNT) {
    return state;
  }
  // 같은 주지만 슬롯 수가 바뀜: 기존 슬롯의 areaKey/진행도/수령을 "그대로" 보존하고, 새로 늘어난
  // 인덱스는 재추첨 없이 null/0으로만 패딩한다. 새 harvest_area 슬롯의 "이번 주 구역"은 다음 주
  // 롤오버에서 해금 구역 기준으로 배정되며, 그 전까지 areaKey=null이라 진행 매칭에서 자동 제외된다
  // (같은 주에 featured를 다시 뽑아 기존 구역이 흔들리거나 미해금 구역이 고정되는 일이 없음).
  const oldAreaCount = state.areaKeys.length;
  return {
    weekKey,
    areaKeys: Array.from({ length: WEEKLY_MISSION_COUNT }, (_, index) =>
      index < oldAreaCount ? (state.areaKeys[index] ?? null) : null
    ),
    progress: Array.from({ length: WEEKLY_MISSION_COUNT }, (_, index) =>
      index < state.progress.length ? (state.progress[index] ?? 0) : 0
    ),
    claimedSlots: state.claimedSlots.filter((slot) => slot < WEEKLY_MISSION_COUNT),
  };
}

function recordProgressForMatches(
  state: WeeklyMissionState,
  now: number,
  unlockedAreas: readonly AreaKey[] | undefined,
  matches: (mission: WeeklyMission) => boolean
): WeeklyMissionState {
  const weekKey = getMissionWeekKey(now);
  const rolled = rolloverWeeklyMissions(state, weekKey, unlockedAreas);
  const missions = resolveMissions(rolled.areaKeys);
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

// 작물 1회 수확을 주간 진행도에 반영한다: harvest 슬롯은 항상 +1, harvest_area는 수확 구역이
// 이번 주 구역과 일치할 때 +1, donate 슬롯은 기부 모드 수확(donated=true)일 때 +1. 주 롤오버 포함.
export function recordWeeklyHarvestProgress(
  state: WeeklyMissionState,
  areaKey: AreaKey,
  donated: boolean,
  now = Date.now(),
  unlockedAreas?: readonly AreaKey[]
): WeeklyMissionState {
  return recordProgressForMatches(
    state,
    now,
    unlockedAreas,
    (mission) =>
      mission.type === 'harvest' ||
      // areaKey != null 가드: 롤오버 리사이즈로 패딩된(구역 미배정) harvest_area 슬롯은
      // 매칭에서 확실히 제외한다.
      (mission.type === 'harvest_area' && mission.areaKey != null && mission.areaKey === areaKey) ||
      (mission.type === 'donate' && donated)
  );
}

// 보상형 광고 1회 시청을 watch_ad 주간 진행도에 반영한다(주 롤오버 포함).
export function recordWeeklyAdWatchProgress(
  state: WeeklyMissionState,
  now = Date.now(),
  unlockedAreas?: readonly AreaKey[]
): WeeklyMissionState {
  return recordProgressForMatches(state, now, unlockedAreas, (mission) => mission.type === 'watch_ad');
}

export type WeeklyMissionView = WeeklyMission & {
  progress: number;
  completed: boolean;
  claimed: boolean;
  // 완료됐고 아직 수령하지 않은 상태(보상 수령 버튼 활성 조건).
  claimable: boolean;
};

export type WeeklyMissionsSnapshot = {
  state: WeeklyMissionState;
  weekKey: string;
  missions: WeeklyMissionView[];
};

// 화면 표시용 스냅샷. now 기준으로 롤오버를 적용한 뒤 각 미션의 진행도·완료·수령·수령가능을 계산한다.
// now 기본값은 일일 미션 스냅샷과 동일한 규약이다: 호출측(FarmGame/record 경로)은 같은 흐름에서
// 동일한 now(Date.now()/rewardedAt)를 명시 전달하므로 record와 snapshot이 같은 주 키를 본다.
export function getWeeklyMissionsSnapshot(
  state: WeeklyMissionState,
  now = Date.now(),
  unlockedAreas?: readonly AreaKey[]
): WeeklyMissionsSnapshot {
  const weekKey = getMissionWeekKey(now);
  const rolled = rolloverWeeklyMissions(state, weekKey, unlockedAreas);
  const missions = resolveMissions(rolled.areaKeys).map((mission) => {
    const progress = rolled.progress[mission.slot] ?? 0;
    const completed = progress >= mission.target;
    const claimed = rolled.claimedSlots.includes(mission.slot);
    return { ...mission, progress, completed, claimed, claimable: completed && !claimed };
  });
  return { state: rolled, weekKey, missions };
}

// 해당 슬롯의 보상을 지금 수령할 수 있는지(완료 && 미수령) 여부.
export function canClaimWeeklyMission(
  state: WeeklyMissionState,
  slot: number,
  now = Date.now(),
  unlockedAreas?: readonly AreaKey[]
): boolean {
  const snapshot = getWeeklyMissionsSnapshot(state, now, unlockedAreas);
  return snapshot.missions.some((mission) => mission.slot === slot && mission.claimable);
}

// 주간 미션 보상을 수령해 골드를 지급하고 새 GameState를 반환한다. 미완료·이미 수령·잘못된 슬롯이면
// null을 반환해 중복 수령/과지급을 막는다. 함수형 업데이터 안에서 호출하면 동시 탭에도 1회만 지급된다.
export function claimWeeklyMission(gameState: GameState, slot: number, now = Date.now()): GameState | null {
  const snapshot = getWeeklyMissionsSnapshot(gameState.weeklyMissionState, now, gameState.unlockedAreas);
  const mission = snapshot.missions.find((candidate) => candidate.slot === slot);
  if (mission == null || !mission.claimable) {
    return null;
  }
  return {
    ...gameState,
    gold: gameState.gold + mission.rewardGold,
    weeklyMissionState: {
      ...snapshot.state,
      claimedSlots: [...snapshot.state.claimedSlots, slot],
    },
  };
}
