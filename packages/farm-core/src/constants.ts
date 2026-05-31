import type { AreaKey, CropKey, GameState, PlotState } from './types';
import balance from './balance.json';

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
export const INITIAL_AREA_KEYS = FARM_AREAS.filter((area) => area.unlock.cost === 0).map((area) => area.key);

export function formatMoney(amount: number) {
  if (!Number.isFinite(amount)) return '0';

  const units = [
    { value: 1e20, suffix: '해' },
    { value: 1e16, suffix: '경' },
    { value: 1e12, suffix: '조' },
    { value: 1e8, suffix: '억' },
    { value: 1e4, suffix: '만' },
  ];
  const absAmount = Math.abs(amount);

  for (const unit of units) {
    if (absAmount >= unit.value) {
      const scaled = amount / unit.value;
      const fractionDigits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
      return `${scaled.toFixed(fractionDigits).replace(/\.0+$|(\.\d*[1-9])0+$/, '$1')}${unit.suffix}`;
    }
  }

  return Math.floor(amount).toLocaleString();
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

export function isAreaUnlocked(gameState: GameState, areaKey: AreaKey) {
  return gameState.unlockedAreas.includes(areaKey);
}

export function getMinUpgradeLevel(gameState: GameState) {
  return Math.min(gameState.upgrades.speed, gameState.upgrades.profit);
}

export function canUnlockArea(gameState: GameState, areaKey: AreaKey) {
  const area = FARM_AREAS.find((candidate) => candidate.key === areaKey);
  if (area == null || isAreaUnlocked(gameState, areaKey)) return false;
  return (
    gameState.gold >= area.unlock.cost &&
    gameState.harvestedCropKeys.length >= area.unlock.requiredHarvestedCropCount &&
    getMinUpgradeLevel(gameState) >= area.unlock.requiredUpgradeLevel
  );
}

export function getAreaUnlockRequirementText(gameState: GameState, areaKey: AreaKey) {
  const area = FARM_AREAS.find((candidate) => candidate.key === areaKey);
  if (area == null) return '';

  const parts = [
    `${formatMoney(area.unlock.cost)}G`,
    `수확 작물 ${gameState.harvestedCropKeys.length}/${area.unlock.requiredHarvestedCropCount}종`,
    `연구 Lv.${getMinUpgradeLevel(gameState)}/${area.unlock.requiredUpgradeLevel}`,
  ];
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
      boostEndsAt: isFiniteTimestamp(adUsage?.harvestBonusAd?.boostEndsAt)
        ? adUsage.harvestBonusAd.boostEndsAt
        : null,
      dailyCount: normalizeDailyCount(adUsage?.harvestBonusAd?.dailyCount, isSameDay),
    },
  };
}

function formatDuration(ms: number) {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}시간` : `${hours}시간 ${remainingMinutes}분`;
}

export function getRewardedAdLimitStatus(gameState: GameState, type: RewardedAdType, now = Date.now()) {
  const adUsage = normalizeAdUsage(gameState.adUsage, now);

  if (type === 'rewardedGold') {
    if (adUsage.rewardedGoldDailyCount >= REWARDED_GOLD_DAILY_LIMIT) {
      return { allowed: false, reason: '오늘 이용 가능한 횟수를 모두 사용했어요.' };
    }

    if (adUsage.rewardedGoldTimestamps.length >= REWARDED_GOLD_MAX_USES_PER_WINDOW) {
      const oldestTimestamp = Math.min(...adUsage.rewardedGoldTimestamps);
      const remainingMs = REWARDED_GOLD_WINDOW_MS - (now - oldestTimestamp);
      return {
        allowed: false,
        reason: `${formatDuration(remainingMs)} 후 다시 받을 수 있어요.`,
      };
    }
    return { allowed: true, reason: '' };
  }

  const limit = type === 'growthAd' ? GROWTH_AD_DAILY_LIMIT : HARVEST_BONUS_AD_DAILY_LIMIT;
  const cooldownMs = type === 'growthAd' ? GROWTH_AD_COOLDOWN_MS : HARVEST_BONUS_AD_COOLDOWN_MS;
  const usage = type === 'growthAd' ? adUsage.growthAd : adUsage.harvestBonusAd;

  if (usage.dailyCount >= limit) {
    return { allowed: false, reason: '오늘 이용 가능한 횟수를 모두 사용했어요.' };
  }

  if (usage.lastUsedAt != null && now - usage.lastUsedAt < cooldownMs) {
    return {
      allowed: false,
      reason: `${formatDuration(cooldownMs - (now - usage.lastUsedAt))} 후 다시 사용할 수 있어요.`,
    };
  }

  return { allowed: true, reason: '' };
}

export function getHarvestBonusPromptStatus(gameState: GameState, now = Date.now()) {
  const adUsage = normalizeAdUsage(gameState.adUsage, now);
  const { lastPromptedAt } = adUsage.harvestBonusAd;

  if (lastPromptedAt != null && now - lastPromptedAt < HARVEST_BONUS_AD_COOLDOWN_MS) {
    return {
      allowed: false,
      reason: `${formatDuration(HARVEST_BONUS_AD_COOLDOWN_MS - (now - lastPromptedAt))} 후 다시 제안돼요.`,
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

export function recordHarvestBonusAdPrompt(
  gameState: GameState,
  now = Date.now()
): GameState['adUsage'] {
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
    adUsage: createInitialAdUsage(),
    upgrades: { speed: 1, profit: 1 },
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

function normalizePlot(plot: Partial<GameState['plots'][number]> | undefined, index: number): GameState['plots'][number] {
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
    adUsage: normalizeAdUsage(loaded.adUsage),
    upgrades: {
      speed: normalizeUpgradeLevel(loadedUpgrades.speed, base.upgrades.speed),
      profit: normalizeUpgradeLevel(loadedUpgrades.profit, base.upgrades.profit),
    },
  };

  const plots = Array.isArray(loaded.plots) ? loaded.plots : base.plots;
  merged.plots = Array.from({ length: MAX_PLOTS }, (_, index) => normalizePlot(plots[index], index));

  if (merged.unlockedAreas.length === 0) merged.unlockedAreas = INITIAL_AREA_KEYS;
  return merged;
}
