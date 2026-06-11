import balance from './balance.json';
import type { CropKey, GameState, PrestigeSkillKey } from './types';
import {
  CROPS,
  getCropEconomyEstimate,
  getHarvestBonusBoostStatus,
  getProfitMultiplier,
  getSpeedMultiplier,
  isAreaUnlocked,
  type FarmProductivityEstimate,
} from './constants';
import { getMasterySellMultiplier, getMasterySpeedMultiplier } from './mastery';
import { isCropPlantable } from './research';

// Prestige skill/region effects are read straight from balance.json here
// (instead of importing prestige.ts) to keep this module cycle-free for its
// callers; prestige.ts re-exposes richer helpers for the UI.
const PRESTIGE_SKILLS_BY_KEY = new Map(balance.prestigeSkills.map((skill) => [skill.key, skill]));
const REGION_ARCHETYPES_BY_KEY = new Map(balance.regions.archetypes.map((archetype) => [archetype.key, archetype]));

function getSkillEffectValue(gameState: GameState, skillKey: PrestigeSkillKey): number {
  const skill = PRESTIGE_SKILLS_BY_KEY.get(skillKey);
  if (skill == null) {
    return 0;
  }
  return (gameState.prestige.skills[skillKey] ?? 0) * skill.effectPerLevel;
}

// Single aggregation point for every multiplier source (upgrades, ad boosts,
// mastery, prestige skills, and region scaling). Gameplay code must read
// multipliers from here instead of combining sources ad hoc.
export type GlobalModifiers = {
  speedMultiplier: number;
  profitMultiplier: number;
  harvestMultiplier: number;
  // Region inflation applies equally to crop sale prices (in
  // profitMultiplier) and seed costs, preserving ROI across regions.
  cropCostMultiplier: number;
};

export type CropModifiers = GlobalModifiers;

export function getGlobalModifiers(gameState: GameState, now = Date.now()): GlobalModifiers {
  const archetype = REGION_ARCHETYPES_BY_KEY.get(gameState.prestige.currentRegionArchetype);
  const regionScale = Math.pow(balance.regions.scalePerLevel, gameState.prestige.level);
  const regionSellMult = (archetype?.sellMult ?? 1) * regionScale;
  const regionGrowTimeMult = archetype?.growTimeMult ?? 1;

  const boost = getHarvestBonusBoostStatus(gameState, now);
  const harvestMultiplier = boost.active ? boost.multiplier + getSkillEffectValue(gameState, 'ad_amplifier') : 1;

  return {
    speedMultiplier:
      (getSpeedMultiplier(gameState.upgrades.speed) * (1 + getSkillEffectValue(gameState, 'global_speed'))) /
      regionGrowTimeMult,
    profitMultiplier:
      getProfitMultiplier(gameState.upgrades.profit) *
      (1 + getSkillEffectValue(gameState, 'global_profit')) *
      regionSellMult,
    harvestMultiplier,
    cropCostMultiplier: regionScale,
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

export function getCropPurchaseCost(gameState: GameState, cropKey: CropKey, now = Date.now()): number {
  const crop = CROPS[cropKey];
  if (crop == null) {
    throw new Error(`Unknown crop: ${cropKey}`);
  }
  return Math.floor(crop.cost * getGlobalModifiers(gameState, now).cropCostMultiplier);
}

// Modifier-aware farm productivity: best plantable crop under the player's
// full multiplier stack, scaled by plot count. Used for the header estimate
// and the chain-farm snapshot taken at graduation.
export function getFarmHourlyProductivity(gameState: GameState, now = Date.now()): FarmProductivityEstimate {
  const plantableCropKeys = (Object.keys(CROPS) as CropKey[]).filter(
    (cropKey) => isAreaUnlocked(gameState, CROPS[cropKey]!.area) && isCropPlantable(gameState, cropKey)
  );

  const bestCrop = plantableCropKeys
    .map((cropKey) => {
      const modifiers = getCropModifiers(gameState, cropKey, now);
      return getCropEconomyEstimate(cropKey, {
        speedMultiplier: modifiers.speedMultiplier,
        profitMultiplier: modifiers.profitMultiplier,
        harvestMultiplier: modifiers.harvestMultiplier,
        costMultiplier: modifiers.cropCostMultiplier,
      });
    })
    .sort((a, b) => b.netProfitPerHour - a.netProfitPerHour)[0];

  return {
    bestCropKey: bestCrop?.cropKey ?? null,
    plotCount: gameState.unlockedPlotCount,
    netProfitPerHour: (bestCrop?.netProfitPerHour ?? 0) * gameState.unlockedPlotCount,
  };
}
