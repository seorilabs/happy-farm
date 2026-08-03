import balance from './balance.json';
import type { AreaKey, AutomationSettings, CropKey, GameState, ResearchNodeKey, ResearchState } from './types';
import { recordMissionProgressEvent } from './missionEvents';

export type ResearchNode = {
  key: ResearchNodeKey;
  cost: number;
  costGrowth: number;
  maxLevel: number | null;
  requires: ResearchNodeKey | null;
  category: 'automation' | 'scaling' | 'breeding';
  effect: ResearchNodeEffect | null;
  effectPerLevel: number;
};

export type ResearchNodeEffect =
  | 'profit_multiplier'
  | 'speed_multiplier'
  | 'offline_cap_ms'
  | 'mutation_chance_multiplier';

export type BreedingRecipe = {
  crop: CropKey;
  parents: CropKey[];
  rpCost: number;
  advanced: boolean;
};

export const RESEARCH_NODES = balance.research.nodes as ResearchNode[];
export const BREEDING_RECIPES = balance.breeding.recipes as BreedingRecipe[];
export const DONATION_RP_RATE = balance.research.donationRpRate;
export const DONATION_AMPLIFIER_BONUS = balance.research.donationAmplifierBonus;
export const RESEARCH_BATCH_STEP = 10;
export const RESEARCH_BATCH_MAX_LEVELS = Number.MAX_SAFE_INTEGER;

export type ResearchNodeBatchPurchase = {
  levels: number;
  totalCost: number;
  fromLevel: number;
  toLevel: number;
};

export type ResearchNodeBatchResult = ResearchNodeBatchPurchase & {
  state: GameState;
};

// balance.json is the only dependency here (not constants.ts) so constants'
// migration/unlock helpers can import this module without a cycle.
const CROP_AREA_BY_KEY = new Map<string, string>(balance.crops.map((crop) => [crop.key, crop.area]));
const GATED_AREA_KEYS = new Set(
  balance.areas.filter((area) => 'gate' in area.unlock).map((area) => area.key)
);

function isKnownCropKey(value: unknown): value is CropKey {
  return typeof value === 'string' && CROP_AREA_BY_KEY.has(value);
}

function isKnownNodeKey(value: unknown): value is ResearchNodeKey {
  return typeof value === 'string' && RESEARCH_NODES.some((node) => node.key === value);
}

function getKnownNode(nodeKey: ResearchNodeKey): ResearchNode {
  const node = RESEARCH_NODES.find((candidate) => candidate.key === nodeKey);
  if (node == null) {
    throw new Error(`Unknown research node: ${nodeKey}`);
  }
  return node;
}

export function isNodeUnlocked(gameState: GameState, nodeKey: ResearchNodeKey): boolean {
  return getResearchNodeLevel(gameState, nodeKey) > 0;
}

export function getResearchNodeLevel(gameState: GameState, nodeKey: ResearchNodeKey): number {
  const storedLevel = gameState.research.nodeLevels?.[nodeKey];
  if (typeof storedLevel === 'number' && Number.isFinite(storedLevel) && storedLevel > 0) {
    return Math.floor(storedLevel);
  }
  // In-memory callers may still hand us a pre-nodeLevels state. Treat legacy
  // unlockedNodes as level 1 until the next save migration persists nodeLevels.
  return gameState.research.unlockedNodes.includes(nodeKey) ? 1 : 0;
}

function getResearchNodeCostAtLevel(node: ResearchNode, level: number): number {
  const rawCost = node.cost * Math.pow(node.costGrowth, level);
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(1, Math.floor(rawCost)));
}

export function getResearchNodeCost(gameState: GameState, nodeKey: ResearchNodeKey): number | null {
  const node = getKnownNode(nodeKey);
  const level = getResearchNodeLevel(gameState, nodeKey);
  if (node.maxLevel != null && level >= node.maxLevel) {
    return null;
  }
  return getResearchNodeCostAtLevel(node, level);
}

/**
 * 반복 연구 노드의 배치 구매 미리보기. 비용이 MAX_SAFE_INTEGER에 도달한 뒤에는 동일 비용이
 * 반복되므로 남은 구매량을 산술 계산해 후반 레벨에서도 `최대`가 선형 루프가 되지 않게 한다.
 */
export function getResearchNodeBatchPurchase(
  gameState: GameState,
  nodeKey: ResearchNodeKey,
  availablePoints: number,
  maxLevels: number,
): ResearchNodeBatchPurchase {
  const node = getKnownNode(nodeKey);
  const fromLevel = getResearchNodeLevel(gameState, nodeKey);
  const empty = { levels: 0, totalCost: 0, fromLevel, toLevel: fromLevel };
  if (node.maxLevel != null || (node.requires != null && !isNodeUnlocked(gameState, node.requires))) {
    return empty;
  }

  const budget =
    availablePoints === Number.POSITIVE_INFINITY
      ? Number.MAX_VALUE
      : Number.isFinite(availablePoints) && availablePoints > 0
        ? availablePoints
        : 0;
  const remainingSafeLevels = Math.max(0, Number.MAX_SAFE_INTEGER - fromLevel);
  const requestedCap =
    maxLevels === Number.POSITIVE_INFINITY
      ? remainingSafeLevels
      : Number.isFinite(maxLevels)
        ? Math.max(0, Math.floor(maxLevels))
        : 0;
  const cap = Math.min(remainingSafeLevels, requestedCap);
  if (budget <= 0 || cap <= 0) {
    return empty;
  }

  if (node.costGrowth <= 1) {
    const cost = getResearchNodeCostAtLevel(node, fromLevel);
    const levels = Math.min(cap, Math.floor(budget / cost));
    return {
      levels,
      totalCost: Math.min(budget, levels * cost),
      fromLevel,
      toLevel: fromLevel + levels,
    };
  }

  let levels = 0;
  let totalCost = 0;
  while (levels < cap) {
    const nextCost = getResearchNodeCostAtLevel(node, fromLevel + levels);
    const remainingPoints = budget - totalCost;
    if (remainingPoints < nextCost) {
      break;
    }
    if (nextCost === Number.MAX_SAFE_INTEGER) {
      const saturatedLevels = Math.min(cap - levels, Math.floor(remainingPoints / nextCost));
      levels += saturatedLevels;
      totalCost += Math.min(remainingPoints, saturatedLevels * nextCost);
      break;
    }
    totalCost += nextCost;
    levels += 1;
  }
  return { levels, totalCost, fromLevel, toLevel: fromLevel + levels };
}

export function getResearchEffectValue(gameState: GameState, effect: ResearchNodeEffect): number {
  return RESEARCH_NODES.filter((node) => node.effect === effect).reduce(
    (total, node) => total + getResearchNodeLevel(gameState, node.key) * node.effectPerLevel,
    0
  );
}

export function canUnlockNode(gameState: GameState, nodeKey: ResearchNodeKey): boolean {
  const node = getKnownNode(nodeKey);
  if (node.requires != null && !isNodeUnlocked(gameState, node.requires)) {
    return false;
  }
  const cost = getResearchNodeCost(gameState, nodeKey);
  return cost != null && gameState.research.points >= cost;
}

export function unlockNode(gameState: GameState, nodeKey: ResearchNodeKey): GameState | null {
  if (!canUnlockNode(gameState, nodeKey)) {
    return null;
  }
  const node = getKnownNode(nodeKey);
  const currentLevel = getResearchNodeLevel(gameState, nodeKey);
  const cost = getResearchNodeCost(gameState, nodeKey);
  if (cost == null) {
    return null;
  }
  return {
    ...gameState,
    research: {
      ...gameState.research,
      points: gameState.research.points - cost,
      nodeLevels: { ...gameState.research.nodeLevels, [nodeKey]: currentLevel + 1 },
      unlockedNodes:
        currentLevel > 0 ? gameState.research.unlockedNodes : [...gameState.research.unlockedNodes, node.key],
    },
  };
}

/** 반복 연구의 RP 차감·레벨 증가·unlockedNodes 유지를 한 상태 전이로 적용한다. */
export function unlockNodeBatch(
  gameState: GameState,
  nodeKey: ResearchNodeKey,
  maxLevels: number,
): ResearchNodeBatchResult | null {
  const purchase = getResearchNodeBatchPurchase(
    gameState,
    nodeKey,
    gameState.research.points,
    maxLevels,
  );
  if (purchase.levels <= 0) {
    return null;
  }
  const state: GameState = {
    ...gameState,
    research: {
      ...gameState.research,
      points: Math.max(0, gameState.research.points - purchase.totalCost),
      nodeLevels: { ...gameState.research.nodeLevels, [nodeKey]: purchase.toLevel },
      unlockedNodes:
        purchase.fromLevel > 0
          ? gameState.research.unlockedNodes
          : [...gameState.research.unlockedNodes, nodeKey],
    },
  };
  return { ...purchase, state };
}

// RP granted when a harvest is donated instead of sold.
export function getDonationRp(gameState: GameState, saleValue: number): number {
  const amplifier = isNodeUnlocked(gameState, 'donation_amplifier') ? DONATION_AMPLIFIER_BONUS : 0;
  return Math.max(1, Math.floor(saleValue * DONATION_RP_RATE * (1 + amplifier)));
}

export function isHybridCrop(cropKey: CropKey): boolean {
  const area = CROP_AREA_BY_KEY.get(cropKey);
  return area != null && GATED_AREA_KEYS.has(area as AreaKey);
}

export function isBreedUnlocked(gameState: GameState, cropKey: CropKey): boolean {
  return gameState.research.unlockedBreeds.includes(cropKey);
}

// Hybrid crops require their breeding recipe before they can be planted;
// every other crop only needs its area.
export function isCropPlantable(gameState: GameState, cropKey: CropKey): boolean {
  return !isHybridCrop(cropKey) || isBreedUnlocked(gameState, cropKey);
}

export type BreedingRecipeStatus = {
  recipe: BreedingRecipe;
  unlocked: boolean;
  nodeSatisfied: boolean;
  parentsDiscovered: boolean;
  affordable: boolean;
  breedable: boolean;
};

export function getBreedingRecipeStatus(gameState: GameState, recipe: BreedingRecipe): BreedingRecipeStatus {
  const unlocked = isBreedUnlocked(gameState, recipe.crop);
  const nodeSatisfied = isNodeUnlocked(gameState, recipe.advanced ? 'breeding_advanced' : 'breeding_lab');
  const parentsDiscovered = recipe.parents.every((parent) => gameState.harvestedCropKeys.includes(parent));
  const affordable = gameState.research.points >= recipe.rpCost;

  return {
    recipe,
    unlocked,
    nodeSatisfied,
    parentsDiscovered,
    affordable,
    breedable: !unlocked && nodeSatisfied && parentsDiscovered && affordable,
  };
}

export function breedCrop(gameState: GameState, cropKey: CropKey, now = Date.now()): GameState | null {
  const recipe = BREEDING_RECIPES.find((candidate) => candidate.crop === cropKey);
  if (recipe == null || !getBreedingRecipeStatus(gameState, recipe).breedable) {
    return null;
  }

  const next: GameState = {
    ...gameState,
    research: {
      ...gameState.research,
      points: gameState.research.points - recipe.rpCost,
      unlockedBreeds: [...gameState.research.unlockedBreeds, recipe.crop],
    },
    lifetimeStats: {
      ...gameState.lifetimeStats,
      breedsUnlocked: gameState.lifetimeStats.breedsUnlocked + 1,
    },
  };
  return recordMissionProgressEvent(next, { type: 'breed' }, now);
}

export function createInitialResearchState(): ResearchState {
  return {
    points: 0,
    totalPointsEarned: 0,
    nodeLevels: {},
    unlockedNodes: [],
    unlockedBreeds: [],
    acknowledgedOpportunities: [],
  };
}

// 연구실 진입 유도 배지용: 지금 당장 행동 가능한 "발견 기회"의 안정적 키 목록.
// - node:<키>  해금 비용/선행 조건을 충족해 지금 해금 가능한 연구 노드
// - breed:<작물> 노드·부모 발견·RP를 모두 충족해 지금 교배 가능한 레시피
export function getResearchOpportunityKeys(gameState: GameState): string[] {
  const keys: string[] = [];
  for (const node of RESEARCH_NODES) {
    if (canUnlockNode(gameState, node.key)) {
      keys.push(`node:${node.key}`);
    }
  }
  for (const recipe of BREEDING_RECIPES) {
    if (getBreedingRecipeStatus(gameState, recipe).breedable) {
      keys.push(`breed:${recipe.crop}`);
    }
  }
  return keys;
}

// 현재 기회 중 마지막 확인 이후 새로 생긴 것이 하나라도 있으면 true(배지 노출 조건).
export function hasUnseenResearchOpportunity(gameState: GameState): boolean {
  const acknowledged = gameState.research.acknowledgedOpportunities;
  return getResearchOpportunityKeys(gameState).some((key) => !acknowledged.includes(key));
}

// 현재 기회를 "확인됨"으로 표시해 배지를 해제한다(Lab을 열 때 호출). 변화가 없으면
// 동일 참조를 반환해 불필요한 상태 갱신/세이브를 피한다.
export function acknowledgeResearchOpportunities(gameState: GameState): GameState {
  const keys = getResearchOpportunityKeys(gameState);
  const current = gameState.research.acknowledgedOpportunities;
  if (keys.length === current.length && keys.every((key) => current.includes(key))) {
    return gameState;
  }
  return {
    ...gameState,
    research: { ...gameState.research, acknowledgedOpportunities: keys },
  };
}

export function createInitialAutomationSettings(): AutomationSettings {
  return { autoHarvestEnabled: false, autoReplantEnabled: false, donationModeEnabled: false };
}

function normalizePoints(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

export function normalizeResearchState(value: unknown): ResearchState {
  const loaded = (typeof value === 'object' && value != null ? value : {}) as Partial<ResearchState>;
  const points = normalizePoints(loaded.points);

  const legacyUnlockedNodes = Array.isArray(loaded.unlockedNodes)
    ? loaded.unlockedNodes
        .filter(isKnownNodeKey)
        .filter((nodeKey, index, items) => items.indexOf(nodeKey) === index)
    : [];

  const candidateLevels: Partial<Record<ResearchNodeKey, number>> = {};
  if (typeof loaded.nodeLevels === 'object' && loaded.nodeLevels != null) {
    for (const [rawKey, rawLevel] of Object.entries(loaded.nodeLevels)) {
      if (!isKnownNodeKey(rawKey) || typeof rawLevel !== 'number' || !Number.isFinite(rawLevel)) continue;
      const node = getKnownNode(rawKey);
      const level = Math.max(0, Math.floor(rawLevel));
      const cappedLevel = node.maxLevel == null ? level : Math.min(level, node.maxLevel);
      if (cappedLevel > 0) {
        candidateLevels[rawKey] = cappedLevel;
      }
    }
  }
  for (const nodeKey of legacyUnlockedNodes) {
    candidateLevels[nodeKey] = Math.max(1, candidateLevels[nodeKey] ?? 0);
  }

  function hasReachablePrerequisites(nodeKey: ResearchNodeKey, visiting = new Set<ResearchNodeKey>()): boolean {
    if ((candidateLevels[nodeKey] ?? 0) <= 0 || visiting.has(nodeKey)) return false;
    const node = getKnownNode(nodeKey);
    if (node.requires == null) return true;
    const nextVisiting = new Set(visiting);
    nextVisiting.add(nodeKey);
    return hasReachablePrerequisites(node.requires, nextVisiting);
  }

  const nodeLevels: Partial<Record<ResearchNodeKey, number>> = {};
  const unlockedNodes = RESEARCH_NODES.filter((node) => hasReachablePrerequisites(node.key)).map((node) => {
    nodeLevels[node.key] = candidateLevels[node.key];
    return node.key;
  });

  const unlockedBreeds = Array.isArray(loaded.unlockedBreeds)
    ? loaded.unlockedBreeds
        .filter(isKnownCropKey)
        .filter((cropKey) => BREEDING_RECIPES.some((recipe) => recipe.crop === cropKey))
        .filter((cropKey, index, items) => items.indexOf(cropKey) === index)
    : [];

  // 잘 알려진 형식(node:<노드>/breed:<레시피 작물>)의 키만 남기고 중복 제거. 형식 변경/
  // 콘텐츠 삭제로 무효해진 항목은 버려 목록이 무한정 커지거나 오염되지 않게 한다.
  const acknowledgedOpportunities = Array.isArray(loaded.acknowledgedOpportunities)
    ? loaded.acknowledgedOpportunities
        .filter(isKnownOpportunityKey)
        .filter((key, index, items) => items.indexOf(key) === index)
    : [];

  return {
    points,
    totalPointsEarned: Math.max(points, normalizePoints(loaded.totalPointsEarned)),
    nodeLevels,
    unlockedNodes,
    unlockedBreeds,
    acknowledgedOpportunities,
  };
}

function isKnownOpportunityKey(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  if (value.startsWith('node:')) {
    return isKnownNodeKey(value.slice('node:'.length));
  }
  if (value.startsWith('breed:')) {
    const cropKey = value.slice('breed:'.length);
    return isKnownCropKey(cropKey) && BREEDING_RECIPES.some((recipe) => recipe.crop === cropKey);
  }
  return false;
}

export function normalizeAutomationSettings(value: unknown): AutomationSettings {
  const loaded = (typeof value === 'object' && value != null ? value : {}) as Partial<AutomationSettings>;
  return {
    autoHarvestEnabled: loaded.autoHarvestEnabled === true,
    autoReplantEnabled: loaded.autoReplantEnabled === true,
    donationModeEnabled: loaded.donationModeEnabled === true,
  };
}
