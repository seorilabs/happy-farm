import type { RewardedAdType } from './constants';

export const REWARDED_AD_PLACEMENTS = {
  shopGoldReward: 'shop_gold_reward',
  shopFreePlot: 'shop_free_plot',
  growthSkip: 'growth_ad_sheet',
  harvestBonus: 'harvest_bonus_sheet',
} as const;

export type RewardedAdPlacement = (typeof REWARDED_AD_PLACEMENTS)[keyof typeof REWARDED_AD_PLACEMENTS];

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
