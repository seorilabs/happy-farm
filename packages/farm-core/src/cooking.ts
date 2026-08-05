import balance from './balance.json';
import type { CropKey, GameState } from './types';
import type { CropInventory } from './production';
import { LANDMARK_DUPLICATE_DISH_FESTIVAL_POINTS, grantLandmarkFestivalDeliveryPoints } from './landmark';

// 요리 도감 시스템(#442). 수확 부산물 재고(GameState.production.inventory)를 재료
// 창고로 공유해, 작물 2~3종을 요리 솥에 넣고 결정적 타이머 후 랜덤 추첨으로 150종
// 메뉴를 발견하는 수집 콘텐츠다. 고정 레시피 매칭이 아니라 "재료 조합의 강도"(재료
// 수·최고 티어)가 성공률·등급 추첨 풀을 결정한다(GDD의 랜덤 도감 방식).
//
// - 조리 시작/취소/즉시완성은 순수·결정적이고, 추첨(resolveCooking)만 주입 rng를
//   쓴다(wheel.ts와 동일한 관례 — 테스트 결정성).
// - 직접 골드 보상은 없다. 보상은 도감 완성도 마일스톤의 영구 전역 판매 보너스이며,
//   합계는 +10% 이내로 통제된다(check:balance §cooking). 실패 시 재료 일부 환급.
// - 도감/솥 상태는 메타 레이어(GameState.cooking)라 프레스티지 후에도 유지된다.
//   카탈로그(메뉴/등급/확률)는 balance.json, 현지화 이름은 i18n/labels의 cookingDish.

export type CookingDishKey = (typeof balance.cooking.dishes)[number]['key'];

export type CookingGradeKey = (typeof balance.cooking.grades)[number]['key'];

export type CookingDish = {
  key: CookingDishKey;
  icon: string;
  grade: CookingGradeKey;
  // 이 메뉴가 추첨 풀에 들어가기 위한 재료 최고 티어 하한(dish.tier <= maxTier).
  tier: number;
};

export type CookingGrade = {
  key: CookingGradeKey;
  // 등급 추첨 가중치(양수). 확률 = weight / 자격 있는 등급의 weight 합.
  weight: number;
  // 이 등급이 추첨 후보가 되기 위한 재료 최고 티어 하한.
  minMaxTier: number;
  // 이 등급이 추첨 후보가 되기 위한 재료 수 하한.
  minIngredients: number;
};

// 카탈로그(선언 순서 = 도감 UI 렌더 순서).
export const COOKING_DISHES: readonly CookingDish[] = balance.cooking.dishes as readonly CookingDish[];

export const COOKING_GRADES: readonly CookingGrade[] = balance.cooking.grades as readonly CookingGrade[];

export const COOKING_MIN_INGREDIENTS = balance.cooking.minIngredients;
export const COOKING_MAX_INGREDIENTS = balance.cooking.maxIngredients;

const DISH_BY_KEY = new Map<string, CookingDish>(COOKING_DISHES.map((dish) => [dish.key, dish]));
const CROP_TIER_BY_KEY = new Map<string, number>(balance.crops.map((crop) => [crop.key, crop.tier]));

export function isKnownCookingDishKey(value: unknown): value is CookingDishKey {
  return typeof value === 'string' && DISH_BY_KEY.has(value);
}

export function getCookingDish(key: CookingDishKey): CookingDish | undefined {
  return DISH_BY_KEY.get(key);
}

// 진행 중인 요리 솥. ingredients는 서로 다른 작물 키 2~3종(각 1개 소비).
export type CookingPot = {
  ingredients: CropKey[];
  startedAt: number;
};

export type CookingState = {
  // 발견한 메뉴별 누적 조리 성공 횟수(1 이상 = 도감 등록).
  discoveredDishes: Partial<Record<CookingDishKey, number>>;
  // 진행 중인 조리(없으면 null). 결과 추첨은 수령(resolveCooking) 시점에 일어난다.
  pot: CookingPot | null;
  // 평생 조리 시도/성공 횟수(도감 통계 표시용).
  totalCookCount: number;
  totalSuccessCount: number;
};

export function createInitialCookingState(): CookingState {
  return { discoveredDishes: {}, pot: null, totalCookCount: 0, totalSuccessCount: 0 };
}

function isKnownCropKey(value: unknown): value is CropKey {
  return typeof value === 'string' && CROP_TIER_BY_KEY.has(value);
}

function normalizeCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

// 미지의 메뉴/작물 키, 음수/비정수/비유한 값, 규격 밖 재료 수를 모두 제거해 손상/
// 레거시 세이브도 항상 안전한 상태로 로드되게 한다(production/wheel 정규화와 동일 관례).
export function normalizeCookingState(value: unknown): CookingState {
  if (typeof value !== 'object' || value == null) {
    return createInitialCookingState();
  }
  const raw = value as Partial<CookingState>;

  const discoveredDishes: Partial<Record<CookingDishKey, number>> = {};
  if (typeof raw.discoveredDishes === 'object' && raw.discoveredDishes != null) {
    for (const [key, count] of Object.entries(raw.discoveredDishes as Record<string, unknown>)) {
      if (isKnownCookingDishKey(key)) {
        const safeCount = normalizeCount(count);
        if (safeCount > 0) {
          discoveredDishes[key] = safeCount;
        }
      }
    }
  }

  let pot: CookingPot | null = null;
  const rawPot = raw.pot;
  if (typeof rawPot === 'object' && rawPot != null) {
    const ingredients = Array.isArray(rawPot.ingredients)
      ? rawPot.ingredients.filter(isKnownCropKey).filter((crop, index, items) => items.indexOf(crop) === index)
      : [];
    const startedAt = rawPot.startedAt;
    if (
      ingredients.length >= COOKING_MIN_INGREDIENTS &&
      ingredients.length <= COOKING_MAX_INGREDIENTS &&
      typeof startedAt === 'number' &&
      Number.isFinite(startedAt) &&
      startedAt >= 0
    ) {
      pot = { ingredients, startedAt };
    }
  }

  const totalCookCount = normalizeCount(raw.totalCookCount);
  // 성공 수는 시도 수를 넘을 수 없고, 도감이 증명하는 성공 수보다 작을 수 없다.
  const provenSuccesses = Object.values(discoveredDishes).reduce<number>(
    (sum, count) => sum + (typeof count === 'number' ? count : 0),
    0
  );
  const totalSuccessCount = Math.max(provenSuccesses, Math.min(totalCookCount, normalizeCount(raw.totalSuccessCount)));

  return {
    discoveredDishes,
    pot,
    totalCookCount: Math.max(totalCookCount, totalSuccessCount),
    totalSuccessCount,
  };
}

// 재료 조합의 최고 작물 티어. 알 수 없는 재료는 무시한다(빈 조합이면 1).
export function getMaxIngredientTier(ingredients: readonly CropKey[]): number {
  let maxTier = 1;
  for (const crop of ingredients) {
    const tier = CROP_TIER_BY_KEY.get(crop);
    if (tier != null && tier > maxTier) {
      maxTier = tier;
    }
  }
  return maxTier;
}

// 조리 대기 시간(ms): timerPerTierMs × 재료 최고 티어(결정적 — rng 없음).
export function getCookingTimerMs(ingredients: readonly CropKey[]): number {
  return balance.cooking.timerPerTierMs * getMaxIngredientTier(ingredients);
}

// 재료 수별 성공 확률. 규격 밖 재료 수는 가장 가까운 정의 값으로 클램프한다.
export function getCookingSuccessRate(ingredientCount: number): number {
  const table = balance.cooking.successRateByIngredientCount as Record<string, number>;
  const counts = Object.keys(table)
    .map((key) => Number(key))
    .filter((count) => Number.isFinite(count))
    .sort((a, b) => a - b);
  if (counts.length === 0) {
    return 1;
  }
  const clamped = Math.min(Math.max(ingredientCount, counts[0]!), counts[counts.length - 1]!);
  const nearest = counts.find((count) => count >= clamped) ?? counts[counts.length - 1]!;
  const rate = table[String(nearest)];
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 && rate <= 1 ? rate : 1;
}

// 입력 재료를 정규화한다: 알려진 작물만, 중복 제거, 선택 순서 유지.
function sanitizeIngredients(ingredients: readonly CropKey[]): CropKey[] {
  return ingredients.filter(isKnownCropKey).filter((crop, index, items) => items.indexOf(crop) === index);
}

// 조리를 시작할 수 있는가: 솥이 비어 있고, 서로 다른 작물 2~3종이며, 재고가 각 1개 이상.
export function canStartCooking(gameState: GameState, ingredients: readonly CropKey[]): boolean {
  if (gameState.cooking.pot != null) {
    return false;
  }
  const sanitized = sanitizeIngredients(ingredients);
  if (
    sanitized.length !== ingredients.length ||
    sanitized.length < COOKING_MIN_INGREDIENTS ||
    sanitized.length > COOKING_MAX_INGREDIENTS
  ) {
    return false;
  }
  const inventory = gameState.production.inventory;
  return sanitized.every((crop) => (inventory[crop] ?? 0) >= 1);
}

// 순수 조리 시작: 재료를 재고에서 1개씩 차감하고 솥을 채운 새 상태를 반환한다.
// 허용되지 않으면(솥 사용 중·재료 규격 위반·재고 부족) null(이중 차감 방지).
export function startCooking(gameState: GameState, ingredients: readonly CropKey[], now = Date.now()): GameState | null {
  if (!canStartCooking(gameState, ingredients)) {
    return null;
  }
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const sanitized = sanitizeIngredients(ingredients);
  const inventory: CropInventory = { ...gameState.production.inventory };
  for (const crop of sanitized) {
    const remaining = (inventory[crop] ?? 0) - 1;
    if (remaining > 0) {
      inventory[crop] = remaining;
    } else {
      delete inventory[crop];
    }
  }
  return {
    ...gameState,
    production: { ...gameState.production, inventory },
    cooking: {
      ...gameState.cooking,
      pot: { ingredients: sanitized, startedAt: safeNow },
    },
  };
}

export type CookingPhase =
  // 솥이 비어 있음(조리 시작 가능).
  | 'idle'
  // 조리 진행 중(타이머 대기).
  | 'cooking'
  // 타이머 완료(결과 확인 가능).
  | 'ready';

export type CookingPotStatus = {
  phase: CookingPhase;
  ingredients: CropKey[];
  maxIngredientTier: number;
  successRate: number;
  timerMs: number;
  startedAt: number | null;
  readyAt: number | null;
  remainingMs: number;
};

// 솥의 파생 상태(순수 계산). UI 렌더와 전이 가드가 같은 판정을 공유한다.
export function getCookingPotStatus(gameState: GameState, now = Date.now()): CookingPotStatus {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const pot = gameState.cooking.pot;
  if (pot == null) {
    return {
      phase: 'idle',
      ingredients: [],
      maxIngredientTier: 1,
      successRate: getCookingSuccessRate(COOKING_MIN_INGREDIENTS),
      timerMs: 0,
      startedAt: null,
      readyAt: null,
      remainingMs: 0,
    };
  }
  const timerMs = getCookingTimerMs(pot.ingredients);
  const readyAt = pot.startedAt + timerMs;
  const remainingMs = Math.max(0, readyAt - safeNow);
  return {
    phase: remainingMs <= 0 ? 'ready' : 'cooking',
    ingredients: pot.ingredients,
    maxIngredientTier: getMaxIngredientTier(pot.ingredients),
    successRate: getCookingSuccessRate(pot.ingredients.length),
    timerMs,
    startedAt: pot.startedAt,
    readyAt,
    remainingMs,
  };
}

// 순수 조리 취소: 아직 완료되지 않은 조리의 재료를 전부 환불하고 솥을 비운다.
// 완료된 조리는 결과를 확인해야 하며, 미진행·이중 취소는 null을 반환한다.
export function cancelCooking(gameState: GameState, now = Date.now()): GameState | null {
  const status = getCookingPotStatus(gameState, now);
  if (status.phase !== 'cooking') {
    return null;
  }
  const inventory: CropInventory = { ...gameState.production.inventory };
  for (const crop of status.ingredients) {
    inventory[crop] = (inventory[crop] ?? 0) + 1;
  }
  return {
    ...gameState,
    production: { ...gameState.production, inventory },
    cooking: { ...gameState.cooking, pot: null },
  };
}

// 보상형 광고(즉시 완성): 진행 중인 조리의 남은 시간을 0으로 만든다(startedAt을
// 타이머 길이만큼 과거로 이동). 진행 중이 아니면 null. 광고 한도/기록은 호출부
// (FarmGame의 showRewardedAd 퍼널)가 담당한다.
export function finishCookingInstantly(gameState: GameState, now = Date.now()): GameState | null {
  const status = getCookingPotStatus(gameState, now);
  if (status.phase !== 'cooking' || gameState.cooking.pot == null) {
    return null;
  }
  const safeNow = Number.isFinite(now) ? now : Date.now();
  return {
    ...gameState,
    cooking: {
      ...gameState.cooking,
      pot: { ...gameState.cooking.pot, startedAt: safeNow - status.timerMs },
    },
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  // rng()가 1(또는 그 이상)을 반환해도 [0,1) 범위에 들도록 클램프한다(wheel.ts와 동일).
  if (value >= 1) return 1 - Number.EPSILON;
  return value;
}

// 재료 조합에서 추첨 후보가 되는 등급 목록(가중치 추첨 대상). 등급 조건을 만족해도
// 해당 등급 풀(dish.tier <= maxTier)이 비어 있으면 제외해 추첨이 항상 성립하게 한다.
export function getEligibleCookingGrades(ingredients: readonly CropKey[]): CookingGrade[] {
  const maxTier = getMaxIngredientTier(ingredients);
  const count = ingredients.length;
  return COOKING_GRADES.filter(
    (grade) =>
      maxTier >= grade.minMaxTier &&
      count >= grade.minIngredients &&
      COOKING_DISHES.some((dish) => dish.grade === grade.key && dish.tier <= maxTier)
  );
}

export type CookingResult =
  | {
      outcome: 'success';
      dishKey: CookingDishKey;
      grade: CookingGradeKey;
      // 이번 성공으로 처음 발견한 메뉴인지(도감 신규 등록).
      isNew: boolean;
    }
  | {
      outcome: 'fail';
      // 환급된 재료(저티어 우선, floor(재료 수 × failRefundRatio)개).
      refundedCrops: CropKey[];
    };

export type CookingResolution = {
  state: GameState;
  result: CookingResult;
};

// 가중치 기반 등급 추첨(순수·결정적: 같은 rng 값이면 같은 등급).
function pickCookingGrade(grades: readonly CookingGrade[], rng: () => number): CookingGrade {
  const totalWeight = grades.reduce((sum, grade) => sum + Math.max(0, grade.weight), 0);
  if (totalWeight <= 0) {
    return grades[0]!;
  }
  const roll = clamp01(rng()) * totalWeight;
  let cumulative = 0;
  for (const grade of grades) {
    cumulative += Math.max(0, grade.weight);
    if (roll < cumulative) {
      return grade;
    }
  }
  return grades[grades.length - 1]!;
}

// 결과를 확인할 수 있는가: 조리가 진행됐고 타이머가 완료됐을 때만.
export function canResolveCooking(gameState: GameState, now = Date.now()): boolean {
  return getCookingPotStatus(gameState, now).phase === 'ready';
}

/**
 * 완료된 조리의 결과를 추첨하고 적용한다(성공: 도감 등록, 실패: 재료 일부 환급).
 * 추첨은 수령 시점에 일어나므로 저장/재시작으로 결과를 되돌릴 수 없다.
 * 아직 완료되지 않았거나 진행 중이 아니면 null(이중 수령 방지).
 *
 * @param rng [0,1) 난수 주입 함수(테스트 결정성). 생략 시 Math.random.
 */
export function resolveCooking(
  gameState: GameState,
  now = Date.now(),
  rng: () => number = Math.random
): CookingResolution | null {
  if (!canResolveCooking(gameState, now)) {
    return null;
  }
  const pot = gameState.cooking.pot!;
  const ingredients = pot.ingredients;
  const successRate = getCookingSuccessRate(ingredients.length);
  const eligibleGrades = getEligibleCookingGrades(ingredients);
  const succeeded = eligibleGrades.length > 0 && clamp01(rng()) < successRate;

  if (!succeeded) {
    const refundCount = Math.max(
      0,
      Math.min(ingredients.length, Math.floor(ingredients.length * balance.cooking.failRefundRatio))
    );
    // 저티어 재료부터 환급한다(고티어 재료가 소비 리스크를 지는 결정적 규칙).
    const refundedCrops = [...ingredients]
      .sort((a, b) => (CROP_TIER_BY_KEY.get(a) ?? 0) - (CROP_TIER_BY_KEY.get(b) ?? 0))
      .slice(0, refundCount);
    const inventory: CropInventory = { ...gameState.production.inventory };
    for (const crop of refundedCrops) {
      inventory[crop] = (inventory[crop] ?? 0) + 1;
    }
    return {
      state: {
        ...gameState,
        production: { ...gameState.production, inventory },
        cooking: {
          ...gameState.cooking,
          pot: null,
          totalCookCount: gameState.cooking.totalCookCount + 1,
        },
      },
      result: { outcome: 'fail', refundedCrops },
    };
  }

  const maxTier = getMaxIngredientTier(ingredients);
  const grade = pickCookingGrade(eligibleGrades, rng);
  const pool = COOKING_DISHES.filter((dish) => dish.grade === grade.key && dish.tier <= maxTier);
  const dish = pool[Math.min(pool.length - 1, Math.floor(clamp01(rng()) * pool.length))]!;
  const previousCount = gameState.cooking.discoveredDishes[dish.key] ?? 0;
  const resolvedState: GameState = {
    ...gameState,
    cooking: {
      ...gameState.cooking,
      pot: null,
      discoveredDishes: { ...gameState.cooking.discoveredDishes, [dish.key]: previousCount + 1 },
      totalCookCount: gameState.cooking.totalCookCount + 1,
      totalSuccessCount: gameState.cooking.totalSuccessCount + 1,
    },
  };

  return {
    state:
      previousCount > 0
        ? grantLandmarkFestivalDeliveryPoints(resolvedState, LANDMARK_DUPLICATE_DISH_FESTIVAL_POINTS)
        : resolvedState,
    result: { outcome: 'success', dishKey: dish.key, grade: dish.grade, isNew: previousCount === 0 },
  };
}

export type CookingMilestoneStatus = {
  count: number;
  sellBonus: number;
  reached: boolean;
};

export type CookingCompendiumProgress = {
  discoveredCount: number;
  totalDishes: number;
  discoveredByGrade: Record<CookingGradeKey, number>;
  totalByGrade: Record<CookingGradeKey, number>;
  // 도달한 마일스톤 판매 보너스 합(영구 전역 판매 배수 가산치).
  sellBonus: number;
  milestones: CookingMilestoneStatus[];
  // 다음 목표 마일스톤(모두 달성했으면 null).
  nextMilestone: CookingMilestoneStatus | null;
};

// 발견한 메뉴 수(도감 등록 수).
export function getDiscoveredDishCount(gameState: GameState): number {
  return Object.keys(gameState.cooking.discoveredDishes).filter((key) => isKnownCookingDishKey(key)).length;
}

// 도감 완성도 마일스톤 판매 보너스 합. modifiers.ts의 전역 판매 배수 스택에
// (1 + bonus)로 곱해진다. 손상 데이터에도 음수가 되지 않게 방어한다.
export function getCookingCompendiumSellBonus(gameState: GameState): number {
  const discoveredCount = getDiscoveredDishCount(gameState);
  return balance.cooking.compendiumMilestones.reduce(
    (sum, milestone) =>
      discoveredCount >= milestone.count && Number.isFinite(milestone.sellBonus) && milestone.sellBonus > 0
        ? sum + milestone.sellBonus
        : sum,
    0
  );
}

// 도감 진행 요약(순수 계산). 도감 UI와 마일스톤 표기가 같은 판정을 공유한다.
export function getCookingCompendiumProgress(gameState: GameState): CookingCompendiumProgress {
  const discoveredByGrade = {} as Record<CookingGradeKey, number>;
  const totalByGrade = {} as Record<CookingGradeKey, number>;
  for (const grade of COOKING_GRADES) {
    discoveredByGrade[grade.key] = 0;
    totalByGrade[grade.key] = 0;
  }
  let discoveredCount = 0;
  for (const dish of COOKING_DISHES) {
    totalByGrade[dish.grade] = (totalByGrade[dish.grade] ?? 0) + 1;
    if ((gameState.cooking.discoveredDishes[dish.key] ?? 0) > 0) {
      discoveredByGrade[dish.grade] = (discoveredByGrade[dish.grade] ?? 0) + 1;
      discoveredCount += 1;
    }
  }
  const milestones = balance.cooking.compendiumMilestones.map((milestone) => ({
    count: milestone.count,
    sellBonus: milestone.sellBonus,
    reached: discoveredCount >= milestone.count,
  }));
  return {
    discoveredCount,
    totalDishes: COOKING_DISHES.length,
    discoveredByGrade,
    totalByGrade,
    sellBonus: getCookingCompendiumSellBonus(gameState),
    milestones,
    nextMilestone: milestones.find((milestone) => !milestone.reached) ?? null,
  };
}
