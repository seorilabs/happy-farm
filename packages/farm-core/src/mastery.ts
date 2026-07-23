import balance from './balance.json';
import type { CropKey, GameState, MasteryRankKey, MutationKey } from './types';
import { getResearchEffectValue } from './research';

export type MasteryRank = {
  key: MasteryRankKey;
  icon: string;
  sellBonus: number;
  speedBonus: number;
};

export type MutationKind = {
  key: MutationKey;
  icon: string;
  sellMultiplier: number;
  baseChance: number;
  chancePerRankAboveMin: number;
  minRank: MasteryRankKey;
};

export const MASTERY_RANKS = balance.mastery.ranks as MasteryRank[];
export const MUTATION_KINDS = balance.mutations.kinds as MutationKind[];

// balance.json is the only dependency here (not constants.ts) so the
// normalizers below can be called from migrateLoadedState without a cycle.
const CROP_TIER_BY_KEY = new Map<string, number>(balance.crops.map((crop) => [crop.key, crop.tier]));
const MASTERY_THRESHOLDS_BY_TIER = balance.mastery.thresholdsByTier as Record<string, number[]>;
const HIGHEST_TIER_THRESHOLDS = Object.entries(MASTERY_THRESHOLDS_BY_TIER).sort(
  ([a], [b]) => Number(b) - Number(a)
)[0]?.[1];

// Rarest mutation first so a single random roll resolves deterministically.
const MUTATION_KINDS_BY_RARITY = [...MUTATION_KINDS].sort((a, b) => a.baseChance - b.baseChance);

function isKnownCropKey(value: unknown): value is CropKey {
  return typeof value === 'string' && CROP_TIER_BY_KEY.has(value);
}

function isKnownMutationKey(value: unknown): value is MutationKey {
  return typeof value === 'string' && MUTATION_KINDS.some((kind) => kind.key === value);
}

export function getMasteryThresholds(cropKey: CropKey): number[] {
  const tier = CROP_TIER_BY_KEY.get(cropKey);
  const thresholds = tier == null ? undefined : MASTERY_THRESHOLDS_BY_TIER[String(tier)];
  return thresholds ?? HIGHEST_TIER_THRESHOLDS ?? [];
}

export function getCropHarvestCount(gameState: GameState, cropKey: CropKey): number {
  const count = gameState.harvestCounts[cropKey];
  return typeof count === 'number' && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

export type MasteryStatus = {
  cropKey: CropKey;
  harvestCount: number;
  rank: MasteryRank | null;
  rankIndex: number;
  nextThreshold: number | null;
  progressRatio: number;
};

function getRankIndexForCount(thresholds: number[], harvestCount: number): number {
  let rankIndex = -1;
  for (let index = 0; index < Math.min(thresholds.length, MASTERY_RANKS.length); index += 1) {
    const threshold = thresholds[index];
    if (threshold != null && harvestCount >= threshold) {
      rankIndex = index;
    }
  }
  return rankIndex;
}

export function getMasteryStatus(gameState: GameState, cropKey: CropKey): MasteryStatus {
  const thresholds = getMasteryThresholds(cropKey);
  const harvestCount = getCropHarvestCount(gameState, cropKey);
  const rankIndex = getRankIndexForCount(thresholds, harvestCount);
  const nextThreshold = rankIndex + 1 < Math.min(thresholds.length, MASTERY_RANKS.length)
    ? (thresholds[rankIndex + 1] ?? null)
    : null;
  const previousThreshold = rankIndex >= 0 ? (thresholds[rankIndex] ?? 0) : 0;
  const progressRatio =
    nextThreshold == null || nextThreshold <= previousThreshold
      ? 1
      : Math.min(1, Math.max(0, (harvestCount - previousThreshold) / (nextThreshold - previousThreshold)));

  return {
    cropKey,
    harvestCount,
    rank: rankIndex >= 0 ? (MASTERY_RANKS[rankIndex] ?? null) : null,
    rankIndex,
    nextThreshold,
    progressRatio,
  };
}

export function getMasterySellMultiplier(gameState: GameState, cropKey: CropKey): number {
  const { rank } = getMasteryStatus(gameState, cropKey);
  return rank == null ? 1 : 1 + rank.sellBonus;
}

export function getMasterySpeedMultiplier(gameState: GameState, cropKey: CropKey): number {
  const { rank } = getMasteryStatus(gameState, cropKey);
  return rank == null ? 1 : 1 + rank.speedBonus;
}

export function getMutationChance(
  gameState: GameState,
  cropKey: CropKey,
  kind: MutationKind,
  mutationChanceMultiplier = 1
): number {
  const { rankIndex } = getMasteryStatus(gameState, cropKey);
  const minRankIndex = MASTERY_RANKS.findIndex((rank) => rank.key === kind.minRank);
  if (minRankIndex < 0 || rankIndex < minRankIndex) {
    return 0;
  }
  const baseChance = kind.baseChance + kind.chancePerRankAboveMin * (rankIndex - minRankIndex);
  return (
    baseChance *
    (1 + getResearchEffectValue(gameState, 'mutation_chance_multiplier')) *
    mutationChanceMultiplier
  );
}

// Consumes exactly one roll in [0, 1) so callers can replay the same roll
// inside a React state updater and reach the same outcome.
export function rollMutation(
  gameState: GameState,
  cropKey: CropKey,
  roll: number,
  mutationChanceMultiplier = 1
): MutationKind | null {
  if (!Number.isFinite(roll) || roll < 0) {
    return null;
  }

  let cumulative = 0;
  for (const kind of MUTATION_KINDS_BY_RARITY) {
    cumulative += getMutationChance(gameState, cropKey, kind, mutationChanceMultiplier);
    if (roll < cumulative) {
      return kind;
    }
  }
  return null;
}

export function getDiscoveredMutationKeys(gameState: GameState, cropKey: CropKey): MutationKey[] {
  return gameState.mutationsDiscovered[cropKey] ?? [];
}

export function isMutationDiscovered(gameState: GameState, cropKey: CropKey, mutationKey: MutationKey): boolean {
  return getDiscoveredMutationKeys(gameState, cropKey).includes(mutationKey);
}

export type MutationCollectionSummary = {
  discoveredCount: number;
  totalCount: number;
};

export function getMutationCollectionSummary(gameState: GameState): MutationCollectionSummary {
  const cropCount = CROP_TIER_BY_KEY.size;
  let discoveredCount = 0;
  for (const keys of Object.values(gameState.mutationsDiscovered)) {
    discoveredCount += Array.isArray(keys) ? keys.length : 0;
  }
  return {
    discoveredCount,
    totalCount: cropCount * MUTATION_KINDS.length,
  };
}

export function normalizeHarvestCounts(value: unknown, harvestedCropKeys: CropKey[]): Partial<Record<CropKey, number>> {
  const counts: Partial<Record<CropKey, number>> = {};

  if (typeof value === 'object' && value != null) {
    for (const [key, rawCount] of Object.entries(value)) {
      if (!isKnownCropKey(key)) continue;
      if (typeof rawCount !== 'number' || !Number.isFinite(rawCount)) continue;
      const count = Math.floor(rawCount);
      if (count > 0) {
        counts[key] = count;
      }
    }
  }

  // Saves that predate mastery only carry harvestedCropKeys; seed those crops
  // with one harvest so discovery and counters stay in sync.
  for (const cropKey of harvestedCropKeys) {
    if (counts[cropKey] == null) {
      counts[cropKey] = 1;
    }
  }

  return counts;
}

export function getHarvestedCropKeysInSync(
  harvestedCropKeys: CropKey[],
  harvestCounts: Partial<Record<CropKey, number>>
): CropKey[] {
  const synced = [...harvestedCropKeys];
  for (const [key, count] of Object.entries(harvestCounts)) {
    if (isKnownCropKey(key) && typeof count === 'number' && count > 0 && !synced.includes(key)) {
      synced.push(key);
    }
  }
  return synced;
}

export function normalizeMutationsDiscovered(value: unknown): Partial<Record<CropKey, MutationKey[]>> {
  const discovered: Partial<Record<CropKey, MutationKey[]>> = {};
  if (typeof value !== 'object' || value == null) {
    return discovered;
  }

  for (const [key, rawKeys] of Object.entries(value)) {
    if (!isKnownCropKey(key) || !Array.isArray(rawKeys)) continue;
    const mutationKeys = rawKeys
      .filter(isKnownMutationKey)
      .filter((mutationKey, index, items) => items.indexOf(mutationKey) === index);
    if (mutationKeys.length > 0) {
      discovered[key] = mutationKeys;
    }
  }

  return discovered;
}
