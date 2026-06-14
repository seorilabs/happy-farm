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
  // Optional multiplier applied only to manual-tap harvests in combo mode.
  // 1.0 = no bonus. Values above 1.0 reward rapid consecutive taps.
  comboMultiplier?: number;
};

export type HarvestOutcome = {
  state: GameState;
  cropKey: CropKey;
  goldGained: number;
  rpGained: number;
  donated: boolean;
  boostActive: boolean;
  boostMultiplier: number;
  comboMultiplier: number;
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
  if (crop.growTime <= 0) {
    // Instant crop: already fully grown.
    return 1;
  }
  if (speedMultiplier <= 0) {
    // Frozen (unreachable in balance): growth is stalled at the start, so report
    // 0% rather than a misleading "ready" 100%. Keeps the progress bar consistent
    // with the countdown, which holds the full grow time in this case.
    return 0;
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

  const crop = getKnownCrop(plot.cropType);
  // Resolve the multiplier once (getCropModifiers is the hot part) and inline the
  // remaining-growth math instead of calling getPlotRemainingGrowthMs, which would
  // recompute the same modifiers a second time on every tile every tick.
  const { speedMultiplier } = getCropModifiers(gameState, plot.cropType, now);
  const elapsed = now - plot.startTime;

  if (speedMultiplier <= 0) {
    // Defensive only: in the shipped balance the multiplier is a product of
    // strictly positive factors, so growth never freezes and this branch is
    // unreachable. If a future mechanic ever drives it to <= 0, growth is not
    // progressing, so report a constant (the full grow time): it neither ticks
    // down nor — for a negative multiplier — climbs with elapsed time.
    return crop.growTime;
  }

  // Total wall-clock duration at the current speed is growTime / speedMultiplier;
  // subtract the wall-clock time already elapsed. This stays consistent with the
  // growth model getPlotGrowthRatio/getPlotRemainingGrowthMs use to decide actual
  // harvest readiness, so the timer always hits 0 exactly when the crop is ready.
  return Math.max(0, Math.ceil(crop.growTime / speedMultiplier - elapsed));
}

export type PlotGrowthDisplay = {
  growthRatio: number;
  remainingWallClockMs: number;
};

// Combined growth-display data for the plot grid. getPlotGrowthRatio and
// getPlotRemainingWallClockMs each resolve getCropModifiers independently, but
// the grid needs both for every growing tile every tick, so computing them in
// one pass resolves the modifiers once per tile instead of twice. Field-for-field
// equivalent to calling the two helpers separately (locked down by the
// plotCountdown equivalence test).
export function getPlotGrowthDisplay(gameState: GameState, plot: Plot, now = Date.now()): PlotGrowthDisplay {
  if (plot.state === 2) {
    return { growthRatio: 1, remainingWallClockMs: 0 };
  }
  if (plot.state !== 1 || plot.cropType == null || plot.startTime == null) {
    return { growthRatio: 0, remainingWallClockMs: 0 };
  }

  const crop = getKnownCrop(plot.cropType);
  const { speedMultiplier } = getCropModifiers(gameState, plot.cropType, now);
  const elapsed = now - plot.startTime;

  if (crop.growTime <= 0) {
    // Instant crop: fully grown, nothing remaining.
    return { growthRatio: 1, remainingWallClockMs: 0 };
  }
  if (speedMultiplier <= 0) {
    // Frozen (unreachable in balance): stuck at the start, so 0% progress with the
    // full grow time still to go. Both fields agree on "not progressing".
    return { growthRatio: 0, remainingWallClockMs: crop.growTime };
  }

  return {
    growthRatio: Math.min(Math.max((elapsed * speedMultiplier) / crop.growTime, 0), 1),
    remainingWallClockMs: Math.max(0, Math.ceil(crop.growTime / speedMultiplier - elapsed)),
  };
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
  const raw = options.comboMultiplier;
  // Cap at 10 (well above the game's max of 1.15) so a pathologically large but
  // finite value can't drive saleValue * comboMultiplier to Infinity.
  const comboMultiplier = typeof raw === 'number' && isFinite(raw) && raw >= 1 && raw <= 2 ? raw : 1;
  const goldGained = donated ? 0 : Math.floor(saleValue * comboMultiplier);
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
    comboMultiplier: donated ? 1 : comboMultiplier,
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

// True for a plot the player can harvest right now: unlocked and fully ripe.
function isPlotHarvestable(gameState: GameState, plot: Plot | undefined): plot is Plot {
  return (
    plot != null && plot.id < gameState.unlockedPlotCount && plot.state === 2 && plot.cropType != null
  );
}

// How many plots are ripe and waiting for a tap. Drives the manual
// "Harvest All" affordance (only worth offering when several are ready).
export function getReadyPlotCount(gameState: GameState): number {
  let count = 0;
  for (const plot of gameState.plots) {
    if (isPlotHarvestable(gameState, plot)) {
      count += 1;
    }
  }
  return count;
}

export type HarvestAllEntry = {
  plotIndex: number;
  outcome: HarvestOutcome;
};

export type HarvestAllResult = {
  state: GameState;
  harvests: HarvestAllEntry[];
  harvestedCount: number;
  totalGoldGained: number;
  totalRpGained: number;
  specialCount: number;
};

export type HarvestAllOptions = HarvestOptions & {
  // Per-plot mutation roll keyed by plot index. When supplied, a given plot
  // always consumes the same roll regardless of how many other plots are ripe,
  // so a UI preview and the committed state update agree on that plot's outcome
  // even if a concurrent growth/auto-harvest tick shifts the ripe set between
  // the two calls. Falls back to the shared `rng` when omitted.
  rollFor?: (plotIndex: number) => number;
};

// Manual "Harvest All": collects every ripe plot in one action through the
// shared harvest pipeline so mastery, mutations, and collection side effects
// stay identical to tapping each plot. Returns per-plot outcomes so the caller
// can drive batched feedback (one toast/pulse/sound) and floating-gold FX.
// Pure: the caller owns every UI side effect, just like performHarvest.
export function performHarvestAll(gameState: GameState, options: HarvestAllOptions = {}): HarvestAllResult {
  const now = options.now ?? Date.now();
  const rng = options.rng ?? Math.random;
  const { rollFor } = options;

  let state = gameState;
  const harvests: HarvestAllEntry[] = [];
  let totalGoldGained = 0;
  let totalRpGained = 0;
  let specialCount = 0;

  for (let plotIndex = 0; plotIndex < state.plots.length; plotIndex += 1) {
    if (!isPlotHarvestable(state, state.plots[plotIndex])) {
      continue;
    }
    const plotRng = rollFor != null ? () => rollFor(plotIndex) : rng;
    const outcome = performHarvest(state, plotIndex, { now, rng: plotRng });
    if (outcome == null) {
      continue;
    }
    state = outcome.state;
    harvests.push({ plotIndex, outcome });
    totalGoldGained += outcome.goldGained;
    totalRpGained += outcome.rpGained;
    if (outcome.mutation != null || outcome.newMasteryRank != null || outcome.boostActive) {
      specialCount += 1;
    }
  }

  return {
    state,
    harvests,
    harvestedCount: harvests.length,
    totalGoldGained,
    totalRpGained,
    specialCount,
  };
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
