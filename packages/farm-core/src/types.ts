import balance from './balance.json';

export type CropKey = (typeof balance.crops)[number]['key'];

export type AreaKey = (typeof balance.areas)[number]['key'];

export type MasteryRankKey = (typeof balance.mastery.ranks)[number]['key'];

export type MutationKey = (typeof balance.mutations.kinds)[number]['key'];

export type AchievementTrackKey = (typeof balance.achievements.tracks)[number]['key'];

export type TitleKey = (typeof balance.achievements.titles)[number]['key'];

export type LifetimeStats = {
  totalHarvests: number;
  totalGoldEarned: number;
  mutationsFound: number;
  prestigeCount: number;
  researchPointsEarned: number;
  breedsUnlocked: number;
};

// Permanent cross-farm progression. Stars are earned from achievements and
// farm graduations, and spent on prestige skills.
export type PrestigeProgress = {
  level: number;
  stars: number;
  totalStarsEarned: number;
};

export const COLLECTION_FULL_REWARD_KEY = 'all';

export type CollectionRewardKey = AreaKey | typeof COLLECTION_FULL_REWARD_KEY;

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
  claimedCollectionRewards: CollectionRewardKey[];
  adUsage: AdUsage;
  upgrades: { speed: number; profit: number };
  harvestCounts: Partial<Record<CropKey, number>>;
  mutationsDiscovered: Partial<Record<CropKey, MutationKey[]>>;
  lifetimeStats: LifetimeStats;
  claimedAchievements: string[];
  activeTitle: TitleKey | null;
  prestige: PrestigeProgress;
};

// Prestige reset boundary. Farm-layer fields are wiped when the player
// graduates a farm; meta-layer fields persist across every farm forever.
export const FARM_LAYER_KEYS = [
  'gold',
  'plots',
  'unlockedPlotCount',
  'unlockedAreas',
  'upgrades',
] as const satisfies readonly (keyof GameState)[];

export const META_LAYER_KEYS = [
  'harvestedCropKeys',
  'claimedCollectionRewards',
  'adUsage',
  'harvestCounts',
  'mutationsDiscovered',
  'lifetimeStats',
  'claimedAchievements',
  'activeTitle',
  'prestige',
] as const satisfies readonly (keyof GameState)[];

export type FarmLayerKey = (typeof FARM_LAYER_KEYS)[number];
export type MetaLayerKey = (typeof META_LAYER_KEYS)[number];

type UnpartitionedGameStateKey = Exclude<keyof GameState, FarmLayerKey | MetaLayerKey>;
type DoublyPartitionedGameStateKey = FarmLayerKey & MetaLayerKey;

// Compile-time guard: every GameState field must be classified into exactly one
// layer. Adding a field without deciding its prestige-reset behavior is a bug.
export const GAME_STATE_LAYER_PARTITION_OK: [UnpartitionedGameStateKey, DoublyPartitionedGameStateKey] extends [
  never,
  never,
]
  ? true
  : { unpartitioned: UnpartitionedGameStateKey; doublyPartitioned: DoublyPartitionedGameStateKey } = true;
