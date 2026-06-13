import type { CropKey, GameState, Plot } from './types';
import { CROPS, isAreaUnlocked } from './constants';
import { getCropModifiers, getCropPurchaseCost } from './modifiers';
import {
  getCropHarvestCount,
  getMasteryStatus,
  isMutationDiscovered,
  rollMutation,
  type MasteryRank,
  type MutationKind,
} from './mastery';
import { getDonationRp, isCropPlantable, isNodeUnlocked } from './research';

export type HarvestOptions = {
  now?: number;
  rng?: () => number;
};

export type HarvestOutcome = {
  state: GameState;
  cropKey: CropKey;
  goldGained: number;
  rpGained: number;
  donated: boolean;
  boostActive: boolean;
  boostMultiplier: number;
  isNewCropDiscovery: boolean;
  isFirstMeaningfulHarvest: boolean;
  mutation: MutationKind | null;
  isNewMutationDiscovery: boolean;
  newMasteryRank: MasteryRank | null;
};

function getKnownCrop(cropKey: CropKey) {
  const crop = CROPS[cropKey];
  if (crop == null) {
    throw new Error(`Unknown crop: ${cropKey}`);
  }
  return crop;
}

export function getPlotGrowthRatio(gameState: GameState, plot: Plot, now = Date.now()): number {
  if (plot.state === 2) {
    return 1;
  }
  if (plot.state !== 1 || plot.cropType == null || plot.startTime == null) {
    return 0;
  }

  const crop = getKnownCrop(plot.cropType);
  const { speedMultiplier } = getCropModifiers(gameState, plot.cropType, now);
  if (crop.growTime <= 0 || speedMultiplier <= 0) {
    return 1;
  }

  const elapsed = Math.max(0, now - plot.startTime) * speedMultiplier;
  return Math.min(Math.max(elapsed / crop.growTime, 0), 1);
}

// Remaining growth expressed in raw grow-time milliseconds (the growth-ad
// skip window is defined against this scale, not wall-clock time).
export function getPlotRemainingGrowthMs(gameState: GameState, plot: Plot, now = Date.now()): number {
  if (plot.state !== 1 || plot.cropType == null || plot.startTime == null) {
    return 0;
  }

  const crop = getKnownCrop(plot.cropType);
  const { speedMultiplier } = getCropModifiers(gameState, plot.cropType, now);
  return Math.max(0, crop.growTime - (now - plot.startTime) * speedMultiplier);
}

// Wall-clock milliseconds until this plot is harvestable, for the player-facing
// plot countdown. Unlike getPlotRemainingGrowthMs (which stays on the raw
// grow-time scale the ad skip window is defined against), this divides by the
// active speed multiplier so the displayed timer matches real elapsed time.
export function getPlotRemainingWallClockMs(gameState: GameState, plot: Plot, now = Date.now()): number {
  if (plot.state !== 1 || plot.cropType == null || plot.startTime == null) {
    return 0;
  }

  const { speedMultiplier } = getCropModifiers(gameState, plot.cropType, now);
  if (speedMultiplier <= 0) {
    return 0;
  }

  return getPlotRemainingGrowthMs(gameState, plot, now) / speedMultiplier;
}

export function isPlotGrowthComplete(gameState: GameState, plot: Plot, now = Date.now()): boolean {
  return plot.state === 1 && getPlotGrowthRatio(gameState, plot, now) >= 1;
}

// The single harvest pipeline. Every harvest path (manual tap, automation)
// must go through here so mastery counters, mutation rolls, and collection
// side effects stay consistent. The mutation roll consumes exactly one rng()
// call; pass a fixed-roll rng to replay an outcome inside a state updater.
export function performHarvest(gameState: GameState, plotIndex: number, options: HarvestOptions = {}): HarvestOutcome | null {
  const now = options.now ?? Date.now();
  const rng = options.rng ?? Math.random;
  const plot = gameState.plots[plotIndex];
  if (plot == null || plot.state !== 2 || plot.cropType == null) {
    return null;
  }

  const cropKey = plot.cropType;
  const crop = getKnownCrop(cropKey);
  const modifiers = getCropModifiers(gameState, cropKey, now);
  const mutation = rollMutation(gameState, cropKey, rng());
  const mutationMultiplier = mutation?.sellMultiplier ?? 1;
  const saleValue = Math.floor(crop.sell * modifiers.profitMultiplier * modifiers.harvestMultiplier * mutationMultiplier);

  // Donation mode converts the full sale value (mutations included) into
  // research points instead of gold.
  const donated = gameState.automationSettings.donationModeEnabled;
  const goldGained = donated ? 0 : saleValue;
  const rpGained = donated ? getDonationRp(gameState, saleValue) : 0;

  const nextPlots = [...gameState.plots];
  nextPlots[plotIndex] = { id: plot.id, cropType: null, startTime: null, state: 0 };

  const isFirstMeaningfulHarvest = gameState.harvestedCropKeys.length === 0;
  const isNewCropDiscovery = !gameState.harvestedCropKeys.includes(cropKey);
  const harvestedCropKeys = isNewCropDiscovery ? [...gameState.harvestedCropKeys, cropKey] : gameState.harvestedCropKeys;

  const previousRankIndex = getMasteryStatus(gameState, cropKey).rankIndex;
  const harvestCounts = {
    ...gameState.harvestCounts,
    [cropKey]: getCropHarvestCount(gameState, cropKey) + 1,
  };

  const isNewMutationDiscovery = mutation != null && !isMutationDiscovered(gameState, cropKey, mutation.key);
  const mutationsDiscovered = isNewMutationDiscovery
    ? {
        ...gameState.mutationsDiscovered,
        [cropKey]: [...(gameState.mutationsDiscovered[cropKey] ?? []), mutation.key],
      }
    : gameState.mutationsDiscovered;

  const nextState: GameState = {
    ...gameState,
    gold: gameState.gold + goldGained,
    plots: nextPlots,
    harvestedCropKeys,
    harvestCounts,
    mutationsDiscovered,
    research: {
      ...gameState.research,
      points: gameState.research.points + rpGained,
      totalPointsEarned: gameState.research.totalPointsEarned + rpGained,
    },
    lifetimeStats: {
      ...gameState.lifetimeStats,
      totalHarvests: gameState.lifetimeStats.totalHarvests + 1,
      totalGoldEarned: gameState.lifetimeStats.totalGoldEarned + goldGained,
      mutationsFound: gameState.lifetimeStats.mutationsFound + (mutation != null ? 1 : 0),
      researchPointsEarned: gameState.lifetimeStats.researchPointsEarned + rpGained,
    },
  };

  const nextMastery = getMasteryStatus(nextState, cropKey);
  const newMasteryRank = nextMastery.rankIndex > previousRankIndex ? nextMastery.rank : null;

  return {
    state: nextState,
    cropKey,
    goldGained,
    rpGained,
    donated,
    boostActive: modifiers.harvestMultiplier > 1,
    boostMultiplier: modifiers.harvestMultiplier,
    isNewCropDiscovery,
    isFirstMeaningfulHarvest,
    mutation,
    isNewMutationDiscovery,
    newMasteryRank,
  };
}

// Pure planting helper shared by the manual planting path and auto-replant.
// Seed prices include the region cost multiplier.
export function performPlant(gameState: GameState, plotIndex: number, cropKey: CropKey, now = Date.now()): GameState | null {
  const crop = getKnownCrop(cropKey);
  if (!isAreaUnlocked(gameState, crop.area) || !isCropPlantable(gameState, cropKey)) {
    return null;
  }
  const cost = getCropPurchaseCost(gameState, cropKey, now);
  if (gameState.gold < cost) {
    return null;
  }
  const plot = gameState.plots[plotIndex];
  if (plot == null || plot.id >= gameState.unlockedPlotCount || plot.state !== 0) {
    return null;
  }

  const nextPlots = [...gameState.plots];
  nextPlots[plotIndex] = { ...plot, cropType: cropKey, startTime: now, state: 1 };
  return { ...gameState, gold: gameState.gold - cost, plots: nextPlots };
}

export type AutomationTickResult = {
  state: GameState;
  harvestedCount: number;
  replantedCount: number;
  goldGained: number;
  rpGained: number;
};

// Harvests every ready plot (and replants the same crop) when the matching
// research nodes are unlocked and the player toggles are on. Intentionally
// side-effect free: callers must not toast/vibrate per crop here.
export function runAutomationTick(gameState: GameState, options: HarvestOptions = {}): AutomationTickResult {
  const now = options.now ?? Date.now();
  const rng = options.rng ?? Math.random;
  const result: AutomationTickResult = {
    state: gameState,
    harvestedCount: 0,
    replantedCount: 0,
    goldGained: 0,
    rpGained: 0,
  };

  const autoHarvest = gameState.automationSettings.autoHarvestEnabled && isNodeUnlocked(gameState, 'auto_harvest');
  if (!autoHarvest) {
    return result;
  }
  const autoReplant = gameState.automationSettings.autoReplantEnabled && isNodeUnlocked(gameState, 'auto_replant');

  for (let plotIndex = 0; plotIndex < result.state.plots.length; plotIndex += 1) {
    const plot = result.state.plots[plotIndex];
    if (plot == null || plot.id >= result.state.unlockedPlotCount || plot.state !== 2 || plot.cropType == null) {
      continue;
    }

    const cropKey = plot.cropType;
    const outcome = performHarvest(result.state, plotIndex, { now, rng });
    if (outcome == null) {
      continue;
    }
    result.state = outcome.state;
    result.harvestedCount += 1;
    result.goldGained += outcome.goldGained;
    result.rpGained += outcome.rpGained;

    if (autoReplant) {
      const replanted = performPlant(result.state, plotIndex, cropKey, now);
      if (replanted != null) {
        result.state = replanted;
        result.replantedCount += 1;
      }
    }
  }

  return result;
}
