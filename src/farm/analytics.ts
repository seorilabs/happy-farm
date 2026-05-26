import type { AreaKey, CropKey, GameState } from './types';
import type { RewardedAdType } from './constants';

type AnalyticsValue = string | number | boolean;

export type GameAnalyticsContext = {
  gold: number;
  plot_count: number;
  speed_level: number;
  profit_level: number;
  unlocked_area_count: number;
  harvested_crop_count: number;
  session_elapsed_sec: number;
};

export function getGameAnalyticsContext(
  gameState: GameState,
  sessionStartedAt: number,
  now = Date.now()
): GameAnalyticsContext {
  return {
    gold: Math.floor(gameState.gold),
    plot_count: gameState.unlockedPlotCount,
    speed_level: gameState.upgrades.speed,
    profit_level: gameState.upgrades.profit,
    unlocked_area_count: gameState.unlockedAreas.length,
    harvested_crop_count: gameState.harvestedCropKeys.length,
    session_elapsed_sec: Math.max(0, Math.floor((now - sessionStartedAt) / 1000)),
  };
}

function trackGameEvent(_name: string, _params: Record<string, AnalyticsValue> = {}) {
  void _name;
  void _params;
  // The RN Analytics API is component-based. Keep event call sites intact for later wiring.
}

export function trackFarmScreen(context: GameAnalyticsContext) {
  trackGameEvent('farm_main_screen', context);
}

export function trackGameStart(context: GameAnalyticsContext) {
  trackGameEvent('game_start', context);
}

export function trackSeedSelected(
  cropKey: CropKey,
  areaKey: AreaKey,
  isFirstSeedSelection: boolean,
  context: GameAnalyticsContext
) {
  trackGameEvent(isFirstSeedSelection ? 'first_seed_selected' : 'seed_selected', {
    crop: cropKey,
    area: areaKey,
    ...context,
  });
}

export function trackCropPlanted(
  cropKey: CropKey,
  areaKey: AreaKey,
  cropTier: number,
  cropCost: number,
  context: GameAnalyticsContext
) {
  trackGameEvent('crop_planted', {
    crop: cropKey,
    area: areaKey,
    crop_tier: cropTier,
    crop_cost: cropCost,
    ...context,
  });
}

export function trackCropReady(cropKey: CropKey, areaKey: AreaKey, cropTier: number, context: GameAnalyticsContext) {
  trackGameEvent('crop_ready', {
    crop: cropKey,
    area: areaKey,
    crop_tier: cropTier,
    ...context,
  });
}

export function trackCropHarvested(params: {
  cropKey: CropKey;
  areaKey: AreaKey;
  cropTier: number;
  revenue: number;
  isFirstMeaningfulHarvest: boolean;
  isFirstCropHarvest: boolean;
  context: GameAnalyticsContext;
}) {
  trackGameEvent('crop_harvested', {
    crop: params.cropKey,
    area: params.areaKey,
    crop_tier: params.cropTier,
    revenue: params.revenue,
    is_first_meaningful_harvest: params.isFirstMeaningfulHarvest,
    is_first_crop_harvest: params.isFirstCropHarvest,
    ...params.context,
  });

  if (params.isFirstMeaningfulHarvest) {
    trackGameEvent('first_meaningful_harvest', {
      crop: params.cropKey,
      area: params.areaKey,
      crop_tier: params.cropTier,
      revenue: params.revenue,
      ...params.context,
    });
  }
}

export function trackPlotUnlocked(params: {
  method: 'gold' | 'ad';
  cost: number;
  nextPlotCount: number;
  context: GameAnalyticsContext;
}) {
  trackGameEvent('plot_unlocked', {
    method: params.method,
    cost: params.cost,
    next_plot_count: params.nextPlotCount,
    ...params.context,
  });
}

export function trackUpgradePurchased(params: {
  kind: 'speed' | 'profit';
  cost: number;
  nextLevel: number;
  context: GameAnalyticsContext;
}) {
  trackGameEvent('upgrade_purchased', {
    upgrade_kind: params.kind,
    cost: params.cost,
    next_level: params.nextLevel,
    ...params.context,
  });
}

export function trackAreaUnlockClicked(areaKey: AreaKey, context: GameAnalyticsContext) {
  trackGameEvent('area_unlock_clicked', {
    area: areaKey,
    ...context,
  });
}

export function trackAreaUnlocked(params: { areaKey: AreaKey; cost: number; context: GameAnalyticsContext }) {
  trackGameEvent('area_unlocked', {
    area: params.areaKey,
    cost: params.cost,
    ...params.context,
  });
}

export function trackAdRewardClick(type: RewardedAdType, context: GameAnalyticsContext) {
  trackGameEvent('ad_reward_click', {
    ad_type: type,
    ...context,
  });
}

export function trackAdRewardImpression(type: RewardedAdType, placement: string, context: GameAnalyticsContext) {
  trackGameEvent('ad_reward_impression', {
    ad_type: type,
    placement,
    ...context,
  });
}

export function trackAdRewardCompleted(params: {
  type: RewardedAdType;
  rewardValue: number;
  context: GameAnalyticsContext;
}) {
  trackGameEvent('ad_reward_completed', {
    ad_type: params.type,
    reward_value: params.rewardValue,
    ...params.context,
  });
}

export function trackAdRewardFailed(type: RewardedAdType, reason: string, context: GameAnalyticsContext) {
  trackGameEvent('ad_reward_failed', {
    ad_type: type,
    reason,
    ...context,
  });
}

export function trackAdLimitBlocked(type: RewardedAdType, reason: string, context: GameAnalyticsContext) {
  trackGameEvent('ad_limit_blocked', {
    ad_type: type,
    blocked_reason: reason,
    ...context,
  });
}
