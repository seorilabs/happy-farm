import type { CropKey, GameState } from './types';
import { getHarvestBonusBoostStatus, getProfitMultiplier, getSpeedMultiplier } from './constants';
import { getMasterySellMultiplier, getMasterySpeedMultiplier } from './mastery';

// Single aggregation point for every multiplier source (upgrades, ad boosts,
// mastery, and later prestige/region bonuses). Gameplay code must read
// multipliers from here instead of combining sources ad hoc.
export type GlobalModifiers = {
  speedMultiplier: number;
  profitMultiplier: number;
  harvestMultiplier: number;
};

export type CropModifiers = GlobalModifiers;

export function getGlobalModifiers(gameState: GameState, now = Date.now()): GlobalModifiers {
  return {
    speedMultiplier: getSpeedMultiplier(gameState.upgrades.speed),
    profitMultiplier: getProfitMultiplier(gameState.upgrades.profit),
    harvestMultiplier: getHarvestBonusBoostStatus(gameState, now).multiplier,
  };
}

export function getCropModifiers(gameState: GameState, cropKey: CropKey, now = Date.now()): CropModifiers {
  const global = getGlobalModifiers(gameState, now);
  return {
    ...global,
    speedMultiplier: global.speedMultiplier * getMasterySpeedMultiplier(gameState, cropKey),
    profitMultiplier: global.profitMultiplier * getMasterySellMultiplier(gameState, cropKey),
  };
}
