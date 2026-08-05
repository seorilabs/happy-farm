import balance from './balance.json';
import { recordMissionProgressEvent } from './missionEvents';
import { getPrestigeCost } from './prestige';
import type { CropInventory } from './production';
import type { CropKey, GameState } from './types';

// 프레스티지 이후의 반복형 메타 골드 싱크. 프로젝트 티어는 completedTier + 1로
// 파생하며, 같은 번호의 prestige.level에 도달해야 그 티어를 진행할 수 있다.

export const LANDMARK_STAGE_KEYS = ['foundation', 'frame', 'equipment', 'festival_prep', 'complete'] as const;

export type LandmarkStageKey = (typeof LANDMARK_STAGE_KEYS)[number];

export type LandmarkStageDefinition = {
  key: LandmarkStageKey;
  goldCostRatio: number;
  cropUnits: number;
  animalProducts: number;
  festivalPoints: number;
};

export type LandmarkState = {
  completedTier: number;
  // 현재 프로젝트에서 완료한 단계의 연속 prefix. 마지막 단계가 끝나면 비우고
  // completedTier를 올리므로 정상 save에는 다섯 단계 전체가 남지 않는다.
  completedStages: LandmarkStageKey[];
  // 현재 tier에서 실제로 차감된 골드 누계. 큰 수 구간에서는 Number의 ULP 때문에
  // 명목 비용과 관측 차감액이 달라질 수 있어, 마지막 단계가 목표 총액을 보정한다.
  goldSpentThisTier: number;
  festivalDeliveryPoints: number;
  animalProductStock: number;
};

export type LandmarkVisualState = 'locked' | 'foundation' | 'scaffold' | 'festival' | 'complete';

export type LandmarkStatus = {
  isFeatureUnlocked: boolean;
  hasActiveProject: boolean;
  completedForCurrentPrestige: boolean;
  completedTier: number;
  currentTier: number;
  completedStages: readonly LandmarkStageKey[];
  currentStageIndex: number;
  currentStageKey: LandmarkStageKey | null;
  totalStageCount: number;
  visualState: LandmarkVisualState;
};

export type LandmarkResourceAmounts = {
  gold: number;
  cropUnits: number;
  animalProducts: number;
  festivalPoints: number;
};

export type LandmarkFundBlockedReason =
  | 'insufficient_gold'
  | 'insufficient_crops'
  | 'insufficient_animal_products'
  | 'insufficient_festival_points';

export type LandmarkStageQuote = {
  tier: number;
  stageIndex: number;
  stageKey: LandmarkStageKey;
  requirements: LandmarkResourceAmounts;
  holdings: LandmarkResourceAmounts;
  canFund: boolean;
  blockedReason: LandmarkFundBlockedReason | null;
};

export type FundLandmarkStageOutcome = {
  state: GameState;
  quote: LandmarkStageQuote;
  tierCompleted: boolean;
};

export const LANDMARK_STAGES: readonly LandmarkStageDefinition[] = balance.landmark
  .stages as readonly LandmarkStageDefinition[];
export const LANDMARK_UNLOCK_PRESTIGE_LEVEL = balance.landmark.unlockPrestigeLevel;
export const LANDMARK_DUPLICATE_DISH_FESTIVAL_POINTS = balance.landmark.duplicateDishFestivalPoints;
export const LANDMARK_ANIMAL_PRODUCT_PER_COLLECTION = balance.landmark.animalProductPerCollection;
export const LANDMARK_REWARDED_AD_FESTIVAL_POINTS = balance.landmark.rewardedAdFestivalPoints;
// 부동소수점 합산 오차가 최종 티어 비용에 섞이지 않도록 설계 총합을 명시한다.
// scripts/check-balance.mjs가 각 단계 비율의 합이 이 값과 같은지 별도로 강제한다.
export const LANDMARK_TOTAL_GOLD_COST_RATIO = 0.72;

const LANDMARK_GOLD_RATIO_SCALE = 10_000;
const LANDMARK_TOTAL_GOLD_RATIO_UNITS = Math.round(
  LANDMARK_TOTAL_GOLD_COST_RATIO * LANDMARK_GOLD_RATIO_SCALE
);

const CROP_CONSUMPTION_ORDER: readonly CropKey[] = [...balance.crops]
  .map((crop, index) => ({ key: crop.key as CropKey, tier: crop.tier, index }))
  .sort((left, right) => left.tier - right.tier || left.index - right.index)
  .map((crop) => crop.key);

function normalizeCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

function normalizeGoldSpend(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

function normalizePrestigeLevel(value: unknown): number {
  return normalizeCount(value);
}

function addCount(current: unknown, amount: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, normalizeCount(current) + amount);
}

function normalizeCompletedStagePrefix(value: unknown): LandmarkStageKey[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const prefix: LandmarkStageKey[] = [];
  for (let index = 0; index < LANDMARK_STAGES.length; index += 1) {
    const expected = LANDMARK_STAGES[index]!.key;
    if (value[index] !== expected) {
      break;
    }
    prefix.push(expected);
  }
  return prefix;
}

export function createInitialLandmarkState(): LandmarkState {
  return {
    completedTier: 0,
    completedStages: [],
    goldSpentThisTier: 0,
    festivalDeliveryPoints: 0,
    animalProductStock: 0,
  };
}

/**
 * additive save migration for the landmark meta layer.
 *
 * A save that genuinely predates this field starts at its current prestige tier
 * instead of receiving a backlog: Pn is seeded with tiers 1..n-1 complete.
 * Explicit modern state never applies that backfill, which keeps normalization
 * idempotent on every subsequent load.
 */
export function normalizeLandmarkState(
  value: unknown,
  prestigeLevel: number,
  legacyMissing = value === undefined
): LandmarkState {
  const safePrestigeLevel = normalizePrestigeLevel(prestigeLevel);
  if (legacyMissing) {
    return {
      ...createInitialLandmarkState(),
      completedTier: Math.max(0, safePrestigeLevel - 1),
    };
  }
  if (typeof value !== 'object' || value == null) {
    return createInitialLandmarkState();
  }

  const raw = value as Partial<LandmarkState>;
  let completedTier = Math.min(normalizeCount(raw.completedTier), safePrestigeLevel);
  let completedStages = normalizeCompletedStagePrefix(raw.completedStages);

  // A fully written intermediate record is canonicalized to the same shape that
  // fundLandmarkStage writes after its final atomic transaction.
  if (completedStages.length === LANDMARK_STAGES.length && completedTier < safePrestigeLevel) {
    completedTier += 1;
    completedStages = [];
  }
  // No future project can be in progress before another prestige unlocks it.
  if (completedTier >= safePrestigeLevel) {
    completedStages = [];
  }

  const currentTier = completedTier + 1;
  const stageGoldCosts = getStageGoldCosts(currentTier);
  const targetGoldCost = getLandmarkTargetGoldCost(currentTier);
  const reconstructedGoldSpend =
    stageGoldCosts == null
      ? 0
      : stageGoldCosts
          .slice(0, completedStages.length)
          .reduce((total, cost) => total + cost, 0);
  const rawGoldSpend =
    raw.goldSpentThisTier === undefined
      ? reconstructedGoldSpend
      : normalizeGoldSpend(raw.goldSpentThisTier);
  const goldSpentThisTier =
    completedStages.length === 0 || completedTier >= safePrestigeLevel
      ? 0
      : Math.min(rawGoldSpend, targetGoldCost ?? rawGoldSpend);

  return {
    completedTier,
    completedStages,
    goldSpentThisTier,
    festivalDeliveryPoints: normalizeCount(raw.festivalDeliveryPoints),
    animalProductStock: normalizeCount(raw.animalProductStock),
  };
}

function resolveVisualState(prestigeLevel: number, landmark: LandmarkState): LandmarkVisualState {
  if (prestigeLevel < LANDMARK_UNLOCK_PRESTIGE_LEVEL) {
    return 'locked';
  }
  const lastStage = landmark.completedStages[landmark.completedStages.length - 1];
  if (lastStage === 'festival_prep') {
    return 'festival';
  }
  if (lastStage === 'frame' || lastStage === 'equipment') {
    return 'scaffold';
  }
  if (lastStage === 'foundation') {
    return 'foundation';
  }
  if (lastStage === 'complete' || landmark.completedTier >= prestigeLevel) {
    return 'complete';
  }
  return 'foundation';
}

export function getLandmarkStatus(gameState: GameState): LandmarkStatus {
  const prestigeLevel = normalizePrestigeLevel(gameState.prestige.level);
  const landmark = normalizeLandmarkState(gameState.landmark, prestigeLevel, false);
  const currentTier = landmark.completedTier + 1;
  const isFeatureUnlocked = prestigeLevel >= LANDMARK_UNLOCK_PRESTIGE_LEVEL;
  const hasActiveProject = isFeatureUnlocked && currentTier <= prestigeLevel;
  const currentStageIndex = landmark.completedStages.length;
  return {
    isFeatureUnlocked,
    hasActiveProject,
    completedForCurrentPrestige: isFeatureUnlocked && landmark.completedTier >= prestigeLevel,
    completedTier: landmark.completedTier,
    currentTier,
    completedStages: landmark.completedStages,
    currentStageIndex,
    currentStageKey: hasActiveProject ? (LANDMARK_STAGES[currentStageIndex]?.key ?? null) : null,
    totalStageCount: LANDMARK_STAGES.length,
    visualState: resolveVisualState(prestigeLevel, landmark),
  };
}

export function getLandmarkVisualState(gameState: GameState): LandmarkVisualState {
  return getLandmarkStatus(gameState).visualState;
}

function getKnownCropUnitCount(inventory: CropInventory): number {
  return CROP_CONSUMPTION_ORDER.reduce((total, cropKey) => total + normalizeCount(inventory[cropKey]), 0);
}

function getExactGraduationCost(tier: number): bigint | null {
  const costBase = balance.regions.graduation.costBase;
  const costGrowth = balance.regions.graduation.costGrowth;
  const graduationCost = getPrestigeCost(tier);
  if (
    !Number.isSafeInteger(tier) ||
    tier < 0 ||
    !Number.isSafeInteger(costBase) ||
    costBase <= 0 ||
    !Number.isSafeInteger(costGrowth) ||
    costGrowth <= 0 ||
    !Number.isFinite(graduationCost) ||
    graduationCost <= 0
  ) {
    return null;
  }

  return BigInt(costBase) * BigInt(costGrowth) ** BigInt(tier);
}

function getLandmarkTargetGoldCost(tier: number): number | null {
  const exactGraduationCost = getExactGraduationCost(tier);
  if (exactGraduationCost == null) {
    return null;
  }
  const exactTarget =
    (exactGraduationCost * BigInt(LANDMARK_TOTAL_GOLD_RATIO_UNITS)) /
    BigInt(LANDMARK_GOLD_RATIO_SCALE);
  const target = Number(exactTarget);
  return Number.isFinite(target) && target > 0 ? target : null;
}

function getStageGoldCosts(tier: number): number[] | null {
  const exactGraduationCost = getExactGraduationCost(tier);
  const totalGoldCost = getLandmarkTargetGoldCost(tier);
  if (exactGraduationCost == null || totalGoldCost == null) {
    return null;
  }

  const costs = LANDMARK_STAGES.map((stage, index) =>
    index === LANDMARK_STAGES.length - 1
      ? 0
      : Number(
          (exactGraduationCost * BigInt(Math.round(stage.goldCostRatio * LANDMARK_GOLD_RATIO_SCALE))) /
            BigInt(LANDMARK_GOLD_RATIO_SCALE)
        )
  );
  const earlierTotal = costs.reduce((total, cost) => total + cost, 0);
  costs[costs.length - 1] = Math.max(0, totalGoldCost - earlierTotal);
  return costs;
}

function getRepresentableGoldCharge(holdings: number, desiredCharge: number): number {
  if (holdings <= 0 || desiredCharge <= 0) {
    return 0;
  }
  const balanceAfter = Math.max(0, holdings - desiredCharge);
  // holdings와 balanceAfter의 차이는 IEEE-754에서 실제 관측되는 차감액이다.
  // 이 값을 견적·상태·analytics에 공통 사용해 큰 수 ULP 구간의 드리프트를 막는다.
  return holdings - balanceAfter;
}

function getBlockedReason(
  requirements: LandmarkResourceAmounts,
  holdings: LandmarkResourceAmounts
): LandmarkFundBlockedReason | null {
  if (holdings.gold < requirements.gold) return 'insufficient_gold';
  if (holdings.cropUnits < requirements.cropUnits) return 'insufficient_crops';
  if (holdings.animalProducts < requirements.animalProducts) return 'insufficient_animal_products';
  if (holdings.festivalPoints < requirements.festivalPoints) return 'insufficient_festival_points';
  return null;
}

export function getLandmarkStageQuote(gameState: GameState): LandmarkStageQuote | null {
  const status = getLandmarkStatus(gameState);
  if (!status.hasActiveProject || status.currentStageKey == null) {
    return null;
  }
  const stage = LANDMARK_STAGES[status.currentStageIndex];
  const goldCosts = getStageGoldCosts(status.currentTier);
  const targetGoldCost = getLandmarkTargetGoldCost(status.currentTier);
  if (stage == null || goldCosts == null || targetGoldCost == null) {
    return null;
  }

  const landmark = normalizeLandmarkState(gameState.landmark, gameState.prestige.level, false);
  const nominalGoldCost =
    status.currentStageIndex === LANDMARK_STAGES.length - 1
      ? Math.max(0, targetGoldCost - landmark.goldSpentThisTier)
      : goldCosts[status.currentStageIndex]!;
  const heldGold =
    typeof gameState.gold === 'number' && Number.isFinite(gameState.gold) ? Math.max(0, gameState.gold) : 0;
  const quotedGoldCost =
    heldGold >= nominalGoldCost
      ? getRepresentableGoldCharge(heldGold, nominalGoldCost)
      : nominalGoldCost;

  const requirements: LandmarkResourceAmounts = {
    gold: quotedGoldCost,
    cropUnits: stage.cropUnits,
    animalProducts: stage.animalProducts,
    festivalPoints: stage.festivalPoints,
  };
  const holdings: LandmarkResourceAmounts = {
    gold: heldGold,
    cropUnits: getKnownCropUnitCount(gameState.production.inventory),
    animalProducts: normalizeCount(gameState.landmark.animalProductStock),
    festivalPoints: normalizeCount(gameState.landmark.festivalDeliveryPoints),
  };
  const blockedReason = getBlockedReason(requirements, holdings);
  return {
    tier: status.currentTier,
    stageIndex: status.currentStageIndex,
    stageKey: stage.key,
    requirements,
    holdings,
    canFund: blockedReason == null,
    blockedReason,
  };
}

function consumeCropUnits(inventory: CropInventory, requiredUnits: number): CropInventory {
  const next: CropInventory = { ...inventory };
  let remaining = requiredUnits;
  for (const cropKey of CROP_CONSUMPTION_ORDER) {
    if (remaining <= 0) break;
    const available = normalizeCount(next[cropKey]);
    const consumed = Math.min(available, remaining);
    if (consumed <= 0) continue;
    const left = available - consumed;
    if (left > 0) {
      next[cropKey] = left;
    } else {
      delete next[cropKey];
    }
    remaining -= consumed;
  }
  return next;
}

export function fundLandmarkStage(
  gameState: GameState,
  expectedTier: number,
  expectedStageKey: LandmarkStageKey,
  now = Date.now()
): FundLandmarkStageOutcome | null {
  const quote = getLandmarkStageQuote(gameState);
  if (quote == null || !quote.canFund || quote.tier !== expectedTier || quote.stageKey !== expectedStageKey) {
    return null;
  }

  const landmark = normalizeLandmarkState(gameState.landmark, gameState.prestige.level, false);
  const completedStages = [...landmark.completedStages, quote.stageKey];
  const tierCompleted = completedStages.length === LANDMARK_STAGES.length;
  const nextLandmark: LandmarkState = {
    completedTier: tierCompleted ? quote.tier : landmark.completedTier,
    completedStages: tierCompleted ? [] : completedStages,
    goldSpentThisTier: tierCompleted
      ? 0
      : landmark.goldSpentThisTier + quote.requirements.gold,
    festivalDeliveryPoints: landmark.festivalDeliveryPoints - quote.requirements.festivalPoints,
    animalProductStock: landmark.animalProductStock - quote.requirements.animalProducts,
  };
  const next: GameState = {
    ...gameState,
    gold: Math.max(0, gameState.gold - quote.requirements.gold),
    production: {
      ...gameState.production,
      inventory: consumeCropUnits(gameState.production.inventory, quote.requirements.cropUnits),
    },
    landmark: nextLandmark,
  };

  return {
    state: recordMissionProgressEvent(next, { type: 'spend_gold', amount: quote.requirements.gold }, now),
    quote,
    tierCompleted,
  };
}

export function grantLandmarkFestivalDeliveryPoints(gameState: GameState, amount: number): GameState {
  const granted = normalizeCount(amount);
  if (granted <= 0) {
    return gameState;
  }
  return {
    ...gameState,
    landmark: {
      ...gameState.landmark,
      festivalDeliveryPoints: addCount(gameState.landmark.festivalDeliveryPoints, granted),
    },
  };
}

export function grantLandmarkAnimalProductStock(
  gameState: GameState,
  amount: number = LANDMARK_ANIMAL_PRODUCT_PER_COLLECTION
): GameState {
  const granted = normalizeCount(amount);
  if (granted <= 0) {
    return gameState;
  }
  return {
    ...gameState,
    landmark: {
      ...gameState.landmark,
      animalProductStock: addCount(gameState.landmark.animalProductStock, granted),
    },
  };
}
