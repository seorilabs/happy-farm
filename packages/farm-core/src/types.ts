import balance from './balance.json';

export type CropKey = (typeof balance.crops)[number]['key'];

export type AreaKey = (typeof balance.areas)[number]['key'];

export type PlotState = 0 | 1 | 2;

export type Plot = {
  id: number;
  cropType: CropKey | null;
  startTime: number | null;
  state: PlotState;
};

export type AdUsage = {
  dailyKey: string;
  rewardedGoldTimestamps: number[];
  rewardedGoldDailyCount: number;
  growthAd: {
    lastUsedAt: number | null;
    dailyCount: number;
  };
  harvestBonusAd: {
    lastUsedAt: number | null;
    lastPromptedAt: number | null;
    boostEndsAt: number | null;
    dailyCount: number;
  };
};

export type GameState = {
  gold: number;
  plots: Plot[];
  unlockedPlotCount: number;
  unlockedAreas: AreaKey[];
  harvestedCropKeys: CropKey[];
  adUsage: AdUsage;
  upgrades: { speed: number; profit: number };
};
