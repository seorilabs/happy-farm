import type { RewardedAdType } from './constants';

export const REWARDED_AD_PLACEMENTS = {
  shopGoldReward: 'shop_gold_reward',
  shopPlotDiscount: 'shop_plot_discount',
  growthSkip: 'growth_ad_sheet',
  harvestBonus: 'harvest_bonus_sheet',
  returnOfflineBonus: 'return_offline_bonus',
  wheelBonusSpin: 'wheel_bonus_spin',
} as const;

export type RewardedAdPlacement = (typeof REWARDED_AD_PLACEMENTS)[keyof typeof REWARDED_AD_PLACEMENTS];

// Single source of truth mapping each rewarded ad type to its surface, so every
// funnel event (impression → click → completed/failed/blocked) is tagged with a
// consistent placement and per-placement fill/completion rates stay computable.
export const REWARDED_AD_PLACEMENT_BY_TYPE: Record<RewardedAdType, RewardedAdPlacement> = {
  rewardedGold: REWARDED_AD_PLACEMENTS.shopGoldReward,
  plotDiscountAd: REWARDED_AD_PLACEMENTS.shopPlotDiscount,
  growthAd: REWARDED_AD_PLACEMENTS.growthSkip,
  harvestBonusAd: REWARDED_AD_PLACEMENTS.harvestBonus,
  offlineBonusAd: REWARDED_AD_PLACEMENTS.returnOfflineBonus,
  wheelBonusAd: REWARDED_AD_PLACEMENTS.wheelBonusSpin,
};

export function getRewardedAdPlacement(type: RewardedAdType): RewardedAdPlacement {
  return REWARDED_AD_PLACEMENT_BY_TYPE[type];
}

export type RewardedAdReward = {
  type: string;
  amount: number;
};

export type RewardedAdShowResult =
  | { status: 'earned'; reward?: RewardedAdReward }
  | { status: 'dismissed' }
  | { status: 'notReady' }
  | { status: 'unsupported' }
  | { status: 'failed'; error?: string };

export type RewardedAdRequest = {
  type: RewardedAdType;
  placement: RewardedAdPlacement;
};

export type RewardedAdController = {
  isAdReady: boolean;
  isAdSupported: boolean;
  showAd(): Promise<RewardedAdShowResult>;
};
