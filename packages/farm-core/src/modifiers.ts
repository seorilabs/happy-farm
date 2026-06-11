import type { GameState } from './types';
import { getHarvestBonusBoostStatus, getProfitMultiplier, getSpeedMultiplier } from './constants';

// Single aggregation point for every multiplier source (upgrades, ad boosts,
// and later mastery/prestige/region bonuses). Gameplay code must read
// multipliers from here instead of combining sources ad hoc.
export type GlobalModifiers = {
  speedMultiplier: number;
  profitMultiplier: number;
  harvestMultiplier: number;
};

export function getGlobalModifiers(gameState: GameState, now = Date.now()): GlobalModifiers {
  return {
    speedMultiplier: getSpeedMultiplier(gameState.upgrades.speed),
    profitMultiplier: getProfitMultiplier(gameState.upgrades.profit),
    harvestMultiplier: getHarvestBonusBoostStatus(gameState, now).multiplier,
  };
}
