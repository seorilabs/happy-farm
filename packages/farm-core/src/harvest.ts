import type { CropKey, GameState, Plot } from './types';
import { CROPS } from './constants';
import { getGlobalModifiers } from './modifiers';

export type HarvestOptions = {
  now?: number;
};

export type HarvestOutcome = {
  state: GameState;
  cropKey: CropKey;
  goldGained: number;
  boostActive: boolean;
  boostMultiplier: number;
  isNewCropDiscovery: boolean;
  isFirstMeaningfulHarvest: boolean;
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
  const { speedMultiplier } = getGlobalModifiers(gameState, now);
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
  const { speedMultiplier } = getGlobalModifiers(gameState, now);
  return Math.max(0, crop.growTime - (now - plot.startTime) * speedMultiplier);
}

export function isPlotGrowthComplete(gameState: GameState, plot: Plot, now = Date.now()): boolean {
  return plot.state === 1 && getPlotGrowthRatio(gameState, plot, now) >= 1;
}

// The single harvest pipeline. Every harvest path (manual tap, automation)
// must go through here so collection/discovery side effects stay consistent.
export function performHarvest(gameState: GameState, plotIndex: number, options: HarvestOptions = {}): HarvestOutcome | null {
  const now = options.now ?? Date.now();
  const plot = gameState.plots[plotIndex];
  if (plot == null || plot.state !== 2 || plot.cropType == null) {
    return null;
  }

  const cropKey = plot.cropType;
  const crop = getKnownCrop(cropKey);
  const modifiers = getGlobalModifiers(gameState, now);
  const goldGained = Math.floor(crop.sell * modifiers.profitMultiplier * modifiers.harvestMultiplier);

  const nextPlots = [...gameState.plots];
  nextPlots[plotIndex] = { id: plot.id, cropType: null, startTime: null, state: 0 };

  const isFirstMeaningfulHarvest = gameState.harvestedCropKeys.length === 0;
  const isNewCropDiscovery = !gameState.harvestedCropKeys.includes(cropKey);
  const harvestedCropKeys = isNewCropDiscovery ? [...gameState.harvestedCropKeys, cropKey] : gameState.harvestedCropKeys;

  return {
    state: {
      ...gameState,
      gold: gameState.gold + goldGained,
      plots: nextPlots,
      harvestedCropKeys,
    },
    cropKey,
    goldGained,
    boostActive: modifiers.harvestMultiplier > 1,
    boostMultiplier: modifiers.harvestMultiplier,
    isNewCropDiscovery,
    isFirstMeaningfulHarvest,
  };
}
