import balance from './balance.json';
import type { AnimalKey, GameState } from './types';
import { recordMissionProgressEvent } from './missionEvents';

// 동물 사육/생산 루프. 작물(초 단위 성장)과는 다른 주기(수 분~수십 분)의 보조
// 재방문 루프를 제공한다: 사료(골드)를 투입 → 결정적 타이머 경과 → 산출물 수집
// → 판매(골드 획득). 순수/결정적 모듈이며 rng를 쓰지 않는다(타이머는 fedAt +
// produceTimerMs로만 결정). 소유/진행(사료 투입 시각)은 메타 레이어
// GameState.animals에 저장되어 프레스티지 후에도 유지된다. 카탈로그(키/아이콘/
// 비용/타이머/판매가)는 balance.json, 현지화 이름/설명은 i18n/labels.ts에 있다.
//
// 밸런스: 각 동물의 산출물 net/h((producePrice - feedCost)/produceTimerMs)는
// 가장 싼 작물의 net/h보다 낮게 유지되어(scripts/check-balance.mjs에서 강제) 능동
// 작물 재배를 지배하지 않는 "보조 트리클"로만 기능한다.

export type Animal = {
  key: AnimalKey;
  icon: string;
  // 산출물 아이콘(달걀/우유 등) — 시트에서 산출물 표시에 쓴다.
  produceIcon: string;
  // 축사 건설(1회) 골드 비용. 소유는 메타 레이어라 프레스티지 후에도 유지된다.
  purchaseCost: number;
  // 급여 1회당 골드 비용.
  feedCost: number;
  // 급여 후 산출물이 준비될 때까지의 결정적 대기 시간(ms).
  produceTimerMs: number;
  // 산출물 판매가(골드). producePrice > feedCost라 사이클마다 양의 마진을 가진다.
  producePrice: number;
};

// 카탈로그(선언 순서 = UI 렌더 순서). 저렴/짧은 주기 → 비싼/긴 주기 순.
export const ANIMALS: readonly Animal[] = balance.animals.kinds as readonly Animal[];

const ANIMAL_BY_KEY = new Map<string, Animal>(ANIMALS.map((animal) => [animal.key, animal]));

export function isKnownAnimalKey(value: unknown): value is AnimalKey {
  return typeof value === 'string' && ANIMAL_BY_KEY.has(value);
}

export function getAnimal(key: AnimalKey): Animal | undefined {
  return ANIMAL_BY_KEY.get(key);
}

// 동물 소유/진행 상태. owned = 건설한 축사 키 목록, feeding = 현재 급여 중인 동물의
// 급여 시각(fedAt) 맵. feeding에 항목이 있으면 성장/수확 대기 중이고, 없으면
// 유휴(다시 급여 가능) 상태다.
export type AnimalsState = {
  owned: AnimalKey[];
  feeding: Partial<Record<AnimalKey, number>>;
};

export function createInitialAnimalsState(): AnimalsState {
  return { owned: [], feeding: {} };
}

// 미지의 키(카탈로그에서 제거된 동물), 소유하지 않은 동물의 feeding 항목, 비유한
// fedAt 값을 모두 제거하고 카탈로그 선언 순서로 정렬해, 손상/레거시 세이브도 항상
// 렌더 안정적인 상태로 로드되게 한다.
export function normalizeAnimalsState(value: unknown): AnimalsState {
  if (typeof value !== 'object' || value == null) {
    return createInitialAnimalsState();
  }
  const raw = value as Partial<AnimalsState>;
  const ownedSet = new Set<AnimalKey>();
  if (Array.isArray(raw.owned)) {
    for (const item of raw.owned) {
      if (isKnownAnimalKey(item)) {
        ownedSet.add(item);
      }
    }
  }
  // 카탈로그 순서를 유지한 소유 목록.
  const owned = ANIMALS.filter((animal) => ownedSet.has(animal.key)).map((animal) => animal.key);

  const feeding: Partial<Record<AnimalKey, number>> = {};
  if (typeof raw.feeding === 'object' && raw.feeding != null) {
    for (const animal of ANIMALS) {
      // 소유한 동물의 급여 항목만 유지한다(소유하지 않은 동물의 진행은 무효).
      if (!ownedSet.has(animal.key)) {
        continue;
      }
      const fedAt = (raw.feeding as Record<string, unknown>)[animal.key];
      if (typeof fedAt === 'number' && Number.isFinite(fedAt)) {
        feeding[animal.key] = fedAt;
      }
    }
  }
  return { owned, feeding };
}

export function isAnimalOwned(state: GameState, key: AnimalKey): boolean {
  return state.animals.owned.includes(key);
}

export type AnimalPhase =
  // 미소유(축사 미건설).
  | 'locked'
  // 소유했지만 급여하지 않은 상태(급여 가능).
  | 'idle'
  // 급여 후 타이머 진행 중(수확 대기).
  | 'growing'
  // 타이머 완료(수확 가능).
  | 'ready';

export type AnimalStatus = {
  key: AnimalKey;
  icon: string;
  produceIcon: string;
  purchaseCost: number;
  feedCost: number;
  produceTimerMs: number;
  producePrice: number;
  owned: boolean;
  phase: AnimalPhase;
  // 급여 시각(진행/수확 대기 중일 때만, 아니면 null).
  fedAt: number | null;
  // 수확 가능 시각(진행/수확 대기 중일 때만, 아니면 null).
  readyAt: number | null;
  // 수확까지 남은 시간(ms, 0 이상). 유휴/미소유면 0.
  remainingMs: number;
};

// 동물의 파생 상태(순수 계산). now를 기준으로 phase/남은시간을 산출한다.
// 미지의 키면 null. 소유 여부/급여 시각은 GameState.animals에서 읽는다.
export function getAnimalState(state: GameState, key: AnimalKey, now: number = Date.now()): AnimalStatus | null {
  const animal = getAnimal(key);
  if (animal == null) {
    return null;
  }
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const owned = isAnimalOwned(state, key);
  const fedAtRaw = owned ? state.animals.feeding[key] : undefined;
  const fedAt = typeof fedAtRaw === 'number' && Number.isFinite(fedAtRaw) ? fedAtRaw : null;

  let phase: AnimalPhase;
  let readyAt: number | null = null;
  let remainingMs = 0;
  if (!owned) {
    phase = 'locked';
  } else if (fedAt == null) {
    phase = 'idle';
  } else {
    readyAt = fedAt + animal.produceTimerMs;
    remainingMs = Math.max(0, readyAt - safeNow);
    phase = remainingMs <= 0 ? 'ready' : 'growing';
  }

  return {
    key: animal.key,
    icon: animal.icon,
    produceIcon: animal.produceIcon,
    purchaseCost: animal.purchaseCost,
    feedCost: animal.feedCost,
    produceTimerMs: animal.produceTimerMs,
    producePrice: animal.producePrice,
    owned,
    phase,
    fedAt,
    readyAt,
    remainingMs,
  };
}

// 카탈로그 순서의 전체 동물 파생 상태(UI 렌더용).
export function getAnimalStates(state: GameState, now: number = Date.now()): AnimalStatus[] {
  return ANIMALS.map((animal) => getAnimalState(state, animal.key, now)!).filter((status) => status != null);
}

// 축사를 건설할 수 있는가: 알려진 동물이고, 아직 소유하지 않았으며(1회 구매), 골드가
// 충분할 때만 true.
export function canPurchaseAnimal(state: GameState, key: AnimalKey): boolean {
  const animal = getAnimal(key);
  if (animal == null || isAnimalOwned(state, key)) {
    return false;
  }
  return state.gold >= animal.purchaseCost;
}

// 순수 구매: 골드를 차감하고 소유 목록에 추가한 새 상태를 반환한다. 허용되지 않으면
// (미지의 키·이미 소유·골드 부족) null을 반환해 이중 차감/이중 소유를 막는다.
export function purchaseAnimal(state: GameState, key: AnimalKey, now = Date.now()): GameState | null {
  const animal = getAnimal(key);
  if (animal == null || !canPurchaseAnimal(state, key)) {
    return null;
  }
  const next: GameState = {
    ...state,
    gold: state.gold - animal.purchaseCost,
    animals: {
      owned: [...state.animals.owned, key],
      feeding: state.animals.feeding,
    },
  };
  return recordMissionProgressEvent(next, { type: 'spend_gold', amount: animal.purchaseCost }, now);
}

// 급여할 수 있는가: 소유했고, 현재 급여 중이 아니며(유휴), 골드가 충분할 때만 true.
export function canFeedAnimal(state: GameState, key: AnimalKey): boolean {
  const animal = getAnimal(key);
  if (animal == null || !isAnimalOwned(state, key)) {
    return false;
  }
  if (state.animals.feeding[key] != null) {
    return false;
  }
  return state.gold >= animal.feedCost;
}

// 순수 급여: 골드를 차감하고 급여 시각을 기록한 새 상태를 반환한다. 허용되지 않으면
// (미소유·이미 급여 중·골드 부족) null.
export function feedAnimal(state: GameState, key: AnimalKey, now: number = Date.now()): GameState | null {
  const animal = getAnimal(key);
  if (animal == null || !canFeedAnimal(state, key)) {
    return null;
  }
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const next: GameState = {
    ...state,
    gold: state.gold - animal.feedCost,
    animals: {
      owned: state.animals.owned,
      feeding: { ...state.animals.feeding, [key]: safeNow },
    },
  };
  return recordMissionProgressEvent(next, { type: 'spend_gold', amount: animal.feedCost }, safeNow);
}

// 수확할 수 있는가: 소유했고 급여 후 타이머가 완료됐을 때만 true.
export function canCollectProduce(state: GameState, key: AnimalKey, now: number = Date.now()): boolean {
  const status = getAnimalState(state, key, now);
  return status != null && status.phase === 'ready';
}

// 순수 수확: 산출물 판매가를 골드로 지급하고 급여 상태를 비워(다시 유휴) 새 상태를
// 반환한다. 아직 준비되지 않았거나 급여 중이 아니면 null(이중 수확 방지).
export function collectProduce(state: GameState, key: AnimalKey, now: number = Date.now()): GameState | null {
  const animal = getAnimal(key);
  if (animal == null || !canCollectProduce(state, key, now)) {
    return null;
  }
  const nextFeeding = { ...state.animals.feeding };
  delete nextFeeding[key];
  const next: GameState = {
    ...state,
    gold: state.gold + animal.producePrice,
    animals: {
      owned: state.animals.owned,
      feeding: nextFeeding,
    },
  };
  return recordMissionProgressEvent(next, { type: 'collect_produce' }, now);
}

export type CollectAllReadyProduceResult = {
  state: GameState;
  collectedKeys: AnimalKey[];
  collectedCount: number;
  totalGold: number;
};

// Collects every ready animal at one captured instant by sequencing the same
// single-item transition used by individual taps. This preserves every
// collection invariant while returning one deterministic summary for batched
// UI feedback. A no-op keeps the original state reference.
export function collectAllReadyProduce(
  gameState: GameState,
  now: number = Date.now()
): CollectAllReadyProduceResult {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  let state = gameState;
  const collectedKeys: AnimalKey[] = [];
  let totalGold = 0;

  for (const status of getAnimalStates(gameState, safeNow)) {
    if (status.phase !== 'ready') {
      continue;
    }
    const next = collectProduce(state, status.key, safeNow);
    if (next == null) {
      continue;
    }
    totalGold += next.gold - state.gold;
    state = next;
    collectedKeys.push(status.key);
  }

  return {
    state,
    collectedKeys,
    collectedCount: collectedKeys.length,
    totalGold,
  };
}
