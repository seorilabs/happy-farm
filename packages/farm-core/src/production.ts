import balance from './balance.json';
import type { CropKey, GameState, ProductionRecipeKey } from './types';
import { recordMissionProgressEvent } from './missionEvents';
import { getCraftSpeedMultiplier, getSpeedAdjustedTimerMs } from './research';

// 생산 가공 공방(#250). 작물을 즉시 판매만 하던 모델에 "잉여 작물 → 고부가 가공품"
// 이라는 계획형 골드 싱크를 더한다. 수확 파이프라인(performHarvest)이 매 수확마다
// 작물 1개를 메타 레이어 인벤토리(GameState.production.inventory)에 부산물로 적재하고,
// 공방은 이 재고를 레시피대로 소비해 결정적 타이머 후 가공품(판매가)을 산출한다.
//
// 순수/결정적 모듈이며 rng를 쓰지 않는다(타이머는 startedAt + timerMs로만 판정).
// 재고/진행 상태는 메타 레이어라 프레스티지 후에도 유지된다. 카탈로그(레시피/입력/
// 타이머/판매가)는 balance.json, 현지화 이름은 i18n/labels.ts에 있다.
//
// 밸런스: 각 레시피의 판매가는 입력 작물 판매가 합보다 크고(부가가치), 그 net/h
// (sellPrice / timerMs — 재고 입력은 수확 부산물이라 실현 한계수익이 곧 판매가)는
// 가장 싼 작물의 net/h보다 낮게 유지되어(scripts/check-balance.mjs에서 강제) 능동
// 작물 진행을 지배하지 않는다. 가공 연구(craft_studies)가 대기 시간을 줄이지만,
// 레벨당 배율이 작물 성장 연구 이하로 묶여 있고 가공품 판매가에는 어떤 판매 배수도
// 붙지 않으므로 이 서열은 유지된다.

export type ProductionRecipeInput = {
  crop: CropKey;
  qty: number;
};

export type ProductionRecipe = {
  key: ProductionRecipeKey;
  icon: string;
  inputs: ProductionRecipeInput[];
  // 가공 대기 시간(ms). 결정적 타이머의 길이.
  timerMs: number;
  // 가공품 판매가(골드). 입력 작물 판매가 합보다 크다(부가가치).
  sellPrice: number;
};

// 카탈로그(선언 순서 = UI 렌더 순서).
export const PRODUCTION_RECIPES: readonly ProductionRecipe[] = balance.production
  .recipes as readonly ProductionRecipe[];

const RECIPE_BY_KEY = new Map<string, ProductionRecipe>(PRODUCTION_RECIPES.map((recipe) => [recipe.key, recipe]));

export function isKnownRecipeKey(value: unknown): value is ProductionRecipeKey {
  return typeof value === 'string' && RECIPE_BY_KEY.has(value);
}

export function getRecipe(key: ProductionRecipeKey): ProductionRecipe | undefined {
  return RECIPE_BY_KEY.get(key);
}

// 전체 레시피(카탈로그 순서).
export function getRecipes(): readonly ProductionRecipe[] {
  return PRODUCTION_RECIPES;
}

// 작물 인벤토리(부산물 재고) + 진행 중 가공(레시피별 시작 시각). crafting에 항목이
// 있으면 가공 진행 중이고, 없으면 idle(다시 시작 가능).
export type CropInventory = Partial<Record<CropKey, number>>;

export type ProductionState = {
  inventory: CropInventory;
  crafting: Partial<Record<ProductionRecipeKey, number>>;
};

export function createInitialProductionState(): ProductionState {
  return { inventory: {}, crafting: {} };
}

function isKnownCropKey(value: unknown): value is CropKey {
  // 작물 존재는 balance.crops로 판정(순환 import 없이 데이터로 확인).
  return typeof value === 'string' && balance.crops.some((crop) => crop.key === value);
}

// 미지의 작물/레시피 키, 음수/비정수/비유한 값을 모두 제거해, 손상/레거시 세이브도
// 항상 안전한 상태로 로드되게 한다(재고는 양의 정수만, crafting은 알려진 레시피의
// 유한 시작 시각만 유지).
export function normalizeProductionState(value: unknown): ProductionState {
  if (typeof value !== 'object' || value == null) {
    return createInitialProductionState();
  }
  const raw = value as Partial<ProductionState>;

  const inventory: CropInventory = {};
  if (typeof raw.inventory === 'object' && raw.inventory != null) {
    for (const [key, amount] of Object.entries(raw.inventory as Record<string, unknown>)) {
      if (isKnownCropKey(key) && typeof amount === 'number' && Number.isFinite(amount)) {
        // 먼저 내림한 뒤 양수일 때만 저장한다: 0.1 같은 소수가 floor→0으로 남아
        // "재고 0" 항목을 만들지 않게 한다(재고는 항상 양의 정수만).
        const qty = Math.floor(amount);
        if (qty > 0) {
          inventory[key] = qty;
        }
      }
    }
  }

  const crafting: Partial<Record<ProductionRecipeKey, number>> = {};
  if (typeof raw.crafting === 'object' && raw.crafting != null) {
    for (const [key, startedAt] of Object.entries(raw.crafting as Record<string, unknown>)) {
      // startedAt은 epoch ms라 음수가 될 수 없다. 음수/비유한 값을 버려, 손상된
      // 세이브가 readyAt(= startedAt + timerMs)을 음수로 만들지 못하게 한다.
      if (isKnownRecipeKey(key) && typeof startedAt === 'number' && Number.isFinite(startedAt) && startedAt >= 0) {
        crafting[key] = startedAt;
      }
    }
  }

  return { inventory, crafting };
}

// 수확 부산물 적재: 인벤토리에 작물 n개를 더한 새 인벤토리를 반환한다(순수).
// harvest 파이프라인이 매 수확마다 1개를 적재하는 데 쓴다.
export function addCropToInventory(inventory: CropInventory, cropKey: CropKey, amount = 1): CropInventory {
  if (!Number.isFinite(amount) || amount <= 0) {
    return inventory;
  }
  return { ...inventory, [cropKey]: (inventory[cropKey] ?? 0) + Math.floor(amount) };
}

// 보유 재고로 레시피 입력을 모두 충족하는가.
export function hasIngredients(state: GameState, key: ProductionRecipeKey): boolean {
  const recipe = getRecipe(key);
  if (recipe == null) {
    return false;
  }
  const inventory = state.production.inventory;
  return recipe.inputs.every((input) => (inventory[input.crop] ?? 0) >= input.qty);
}

export type ProductionPhase =
  // 가공 시작 가능(진행 중 아님).
  | 'idle'
  // 가공 진행 중(타이머 대기).
  | 'crafting'
  // 타이머 완료(수집 가능).
  | 'ready';

// 가공 연구(craft_studies)를 반영한 실제 대기 시간. 카탈로그의 recipe.timerMs는 기준값이고,
// 표시·판정에는 항상 이 값을 쓴다. readyAt은 startedAt + 유효 타이머로 매번 다시 계산되므로,
// 진행 중인 가공도 연구 레벨이 오르는 즉시 짧아진 타이머를 적용받는다. 미지의 키면 0.
export function getCraftTimerMs(state: GameState, key: ProductionRecipeKey): number {
  const recipe = getRecipe(key);
  if (recipe == null) {
    return 0;
  }
  return getSpeedAdjustedTimerMs(recipe.timerMs, getCraftSpeedMultiplier(state));
}

export type ProductionStatus = {
  key: ProductionRecipeKey;
  icon: string;
  inputs: ProductionRecipeInput[];
  // 가공 연구가 적용된 실제 대기 시간(카탈로그 기준값이 아님).
  timerMs: number;
  sellPrice: number;
  phase: ProductionPhase;
  // 입력 충족 여부(idle일 때 시작 가능한지).
  hasIngredients: boolean;
  // 가공 시작 시각(진행/완료 대기 중일 때만, 아니면 null).
  startedAt: number | null;
  // 수집 가능 시각(진행/완료 대기 중일 때만, 아니면 null).
  readyAt: number | null;
  // 수집까지 남은 시간(ms, 0 이상).
  remainingMs: number;
};

// 레시피의 파생 상태(순수 계산). 미지의 키면 null.
export function getProductionState(
  state: GameState,
  key: ProductionRecipeKey,
  now: number = Date.now()
): ProductionStatus | null {
  const recipe = getRecipe(key);
  if (recipe == null) {
    return null;
  }
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const startedAtRaw = state.production.crafting[key];
  // startedAt은 epoch ms(≥0)만 유효하다. 음수/비유한 값은 진행 없음(idle)으로 취급해
  // readyAt(= startedAt + timerMs)이 항상 유효한 미래/현재 시각만 갖게 한다(정규화가
  // 거르지 않은 경로로 들어와도 방어).
  const startedAt =
    typeof startedAtRaw === 'number' && Number.isFinite(startedAtRaw) && startedAtRaw >= 0 ? startedAtRaw : null;

  const timerMs = getCraftTimerMs(state, key);
  let phase: ProductionPhase;
  let readyAt: number | null = null;
  let remainingMs = 0;
  if (startedAt == null) {
    phase = 'idle';
  } else {
    readyAt = startedAt + timerMs;
    remainingMs = Math.max(0, readyAt - safeNow);
    phase = remainingMs <= 0 ? 'ready' : 'crafting';
  }

  return {
    key: recipe.key,
    icon: recipe.icon,
    inputs: recipe.inputs,
    timerMs,
    sellPrice: recipe.sellPrice,
    phase,
    hasIngredients: hasIngredients(state, key),
    startedAt,
    readyAt,
    remainingMs,
  };
}

// 카탈로그 순서의 전체 레시피 파생 상태(UI 렌더용).
export function getProductionStates(state: GameState, now: number = Date.now()): ProductionStatus[] {
  return PRODUCTION_RECIPES.map((recipe) => getProductionState(state, recipe.key, now)!).filter(
    (status) => status != null
  );
}

// 가공을 시작할 수 있는가: 알려진 레시피이고, 진행 중이 아니며, 입력 재고가 충분할 때.
export function canStartCraft(state: GameState, key: ProductionRecipeKey): boolean {
  const recipe = getRecipe(key);
  if (recipe == null) {
    return false;
  }
  if (state.production.crafting[key] != null) {
    return false;
  }
  return hasIngredients(state, key);
}

// 순수 가공 시작: 입력 작물을 재고에서 차감하고 시작 시각을 기록한 새 상태를 반환한다.
// 허용되지 않으면(미지의 키·이미 진행 중·재고 부족) null(이중 차감 방지).
export function startCraft(state: GameState, key: ProductionRecipeKey, now: number = Date.now()): GameState | null {
  const recipe = getRecipe(key);
  if (recipe == null || !canStartCraft(state, key)) {
    return null;
  }
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const inventory: CropInventory = { ...state.production.inventory };
  for (const input of recipe.inputs) {
    const remaining = (inventory[input.crop] ?? 0) - input.qty;
    if (remaining > 0) {
      inventory[input.crop] = remaining;
    } else {
      delete inventory[input.crop];
    }
  }
  return {
    ...state,
    production: {
      inventory,
      crafting: { ...state.production.crafting, [key]: safeNow },
    },
  };
}

// 순수 가공 취소: 아직 완료되지 않은 가공의 입력 작물을 전부 환불하고 진행 상태를 비운다.
// 완료된 가공은 결과물을 수집해야 하며, 미지의 키·미진행·이중 취소는 null을 반환한다.
export function cancelCraft(state: GameState, key: ProductionRecipeKey, now: number = Date.now()): GameState | null {
  const recipe = getRecipe(key);
  const status = getProductionState(state, key, now);
  if (recipe == null || status?.phase !== 'crafting') {
    return null;
  }

  const inventory: CropInventory = { ...state.production.inventory };
  for (const input of recipe.inputs) {
    inventory[input.crop] = (inventory[input.crop] ?? 0) + input.qty;
  }
  const crafting = { ...state.production.crafting };
  delete crafting[key];

  return {
    ...state,
    production: {
      inventory,
      crafting,
    },
  };
}

// 가공품을 수집할 수 있는가: 진행 중이고 타이머가 완료됐을 때만.
export function canCollectCraft(state: GameState, key: ProductionRecipeKey, now: number = Date.now()): boolean {
  const status = getProductionState(state, key, now);
  return status != null && status.phase === 'ready';
}

// 순수 가공 수집: 판매가를 골드로 지급하고 진행 상태를 비워 새 상태를 반환한다.
// 아직 완료되지 않았거나 진행 중이 아니면 null(이중 수집 방지).
export function collectCraft(state: GameState, key: ProductionRecipeKey, now: number = Date.now()): GameState | null {
  const recipe = getRecipe(key);
  if (recipe == null || !canCollectCraft(state, key, now)) {
    return null;
  }
  const crafting = { ...state.production.crafting };
  delete crafting[key];
  const next: GameState = {
    ...state,
    gold: state.gold + recipe.sellPrice,
    production: {
      inventory: state.production.inventory,
      crafting,
    },
  };
  return recordMissionProgressEvent(next, { type: 'craft_complete' }, now);
}

export type CollectAllReadyCraftsResult = {
  state: GameState;
  collectedKeys: ProductionRecipeKey[];
  collectedCount: number;
  totalGold: number;
};

// Collects every completed recipe at one captured instant through the existing
// single-recipe transition. A no-op returns the input state by reference, and
// the summary lets UI feedback fire exactly once for the committed batch.
export function collectAllReadyCrafts(
  gameState: GameState,
  now: number = Date.now()
): CollectAllReadyCraftsResult {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  let state = gameState;
  const collectedKeys: ProductionRecipeKey[] = [];
  let totalGold = 0;

  for (const status of getProductionStates(gameState, safeNow)) {
    if (status.phase !== 'ready') {
      continue;
    }
    const next = collectCraft(state, status.key, safeNow);
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
