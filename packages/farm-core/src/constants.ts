import type {
  AreaKey,
  CollectionRewardKey,
  CropKey,
  GameState,
  OnboardingStep,
  PlotState,
  ResearchNodeKey,
} from './types';
import { normalizeDailyBonusState } from './dailyBonus';
import { COLLECTION_FULL_REWARD_KEY } from './types';
import { getHarvestedCropKeysInSync, normalizeHarvestCounts, normalizeMutationsDiscovered } from './mastery';
import {
  createInitialLifetimeStats,
  normalizeActiveTitle,
  normalizeClaimedAchievements,
  normalizeLifetimeStats,
} from './achievements';
import { createInitialPrestigeProgress, normalizeChainFarms, normalizePrestigeProgress } from './prestige';
import { createInitialAnimalsState, normalizeAnimalsState } from './animals';
import { createInitialProductionState, normalizeProductionState } from './production';
import { normalizeSeenFeatureCoachmarks, seedSeenFeatureCoachmarksForLoadedSave } from './featureCoachmarks';
import { getResetDayIndex } from './resetBoundary';
import { createInitialPlacedDecorations, normalizePlacedDecorations } from './decorations';
import { createInitialDailyMissionState, normalizeDailyMissionState } from './missions';
import { createInitialWeeklyMissionState, normalizeWeeklyMissionState } from './weeklyMissions';
import { createInitialWheelState, getWheelStatus, normalizeWheelState, type WheelSpinResult } from './wheel';
import {
  createInitialAutomationSettings,
  createInitialResearchState,
  isCropPlantable,
  normalizeAutomationSettings,
  normalizeResearchState,
} from './research';
import balance from './balance.json';
import { getAdLimits } from './adLimits';
import {
  DEFAULT_LOCALE,
  formatDuration,
  formatMoney as formatMoneyForLocale,
  getCoreMessages,
  getResearchNodeLabel,
  type SupportedLocale,
} from './i18n';

export type RewardedAdType =
  | 'rewardedGold'
  | 'growthAd'
  | 'harvestBonusAd'
  | 'plotDiscountAd'
  | 'offlineBonusAd'
  | 'wheelBonusAd';

export const FARM_AREAS = balance.areas as Array<{
  key: AreaKey;
  name: string;
  target: string;
  description: string;
  unlock: {
    cost: number;
    requiredHarvestedCropCount: number;
    requiredUpgradeLevel: number;
    // Research node that must be unlocked first. Gated areas sit outside the
    // sequential area progression and never count as initially unlocked.
    gate?: ResearchNodeKey;
  };
}>;

export const CROPS: Record<
  CropKey,
  {
    name: string;
    cost: number;
    sell: number;
    growTime: number;
    icon: string;
    tier: number;
    area: AreaKey;
  }
> = Object.fromEntries(
  balance.crops.map((crop) => [
    crop.key,
    {
      name: crop.name,
      cost: crop.cost,
      sell: crop.sell,
      growTime: crop.growTime,
      icon: crop.icon,
      tier: crop.tier,
      area: crop.area as AreaKey,
    },
  ])
) as Record<
  CropKey,
  {
    name: string;
    cost: number;
    sell: number;
    growTime: number;
    icon: string;
    tier: number;
    area: AreaKey;
  }
>;

export const MAX_PLOTS = balance.economy.maxPlots;
export const INITIAL_PLOTS = balance.economy.initialPlots;
export const DEFAULT_GOLD = balance.economy.defaultGold;
export const SAVE_KEY = 'farmTycoonSave';
export const ONBOARDING_STEPS = ['plant', 'harvest', 'reward'] as const satisfies readonly OnboardingStep[];
// #427: 신규 유저의 첫 밭에 자동 파종되는 씨앗. 가장 싼 1티어 작물이라 즉시 수확
// 가능한 aha 순간을 만든다. 온보딩 시작 단계를 'harvest'로 여는 근거가 되는 상수.
export const ONBOARDING_STARTER_CROP: CropKey = 'carrot';
export const REWARDED_GOLD_AMOUNT = balance.ads.rewardedGoldAmount;
export const REWARDED_GOLD_WINDOW_MS = balance.ads.rewardedGoldWindowMs;
export const REWARDED_GOLD_MAX_USES_PER_WINDOW = balance.ads.rewardedGoldMaxUsesPerWindow;
export const REWARDED_GOLD_DAILY_LIMIT = balance.ads.rewardedGoldDailyLimit;
export const HARVEST_BONUS_MULTIPLIER = balance.ads.harvestBonusMultiplier;
export const HARVEST_BONUS_AD_COOLDOWN_MS = balance.ads.harvestBonusAdCooldownMs;
export const HARVEST_BONUS_BOOST_DURATION_MS = balance.ads.harvestBonusBoostDurationMs;
export const HARVEST_BONUS_AD_DAILY_LIMIT = balance.ads.harvestBonusAdDailyLimit;
export const GROWTH_AD_MIN_REMAINING_MS = balance.ads.growthAdMinRemainingMs;
// Tiered growth-skip: one ad removes a flat floor (`SKIP_MS`) or a share
// (`SKIP_PERCENT`) of the remaining grow time, whichever is larger. Replaces the
// old hard upper cap so long-duration crops also qualify (partial skip allowed).
export const GROWTH_AD_SKIP_MS = balance.ads.growthAdSkipMs;
export const GROWTH_AD_SKIP_PERCENT = balance.ads.growthAdSkipPercent;
export const GROWTH_AD_COOLDOWN_MS = balance.ads.growthAdCooldownMs;
export const GROWTH_AD_DAILY_LIMIT = balance.ads.growthAdDailyLimit;
// Plot-discount ad: replaces the old "free plot" reward. Instead of granting a
// plot for free (which bypassed the gold sink), one ad buys the next plot at a
// discount — the player still pays gold — and it is strongly capped per day.
export const PLOT_DISCOUNT_AD_PERCENT = balance.ads.plotDiscountAdPercent;
export const PLOT_DISCOUNT_AD_DAILY_LIMIT = balance.ads.plotDiscountAdDailyLimit;
export const PLOT_DISCOUNT_AD_COOLDOWN_MS = balance.ads.plotDiscountAdCooldownMs;
export const OFFLINE_BONUS_MULTIPLIER = balance.ads.offlineBonusMultiplier;
export const INTERSTITIAL_MILESTONE_COOLDOWN_MS = balance.ads.interstitialMilestoneCooldownMs;
// Minimum gap between two return (welcome-back) interstitials. Keeps the
// session-return ad non-intrusive for players who reopen the app often.
export const RETURN_INTERSTITIAL_COOLDOWN_MS = balance.ads.returnInterstitialCooldownMs;

// Harvest combo pacing (canonical balance data). The window is how long after a
// manual harvest the next one still extends the streak; the thresholds gate the
// great/legendary tier escalation. Sourced from balance.json so designers tune
// combo pacing without touching the UI.
export const COMBO_WINDOW_MS = balance.combo.windowMs;
export const COMBO_GREAT_THRESHOLD = balance.combo.greatThreshold;
export const COMBO_LEGENDARY_THRESHOLD = balance.combo.legendaryThreshold;
// Invariant guard: the great tier must be reached before the legendary tier, or
// the tier escalation is incoherent. Fail fast on a misconfigured balance file.
if (!(COMBO_GREAT_THRESHOLD < COMBO_LEGENDARY_THRESHOLD)) {
  throw new Error(
    `Invalid combo thresholds: greatThreshold (${COMBO_GREAT_THRESHOLD}) must be < legendaryThreshold (${COMBO_LEGENDARY_THRESHOLD})`
  );
}

// Raw grow-time milliseconds removed by one growth-skip ad, given the plot's
// current remaining grow time (the raw scale getPlotRemainingGrowthMs returns).
// max(flat floor, percent of remaining), never more than the remainder itself —
// so a near-ready crop is fully skipped while a long crop gets a partial cut.
export function getGrowthAdSkipMs(remainingMs: number): number {
  if (remainingMs <= 0) {
    return 0;
  }
  const tier = Math.max(GROWTH_AD_SKIP_MS, Math.floor(remainingMs * GROWTH_AD_SKIP_PERCENT));
  return Math.min(remainingMs, tier);
}

// Preserves balance.areas definition order so "next area" means the next step
// in the designed progression, not the cheapest remaining unlock.
const NON_GATED_AREAS = FARM_AREAS.filter((area) => area.unlock.gate == null && area.unlock.cost > 0);

/**
 * Returns the rewarded-gold ad payout scaled to the player's current
 * progression. Uses 5 % of the next area unlock cost as the base amount,
 * falling back to 5 % of the prestige graduation cost once all non-gated
 * areas are unlocked. The result is always at least REWARDED_GOLD_AMOUNT.
 */
export function getRewardedGoldAmount(gameState: GameState): number {
  const nextArea = NON_GATED_AREAS.find((area) => !isAreaUnlocked(gameState, area.key));
  const prestigeLevel = Number.isFinite(gameState.prestige.level)
    ? Math.max(0, Math.floor(gameState.prestige.level))
    : 0;
  const nextGoalCost =
    nextArea != null
      ? nextArea.unlock.cost
      : Math.floor(
          balance.regions.graduation.costBase *
            Math.pow(balance.regions.graduation.costGrowth, prestigeLevel)
        );
  const ratio =
    Number.isFinite(balance.ads.rewardedGoldScaling.nextGoalRatio) &&
    balance.ads.rewardedGoldScaling.nextGoalRatio > 0
      ? balance.ads.rewardedGoldScaling.nextGoalRatio
      : 0.05;
  const scaled = Math.floor(nextGoalCost * ratio);
  return Number.isFinite(scaled) ? Math.max(REWARDED_GOLD_AMOUNT, scaled) : REWARDED_GOLD_AMOUNT;
}

export const INITIAL_AREA_KEYS = FARM_AREAS.filter(
  (area) => area.unlock.cost === 0 && area.unlock.gate == null
).map((area) => area.key);
const MS_PER_HOUR = 60 * 60 * 1000;

export const COLLECTION_AREA_REWARDS = balance.collection.areaCompletionReward as Record<AreaKey, number>;
export const COLLECTION_FULL_REWARD = balance.collection.fullCompletionReward as number;

// Pre-prestige offline income tuning (see balance.json offlineIncome).
export const OFFLINE_INCOME_EFFICIENCY_RATIO = balance.offlineIncome.efficiencyRatio;
export const OFFLINE_INCOME_CAP_MS = balance.offlineIncome.capMs;

const CROP_KEYS_BY_AREA: Record<AreaKey, CropKey[]> = FARM_AREAS.reduce(
  (acc, area) => {
    acc[area.key] = (Object.keys(CROPS) as CropKey[]).filter((cropKey) => getKnownCrop(cropKey).area === area.key);
    return acc;
  },
  {} as Record<AreaKey, CropKey[]>
);

export function getAreaCropKeys(areaKey: AreaKey): CropKey[] {
  return CROP_KEYS_BY_AREA[areaKey] ?? [];
}

export function isCropDiscovered(gameState: GameState, cropKey: CropKey): boolean {
  return gameState.harvestedCropKeys.includes(cropKey);
}

export type AreaCollectionStatus = {
  areaKey: AreaKey;
  cropKeys: CropKey[];
  totalCount: number;
  discoveredCount: number;
  completed: boolean;
  reward: number;
  rewardClaimed: boolean;
  rewardClaimable: boolean;
};

export type CollectionSummary = {
  areas: AreaCollectionStatus[];
  totalCount: number;
  discoveredCount: number;
  allDiscovered: boolean;
  fullReward: number;
  fullRewardClaimed: boolean;
  fullRewardClaimable: boolean;
  claimableCount: number;
};

export function getCollectionSummary(gameState: GameState): CollectionSummary {
  const claimed = gameState.claimedCollectionRewards;
  let discoveredCount = 0;
  let totalCount = 0;
  let claimableCount = 0;

  const areas: AreaCollectionStatus[] = FARM_AREAS.map((area) => {
    const cropKeys = getAreaCropKeys(area.key);
    const areaDiscoveredCount = cropKeys.filter((cropKey) => isCropDiscovered(gameState, cropKey)).length;
    const completed = cropKeys.length > 0 && areaDiscoveredCount === cropKeys.length;
    const reward = COLLECTION_AREA_REWARDS[area.key] ?? 0;
    const rewardClaimed = claimed.includes(area.key);
    const rewardClaimable = completed && !rewardClaimed && reward > 0;

    if (rewardClaimable) claimableCount += 1;
    discoveredCount += areaDiscoveredCount;
    totalCount += cropKeys.length;

    return {
      areaKey: area.key,
      cropKeys,
      totalCount: cropKeys.length,
      discoveredCount: areaDiscoveredCount,
      completed,
      reward,
      rewardClaimed,
      rewardClaimable,
    };
  });

  const allDiscovered = totalCount > 0 && discoveredCount === totalCount;
  const fullRewardClaimed = claimed.includes(COLLECTION_FULL_REWARD_KEY);
  const fullRewardClaimable = allDiscovered && !fullRewardClaimed && COLLECTION_FULL_REWARD > 0;
  if (fullRewardClaimable) claimableCount += 1;

  return {
    areas,
    totalCount,
    discoveredCount,
    allDiscovered,
    fullReward: COLLECTION_FULL_REWARD,
    fullRewardClaimed,
    fullRewardClaimable,
    claimableCount,
  };
}

export function getClaimableCollectionRewardCount(gameState: GameState): number {
  return getCollectionSummary(gameState).claimableCount;
}

export function claimCollectionReward(
  gameState: GameState,
  rewardKey: CollectionRewardKey
): { state: GameState; awardedGold: number } | null {
  const summary = getCollectionSummary(gameState);

  if (rewardKey === COLLECTION_FULL_REWARD_KEY) {
    if (!summary.fullRewardClaimable) return null;
    return {
      state: {
        ...gameState,
        gold: gameState.gold + summary.fullReward,
        claimedCollectionRewards: [...gameState.claimedCollectionRewards, rewardKey],
      },
      awardedGold: summary.fullReward,
    };
  }

  const area = summary.areas.find((candidate) => candidate.areaKey === rewardKey);
  if (area == null || !area.rewardClaimable) return null;

  return {
    state: {
      ...gameState,
      gold: gameState.gold + area.reward,
      claimedCollectionRewards: [...gameState.claimedCollectionRewards, rewardKey],
    },
    awardedGold: area.reward,
  };
}

export type CropEconomyEstimate = {
  cropKey: CropKey;
  harvestValue: number;
  netProfit: number;
  roiPercent: number;
  netProfitPerHour: number;
};

export type FarmProductivityEstimate = {
  bestCropKey: CropKey | null;
  plotCount: number;
  netProfitPerHour: number;
};

function getKnownCrop(cropKey: CropKey) {
  const crop = CROPS[cropKey];
  if (crop == null) {
    throw new Error(`Unknown crop: ${cropKey}`);
  }
  return crop;
}

export function formatMoney(amount: number, locale: SupportedLocale = DEFAULT_LOCALE) {
  return formatMoneyForLocale(amount, locale);
}

export function getPlotCost(unlockedPlotCount: number) {
  return Math.floor(
    balance.economy.plotCostBase * Math.pow(balance.economy.plotCostGrowth, unlockedPlotCount - INITIAL_PLOTS)
  );
}

// Gold price of the next plot after the plot-discount ad reward. Still a real
// (reduced) gold cost, so the plot sink is preserved rather than bypassed.
export function getDiscountedPlotCost(unlockedPlotCount: number) {
  return Math.floor(getPlotCost(unlockedPlotCount) * (1 - PLOT_DISCOUNT_AD_PERCENT));
}

export function getUpgradeCost(type: 'speed' | 'profit', level: number) {
  const base = type === 'speed' ? balance.economy.speedUpgradeBaseCost : balance.economy.profitUpgradeBaseCost;
  return Math.floor(base * Math.pow(balance.economy.upgradeCostGrowth, level - 1));
}

export function getSpeedMultiplier(speedLevel: number) {
  return 1 + (speedLevel - 1) * balance.economy.upgradeStep;
}

export function getProfitMultiplier(profitLevel: number) {
  return 1 + (profitLevel - 1) * balance.economy.upgradeStep;
}

export function getCropEconomyEstimate(
  cropKey: CropKey,
  {
    speedMultiplier,
    profitMultiplier,
    harvestMultiplier = 1,
    costMultiplier = 1,
  }: {
    speedMultiplier: number;
    profitMultiplier: number;
    harvestMultiplier?: number;
    costMultiplier?: number;
  }
): CropEconomyEstimate {
  const crop = getKnownCrop(cropKey);
  const safeSpeedMultiplier = Number.isFinite(speedMultiplier) && speedMultiplier > 0 ? speedMultiplier : 1;
  const safeProfitMultiplier = Number.isFinite(profitMultiplier) && profitMultiplier > 0 ? profitMultiplier : 1;
  const safeHarvestMultiplier = Number.isFinite(harvestMultiplier) && harvestMultiplier > 0 ? harvestMultiplier : 1;
  const safeCostMultiplier = Number.isFinite(costMultiplier) && costMultiplier > 0 ? costMultiplier : 1;
  const effectiveCost = Math.floor(crop.cost * safeCostMultiplier);
  const harvestValue = Math.floor(crop.sell * safeProfitMultiplier * safeHarvestMultiplier);
  const netProfit = harvestValue - effectiveCost;
  const effectiveGrowTime = Math.max(1, crop.growTime / safeSpeedMultiplier);

  return {
    cropKey,
    harvestValue,
    netProfit,
    roiPercent: (netProfit / Math.max(1, effectiveCost)) * 100,
    netProfitPerHour: (netProfit / effectiveGrowTime) * MS_PER_HOUR,
  };
}

export function getFarmProductivityEstimate(
  gameState: GameState,
  {
    speedMultiplier,
    profitMultiplier,
    harvestMultiplier = 1,
  }: {
    speedMultiplier: number;
    profitMultiplier: number;
    harvestMultiplier?: number;
  }
): FarmProductivityEstimate {
  const unlockedCropKeys = (Object.keys(CROPS) as CropKey[]).filter(
    (cropKey) => isAreaUnlocked(gameState, getKnownCrop(cropKey).area) && isCropPlantable(gameState, cropKey)
  );
  const bestCrop = unlockedCropKeys
    .map((cropKey) =>
      getCropEconomyEstimate(cropKey, {
        speedMultiplier,
        profitMultiplier,
        harvestMultiplier,
      })
    )
    .sort((a, b) => b.netProfitPerHour - a.netProfitPerHour)[0];

  return {
    bestCropKey: bestCrop?.cropKey ?? null,
    plotCount: gameState.unlockedPlotCount,
    netProfitPerHour: (bestCrop?.netProfitPerHour ?? 0) * gameState.unlockedPlotCount,
  };
}

export function isAreaUnlocked(gameState: GameState, areaKey: AreaKey) {
  return gameState.unlockedAreas.includes(areaKey);
}

export function getMinUpgradeLevel(gameState: GameState) {
  return Math.min(gameState.upgrades.speed, gameState.upgrades.profit);
}

export function canUnlockArea(gameState: GameState, areaKey: AreaKey) {
  const area = FARM_AREAS.find((candidate) => candidate.key === areaKey);
  if (area == null || isAreaUnlocked(gameState, areaKey)) return false;
  if (area.unlock.gate != null && !gameState.research.unlockedNodes.includes(area.unlock.gate)) return false;
  return (
    gameState.gold >= area.unlock.cost &&
    gameState.harvestedCropKeys.length >= area.unlock.requiredHarvestedCropCount &&
    getMinUpgradeLevel(gameState) >= area.unlock.requiredUpgradeLevel
  );
}

export function getAreaUnlockRequirementText(
  gameState: GameState,
  areaKey: AreaKey,
  locale: SupportedLocale = DEFAULT_LOCALE
) {
  const area = FARM_AREAS.find((candidate) => candidate.key === areaKey);
  if (area == null) return '';

  const messages = getCoreMessages(locale);
  const parts = [
    `${formatMoney(area.unlock.cost, locale)}G`,
    messages.harvestedCropRequirement(gameState.harvestedCropKeys.length, area.unlock.requiredHarvestedCropCount),
    messages.researchLevelRequired(area.unlock.requiredUpgradeLevel),
  ];
  if (area.unlock.gate != null) {
    parts.push(messages.researchNodeRequired(getResearchNodeLabel(area.unlock.gate, locale).name));
  }
  return parts.join(' · ');
}

// 광고 일일 한도의 날짜 키. 다른 일일 리셋과 같은 리셋 경계(공통 getResetDayIndex,
// 기본 KST 04:00)를 쓰도록 통일한다(#251). 예전 UTC 날짜 문자열("YYYY-MM-DD")에서 리셋
// 일 인덱스 문자열로 형식이 바뀌므로, 구버전 세이브는 업그레이드 시 광고 일일 카운트가
// 한 번 리셋된다(무해 — 한도만 하루치 초기화).
export function getAdDailyKey(now = Date.now()) {
  return String(getResetDayIndex(now));
}

export function createInitialAdUsage(now = Date.now()): GameState['adUsage'] {
  return {
    dailyKey: getAdDailyKey(now),
    rewardedGoldTimestamps: [],
    rewardedGoldDailyCount: 0,
    growthAd: { lastUsedAt: null, dailyCount: 0 },
    plotDiscountAd: { lastUsedAt: null, dailyCount: 0 },
    offlineBonusAd: { lastUsedAt: null, dailyCount: 0 },
    harvestBonusAd: { lastUsedAt: null, lastPromptedAt: null, boostEndsAt: null, dailyCount: 0 },
    returnInterstitialAt: null,
  };
}

function isFinitePastTimestamp(value: unknown, now: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value <= now;
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeDailyCount(value: unknown, isSameDay: boolean) {
  if (!isSameDay || typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

export function normalizeAdUsage(
  adUsage: Partial<GameState['adUsage']> | undefined,
  now = Date.now()
): GameState['adUsage'] {
  const dailyKey = getAdDailyKey(now);
  const isSameDay = adUsage?.dailyKey === dailyKey;

  return {
    dailyKey,
    rewardedGoldTimestamps: Array.isArray(adUsage?.rewardedGoldTimestamps)
      ? adUsage.rewardedGoldTimestamps.filter(
          (timestamp) => isFinitePastTimestamp(timestamp, now) && now - timestamp < REWARDED_GOLD_WINDOW_MS
        )
      : [],
    rewardedGoldDailyCount: normalizeDailyCount(adUsage?.rewardedGoldDailyCount, isSameDay),
    growthAd: {
      lastUsedAt: isFinitePastTimestamp(adUsage?.growthAd?.lastUsedAt, now) ? adUsage.growthAd.lastUsedAt : null,
      dailyCount: normalizeDailyCount(adUsage?.growthAd?.dailyCount, isSameDay),
    },
    plotDiscountAd: {
      lastUsedAt: isFinitePastTimestamp(adUsage?.plotDiscountAd?.lastUsedAt, now)
        ? adUsage.plotDiscountAd.lastUsedAt
        : null,
      dailyCount: normalizeDailyCount(adUsage?.plotDiscountAd?.dailyCount, isSameDay),
    },
    offlineBonusAd: {
      lastUsedAt: isFinitePastTimestamp(adUsage?.offlineBonusAd?.lastUsedAt, now)
        ? adUsage.offlineBonusAd.lastUsedAt
        : null,
      dailyCount: normalizeDailyCount(adUsage?.offlineBonusAd?.dailyCount, isSameDay),
    },
    harvestBonusAd: {
      lastUsedAt: isFinitePastTimestamp(adUsage?.harvestBonusAd?.lastUsedAt, now)
        ? adUsage.harvestBonusAd.lastUsedAt
        : null,
      lastPromptedAt: isFinitePastTimestamp(adUsage?.harvestBonusAd?.lastPromptedAt, now)
        ? adUsage.harvestBonusAd.lastPromptedAt
        : null,
      boostEndsAt: isFiniteTimestamp(adUsage?.harvestBonusAd?.boostEndsAt) ? adUsage.harvestBonusAd.boostEndsAt : null,
      dailyCount: normalizeDailyCount(adUsage?.harvestBonusAd?.dailyCount, isSameDay),
    },
    returnInterstitialAt: isFinitePastTimestamp(adUsage?.returnInterstitialAt, now)
      ? adUsage.returnInterstitialAt
      : null,
  };
}

// Whether the return (welcome-back) interstitial may fire now: never fired, or
// the cooldown has elapsed since the last one. Persisted in the save so the gap
// holds across app restarts (the typical "session return" path).
export function canShowReturnInterstitial(gameState: GameState, now = Date.now()): boolean {
  const adUsage = normalizeAdUsage(gameState.adUsage, now);
  return (
    adUsage.returnInterstitialAt == null ||
    now - adUsage.returnInterstitialAt >= getAdLimits().returnInterstitialCooldownMs
  );
}

export function recordReturnInterstitial(gameState: GameState, now = Date.now()): GameState['adUsage'] {
  return {
    ...normalizeAdUsage(gameState.adUsage, now),
    returnInterstitialAt: now,
  };
}

export function getRewardedAdLimitStatus(
  gameState: GameState,
  type: RewardedAdType,
  now = Date.now(),
  locale: SupportedLocale = DEFAULT_LOCALE
) {
  const adUsage = normalizeAdUsage(gameState.adUsage, now);
  const messages = getCoreMessages(locale);
  const limits = getAdLimits();

  if (type === 'rewardedGold') {
    if (adUsage.rewardedGoldDailyCount >= limits.rewardedGoldDailyLimit) {
      return { allowed: false, reason: messages.adDailyLimitReached };
    }

    if (adUsage.rewardedGoldTimestamps.length >= limits.rewardedGoldMaxUsesPerWindow) {
      const oldestTimestamp = Math.min(...adUsage.rewardedGoldTimestamps);
      const remainingMs = REWARDED_GOLD_WINDOW_MS - (now - oldestTimestamp);
      return {
        allowed: false,
        reason: messages.rewardedGoldCooldown(formatDuration(remainingMs, locale)),
      };
    }
    return { allowed: true, reason: '' };
  }

  // 룰렛 광고의 cap/cooldown source of truth는 WheelState다. AdUsage에 같은
  // 카운터를 복제하면 세이브 마이그레이션·리셋 경계에서 둘이 드리프트할 수 있다.
  if (type === 'wheelBonusAd') {
    const wheelStatus = getWheelStatus(gameState.wheelState, now);
    if (wheelStatus.bonusSpinsUsedToday >= limits.wheelBonusAdDailyLimit) {
      return { allowed: false, reason: messages.adDailyLimitReached };
    }
    const lastUsedAt = gameState.wheelState.lastBonusSpinAt;
    const safeLastUsedAt = lastUsedAt == null ? null : Math.min(lastUsedAt, now);
    if (
      safeLastUsedAt != null &&
      now - safeLastUsedAt < limits.wheelBonusAdCooldownMs
    ) {
      return {
        allowed: false,
        reason: messages.adCooldown(
          formatDuration(limits.wheelBonusAdCooldownMs - (now - safeLastUsedAt), locale)
        ),
      };
    }
    return { allowed: true, reason: '' };
  }

  const limit =
    type === 'growthAd'
      ? limits.growthAdDailyLimit
      : type === 'plotDiscountAd'
        ? limits.plotDiscountAdDailyLimit
        : type === 'offlineBonusAd'
          ? limits.offlineBonusAdDailyLimit
          : limits.harvestBonusAdDailyLimit;
  const cooldownMs =
    type === 'growthAd'
      ? limits.growthAdCooldownMs
      : type === 'plotDiscountAd'
        ? limits.plotDiscountAdCooldownMs
        : type === 'offlineBonusAd'
          ? limits.offlineBonusAdCooldownMs
          : limits.harvestBonusAdCooldownMs;
  const usage =
    type === 'growthAd'
      ? adUsage.growthAd
      : type === 'plotDiscountAd'
        ? adUsage.plotDiscountAd
        : type === 'offlineBonusAd'
          ? adUsage.offlineBonusAd
          : adUsage.harvestBonusAd;

  if (usage.dailyCount >= limit) {
    return { allowed: false, reason: messages.adDailyLimitReached };
  }

  if (usage.lastUsedAt != null && now - usage.lastUsedAt < cooldownMs) {
    return {
      allowed: false,
      reason: messages.adCooldown(formatDuration(cooldownMs - (now - usage.lastUsedAt), locale)),
    };
  }

  return { allowed: true, reason: '' };
}

export function getHarvestBonusPromptStatus(
  gameState: GameState,
  now = Date.now(),
  locale: SupportedLocale = DEFAULT_LOCALE
) {
  const adUsage = normalizeAdUsage(gameState.adUsage, now);
  const messages = getCoreMessages(locale);
  const { lastPromptedAt } = adUsage.harvestBonusAd;
  const cooldownMs = getAdLimits().harvestBonusAdCooldownMs;

  if (lastPromptedAt != null && now - lastPromptedAt < cooldownMs) {
    return {
      allowed: false,
      reason: messages.harvestBonusPromptCooldown(formatDuration(cooldownMs - (now - lastPromptedAt), locale)),
    };
  }

  return { allowed: true, reason: '' };
}

export function getHarvestBonusBoostStatus(gameState: GameState, now = Date.now()) {
  const adUsage = normalizeAdUsage(gameState.adUsage, now);
  const { boostEndsAt } = adUsage.harvestBonusAd;
  const remainingMs = boostEndsAt == null ? 0 : Math.max(0, boostEndsAt - now);
  const active = remainingMs > 0;

  return {
    active,
    multiplier: active ? HARVEST_BONUS_MULTIPLIER : 1,
    remainingMs,
    endsAt: active ? boostEndsAt : null,
  };
}

// 광고 외 경로(룰렛 harvest_boost 슬롯 등)에서 수확 부스트를 부여/연장한다. 만료 판정은
// 기존 boostEndsAt 경로(getHarvestBonusBoostStatus)를 그대로 타므로 광고 부스트와 동일한
// 만료 로직으로 동작한다. 중첩 정책은 "연장": 이미 활성인 부스트가 있으면 남은 시간 뒤에
// 이어 붙는다(비활성이면 now 기준). 광고 사용 카운트/쿨다운/프롬프트에는 영향을 주지 않는다.
export function extendHarvestBonusBoost(
  gameState: GameState,
  durationMs: number,
  now = Date.now()
): GameState['adUsage'] {
  const adUsage = normalizeAdUsage(gameState.adUsage, now);
  const safeDuration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
  const currentEndsAt = adUsage.harvestBonusAd.boostEndsAt;
  const base = currentEndsAt != null && currentEndsAt > now ? currentEndsAt : now;
  return {
    ...adUsage,
    harvestBonusAd: {
      ...adUsage.harvestBonusAd,
      boostEndsAt: base + safeDuration,
    },
  };
}

// 룰렛 스핀 결과를 GameState에 적용한다(#209). 타입별 분기(골드 가산 / RP 가산 —
// 누적치 totalPointsEarned 포함 / 수확 부스트 연장)를 순수 함수로 모아, UI(FarmGame)는
// 스핀 가드만 담당하고 보상 적용 규칙은 core 테스트로 고정한다.
export function applyWheelReward(gameState: GameState, result: WheelSpinResult, now = Date.now()): GameState {
  const reward = result.reward;
  switch (reward.type) {
    case 'rp':
      return {
        ...gameState,
        research: {
          ...gameState.research,
          points: gameState.research.points + reward.rp,
          totalPointsEarned: gameState.research.totalPointsEarned + reward.rp,
        },
        wheelState: result.newState,
      };
    case 'harvest_boost':
      return {
        ...gameState,
        adUsage: extendHarvestBonusBoost(gameState, reward.durationMs, now),
        wheelState: result.newState,
      };
    case 'gold':
    default:
      return { ...gameState, gold: gameState.gold + reward.gold, wheelState: result.newState };
  }
}

export function recordHarvestBonusAdPrompt(gameState: GameState, now = Date.now()): GameState['adUsage'] {
  const adUsage = normalizeAdUsage(gameState.adUsage, now);

  return {
    ...adUsage,
    harvestBonusAd: {
      ...adUsage.harvestBonusAd,
      lastPromptedAt: now,
    },
  };
}

export function recordRewardedAdUsage(
  gameState: GameState,
  type: RewardedAdType,
  now = Date.now()
): GameState['adUsage'] {
  const adUsage = normalizeAdUsage(gameState.adUsage, now);

  if (type === 'rewardedGold') {
    return {
      ...adUsage,
      rewardedGoldTimestamps: [...adUsage.rewardedGoldTimestamps, now],
      rewardedGoldDailyCount: adUsage.rewardedGoldDailyCount + 1,
    };
  }

  if (type === 'growthAd') {
    return {
      ...adUsage,
      growthAd: {
        lastUsedAt: now,
        dailyCount: adUsage.growthAd.dailyCount + 1,
      },
    };
  }

  if (type === 'plotDiscountAd') {
    return {
      ...adUsage,
      plotDiscountAd: {
        lastUsedAt: now,
        dailyCount: adUsage.plotDiscountAd.dailyCount + 1,
      },
    };
  }

  if (type === 'offlineBonusAd') {
    return {
      ...adUsage,
      offlineBonusAd: {
        lastUsedAt: now,
        dailyCount: adUsage.offlineBonusAd.dailyCount + 1,
      },
    };
  }

  if (type === 'wheelBonusAd') {
    return adUsage;
  }

  return {
    ...adUsage,
    harvestBonusAd: {
      lastUsedAt: now,
      lastPromptedAt: now,
      boostEndsAt: now + HARVEST_BONUS_BOOST_DURATION_MS,
      dailyCount: adUsage.harvestBonusAd.dailyCount + 1,
    },
  };
}

// 모든 밭이 비어 있는(state 0) 초기 밭 배열. createInitialState의 자동 파종과
// 무관하게 "빈 밭" 기본값이 필요한 곳(프레스티지 리셋·마이그레이션 폴백)에서 재사용한다.
export function createEmptyPlots(): GameState['plots'] {
  return Array.from({ length: MAX_PLOTS }, (_, i) => ({
    id: i,
    cropType: null,
    startTime: null,
    state: 0 as PlotState,
  }));
}

export function createInitialState(): GameState {
  // #427: 신규 유저는 첫 밭에 carrot이 이미 자란(state 2) 상태로 시작한다. 씨앗 선택
  // 단계를 없애고 첫 인터랙션을 '수확'으로 옮겨 활성화를 높인다. startTime은 성장 완료
  // 상태(state 2)에서 성장 계산에 쓰이지 않으므로 결정적 0으로 둔다.
  const plots = createEmptyPlots();
  plots[0] = { id: 0, cropType: ONBOARDING_STARTER_CROP, startTime: 0, state: 2 };
  return {
    gold: DEFAULT_GOLD,
    unlockedPlotCount: INITIAL_PLOTS,
    unlockedAreas: INITIAL_AREA_KEYS,
    harvestedCropKeys: [],
    claimedCollectionRewards: [],
    adUsage: createInitialAdUsage(),
    upgrades: { speed: 1, profit: 1 },
    harvestCounts: {},
    mutationsDiscovered: {},
    lifetimeStats: createInitialLifetimeStats(),
    claimedAchievements: [],
    activeTitle: null,
    prestige: createInitialPrestigeProgress(),
    chainFarms: [],
    research: createInitialResearchState(),
    automationSettings: createInitialAutomationSettings(),
    plots,
    dailyBonusState: { lastClaimedAt: null, streak: 0 },
    dailyMissionState: createInitialDailyMissionState(),
    weeklyMissionState: createInitialWeeklyMissionState(),
    onboardingCompleted: false,
    // 첫 밭 carrot이 이미 자란 상태이므로 온보딩은 harvest 단계부터 시작한다(#427).
    onboardingStep: 'harvest',
    firstSeedSelected: false,
    onboardingReturnSettledAt: null,
    harvestNotificationPromptSeen: false,
    prestigeGuideSeen: false,
    placedDecorations: createInitialPlacedDecorations(),
    wheelState: createInitialWheelState(),
    animals: createInitialAnimalsState(),
    production: createInitialProductionState(),
    seenFeatureCoachmarks: [],
  };
}

function isKnownAreaKey(value: unknown): value is AreaKey {
  return typeof value === 'string' && FARM_AREAS.some((area) => area.key === value);
}

function isKnownCropKey(value: unknown): value is CropKey {
  return typeof value === 'string' && value in CROPS;
}

function uniqueKnownAreas(value: unknown, fallback: AreaKey[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return value.filter(isKnownAreaKey).filter((areaKey, index, items) => items.indexOf(areaKey) === index);
}

function uniqueKnownCrops(value: unknown, fallback: CropKey[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return value.filter(isKnownCropKey).filter((cropKey, index, items) => items.indexOf(cropKey) === index);
}

function isKnownCollectionRewardKey(value: unknown): value is CollectionRewardKey {
  return value === COLLECTION_FULL_REWARD_KEY || isKnownAreaKey(value);
}

function uniqueKnownCollectionRewards(value: unknown, fallback: CollectionRewardKey[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return value
    .filter(isKnownCollectionRewardKey)
    .filter((rewardKey, index, items) => items.indexOf(rewardKey) === index);
}

function normalizeGold(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizeUpgradeLevel(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

function normalizeUnlockedPlotCount(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(MAX_PLOTS, Math.max(INITIAL_PLOTS, Math.floor(value)));
}

function normalizePlot(
  plot: Partial<GameState['plots'][number]> | undefined,
  index: number
): GameState['plots'][number] {
  const cropType = isKnownCropKey(plot?.cropType) ? plot.cropType : null;
  const startTime = typeof plot?.startTime === 'number' && Number.isFinite(plot.startTime) ? plot.startTime : null;
  const canKeepCropState = cropType != null;
  const state: PlotState =
    canKeepCropState && plot?.state === 2 ? 2 : canKeepCropState && plot?.state === 1 && startTime != null ? 1 : 0;

  return {
    id: index,
    cropType: state === 0 ? null : cropType,
    startTime: state === 0 ? null : startTime,
    state,
  };
}

function isOnboardingStep(value: unknown): value is OnboardingStep {
  return typeof value === 'string' && (ONBOARDING_STEPS as readonly string[]).includes(value);
}

/**
 * Resolves a resumable onboarding step from persisted data and normalized game
 * progress. Completion remains the caller's responsibility because completed
 * onboarding always stores null rather than another active step.
 */
export function resolveOnboardingStep(state: GameState, candidate: unknown): OnboardingStep {
  if (isOnboardingStep(candidate)) {
    return candidate;
  }
  if (state.harvestedCropKeys.length > 0 || state.lifetimeStats.totalHarvests > 0) {
    return 'reward';
  }
  if (state.plots.some((plot) => plot.cropType != null)) {
    return 'harvest';
  }
  // #427: selectSeed 제거 후 "아직 아무것도 심지 않은" 미완료 세이브(레거시 진행 중
  // selectSeed 포함)는 plant 단계로 재개해 직접 파종을 안내한다.
  return 'plant';
}

export function migrateLoadedState(loaded: Partial<GameState>, base: GameState): GameState {
  const loadedUpgrades =
    typeof loaded.upgrades === 'object' && loaded.upgrades != null
      ? (loaded.upgrades as Partial<GameState['upgrades']>)
      : {};
  const merged: GameState = {
    ...base,
    ...loaded,
    gold: normalizeGold(loaded.gold, base.gold),
    unlockedPlotCount: normalizeUnlockedPlotCount(loaded.unlockedPlotCount, base.unlockedPlotCount),
    unlockedAreas: uniqueKnownAreas(loaded.unlockedAreas, base.unlockedAreas),
    harvestedCropKeys: uniqueKnownCrops(loaded.harvestedCropKeys, base.harvestedCropKeys),
    claimedCollectionRewards: uniqueKnownCollectionRewards(
      loaded.claimedCollectionRewards,
      base.claimedCollectionRewards
    ),
    adUsage: normalizeAdUsage(loaded.adUsage),
    upgrades: {
      speed: normalizeUpgradeLevel(loadedUpgrades.speed, base.upgrades.speed),
      profit: normalizeUpgradeLevel(loadedUpgrades.profit, base.upgrades.profit),
    },
  };

  // #427: base(createInitialState)는 이제 첫 밭에 자동 파종 carrot을 담는다. 기존
  // 세이브 마이그레이션이 그 스타터 작물을 상속받지 않도록, loaded.plots가 없을 때의
  // 폴백은 base가 아닌 빈 밭이다(자동 파종은 오직 신규 상태에서만 일어난다).
  const plots = Array.isArray(loaded.plots) ? loaded.plots : createEmptyPlots();
  merged.plots = Array.from({ length: MAX_PLOTS }, (_, index) => normalizePlot(plots[index], index));

  // Mastery counters and the discovery list must stay in sync both ways:
  // pre-mastery saves seed counts from discoveries, and counted crops are
  // always part of the collection.
  merged.harvestCounts = normalizeHarvestCounts(loaded.harvestCounts, merged.harvestedCropKeys);
  merged.harvestedCropKeys = getHarvestedCropKeysInSync(merged.harvestedCropKeys, merged.harvestCounts);
  merged.mutationsDiscovered = normalizeMutationsDiscovered(loaded.mutationsDiscovered);

  merged.lifetimeStats = normalizeLifetimeStats(loaded.lifetimeStats);
  // Lifetime totals can never trail what the save already proves happened.
  const provenHarvests = Object.values(merged.harvestCounts).reduce<number>(
    (sum, count) => sum + (typeof count === 'number' ? count : 0),
    0
  );
  merged.lifetimeStats.totalHarvests = Math.max(merged.lifetimeStats.totalHarvests, provenHarvests);
  // first_seed_selected is a lifetime event. Saves created before the explicit
  // flag inherit true whenever persisted progress proves a seed was already
  // selected; otherwise a genuinely untouched player keeps the initial false.
  // #427: 'harvest'는 이제 자동 파종 신규 유저의 기본 시작 단계이므로 더 이상 수동
  // 씨앗 선택의 증거가 아니다. 레거시에서 직접 파종을 진행하던 'plant'만 증거로 남긴다.
  const onboardingStepProvesSeedSelection = loaded.onboardingStep === 'plant';
  const progressProvesSeedSelection =
    merged.plots.some((plot) => plot.cropType != null) ||
    merged.harvestedCropKeys.length > 0 ||
    merged.lifetimeStats.totalHarvests > 0 ||
    provenHarvests > 0 ||
    onboardingStepProvesSeedSelection;
  merged.firstSeedSelected = loaded.firstSeedSelected === true || progressProvesSeedSelection;
  merged.claimedAchievements = normalizeClaimedAchievements(loaded.claimedAchievements);
  merged.activeTitle = normalizeActiveTitle(loaded.activeTitle, merged.claimedAchievements);
  merged.prestige = normalizePrestigeProgress(loaded.prestige);
  merged.lifetimeStats.prestigeCount = Math.max(merged.lifetimeStats.prestigeCount, merged.prestige.level);

  // A save without the flag predates the guide. Treat an already-graduated
  // player as having seen it (they know the chain-income concept), but let a
  // legacy player who has never graduated still get the guide on their first
  // graduation. Brand-new players keep createInitialState's false value.
  merged.prestigeGuideSeen =
    typeof loaded.prestigeGuideSeen === 'boolean' ? loaded.prestigeGuideSeen : merged.prestige.level > 0;
  merged.chainFarms = normalizeChainFarms(loaded.chainFarms);

  merged.research = normalizeResearchState(loaded.research);
  merged.lifetimeStats.researchPointsEarned = Math.max(
    merged.lifetimeStats.researchPointsEarned,
    merged.research.totalPointsEarned
  );
  merged.lifetimeStats.breedsUnlocked = Math.max(
    merged.lifetimeStats.breedsUnlocked,
    merged.research.unlockedBreeds.length
  );
  merged.automationSettings = normalizeAutomationSettings(loaded.automationSettings);
  // A gated area must never stay unlocked without its research node.
  merged.unlockedAreas = merged.unlockedAreas.filter((areaKey) => {
    const area = FARM_AREAS.find((candidate) => candidate.key === areaKey);
    return area?.unlock.gate == null || merged.research.unlockedNodes.includes(area.unlock.gate);
  });

  merged.dailyBonusState = normalizeDailyBonusState(loaded.dailyBonusState);
  merged.dailyMissionState = normalizeDailyMissionState(loaded.dailyMissionState);
  // base.weeklyMissionState를 넘겨 다른 정규화 함수(uniqueKnownAreas/normalizeAdUsage 등)의
  // base 보존 규약과 통일한다. 정상 세이브는 loaded의 배열 참조를 그대로 보존하고, 없거나 손상된
  // 세이브만 base(= createInitialWeeklyMissionState)로 폴백한다.
  merged.weeklyMissionState = normalizeWeeklyMissionState(loaded.weeklyMissionState, base.weeklyMissionState);

  // A save without the flag belongs to a player who already started before
  // onboarding existed, so treat it as completed and never resurface the
  // coachmarks. Brand-new players have no save and keep createInitialState's
  // false value.
  merged.onboardingCompleted =
    typeof loaded.onboardingCompleted === 'boolean' ? loaded.onboardingCompleted : true;
  merged.onboardingStep = merged.onboardingCompleted ? null : resolveOnboardingStep(merged, loaded.onboardingStep);
  merged.onboardingReturnSettledAt =
    typeof loaded.onboardingReturnSettledAt === 'number' &&
    Number.isFinite(loaded.onboardingReturnSettledAt) &&
    loaded.onboardingReturnSettledAt > 0
      ? Math.floor(loaded.onboardingReturnSettledAt)
      : null;

  // A save without the flag belongs to a player who already started before this
  // prompt existed, so treat it as already seen to avoid surprising them with a
  // sudden ask. Only brand-new players (no save) keep createInitialState's false
  // value and get the prompt at the optimal moment right after their first harvest.
  merged.harvestNotificationPromptSeen =
    typeof loaded.harvestNotificationPromptSeen === 'boolean' ? loaded.harvestNotificationPromptSeen : true;

  if (merged.unlockedAreas.length === 0) merged.unlockedAreas = INITIAL_AREA_KEYS;

  // Cosmetic decorations: drop any keys missing from the current catalog and
  // de-duplicate so a legacy/corrupt save never renders an unknown decoration.
  merged.placedDecorations = normalizePlacedDecorations(loaded.placedDecorations);

  // Daily wheel: a malformed/legacy save (no wheelState) normalizes to "never
  // spun", so the first spin is immediately available.
  merged.wheelState = normalizeWheelState(loaded.wheelState);

  // Animals: drop coops/feeding entries missing from the current catalog and any
  // feeding for an un-owned animal, so a legacy/corrupt save loads into a clean,
  // render-stable state. A save without the field starts with no coops.
  merged.animals = normalizeAnimalsState(loaded.animals);

  // Workshop: drop inventory/craft entries missing from the current catalog and
  // any non-positive/non-finite values. A save without the field starts empty.
  merged.production = normalizeProductionState(loaded.production);

  // 딥 기능 발견성 코치마크(#367): 필드가 있는 세이브는 알려진 키만 정규화해 보존한다.
  // 필드가 아예 없는 레거시 세이브는 지금 이미 가용한 기능을 전부 "확인됨"으로 선반영해,
  // 오랫동안 써 온 기능들의 코치마크가 업데이트 직후 한꺼번에 뜨는 걸 막는다. 이 판정은
  // merged가 완전히 정규화된 뒤(연구·동물·생산·프레스티지·수확 목록 포함) 계산해야 한다.
  merged.seenFeatureCoachmarks =
    loaded.seenFeatureCoachmarks === undefined
      ? seedSeenFeatureCoachmarksForLoadedSave(merged)
      : normalizeSeenFeatureCoachmarks(loaded.seenFeatureCoachmarks);

  return merged;
}
