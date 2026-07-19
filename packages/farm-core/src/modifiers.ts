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
import { getCropOfTheDayStatus } from './cropOfTheDay';
import { getWeeklyEventMultiplier, getWeeklyEventSpeedMultiplier } from './weeklyEvent';

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
  const cotd = getCropOfTheDayStatus(now);
  return {
    ...global,
    // A harvest (speed-axis) weekend festival speeds up the featured area's growth;
    // getWeeklyEventSpeedMultiplier is 1 on non-speed weekends, so sale festivals
    // leave growth speed unchanged.
    speedMultiplier:
      global.speedMultiplier *
      getMasterySpeedMultiplier(gameState, cropKey) *
      getWeeklyEventSpeedMultiplier(cropKey, now, gameState.unlockedAreas),
    // Sale multipliers stack multiplicatively: a crop that is both the crop of
    // the day and in a sale weekend festival's featured area earns cotd × festival.
    // getWeeklyEventMultiplier is 1 on non-sale weekends.
    profitMultiplier:
      global.profitMultiplier *
      getMasterySellMultiplier(gameState, cropKey) *
      (cropKey === cotd.cropKey ? cotd.multiplier : 1) *
      getWeeklyEventMultiplier(cropKey, now, gameState.unlockedAreas),
  };
}

export function getCropPurchaseCost(gameState: GameState, cropKey: CropKey, now = Date.now()): number {
  const crop = CROPS[cropKey];
  if (crop == null) {
    throw new Error(`Unknown crop: ${cropKey}`);
  }
  return Math.floor(crop.cost * getGlobalModifiers(gameState, now).cropCostMultiplier);
}

// 온보딩 "바로 시작" CTA가 자동 선택할 대표 씨앗을 고른다(#362, #274).
// 잠긴 구역·미해금(하이브리드) 작물을 제외한 심을 수 있는 작물 중에서, 지금
// 골드로 실제 감당 가능한 "가장 싼" 작물을 우선한다 — CTA를 탭한 신규 유저가
// 골드 가드 토스트로 튕겨 selectSeed에서 정체되는 경로를 막기 위함이다. 감당
// 가능한 작물이 하나도 없어도(모디파이어로 비싸진 극단 상황) 심기 가능한 전체
// 중 최저가로 폴백해 항상 non-null을 보장한다 — CTA가 "탭해도 무동작"인 채로
// 정체를 만들지 않도록. 심을 수 있는 작물이 전혀 없을 때만 null.
export function getOnboardingCropKey(gameState: GameState, now = Date.now()): CropKey | null {
  const plantable = (Object.keys(CROPS) as CropKey[])
    .filter((key) => isAreaUnlocked(gameState, CROPS[key]!.area) && isCropPlantable(gameState, key))
    .map((key) => ({ key, cost: getCropPurchaseCost(gameState, key, now) }))
    .sort((a, b) => a.cost - b.cost);
  if (plantable.length === 0) {
    return null;
  }
  const affordable = plantable.find((candidate) => gameState.gold >= candidate.cost);
  return (affordable ?? plantable[0]!).key;
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
