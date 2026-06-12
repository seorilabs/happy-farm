import type { AreaKey, CollectionRewardKey, CropKey, GameState, PlotState, ResearchNodeKey } from './types';
import { COLLECTION_FULL_REWARD_KEY } from './types';
import { getHarvestedCropKeysInSync, normalizeHarvestCounts, normalizeMutationsDiscovered } from './mastery';
import {
  createInitialLifetimeStats,
  normalizeActiveTitle,
  normalizeClaimedAchievements,
  normalizeLifetimeStats,
} from './achievements';
import { createInitialPrestigeProgress, normalizeChainFarms, normalizePrestigeProgress } from './prestige';
import {
  createInitialAutomationSettings,
  createInitialResearchState,
  isCropPlantable,
  normalizeAutomationSettings,
  normalizeResearchState,
} from './research';
import balance from './balance.json';
import {
  DEFAULT_LOCALE,
  formatDuration,
  formatMoney as formatMoneyForLocale,
  getCoreMessages,
  getResearchNodeLabel,
  type SupportedLocale,
} from './i18n';

export type RewardedAdType = 'rewardedGold' | 'growthAd' | 'harvestBonusAd';

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
export const REWARDED_GOLD_AMOUNT = balance.ads.rewardedGoldAmount;
export const REWARDED_GOLD_WINDOW_MS = balance.ads.rewardedGoldWindowMs;
export const REWARDED_GOLD_MAX_USES_PER_WINDOW = balance.ads.rewardedGoldMaxUsesPerWindow;
export const REWARDED_GOLD_DAILY_LIMIT = balance.ads.rewardedGoldDailyLimit;
export const HARVEST_BONUS_MULTIPLIER = balance.ads.harvestBonusMultiplier;
export const HARVEST_BONUS_AD_COOLDOWN_MS = balance.ads.harvestBonusAdCooldownMs;
export const HARVEST_BONUS_BOOST_DURATION_MS = balance.ads.harvestBonusBoostDurationMs;
export const HARVEST_BONUS_AD_DAILY_LIMIT = balance.ads.harvestBonusAdDailyLimit;
export const GROWTH_AD_MIN_REMAINING_MS = balance.ads.growthAdMinRemainingMs;
export const GROWTH_AD_MAX_SKIP_MS = balance.ads.growthAdMaxSkipMs;
export const GROWTH_AD_COOLDOWN_MS = balance.ads.growthAdCooldownMs;
export const GROWTH_AD_DAILY_LIMIT = balance.ads.growthAdDailyLimit;
export const INTERSTITIAL_MILESTONE_COOLDOWN_MS = balance.ads.interstitialMilestoneCooldownMs;
export const INITIAL_AREA_KEYS = FARM_AREAS.filter(
  (area) => area.unlock.cost === 0 && area.unlock.gate == null
).map((area) => area.key);
const MS_PER_HOUR = 60 * 60 * 1000;

export const COLLECTION_AREA_REWARDS = balance.collection.areaCompletionReward as Record<AreaKey, number>;
export const COLLECTION_FULL_REWARD = balance.collection.fullCompletionReward as number;

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

export function getAdDailyKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function createInitialAdUsage(now = Date.now()): GameState['adUsage'] {
  return {
    dailyKey: getAdDailyKey(now),
    rewardedGoldTimestamps: [],
    rewardedGoldDailyCount: 0,
    growthAd: { lastUsedAt: null, dailyCount: 0 },
    harvestBonusAd: { lastUsedAt: null, lastPromptedAt: null, boostEndsAt: null, dailyCount: 0 },
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

  if (type === 'rewardedGold') {
    if (adUsage.rewardedGoldDailyCount >= REWARDED_GOLD_DAILY_LIMIT) {
      return { allowed: false, reason: messages.adDailyLimitReached };
    }

    if (adUsage.rewardedGoldTimestamps.length >= REWARDED_GOLD_MAX_USES_PER_WINDOW) {
      const oldestTimestamp = Math.min(...adUsage.rewardedGoldTimestamps);
      const remainingMs = REWARDED_GOLD_WINDOW_MS - (now - oldestTimestamp);
      return {
        allowed: false,
        reason: messages.rewardedGoldCooldown(formatDuration(remainingMs, locale)),
      };
    }
    return { allowed: true, reason: '' };
  }

  const limit = type === 'growthAd' ? GROWTH_AD_DAILY_LIMIT : HARVEST_BONUS_AD_DAILY_LIMIT;
  const cooldownMs = type === 'growthAd' ? GROWTH_AD_COOLDOWN_MS : HARVEST_BONUS_AD_COOLDOWN_MS;
  const usage = type === 'growthAd' ? adUsage.growthAd : adUsage.harvestBonusAd;

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

  if (lastPromptedAt != null && now - lastPromptedAt < HARVEST_BONUS_AD_COOLDOWN_MS) {
    return {
      allowed: false,
      reason: messages.harvestBonusPromptCooldown(
        formatDuration(HARVEST_BONUS_AD_COOLDOWN_MS - (now - lastPromptedAt), locale)
      ),
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

export function createInitialState(): GameState {
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
    plots: Array.from({ length: MAX_PLOTS }, (_, i) => ({
      id: i,
      cropType: null,
      startTime: null,
      state: 0 as PlotState,
    })),
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

  const plots = Array.isArray(loaded.plots) ? loaded.plots : base.plots;
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
  merged.claimedAchievements = normalizeClaimedAchievements(loaded.claimedAchievements);
  merged.activeTitle = normalizeActiveTitle(loaded.activeTitle, merged.claimedAchievements);
  merged.prestige = normalizePrestigeProgress(loaded.prestige);
  merged.lifetimeStats.prestigeCount = Math.max(merged.lifetimeStats.prestigeCount, merged.prestige.level);
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

  if (merged.unlockedAreas.length === 0) merged.unlockedAreas = INITIAL_AREA_KEYS;
  return merged;
}
