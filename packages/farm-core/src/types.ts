import balance from './balance.json';
import type { AnimalsState } from './animals';
import type { FeatureCoachmarkKey } from './featureCoachmarks';
import type { ProductionState } from './production';
import type { DailyBonusState } from './dailyBonus';
import type { DailyMissionState } from './missions';
import type { WeeklyMissionState } from './weeklyMissions';
import type { WheelState } from './wheel';

export type CropKey = (typeof balance.crops)[number]['key'];

export type AreaKey = (typeof balance.areas)[number]['key'];

export type MasteryRankKey = (typeof balance.mastery.ranks)[number]['key'];

export type MutationKey = (typeof balance.mutations.kinds)[number]['key'];

export type WeatherKey = (typeof balance.weather.types)[number]['key'];

export type ResearchNodeKey = (typeof balance.research.nodes)[number]['key'];

export type DecorationKey = (typeof balance.decorations.items)[number]['key'];

export type DecorationPlacement = {
  key: DecorationKey;
  // Fixed-grid slot index. null keeps ownership while the item is stored in the
  // decorating inventory. Coordinates remain cosmetic and never affect balance.
  slot: number | null;
};

export type AnimalKey = (typeof balance.animals.kinds)[number]['key'];

export type ProductionRecipeKey = (typeof balance.production.recipes)[number]['key'];

export type BreedingRecipeKey = (typeof balance.breeding.recipes)[number]['crop'];

export type ResearchState = {
  points: number;
  totalPointsEarned: number;
  // 반복/티어 연구의 현재 레벨. 기존 save의 unlockedNodes는 migration에서
  // level 1로 승격하며, 호환성을 위해 unlockedNodes도 함께 유지한다.
  nodeLevels: Partial<Record<ResearchNodeKey, number>>;
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

export type OnboardingStep = 'selectSeed' | 'plant' | 'harvest' | 'reward';

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
  offlineBonusAd: {
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
  // Daily mission (today's goals) progress/claim tracking. The missions
  // themselves are derived deterministically from the date, so only progress and
  // which slots were claimed need to persist. A meta-layer field so daily
  // engagement carries across prestige, like dailyBonusState.
  dailyMissionState: DailyMissionState;
  // Weekly mission (this week's long-term goals) progress/claim tracking. Like
  // dailyMissionState, the missions are derived deterministically from the UTC
  // week, so only progress, which slots were claimed, and this week's featured
  // area snapshot persist. A meta-layer field so weekly engagement carries across
  // prestige.
  weeklyMissionState: WeeklyMissionState;
  // Whether the first-session onboarding guide was completed or skipped. A
  // one-time flag so the coachmarks show only to new players and never return.
  onboardingCompleted: boolean;
  // Last active onboarding step. Persisted so an interrupted first session can
  // resume from the same point; null once onboarding is completed or skipped.
  onboardingStep: OnboardingStep | null;
  // Whether the player has ever selected a seed. This lifetime analytics guard
  // is persisted so first_seed_selected can fire at most once across remounts
  // and prestige resets.
  firstSeedSelected: boolean;
  // Source lastSeenAt used for the most recent automatic return settlement
  // while onboarding was incomplete. Makes the two-key save/last-seen write
  // idempotent if the process stops between those writes.
  onboardingReturnSettledAt: number | null;
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
  // Cosmetic decorations the player owns plus their optional fixed-grid slot.
  // A null slot means stored/unplaced. Purely self-expression / late-game gold
  // sink — ownership and placement survive every prestige.
  placedDecorations: DecorationPlacement[];
  // Daily fortune-wheel tracking: free-spin time plus the authoritative bonus-ad
  // day/count/last-use fields. Reward slots stay derived from balance + injected
  // rng. A meta-layer field so both daily caps carry across prestige.
  wheelState: WheelState;
  // Animal husbandry (coop/barn) ownership + in-progress feeding. A supplementary
  // re-visit loop with a cadence distinct from crops. Ownership and feeding
  // timestamps are deterministic (no rng). A meta-layer field so built coops and
  // any in-progress produce survive every prestige, like placedDecorations.
  animals: AnimalsState;
  // Crop-processing workshop (#250): the stockpiled-crop inventory (a harvest
  // byproduct) plus any in-progress crafts. A meta-layer field so the inventory
  // and running crafts survive every prestige, like placedDecorations/animals.
  production: ProductionState;
  // 딥 기능(동물·공방·연구소·교배·개척) 최초 해금 시 1회성 발견성 코치마크(#367)를
  // 이미 확인한 기능 키 목록. 한 번 확인하면 다시는 노출되지 않는다. 메타-레이어 필드라
  // 프레스티지를 넘어 유지된다(placedDecorations/animals와 동일).
  seenFeatureCoachmarks: FeatureCoachmarkKey[];
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
  'dailyMissionState',
  'weeklyMissionState',
  'onboardingCompleted',
  'onboardingStep',
  'firstSeedSelected',
  'onboardingReturnSettledAt',
  'harvestNotificationPromptSeen',
  'prestigeGuideSeen',
  'placedDecorations',
  'wheelState',
  'animals',
  'production',
  'seenFeatureCoachmarks',
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
