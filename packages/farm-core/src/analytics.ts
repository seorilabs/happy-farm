import type { AreaKey, CollectionRewardKey, CropKey, GameState } from './types';
import type { RewardedAdType } from './constants';

export type AnalyticsValue = string | number | boolean;

export type TrackGameEvent = (name: string, params?: Record<string, AnalyticsValue>) => void;

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

const noopTrackGameEvent: TrackGameEvent = (_name, _params = {}) => {
  void _name;
  void _params;
};

export function createFarmAnalytics(track: TrackGameEvent = noopTrackGameEvent) {
  return {
    trackFarmScreen: (context: GameAnalyticsContext) => {
      track('farm_main_screen', context);
    },

    trackGameStart: (context: GameAnalyticsContext) => {
      track('game_start', context);
    },

    trackSeedSelected: (
      cropKey: CropKey,
      areaKey: AreaKey,
      isFirstSeedSelection: boolean,
      context: GameAnalyticsContext
    ) => {
      track(isFirstSeedSelection ? 'first_seed_selected' : 'seed_selected', {
        crop: cropKey,
        area: areaKey,
        ...context,
      });
    },

    trackCropPlanted: (
      cropKey: CropKey,
      areaKey: AreaKey,
      cropTier: number,
      cropCost: number,
      context: GameAnalyticsContext
    ) => {
      track('crop_planted', {
        crop: cropKey,
        area: areaKey,
        crop_tier: cropTier,
        crop_cost: cropCost,
        ...context,
      });
    },

    trackCropReady: (cropKey: CropKey, areaKey: AreaKey, cropTier: number, context: GameAnalyticsContext) => {
      track('crop_ready', {
        crop: cropKey,
        area: areaKey,
        crop_tier: cropTier,
        ...context,
      });
    },

    trackCropHarvested: (params: {
      cropKey: CropKey;
      areaKey: AreaKey;
      cropTier: number;
      revenue: number;
      isFirstMeaningfulHarvest: boolean;
      isFirstCropHarvest: boolean;
      context: GameAnalyticsContext;
    }) => {
      track('crop_harvested', {
        crop: params.cropKey,
        area: params.areaKey,
        crop_tier: params.cropTier,
        revenue: params.revenue,
        is_first_meaningful_harvest: params.isFirstMeaningfulHarvest,
        is_first_crop_harvest: params.isFirstCropHarvest,
        ...params.context,
      });

      if (params.isFirstMeaningfulHarvest) {
        track('first_meaningful_harvest', {
          crop: params.cropKey,
          area: params.areaKey,
          crop_tier: params.cropTier,
          revenue: params.revenue,
          ...params.context,
        });
      }
    },

    trackPlotUnlocked: (params: {
      method: 'gold' | 'ad';
      cost: number;
      nextPlotCount: number;
      context: GameAnalyticsContext;
    }) => {
      track('plot_unlocked', {
        method: params.method,
        cost: params.cost,
        next_plot_count: params.nextPlotCount,
        ...params.context,
      });
    },

    trackUpgradePurchased: (params: {
      kind: 'speed' | 'profit';
      cost: number;
      nextLevel: number;
      context: GameAnalyticsContext;
    }) => {
      track('upgrade_purchased', {
        upgrade_kind: params.kind,
        cost: params.cost,
        next_level: params.nextLevel,
        ...params.context,
      });
    },

    trackAreaUnlockClicked: (areaKey: AreaKey, context: GameAnalyticsContext) => {
      track('area_unlock_clicked', {
        area: areaKey,
        ...context,
      });
    },

    trackAreaUnlocked: (params: { areaKey: AreaKey; cost: number; context: GameAnalyticsContext }) => {
      track('area_unlocked', {
        area: params.areaKey,
        cost: params.cost,
        ...params.context,
      });
    },

    trackAdRewardClick: (type: RewardedAdType, context: GameAnalyticsContext) => {
      track('ad_reward_click', {
        ad_type: type,
        ...context,
      });
    },

    trackAdRewardImpression: (type: RewardedAdType, placement: string, context: GameAnalyticsContext) => {
      track('ad_reward_impression', {
        ad_type: type,
        placement,
        ...context,
      });
    },

    trackAdRewardCompleted: (params: { type: RewardedAdType; rewardValue: number; context: GameAnalyticsContext }) => {
      track('ad_reward_completed', {
        ad_type: params.type,
        reward_value: params.rewardValue,
        ...params.context,
      });
    },

    trackAdRewardFailed: (type: RewardedAdType, reason: string, context: GameAnalyticsContext) => {
      track('ad_reward_failed', {
        ad_type: type,
        reason,
        ...context,
      });
    },

    trackAdLimitBlocked: (type: RewardedAdType, reason: string, context: GameAnalyticsContext) => {
      track('ad_limit_blocked', {
        ad_type: type,
        blocked_reason: reason,
        ...context,
      });
    },

    trackCollectionScreen: (context: GameAnalyticsContext) => {
      track('collection_screen', context);
    },

    trackCollectionRewardClaimed: (params: {
      rewardKey: CollectionRewardKey;
      rewardValue: number;
      context: GameAnalyticsContext;
    }) => {
      track('collection_reward_claimed', {
        reward_key: params.rewardKey,
        reward_value: params.rewardValue,
        ...params.context,
      });
    },
  };
}
