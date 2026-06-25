import balance from './balance.json';
import type { DailyBonusState } from './dailyBonus';

export type CropKey = (typeof balance.crops)[number]['key'];

export type AreaKey = (typeof balance.areas)[number]['key'];

export type MasteryRankKey = (typeof balance.mastery.ranks)[number]['key'];

export type MutationKey = (typeof balance.mutations.kinds)[number]['key'];

export type ResearchNodeKey = (typeof balance.research.nodes)[number]['key'];

export type BreedingRecipeKey = (typeof balance.breeding.recipes)[number]['crop'];

export type ResearchState = {
  points: number;
  totalPointsEarned: number;
  unlockedNodes: ResearchNodeKey[];
  unlockedBreeds: CropKey[];
  // 연구실 진입 유도 배지를 위해, 마지막으로 Lab을 열어 "확인"한 시점의 발견 기회
  // (해금 가능 노드 / 교배 가능 레시피) 키 목록. 현재 기회 중 이 목록에 없는 항목이
  // 있으면 새 기회로 보고 배지를 띄운다. Lab을 열면 현재 기회로 갱신해 배지를 해제한다.
  acknowledgedOpportunities: string[];
};

export type AutomationSettings = {
  autoHarvestEnabled: boolean;
  autoReplantEnabled: boolean;
  donationModeEnabled: boolean;
};

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

export type RegionArchetypeKey = (typeof balance.regions.archetypes)[number]['key'];

export type PrestigeSkillKey = (typeof balance.prestigeSkills)[number]['key'];

// Permanent cross-farm progression. Stars are earned from achievements and
// farm graduations, and spent on prestige skills.
export type PrestigeProgress = {
  level: number;
  stars: number;
  totalStarsEarned: number;
  skills: Partial<Record<PrestigeSkillKey, number>>;
  currentRegionArchetype: RegionArchetypeKey;
};

// A graduated farm that keeps paying gold per hour based on the productivity
// snapshot taken at graduation time.
export type ChainFarm = {
  id: number;
  archetype: RegionArchetypeKey;
  goldPerHour: number;
  lastCollectedAt: number;
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
  plotDiscountAd: {
    lastUsedAt: number | null;
    dailyCount: number;
  };
  harvestBonusAd: {
    lastUsedAt: number | null;
    lastPromptedAt: number | null;
    boostEndsAt: number | null;
    dailyCount: number;
  };
  // Last time the return (welcome-back) interstitial was shown; gates its
  // cooldown across app restarts. Null until the first return ad fires.
  returnInterstitialAt: number | null;
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
  chainFarms: ChainFarm[];
  research: ResearchState;
  automationSettings: AutomationSettings;
  dailyBonusState: DailyBonusState;
  // Whether the first-session onboarding guide was completed or skipped. A
  // one-time flag so the coachmarks show only to new players and never return.
  onboardingCompleted: boolean;
  // Whether the one-time harvest-notification permission prompt — shown right
  // after the first harvest ("aha") — has already been surfaced. Once the player
  // accepts or dismisses it we never ask again (they can still toggle it in
  // settings). A meta-layer flag, so it survives prestige.
  harvestNotificationPromptSeen: boolean;
  // Whether the one-time "chain income" guide shown after the player's first
  // graduation (prestige) has been seen. Surfaced once to explain the passive
  // chain-farm income concept, then never again. A meta-layer flag so it
  // persists across every subsequent graduation.
  prestigeGuideSeen: boolean;
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
  'chainFarms',
  'research',
  'automationSettings',
  'dailyBonusState',
  'onboardingCompleted',
  'harvestNotificationPromptSeen',
  'prestigeGuideSeen',
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
