import { CROPS, isAreaUnlocked } from './constants';
import { performHarvest, performPlant, type HarvestOutcome } from './harvest';
import { getCropPurchaseCost } from './modifiers';
import { isCropPlantable } from './research';
import type { AreaKey, CropKey, GameState } from './types';

export type FarmGameCommand =
  | { type: 'plantCrop'; plotIndex: number; cropKey: CropKey }
  | { type: 'harvestCrop'; plotIndex: number };

export type FarmGameCommandEnvironment = {
  now: number;
  rng: () => number;
};

export type PlantCropBlockedReason = 'areaLocked' | 'cropLocked' | 'insufficientGold' | 'plotUnavailable';
export type HarvestCropBlockedReason = 'plotUnavailable';
export type FarmGameCommandBlockedReason = PlantCropBlockedReason | HarvestCropBlockedReason;

export type CropPlantedGameEvent = {
  type: 'cropPlanted';
  plotIndex: number;
  cropKey: CropKey;
  areaKey: AreaKey;
  cropTier: number;
  cost: number;
};

export type CropHarvestedGameEvent = Omit<HarvestOutcome, 'state'> & {
  type: 'cropHarvested';
  plotIndex: number;
  areaKey: AreaKey;
  cropTier: number;
};

export type FarmGameEvent = CropPlantedGameEvent | CropHarvestedGameEvent;

export type FarmGameCommandResult =
  | { status: 'applied'; state: GameState; events: FarmGameEvent[] }
  | { status: 'blocked'; reason: FarmGameCommandBlockedReason; events: [] };

function getKnownCrop(cropKey: CropKey) {
  const crop = CROPS[cropKey];
  if (crop == null) {
    throw new Error(`Unknown crop: ${cropKey}`);
  }
  return crop;
}

export function executeFarmGameCommand(
  gameState: GameState,
  command: FarmGameCommand,
  environment: FarmGameCommandEnvironment
): FarmGameCommandResult {
  switch (command.type) {
    case 'plantCrop':
      return executePlantCropCommand(gameState, command.plotIndex, command.cropKey, environment);
    case 'harvestCrop':
      return executeHarvestCropCommand(gameState, command.plotIndex, environment);
  }
}

function executePlantCropCommand(
  gameState: GameState,
  plotIndex: number,
  cropKey: CropKey,
  environment: FarmGameCommandEnvironment
): FarmGameCommandResult {
  const now = environment.now;
  const crop = getKnownCrop(cropKey);

  if (!isAreaUnlocked(gameState, crop.area)) {
    return { status: 'blocked', reason: 'areaLocked', events: [] };
  }
  if (!isCropPlantable(gameState, cropKey)) {
    return { status: 'blocked', reason: 'cropLocked', events: [] };
  }

  const cost = getCropPurchaseCost(gameState, cropKey, now);
  if (gameState.gold < cost) {
    return { status: 'blocked', reason: 'insufficientGold', events: [] };
  }

  const nextState = performPlant(gameState, plotIndex, cropKey, now);
  if (nextState == null) {
    return { status: 'blocked', reason: 'plotUnavailable', events: [] };
  }

  return {
    status: 'applied',
    state: nextState,
    events: [
      {
        type: 'cropPlanted',
        plotIndex,
        cropKey,
        areaKey: crop.area,
        cropTier: crop.tier,
        cost,
      },
    ],
  };
}

function executeHarvestCropCommand(
  gameState: GameState,
  plotIndex: number,
  environment: FarmGameCommandEnvironment
): FarmGameCommandResult {
  const outcome = performHarvest(gameState, plotIndex, { now: environment.now, rng: environment.rng });
  if (outcome == null) {
    return { status: 'blocked', reason: 'plotUnavailable', events: [] };
  }

  const crop = getKnownCrop(outcome.cropKey);
  const { state, ...harvest } = outcome;

  return {
    status: 'applied',
    state,
    events: [
      {
        type: 'cropHarvested',
        plotIndex,
        areaKey: crop.area,
        cropTier: crop.tier,
        ...harvest,
      },
    ],
  };
}
