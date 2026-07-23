import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Easing,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BREEDING_RECIPES,
  CROPS,
  FARM_AREAS,
  PRESTIGE_SKILLS,
  REGION_ARCHETYPES,
  RESEARCH_NODES,
  breedCrop,
  buySkill,
  getCropOfTheDayStatus,
  getWeeklyEventStatus,
  canPrestige,
  canUnlockNode,
  claimNextAchievementTier,
  claimAllAchievements,
  collectChainIncome,
  collectReturnOfflineGold,
  collectReturnSummaryOfflineGold,
  collectReturnSummaryOfflineGoldWithAdBonus,
  acknowledgeResearchOpportunities,
  hasUnseenResearchOpportunity,
  getBreedingRecipeStatus,
  getChainIncome,
  getClaimableAchievementCount,
  getCropModifiers,
  getCropPurchaseCost,
  getFarmHourlyProductivity,
  getGlobalModifiers,
  getOnboardingCropKey,
  getPrestigeSkillLabel,
  getSkillCost,
  getRegionArchetypeLabel,
  getResearchNodeLabel,
  getTitleLabel,
  prestigeFarm,
  runAutomationTick,
  setActiveTitle,
  unlockNode,
  type AchievementTrackKey,
  type ClaimedAchievementTier,
  type MasteryRankKey,
  type MutationKey,
  type PrestigeSkillKey,
  type RegionArchetypeKey,
  type ResearchNodeKey,
  type TitleKey,
  GROWTH_AD_MIN_REMAINING_MS,
  applyGrowthAdSkip,
  applyFertilizer,
  applyFertilizerToAllGrowing,
  getFertilizerCost,
  previewFertilizeAll,
  getGrowthAdSkipMs,
  HARVEST_BONUS_BOOST_DURATION_MS,
  HARVEST_BONUS_MULTIPLIER,
  OFFLINE_BONUS_MULTIPLIER,
  OFFLINE_INCOME_CAP_MS,
  getAdLimits,
  MAX_PLOTS,
  PLOT_DISCOUNT_AD_PERCENT,
  getRewardedGoldAmount,
  REWARDED_GOLD_MAX_USES_PER_WINDOW,
  REWARDED_GOLD_WINDOW_MS,
  type AreaKey,
  type CollectionRewardKey,
  type CropKey,
  type DailyBonusSource,
  type GameAnalyticsContext,
  type GameState,
  type HarvestComboEndReason,
  type HarvestComboTier,
  type RewardedAdController,
  type RewardedAdShowResult,
  type RewardedAdType,
  canShowReturnInterstitial,
  canUnlockArea,
  claimCollectionReward,
  createFarmAnalytics,
  getRewardedAdPlacement,
  shouldRetryRewardedShow,
  createInitialState,
  migrateLoadedState,
  resolveOnboardingStep,
  DEFAULT_LOCALE,
  LOCALE_ENDONYMS,
  SUPPORTED_LOCALES,
  executeFarmGameCommand,
  formatDuration,
  formatHourlyGold,
  formatMoney,
  formatRemainingTime,
  formatSignedPercent,
  getReturnSummary,
  getActiveFarmOfflineGoldPerHour,
  type ReturnSummary,
  getAreaLabel,
  getAreaUnlockRequirementText,
  getCollectionSummary,
  type CollectionSummary,
  getCropLabel,
  COMBO_WINDOW_MS,
  COMBO_GREAT_THRESHOLD,
  COMBO_LEGENDARY_THRESHOLD,
  getEnvironmentTone,
  getLocalMinutesOfDay,
  getDailyMissionsSnapshot,
  claimMission,
  recordAdWatchProgress,
  getWeeklyMissionsSnapshot,
  claimWeeklyMission,
  recordWeeklyAdWatchProgress,
  getDecorationLabel,
  getAnimalLabel,
  DECORATIONS,
  canPurchaseDecoration,
  isDecorationOwned,
  purchaseDecoration,
  getPlacedDecorations,
  applyWheelReward,
  getWheelStatus,
  spinBonusWheel,
  spinWheel,
  type WheelReward,
  getAnimalStates,
  purchaseAnimal,
  feedAnimal,
  collectProduce,
  collectAllReadyProduce,
  type AnimalKey,
  getProductionStates,
  getProductionRecipeLabel,
  startCraft,
  cancelCraft,
  collectCraft,
  collectAllReadyCrafts,
  type ProductionRecipeKey,
  getCropEconomyEstimate,
  sortCropKeysForStrip,
  nextSeedSortMode,
  type SeedSortMode,
  getGameAnalyticsContext,
  getHarvestBonusBoostStatus,
  getHarvestBonusPromptStatus,
  getMasteryRankLabel,
  getMasteryStatus,
  getMinUpgradeLevel,
  getMutationLabel,
  getCropGrowthStage,
  isCropNearlyReady,
  type CropGrowthStage,
  getDiscountedPlotCost,
  getPlotCost,
  getPlotGrowthDisplay,
  getPlotRemainingGrowthMs,
  getPlotRemainingWallClockMs,
  getRewardedAdLimitStatus,
  getUpgradeCost,
  isAreaUnlocked,
  isCropPlantable,
  isPlotGrowthComplete,
  accumulateCropReadySummary,
  collectNewlyReadyPlotIds,
  createCropReadySummaryState,
  isCropReadySummaryDue,
  type CropReadySummaryEntry,
  type CropReadyLogState,
  isTitleUnlocked,
  normalizeLocale,
  performHarvestAll,
  performHarvestAndReplant,
  performPlantAll,
  getPlantAllPreview,
  getReadyPlotCount,
  recordHarvestBonusAdPrompt,
  recordReturnInterstitial,
  recordRewardedAdUsage,
  type CropHarvestedGameEvent,
  type HarvestAllResult,
  type CropPlantedGameEvent,
  type CropEconomyEstimate,
  type FarmGameCommandBlockedReason,
  type SupportedLocale,
  getPendingFeatureCoachmark,
  markFeatureCoachmarkSeen,
  type FeatureCoachmarkKey,
} from '../../farm-core/src';
import {
  claimDailyBonus,
  getDailyBonusLabel,
  getDailyBonusReminderAt,
  isDailyBonusAvailable,
  normalizeDailyBonusState,
  previewDailyBonus,
} from '../../farm-core/src/dailyBonus';

import { DEFAULT_FARM_GAME_SETTINGS, normalizeFarmGameSettings, type FarmGameSettings } from './gameSettings';
import { CropGlyph, FarmArtProvider, useCropArtSource, useFarmArt, type FarmArt } from './farmArt';
import { getFarmMessages, type FarmMessages } from './i18n';
import { getWeeklyEventPresentation } from './weeklyEventPresentation';
import { AchievementsSheet } from './components/AchievementsSheet';
import { ChainMapSheet, PrestigeConfirmSheet } from './components/ChainMapSheet';
import { CollectionSheet } from './components/CollectionSheet';
import { EnvironmentBackdrop } from './components/EnvironmentBackdrop';
import { FarmOnboarding, ONBOARDING_STEPS, type OnboardingStep } from './components/FarmOnboarding';
import { LabSheet } from './components/LabSheet';
import { MissionsSheet } from './components/MissionsSheet';
import { StatsSheet, type FarmRecordStats } from './components/StatsSheet';
import { WheelSheet } from './components/WheelSheet';
import { AnimalsSheet } from './components/AnimalsSheet';
import { WorkshopSheet } from './components/WorkshopSheet';
import { AdRewardCard, CloudSaveSection, SettingToggle, SheetAction, ShopCard, sheetPartStyles } from './components/SheetParts';
import {
  DISCOVERY_BANNER_BASE_BOTTOM,
  getPlotTileSize,
  PLOT_COLUMNS,
  PLOT_GAP,
  SHEET_CONTENT_BASE_PADDING_BOTTOM,
} from './farmGameLayout';
import { styles } from './farmGameStyles';
import { resolveUnaffordableSeedNudge, shouldFireStallNudge } from './onboardingNudge';
import { resolveBottomSafeInset } from './safeArea';
import {
  getShopTabBadge,
  getVisibleShopTabs,
  resolveActiveShopTab,
  shouldRenderShopTabBar,
  type ShopTabKey,
} from './shopTabs';

// Game tick: drives idle re-renders so time-based UI (growth, cooldowns) advances.
// The growth bar animates one tick at a time, so its duration is tied to this value
// rather than hardcoded separately.
export const GAME_TICK_INTERVAL_MS = 250;
// Auto-harvest analytics are batched into one summary event per interval.
const AUTO_HARVEST_SUMMARY_INTERVAL_MS = 60_000;
// Newly-ready crops share one rolling window, then emit one summary per
// crop/area/tier bucket instead of one event per plot.
export const CROP_READY_SUMMARY_INTERVAL_MS = 60_000;
// How often the active session refreshes its "last seen" timestamp so the
// welcome-back recap measures the real away gap even if the app is killed
// without firing a background event.
const LAST_SEEN_HEARTBEAT_MS = 30_000;
const HARVEST_NOTIFICATION_MIN_LEAD_MS = 60_000;
const PROGRESS_ANIMATION_DURATION_MS = GAME_TICK_INTERVAL_MS;
// Fresh-plant sprout "bounce in" duration.
const PLANT_POP_DURATION_MS = 320;
// The "Harvest All" shortcut only appears once enough plots are ripe that
// tapping each one becomes a chore; a single ripe plot is a quick one-tap.
const HARVEST_ALL_MIN_COUNT = 2;
// The "Plant All" shortcut mirrors Harvest All: it only appears when a crop tool
// is selected and at least this many empty plots are waiting, so single-tap
// planting stays the norm and the batch button is reserved for the chore case.
const PLANT_ALL_MIN_COUNT = 2;
// "전체 비료"(#359) 단축 버튼도 같은 원칙: 성장 중이면서 지금 골드로 감당 가능한 밭이
// 이만큼 있을 때만 조건부 행에 노출한다. 한두 칸은 밭 시트 안 단일 비료로 충분하다.
const FERTILIZE_ALL_MIN_COUNT = 2;
// 큰 골드 지출이라 1탭으로 즉시 실행하지 않는다. 1차 탭은 확인(버튼 라벨 전환), 2차 탭이
// 실행이며, 이 시간 안에 다시 누르지 않으면 확인 상태가 자동 해제된다(오조작 방지).
const FERTILIZE_ALL_CONFIRM_WINDOW_MS = 4000;
// Harvest combo pacing (window + tier thresholds) now lives in balance.json and
// is imported from farm-core above. Re-exported so existing consumers/tests keep
// reading the thresholds from this module.
export { COMBO_GREAT_THRESHOLD, COMBO_LEGENDARY_THRESHOLD };
export const MASTERY_RANK_UP_CELEBRATION_DURATION_MS = 2600;
export const PRESTIGE_GRADUATION_CELEBRATION_DURATION_MS = 3500;
export const FIRST_HARVEST_CELEBRATION_DURATION_MS = 3200;
// Frequent speed/profit purchases get a compact in-card burst, intentionally
// much shorter than mastery/prestige full-screen celebrations (#289).
export const UPGRADE_BURST_DURATION_MS = 720;
// 온보딩 단계 진입 후 이만큼 무행동으로 머물면 onboarding_stall을 1회 발화해
// 단계별 정체 구간을 계측한다(#274). selectSeed 69% 정체 진단용.
export const ONBOARDING_STALL_MS = 15_000;
const SHEET_DISMISS_DRAG_DISTANCE = 96;
const SHEET_DISMISS_VELOCITY = 1.1;
const SHEET_DISMISS_TRANSLATE_Y = 520;
const SHEET_ANIMATION_DURATION_MS = 180;
const EMPTY_SAFE_AREA_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

import { _callGoldPulseHook } from './farmGoldPulse';

function getFirstArea() {
  const area = FARM_AREAS[0];
  if (area == null) {
    throw new Error('Farm balance must include at least one area.');
  }
  return area;
}

function getCrop(cropKey: CropKey) {
  const crop = CROPS[cropKey];
  if (crop == null) {
    throw new Error(`Unknown crop: ${cropKey}`);
  }
  return crop;
}

// Identifies the single most actionable next milestone for the player: the
// first locked sequential area, and whichever of its requirements is furthest
// from met. Returned raw so the component can format it with the active locale.
export type NextAreaGoal =
  | { kind: 'gold'; areaKey: AreaKey; current: number; total: number }
  | { kind: 'harvest'; areaKey: AreaKey; current: number; total: number }
  | { kind: 'upgrade'; areaKey: AreaKey; current: number; total: number }
  | { kind: 'ready'; areaKey: AreaKey }
  | null;

export function getNextAreaGoal(gameState: GameState): NextAreaGoal {
  const nextArea = FARM_AREAS.find(
    (area) => !isAreaUnlocked(gameState, area.key) && area.unlock.gate == null
  );
  if (nextArea == null) return null;

  const goldOk = gameState.gold >= nextArea.unlock.cost;
  const harvestOk = gameState.harvestedCropKeys.length >= nextArea.unlock.requiredHarvestedCropCount;
  const upgradeOk = getMinUpgradeLevel(gameState) >= nextArea.unlock.requiredUpgradeLevel;

  if (goldOk && harvestOk && upgradeOk) {
    return { kind: 'ready', areaKey: nextArea.key };
  }

  const goldRatio = nextArea.unlock.cost > 0 ? gameState.gold / nextArea.unlock.cost : 1;
  const harvestRatio =
    nextArea.unlock.requiredHarvestedCropCount > 0
      ? gameState.harvestedCropKeys.length / nextArea.unlock.requiredHarvestedCropCount
      : 1;
  const upgradeRatio =
    nextArea.unlock.requiredUpgradeLevel > 0
      ? getMinUpgradeLevel(gameState) / nextArea.unlock.requiredUpgradeLevel
      : 1;

  if (!goldOk && goldRatio <= harvestRatio && goldRatio <= upgradeRatio) {
    return { kind: 'gold', areaKey: nextArea.key, current: gameState.gold, total: nextArea.unlock.cost };
  }
  if (!harvestOk && harvestRatio <= upgradeRatio) {
    return {
      kind: 'harvest',
      areaKey: nextArea.key,
      current: gameState.harvestedCropKeys.length,
      total: nextArea.unlock.requiredHarvestedCropCount,
    };
  }
  return {
    kind: 'upgrade',
    areaKey: nextArea.key,
    current: getMinUpgradeLevel(gameState),
    total: nextArea.unlock.requiredUpgradeLevel,
  };
}

function getCropEconomy(cropEconomyByKey: Record<CropKey, CropEconomyEstimate>, cropKey: CropKey): CropEconomyEstimate {
  const estimate = cropEconomyByKey[cropKey];
  if (estimate == null) {
    throw new Error(`Missing crop economy estimate: ${cropKey}`);
  }
  return estimate;
}

const FIRST_AREA = getFirstArea();

type DailyBonusSheet = { type: 'dailyBonus'; source: DailyBonusSource };

type ActiveSheet =
  | { type: 'shop' }
  | { type: 'collection' }
  | { type: 'missions' }
  | { type: 'more' }
  | { type: 'stats' }
  | { type: 'achievements' }
  | { type: 'lab' }
  | { type: 'map' }
  | { type: 'prestigeConfirm' }
  | { type: 'settings' }
  | { type: 'growthAd'; plotIndex: number; cropKey: CropKey; remainingMs: number }
  | { type: 'harvestBonus' }
  | { type: 'welcomeBack'; summary: ReturnSummary }
  | DailyBonusSheet
  | { type: 'wheel' }
  | { type: 'animals' }
  | { type: 'workshop' }
  | { type: 'resetConfirm' }
  | null;

export type FarmGamePersistence = {
  readPersistedGameState: () => Promise<GameState>;
  writePersistedGameState: (gameState: GameState) => Promise<void>;
  removePersistedGameState: () => Promise<void>;
  readPersistedGameSettings?: () => Promise<Partial<FarmGameSettings> | null | undefined>;
  writePersistedGameSettings?: (settings: FarmGameSettings) => Promise<void>;
  // Optional so older host integrations keep working; when absent the
  // welcome-back summary simply never triggers.
  readLastSeenAt?: () => Promise<number | null>;
  writeLastSeenAt?: (timestamp: number) => Promise<void>;
};

type UseFarmAd = (adGroupId?: string) => RewardedAdController;
type FarmAnalytics = ReturnType<typeof createFarmAnalytics>;
type FarmGameMarket = 'appsInToss' | 'mobile';
export type FarmGameAdGroupIds = {
  rewarded?: string;
  interstitial?: string;
};

// One-shot SFX beyond the base harvest coin. Adapters map each key to a
// bundled/streamed asset: plant(심기 팝), reward(도감/업적 보상 팡파레),
// unlock(구역 해금/연구 완료), mutation(돌연변이 발견 반짝), wheelSpin(룰렛 틱).
export type FarmSoundEffectKey = 'plant' | 'reward' | 'unlock' | 'mutation' | 'wheelSpin';

export type FarmGameAudio = {
  isSupported: boolean;
  playHarvest: () => void | Promise<void>;
  // Fire-and-forget: implementations must not throw or return a rejectable Promise.
  playComboMilestone: (tier: 'great' | 'legendary') => void;
  // Fire-and-forget like playComboMilestone; callers guard settings/support.
  playEffect: (effect: FarmSoundEffectKey) => void;
  setBackgroundMusicEnabled: (enabled: boolean) => void | Promise<void>;
};

// Comeback-nudge reminders distinct from the per-harvest reminder. Each kind
// maps to its own platform notification id/channel so it never collides with
// the harvest notification.
export type FarmReminderKind = 'dailyBonus' | 'cropOfTheDay';

export type FarmGameNotifications = {
  isSupported: boolean;
  requestPermission: () => Promise<boolean>;
  scheduleHarvestReady: (notification: { readyAtMs: number; title: string; body: string }) => Promise<void>;
  cancelHarvestReady: () => Promise<void>;
  scheduleReminder: (
    kind: FarmReminderKind,
    notification: { readyAtMs: number; title: string; body: string }
  ) => Promise<void>;
  cancelReminder: (kind: FarmReminderKind) => Promise<void>;
};

// User-triggered cloud backup/restore from settings. Distinct from the automatic
// backup wired inside persistence: this adapter surfaces an explicit entry point
// and result status in the UI. When isSupported is false the settings section is
// hidden entirely (AIT / default).
export type FarmCloudSaveBackupOutcome =
  | { status: 'disabled' | 'signed_out' | 'error' }
  | { status: 'backed_up'; clientRevision: number };

export type FarmCloudSaveRestoreOutcome =
  | { status: 'disabled' | 'signed_out' | 'missing' | 'invalid' | 'error' }
  | { status: 'restored'; clientRevision: number; gameState: GameState };

export type FarmCloudSave = {
  isSupported: boolean;
  backupNow: (gameState: GameState) => Promise<FarmCloudSaveBackupOutcome>;
  restoreFromCloud: () => Promise<FarmCloudSaveRestoreOutcome>;
};

export type FarmGameProps = {
  persistence?: FarmGamePersistence;
  cloudSave?: FarmCloudSave;
  analytics?: FarmAnalytics;
  useRewardedAd?: UseFarmAd;
  useInterstitialAd?: UseFarmAd;
  audio?: FarmGameAudio;
  // Host-provided generated art (crop icons and growth stages).
  // Absent → every surface falls back to the original emoji glyphs.
  art?: FarmArt;
  notifications?: FarmGameNotifications;
  market?: FarmGameMarket;
  preferredLocale?: SupportedLocale;
  adGroupIds?: FarmGameAdGroupIds;
};

type GetAnalyticsContext = (state?: GameState) => GameAnalyticsContext;
type ToolKey = 'harvest' | CropKey;
type ManualHarvestComboAccumulator = {
  count: number;
  startedAt: number;
  lastHarvestedAt: number;
  baseRevenueTotal: number;
  context: GameAnalyticsContext;
};

function getManualHarvestComboTier(count: number): HarvestComboTier {
  if (count >= COMBO_LEGENDARY_THRESHOLD) {
    return 'legendary';
  }
  if (count >= COMBO_GREAT_THRESHOLD) {
    return 'great';
  }
  return 'normal';
}

type PendingFarmCommandEffect =
  | { id: number; type: 'plantBlocked'; reason: FarmGameCommandBlockedReason }
  | { id: number; type: 'cropPlanted'; event: CropPlantedGameEvent }
  | {
      id: number;
      type: 'cropHarvested';
      event: CropHarvestedGameEvent;
      now: number;
      shouldShowHarvestBonusNudge: boolean;
    }
  | {
      id: number;
      type: 'harvestedAll';
      fx: { plotIndex: number; goldGained: number; tone: HarvestPop['tone'] }[];
      rankUps: { cropKey: CropKey; rankKey: MasteryRankKey; rankIcon: string }[];
      firstMutationFlash: MutationCelebrationKey | null;
      // Carries the lifetime-first-harvest signal when the batch contains it, so
      // the "aha" celebration fires even if the very first harvest came through
      // Harvest All (e.g. a new player whose starter plots ripen together).
      firstHarvest: { cropIcon: string; goldGained: number } | null;
      totalGoldGained: number;
      totalRpGained: number;
      harvestedCount: number;
      specialCount: number;
      // Plots re-sown in the same tap by Harvest-then-Replant (#252). >0 switches
      // the batch toast to the combined harvest+replant variant. 0/undefined for a
      // plain Harvest All.
      replantedCount?: number;
    }
  | {
      id: number;
      type: 'readyItemsCollected';
      surface: 'animals' | 'workshop';
      collectedCount: number;
      totalGold: number;
    }
  | {
      id: number;
      type: 'achievementsClaimed';
      mode: 'single' | 'all';
      claims: ClaimedAchievementTier[];
    };

type MasteryRankUpNotice = {
  id: number;
  cropIcon: string;
  cropName: string;
  rankKey: MasteryRankKey;
  rankIcon: string;
  rankName: string;
};

const MASTERY_RANK_COLORS: Record<MasteryRankKey, string> = {
  bronze: '#9a6b3e',
  silver: '#5f7e99',
  gold: '#d4860a',
  prism: '#7c44ff',
};

type PrestigeGraduationNotice = {
  id: number;
  regionIcon: string;
  regionName: string;
  starsAwarded: number;
};

type FirstHarvestNotice = {
  id: number;
  cropIcon: string;
  goldFormatted: string;
};

// One-shot floating "+gold" feedback spawned at the tapped plot on a manual
// harvest. Auto-harvest stays silent so the burst always maps to a finger tap.
type HarvestPop = {
  id: number;
  index: number;
  label: string;
  tone: 'normal' | 'special' | MutationCelebrationKey;
};

// Imperative handle so a harvest can fire a burst without lifting pop state into
// FarmGame: spawning/removing pops re-renders only the overlay, never the plot
// grid, keeping rapid tapping cheap on low-end devices.
type HarvestFxHandle = {
  spawn: (index: number, label: string, tone: HarvestPop['tone']) => void;
};

// Imperative handle to fire the full-screen mutation flash overlay without
// lifting flash state into FarmGame (avoids re-rendering the whole tree).
type MutationFlashHandle = {
  flash: (mutationKey: MutationCelebrationKey) => void;
};

export const MUTATION_CELEBRATION_KEYS = ['golden', 'rainbow', 'giant', 'prism'] as const;
export type MutationCelebrationKey = (typeof MUTATION_CELEBRATION_KEYS)[number];

type MutationCelebrationConfig = {
  priority: number;
  flashColor: string;
  flashPeakOpacity: number;
  flashRiseMs: number;
  flashFadeMs: number;
  popIcon: string;
  popDurationMs: number;
  popRiseMultiplier: number;
  popScaleMax: number;
};

const MUTATION_CELEBRATION_CONFIG = {
  golden: {
    priority: 0,
    flashColor: '#fde68a',
    flashPeakOpacity: 0.36,
    flashRiseMs: 120,
    flashFadeMs: 400,
    popIcon: '✨',
    popDurationMs: 1_100,
    popRiseMultiplier: 0.78,
    popScaleMax: 1.45,
  },
  rainbow: {
    priority: 1,
    flashColor: '#c084fc',
    flashPeakOpacity: 0.45,
    flashRiseMs: 230,
    flashFadeMs: 600,
    popIcon: '🌈',
    popDurationMs: 1_400,
    popRiseMultiplier: 0.95,
    popScaleMax: 1.65,
  },
  giant: {
    priority: 2,
    flashColor: '#fb923c',
    flashPeakOpacity: 0.52,
    flashRiseMs: 180,
    flashFadeMs: 760,
    popIcon: '🦣',
    popDurationMs: 1_550,
    popRiseMultiplier: 1.08,
    popScaleMax: 1.82,
  },
  prism: {
    priority: 3,
    flashColor: '#67e8f9',
    flashPeakOpacity: 0.6,
    flashRiseMs: 260,
    flashFadeMs: 940,
    popIcon: '🔮',
    popDurationMs: 1_750,
    popRiseMultiplier: 1.2,
    popScaleMax: 2,
  },
} satisfies Record<MutationCelebrationKey, MutationCelebrationConfig>;

export function isMutationCelebrationKey(value: MutationKey | null | undefined): value is MutationCelebrationKey {
  return value != null && (MUTATION_CELEBRATION_KEYS as readonly string[]).includes(value);
}

export function selectRarestMutationFlash(
  current: MutationCelebrationKey | null,
  candidate: MutationKey | null | undefined,
): MutationCelebrationKey | null {
  if (!isMutationCelebrationKey(candidate)) {
    return current;
  }
  if (
    current == null ||
    MUTATION_CELEBRATION_CONFIG[candidate].priority > MUTATION_CELEBRATION_CONFIG[current].priority
  ) {
    return candidate;
  }
  return current;
}

let mutationFlashTestHook: ((mutationKey: MutationCelebrationKey) => void) | undefined;

/** @internal Test-only setter; no-op when __DEV__ is false. */
export function __setMutationFlashTestHook(
  hook: ((mutationKey: MutationCelebrationKey) => void) | undefined,
): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    mutationFlashTestHook = hook;
  }
}

// Imperative handle to show the new-crop discovery banner. Keeping crop data
// in the call avoids any shared state and lets the overlay mount lazily.
type DiscoveryBannerHandle = {
  show: (icon: string, name: string) => void;
};

const defaultFarmAnalytics = createFarmAnalytics();
const defaultFarmAudio: FarmGameAudio = {
  isSupported: false,
  playHarvest: () => undefined,
  playComboMilestone: () => undefined,
  playEffect: () => undefined,
  setBackgroundMusicEnabled: () => undefined,
};
const defaultFarmNotifications: FarmGameNotifications = {
  isSupported: false,
  requestPermission: async () => false,
  scheduleHarvestReady: async () => undefined,
  cancelHarvestReady: async () => undefined,
  scheduleReminder: async () => undefined,
  cancelReminder: async () => undefined,
};
const defaultCloudSave: FarmCloudSave = {
  isSupported: false,
  backupNow: async () => ({ status: 'disabled' }),
  restoreFromCloud: async () => ({ status: 'disabled' }),
};
const defaultPersistence: FarmGamePersistence = {
  readPersistedGameState: async () => createInitialState(),
  writePersistedGameState: async () => undefined,
  removePersistedGameState: async () => undefined,
  readPersistedGameSettings: async () => null,
  writePersistedGameSettings: async () => undefined,
  readLastSeenAt: async () => null,
  writeLastSeenAt: async () => undefined,
};

function useUnsupportedAd(): RewardedAdController {
  return {
    isAdReady: false,
    isAdSupported: false,
    showAd: () => Promise.resolve({ status: 'unsupported' }),
  };
}

function getAdFailureReason(result: RewardedAdShowResult) {
  if (result.status === 'notReady') {
    return 'not_ready';
  }
  if (result.status === 'unsupported') {
    return 'unsupported';
  }
  if (result.status === 'dismissed') {
    return 'dismissed';
  }
  if (result.status === 'failed') {
    return result.error ?? 'failed_to_show';
  }
  return 'failed_to_show';
}

function getNextHarvestReadyAt(gameState: GameState, now = Date.now()) {
  let nextReadyAt: number | null = null;

  for (const plot of gameState.plots) {
    if (plot.state !== 1 || plot.cropType == null || plot.startTime == null) {
      continue;
    }

    const remainingMs = getPlotRemainingWallClockMs(gameState, plot, now);
    if (remainingMs <= 0) {
      continue;
    }

    const readyAt = now + remainingMs;
    if (nextReadyAt == null || readyAt < nextReadyAt) {
      nextReadyAt = readyAt;
    }
  }

  return nextReadyAt;
}

function useFarmSafeAreaInsets() {
  try {
    return useSafeAreaInsets();
  } catch {
    return EMPTY_SAFE_AREA_INSETS;
  }
}

// Thin wrapper so the art context wraps every FarmGame subtree (sheets,
// overlays, plot grid) without threading a prop through each component.
export default function FarmGame(props: FarmGameProps = {}) {
  return (
    <FarmArtProvider art={props.art}>
      <FarmGameBody {...props} />
    </FarmArtProvider>
  );
}

function FarmGameBody({
  persistence = defaultPersistence,
  cloudSave = defaultCloudSave,
  analytics = defaultFarmAnalytics,
  useRewardedAd = useUnsupportedAd,
  useInterstitialAd = useUnsupportedAd,
  audio = defaultFarmAudio,
  notifications = defaultFarmNotifications,
  market = 'appsInToss',
  preferredLocale = DEFAULT_LOCALE,
  adGroupIds = {},
}: FarmGameProps = {}) {
  const insets = useFarmSafeAreaInsets();
  // AIT(Granite) 호스트는 하단 시스템 UI 인셋을 0으로 보고하는 경우가 있어, 최소
  // 확보 인셋으로 보정해 하단 스트립/시트/토스트가 시스템 백버튼·제스처 바와
  // 겹치지 않게 한다(#236). 모바일의 실제 측정값이 더 크면 그대로 유지된다.
  const bottomSafeInset = resolveBottomSafeInset(insets.bottom);
  const { width: windowWidth } = useWindowDimensions();
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  // #372 상점 시트 내부 활성 탭. 상점 진입 시 항상 첫 탭(확장)부터 보도록 초기화한다.
  const [shopTab, setShopTab] = useState<ShopTabKey>('expand');
  // #376 데일리 보너스는 열람 즉시 자동 수령되므로, 방금 지급된 streak·골드를
  // 시트 "수령 완료" 표시용으로 고정한다. 수령 후 dailyBonusState가 다음 회차 기준으로
  // 갱신돼 previewDailyBonus 값이 바뀌어도, 화면엔 방금 받은 값이 그대로 남는다.
  const [dailyBonusClaim, setDailyBonusClaim] = useState<{ streak: number; goldAwarded: number } | null>(null);
  // A return-card action can receive two native taps before React commits the
  // destination sheet. Reserve its immutable snapshot synchronously so offline
  // gold and analytics are exactly-once for this mount.
  const completedReturnSummaryAtRef = useRef<number | null>(null);
  // The rewarded SDK may take seconds to settle, so block every other
  // welcome-back action while the offline-bonus request owns its snapshot.
  const offlineBonusAdInFlightRef = useRef(false);
  // Wheel bonus ad can outlive a render while the native SDK is open. Reserve
  // the request synchronously so rapid taps cannot open two ads or two spins.
  const wheelBonusSpinInFlightRef = useRef(false);
  const offlineBonusImpressionAtRef = useRef<number | null>(null);
  // 마지막으로 시트 impression·collection_screen을 발화한 시트 타입을 기억한다.
  // 방치형 특성상 시트가 열려 있는 동안에도 gameState가 계속 바뀌는데(작물 성장/
  // 자동 수확/골드 누적), 시트 타입이 실제로 전이(open/close/switch)될 때만 발화해
  // 같은 시트가 열린 채 이벤트가 반복 발화되는 것을 막는다.
  const sheetImpressionTypeRef = useRef<string | null>(null);
  // First-session onboarding owns the foreground. A daily-bonus sheet
  // discovered during load waits here until the guide completes or the player
  // explicitly skips it, so a modal can never hide the first action.
  const deferredOnboardingSheetRef = useRef<DailyBonusSheet | null>(null);
  // Track one impression per continuous daily-bonus sheet opening. The ref is
  // reset after leaving the sheet so a later More/welcome-back re-entry becomes
  // a new, correctly attributed impression without 250ms tick duplicates.
  const dailyBonusOpenedSourceRef = useRef<DailyBonusSource | null>(null);
  const [resetConfirmText, setResetConfirmText] = useState('');
  // Cloud backup/restore: in-flight guard against double taps, plus the last
  // result notice shown in the settings section.
  const [cloudSaveBusy, setCloudSaveBusy] = useState(false);
  const [cloudSaveNotice, setCloudSaveNotice] = useState<string | null>(null);
  const [isSaveLoaded, setIsSaveLoaded] = useState(false);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const [gameSettings, setGameSettings] = useState<FarmGameSettings>(DEFAULT_FARM_GAME_SETTINGS);
  // Mirror the haptics setting into a ref so the vibrate helper can read the
  // latest value without being threaded through every effect/callback dep list.
  const hapticsEnabledRef = useRef(DEFAULT_FARM_GAME_SETTINGS.hapticsEnabled);
  hapticsEnabledRef.current = gameSettings.hapticsEnabled;
  // Single entry point that buzzes only when the setting is on. Haptics are
  // non-critical feedback, so a failure is swallowed to never block gameplay.
  const triggerHaptic = useCallback((pattern: number | number[]) => {
    if (!hapticsEnabledRef.current) {
      return;
    }
    try {
      Vibration.vibrate(pattern);
    } catch {
      /* non-critical haptic */
    }
  }, []);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [harvestCombo, setHarvestCombo] = useState(0);
  const comboTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevComboRef = useRef(0);
  // Analytics uses a manual-only streak independent from the display combo:
  // Harvest All intentionally advances the visual celebration, but must never
  // make a future manual reward look earned in the evidence baseline (#348).
  const manualHarvestComboRef = useRef<ManualHarvestComboAccumulator | null>(null);
  const manualHarvestComboTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualHarvestComboGenerationRef = useRef(0);
  const manualHarvestComboPendingEndReasonRef = useRef<HarvestComboEndReason | null>(null);
  const [masteryRankUpNotice, setMasteryRankUpNotice] = useState<MasteryRankUpNotice | null>(null);
  const masteryRankUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const masteryNoticeIdRef = useRef(0);
  const [prestigeGraduationNotice, setPrestigeGraduationNotice] = useState<PrestigeGraduationNotice | null>(null);
  const prestigeGraduationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prestigeGraduationNoticeIdRef = useRef(0);
  // One-time "chain income" guide shown after the very first graduation. The
  // pending ref defers it until the graduation celebration finishes so they
  // don't stack.
  const [prestigeGuide, setPrestigeGuide] = useState(false);
  const prestigeGuidePendingRef = useRef(false);
  const [firstHarvestNotice, setFirstHarvestNotice] = useState<FirstHarvestNotice | null>(null);
  const firstHarvestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstHarvestNoticeIdRef = useRef(0);
  // One-time harvest-notification permission prompt, shown after the first
  // harvest ("aha") and once onboarding has finished.
  const [notificationPromptGeneration, setNotificationPromptGeneration] = useState<number | null>(null);
  // Guards the prompt decision so it runs only once per mount.
  const notificationPromptResolvedRef = useRef(false);
  // Each displayed prompt owns a generation token. Accept/decline atomically
  // invalidate it, so queued events from a retired prompt cannot affect a new
  // prompt shown after an in-place reset or cloud restore.
  const notificationPromptGenerationSequenceRef = useRef(0);
  const activeNotificationPromptGenerationRef = useRef<number | null>(null);
  // Current step of the first-session onboarding coachmark; null hides it.
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep | null>(null);
  // Mirror of the current step for stable callbacks (skip handler) that must read
  // the latest step without being recreated on every render.
  const onboardingStepRef = useRef<OnboardingStep | null>(null);
  onboardingStepRef.current = onboardingStep;
  // Tracks the last step we emitted an onboarding_step_view for, so the funnel
  // event fires once per step entry instead of on every render tick.
  const onboardingStepViewedRef = useRef<OnboardingStep | null>(null);
  // A CTA can receive two taps before React commits the completed state. Guard
  // analytics and finalization synchronously so completion/skip is exactly-once.
  const onboardingFinishCommittedRef = useRef(false);
  // Stable handle to the latest analyticsContext (assigned after it is defined),
  // so the onboarding skip/complete handlers can build a fresh context without
  // being recreated on every tick.
  const analyticsContextRef = useRef<GetAnalyticsContext | null>(null);
  // Soft pulse driving the seed-strip emphasis ring while the selectSeed step is
  // active, so the place to tap reads louder for brand-new players (#159).
  const seedHighlightPulseRef = useRef<Animated.Value | null>(null);
  if (seedHighlightPulseRef.current == null) {
    seedHighlightPulseRef.current = new Animated.Value(0);
  }
  const seedHighlightPulse = seedHighlightPulseRef.current;
  // One-shot emphasis burst on the seed strip, distinct from the ambient pulse
  // above. Fired when the player stalls at selectSeed (#362, once per session) or
  // taps a seed they can't afford, to actively point at the affordable seed.
  const seedNudgeBurstRef = useRef<Animated.Value | null>(null);
  if (seedNudgeBurstRef.current == null) {
    seedNudgeBurstRef.current = new Animated.Value(0);
  }
  const seedNudgeBurst = seedNudgeBurstRef.current;
  // Guards the stall-triggered nudge to at most once per session so a lingering
  // new player isn't pulsed repeatedly (#362). Tap-triggered nudges are exempt —
  // those are immediate feedback to an explicit action.
  const stallNudgePlayedRef = useRef(false);
  // Per-plot "just planted" tokens. Bumped only on a manual plant so the fresh
  // sprout bounces in (auto-replant and save-load stay silent). Keyed by index.
  const [plantPulses, setPlantPulses] = useState<Record<number, number>>({});
  const plantPulseTokenRef = useRef(0);
  const harvestFxRef = useRef<HarvestFxHandle>(null);
  const mutationFlashRef = useRef<MutationFlashHandle>(null);
  const discoveryBannerRef = useRef<DiscoveryBannerHandle>(null);
  const goldPulseRef = useRef<Animated.Value | null>(null);
  if (goldPulseRef.current == null) {
    goldPulseRef.current = new Animated.Value(0);
  }
  const goldPulse = goldPulseRef.current;
  const goldPulseScaleRef = useRef<Animated.AnimatedInterpolation<number> | null>(null);
  if (goldPulseScaleRef.current == null) {
    goldPulseScaleRef.current = goldPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  }
  const goldPulseScale = goldPulseScaleRef.current;
  useEffect(() => () => goldPulse.stopAnimation(), [goldPulse]);
  const lastInterstitialShownAtRef = useRef(0);
  const sessionStartedAtRef = useRef(Date.now());
  // Target time of the last scheduled harvest reminder. This effect re-runs
  // every tick, so we only emit notification_scheduled when that target
  // actually changes — otherwise the analytics would be flooded with noise.
  const lastScheduledHarvestReadyAtRef = useRef<number | null>(null);
  // Same dedupe idea for the comeback reminders: only re-emit analytics when a
  // reminder's target time actually changes, not on every render tick.
  const lastScheduledDailyReminderAtRef = useRef<number | null>(null);
  const lastScheduledCropReminderAtRef = useRef<number | null>(null);
  const tickNowMsRef = useRef(Date.now());
  const gameStartTrackedRef = useRef(false);
  const firstSeedSelectedRef = useRef(false);
  const claimedRewardKeysRef = useRef<Set<CollectionRewardKey>>(new Set());
  const achievementClaimInFlightRef = useRef(false);
  const commandEffectIdRef = useRef(0);
  const pendingCommandEffectsRef = useRef<PendingFarmCommandEffect[]>([]);
  const handledCommandEffectIdsRef = useRef<Set<number>>(new Set());
  const [commandEffectVersion, setCommandEffectVersion] = useState(0);
  // Double-tap guard for confirmPrestige: the state updater is idempotent,
  // but the toast/analytics must fire exactly once per graduated level.
  const prestigedLevelsRef = useRef<Set<number>>(new Set());
  const autoHarvestSummaryRef = useRef({ harvestedCount: 0, replantedCount: 0, windowStartedAt: 0 });
  const cropReadySummaryRef = useRef(createCropReadySummaryState());
  const rewardedAd = useRewardedAd(adGroupIds.rewarded);
  const interstitialAd = useInterstitialAd(adGroupIds.interstitial);
  const farmAnalytics = analytics;
  const isMobileMarket = market === 'mobile';
  const locale = normalizeLocale(gameSettings.locale);
  const messages = useMemo(() => getFarmMessages(locale), [locale]);
  const resetConfirmValue = messages.resetConfirmText;
  // The language picker shows each language by its own endonym, so these labels
  // read the same regardless of the currently active locale.
  const languageOptionLabels: Record<SupportedLocale, string> = LOCALE_ENDONYMS;
  const getLocalizedCropName = useCallback((cropKey: CropKey) => getCropLabel(cropKey, locale).name, [locale]);
  const getLocalizedAreaLabel = useCallback((areaKey: AreaKey) => getAreaLabel(areaKey, locale), [locale]);

  const [gameState, setGameState] = useState<GameState>(() => createInitialState());
  // 콜백 의존성을 늘리지 않고 최신 gameState를 읽기 위한 ref(매 렌더 동기화).
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const [selectedTool, setSelectedTool] = useState<ToolKey>('harvest');
  const [selectedArea, setSelectedArea] = useState<AreaKey>(FIRST_AREA.key);
  // Seed-strip display order. Session-only UI state (no need to persist); the
  // last-chosen sort is kept while the app is open. See sortCropKeysForStrip.
  const [seedSortMode, setSeedSortMode] = useState<SeedSortMode>('default');
  const [prestigeArchetype, setPrestigeArchetype] = useState<RegionArchetypeKey>(
    REGION_ARCHETYPES[0]?.key ?? 'plains'
  );
  const [tick, setTick] = useState(0);
  const plotTileSize = useMemo(() => getPlotTileSize(windowWidth), [windowWidth]);

  const toast = useCallback((message: string) => {
    if (toastTimerRef.current != null) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 1800);
  }, []);
  // A quick "cha-ching" bump on the gold HUD when a harvest lands, so the eye
  // links the floating "+gold" at the plot to the balance actually rising.
  const pulseGold = useCallback(() => {
    _callGoldPulseHook();
    goldPulse.stopAnimation();
    goldPulse.setValue(0);
    Animated.sequence([
      Animated.timing(goldPulse, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(goldPulse, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [goldPulse]);
  const incrementCombo = useCallback((count: number) => {
    if (comboTimerRef.current != null) {
      clearTimeout(comboTimerRef.current);
    }
    setHarvestCombo((prev) => prev + count);
    comboTimerRef.current = setTimeout(() => {
      setHarvestCombo(0);
      comboTimerRef.current = null;
    }, COMBO_WINDOW_MS);
  }, []);
  const showMasteryRankUpCelebration = useCallback((notice: Omit<MasteryRankUpNotice, 'id'>) => {
    if (masteryRankUpTimerRef.current != null) {
      clearTimeout(masteryRankUpTimerRef.current);
    }
    masteryNoticeIdRef.current += 1;
    setMasteryRankUpNotice({ ...notice, id: masteryNoticeIdRef.current });
    masteryRankUpTimerRef.current = setTimeout(() => {
      setMasteryRankUpNotice(null);
      masteryRankUpTimerRef.current = null;
    }, MASTERY_RANK_UP_CELEBRATION_DURATION_MS);
  }, []);
  const dismissMasteryRankUpCelebration = useCallback(() => {
    if (masteryRankUpTimerRef.current != null) {
      clearTimeout(masteryRankUpTimerRef.current);
      masteryRankUpTimerRef.current = null;
    }
    setMasteryRankUpNotice(null);
  }, []);
  const showPrestigeGraduation = useCallback((notice: Omit<PrestigeGraduationNotice, 'id'>) => {
    if (prestigeGraduationTimerRef.current != null) {
      clearTimeout(prestigeGraduationTimerRef.current);
    }
    prestigeGraduationNoticeIdRef.current += 1;
    setPrestigeGraduationNotice({ ...notice, id: prestigeGraduationNoticeIdRef.current });
    prestigeGraduationTimerRef.current = setTimeout(() => {
      setPrestigeGraduationNotice(null);
      prestigeGraduationTimerRef.current = null;
      // Surface the first-graduation chain-income guide once the celebration
      // clears, if confirmPrestige flagged it pending for this graduation.
      if (prestigeGuidePendingRef.current) {
        prestigeGuidePendingRef.current = false;
        setPrestigeGuide(true);
      }
    }, PRESTIGE_GRADUATION_CELEBRATION_DURATION_MS);
  }, []);
  const dismissPrestigeGraduation = useCallback(() => {
    if (prestigeGraduationTimerRef.current != null) {
      clearTimeout(prestigeGraduationTimerRef.current);
      prestigeGraduationTimerRef.current = null;
    }
    setPrestigeGraduationNotice(null);
    if (prestigeGuidePendingRef.current) {
      prestigeGuidePendingRef.current = false;
      setPrestigeGuide(true);
    }
  }, []);
  const showFirstHarvestCelebration = useCallback((notice: Omit<FirstHarvestNotice, 'id'>) => {
    if (firstHarvestTimerRef.current != null) {
      clearTimeout(firstHarvestTimerRef.current);
    }
    firstHarvestNoticeIdRef.current += 1;
    setFirstHarvestNotice({ ...notice, id: firstHarvestNoticeIdRef.current });
    firstHarvestTimerRef.current = setTimeout(() => {
      setFirstHarvestNotice(null);
      firstHarvestTimerRef.current = null;
    }, FIRST_HARVEST_CELEBRATION_DURATION_MS);
  }, []);
  const dismissFirstHarvestCelebration = useCallback(() => {
    if (firstHarvestTimerRef.current != null) {
      clearTimeout(firstHarvestTimerRef.current);
      firstHarvestTimerRef.current = null;
    }
    setFirstHarvestNotice(null);
  }, []);
  const advanceOnboarding = useCallback((step: OnboardingStep) => {
    setOnboardingStep(step);
    setGameState((state) => (state.onboardingStep === step ? state : { ...state, onboardingStep: step }));
  }, []);
  const revealDeferredOnboardingSheet = useCallback(() => {
    const deferred = deferredOnboardingSheetRef.current;
    if (deferred == null) {
      return;
    }
    deferredOnboardingSheetRef.current = null;
    setActiveSheet(deferred);
  }, []);
  // Finishes onboarding (shared by reward confirmation/skip). The persisted
  // step is cleared atomically with the completion flag, then any sheet that
  // waited behind the guide is surfaced.
  const finishOnboarding = useCallback(() => {
    setOnboardingStep(null);
    setGameState((state) =>
      state.onboardingCompleted && state.onboardingStep == null
        ? state
        : { ...state, onboardingCompleted: true, onboardingStep: null }
    );
    revealDeferredOnboardingSheet();
  }, [revealDeferredOnboardingSheet]);
  // User-initiated skip: log which step they bailed on, then finish. Kept stable
  // by reading the step from a ref so the coachmark's onSkip prop is steady.
  const skipOnboarding = useCallback(() => {
    const current = onboardingStepRef.current;
    if (current !== 'harvest' || onboardingFinishCommittedRef.current) {
      return;
    }
    onboardingFinishCommittedRef.current = true;
    const buildContext = analyticsContextRef.current;
    if (buildContext != null) {
      farmAnalytics.trackOnboardingSkip({
        skippedStep: current,
        stepIndex: ONBOARDING_STEPS.indexOf(current) + 1,
        context: buildContext(),
      });
    }
    finishOnboarding();
  }, [farmAnalytics, finishOnboarding]);
  // Natural completion happens only after the first-harvest reward is
  // explicitly confirmed. Distinct from skip so the funnel separates
  // "finished" from "gave up".
  const completeOnboarding = useCallback(() => {
    if (onboardingStepRef.current !== 'reward' || onboardingFinishCommittedRef.current) {
      return;
    }
    onboardingFinishCommittedRef.current = true;
    const buildContext = analyticsContextRef.current;
    if (buildContext != null) {
      farmAnalytics.trackOnboardingComplete({ context: buildContext() });
    }
    finishOnboarding();
  }, [farmAnalytics, finishOnboarding]);
  const closeSheet = useCallback(() => {
    setActiveSheet(null);
  }, []);
  const clearPlantPulse = useCallback((index: number) => {
    setPlantPulses((prev) => {
      if (prev[index] == null) {
        return prev;
      }
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current != null) {
        clearTimeout(toastTimerRef.current);
      }
      if (comboTimerRef.current != null) {
        clearTimeout(comboTimerRef.current);
      }
      if (masteryRankUpTimerRef.current != null) {
        clearTimeout(masteryRankUpTimerRef.current);
      }
      if (prestigeGraduationTimerRef.current != null) {
        clearTimeout(prestigeGraduationTimerRef.current);
        prestigeGraduationTimerRef.current = null;
      }
      if (firstHarvestTimerRef.current != null) {
        clearTimeout(firstHarvestTimerRef.current);
        firstHarvestTimerRef.current = null;
      }
    };
  }, []);

  // Central SFX guard: every non-harvest effect funnels through here so the
  // settings/support checks and error swallowing stay in one place.
  const playSoundEffect = useCallback(
    (effect: FarmSoundEffectKey) => {
      if (!gameSettings.soundEffectsEnabled || !audio.isSupported) return;
      try {
        void Promise.resolve(audio.playEffect(effect) as unknown).catch(() => undefined);
      } catch {
        // SFX errors are non-critical.
      }
    },
    [audio, gameSettings.soundEffectsEnabled]
  );

  useEffect(() => {
    const prev = prevComboRef.current;
    prevComboRef.current = harvestCombo;
    if (!gameSettings.soundEffectsEnabled || !audio.isSupported) return;
    if (harvestCombo === 0) return;
    const prevTier = prev < COMBO_GREAT_THRESHOLD ? 0 : prev < COMBO_LEGENDARY_THRESHOLD ? 1 : 2;
    const currTier = harvestCombo < COMBO_GREAT_THRESHOLD ? 0 : harvestCombo < COMBO_LEGENDARY_THRESHOLD ? 1 : 2;
    if (currTier > prevTier) {
      // Single-action design: when a batch harvest jumps combo past multiple tiers
      // at once, we play only the highest tier reached. This preserves a meaningful
      // audio advantage for individual manual harvesting over Harvest All.
      const tier = currTier >= 2 ? 'legendary' : 'great';
      try {
        // Promise.resolve wraps both void and any unexpected Promise return, so
        // the catch handles async rejections even if the void contract is violated.
        void Promise.resolve(audio.playComboMilestone(tier) as unknown).catch(() => undefined);
      } catch {
        // Synchronous throws from SFX are non-critical.
      }
    }
  }, [harvestCombo, audio, gameSettings.soundEffectsEnabled]);

  const analyticsContext = useCallback(
    (state = gameState) => getGameAnalyticsContext(state, sessionStartedAtRef.current),
    [gameState]
  );
  // Keep the stable ref (declared near the onboarding refs) pointed at the latest
  // analyticsContext so timers can build a fresh context without depending on
  // gameState.
  analyticsContextRef.current = analyticsContext;

  useEffect(() => {
    if (activeSheet?.type !== 'dailyBonus') {
      dailyBonusOpenedSourceRef.current = null;
      // 시트를 벗어나면 고정해 둔 수령 표시값을 비운다(다음 열람 때 다시 채워짐).
      setDailyBonusClaim(null);
      return;
    }
    if (dailyBonusOpenedSourceRef.current === activeSheet.source) {
      return;
    }
    const buildContext = analyticsContextRef.current;
    if (buildContext == null) {
      return;
    }
    const source = activeSheet.source;
    // source-transition 가드로 이 블록은 열람 전이당 정확히 1회만 실행된다.
    // (StrictMode 이중 마운트/리렌더에도 ref가 유지돼 중복 실행되지 않음)
    dailyBonusOpenedSourceRef.current = source;
    farmAnalytics.trackDailyBonusOpened({
      source,
      context: buildContext(),
    });

    // #376 열람 즉시 자동 수령. 열람 경로 3곳(more/auto_popup/welcome_back)은 모두
    // isDailyBonusAvailable/preview.available 게이트를 통과해야 열리므로 이 시점엔
    // 원칙적으로 항상 수령 가능하다. 다만 클록 역전 등 희귀 케이스로 claim이 null이면
    // 지급·이벤트 발화 없이 시트를 조용히 닫아 기존 가드 의미를 유지한다.
    const now = Date.now();
    const result = claimDailyBonus(gameState.dailyBonusState, now, getRewardedGoldAmount(gameState));
    if (result == null) {
      setActiveSheet(null);
      return;
    }
    // 지급은 순수 함수 결과를 기준으로 하되, 동시 경로(다른 열람 트리거)의 이중 지급은
    // functional updater가 최신 prev로 재평가해 막는다: 이미 수령됐으면 null → prev 유지.
    setGameState((prev) => {
      const applied = claimDailyBonus(prev.dailyBonusState, now, getRewardedGoldAmount(prev));
      if (applied == null) {
        return prev;
      }
      return {
        ...prev,
        gold: prev.gold + applied.goldAwarded,
        dailyBonusState: applied.newState,
      };
    });
    setDailyBonusClaim({ streak: result.streak, goldAwarded: result.goldAwarded });
    farmAnalytics.trackDailyBonusClaimed({
      streak: result.streak,
      rewardValue: result.goldAwarded,
      isFirstClaim: result.isFirstClaim,
      source,
      context: buildContext(),
    });
  }, [activeSheet, farmAnalytics, gameState]);

  const flushCropReadySummary = useCallback(
    (context?: GameAnalyticsContext, flushedAt = Date.now()) => {
      const summary = cropReadySummaryRef.current;
      if (summary.readyCount === 0) {
        return;
      }
      const snapshotContext = context ?? analyticsContextRef.current?.();
      if (snapshotContext == null) {
        return;
      }

      // Retire the window before tracking so a re-entrant render/background
      // callback cannot emit the same buckets twice.
      cropReadySummaryRef.current = createCropReadySummaryState();
      for (const bucket of summary.buckets) {
        farmAnalytics.trackCropReadySummary({
          cropKey: bucket.cropKey,
          areaKey: bucket.areaKey,
          cropTier: bucket.cropTier,
          readyCount: bucket.readyCount,
          windowSeconds: Math.max(1, Math.floor((flushedAt - summary.windowStartedAt) / 1000)),
          context: snapshotContext,
        });
      }
    },
    [farmAnalytics],
  );

  const flushManualHarvestCombo = useCallback(
    (endReason: HarvestComboEndReason, flushedAt = Date.now()) => {
      const combo = manualHarvestComboRef.current;
      if (combo == null) {
        return;
      }

      // Retire the accumulator before tracking. AppState can emit inactive then
      // background, and a delayed timer can race either callback; every later
      // path sees null and becomes a no-op.
      manualHarvestComboRef.current = null;
      manualHarvestComboGenerationRef.current += 1;
      if (manualHarvestComboTimerRef.current != null) {
        clearTimeout(manualHarvestComboTimerRef.current);
        manualHarvestComboTimerRef.current = null;
      }

      farmAnalytics.trackHarvestComboCompleted({
        manualHarvestCount: combo.count,
        comboTier: getManualHarvestComboTier(combo.count),
        durationMs: Math.max(0, combo.lastHarvestedAt - combo.startedAt),
        baseRevenueTotal: combo.baseRevenueTotal,
        // A blocked JS thread can delay the timer past its logical deadline.
        // If another boundary wins that race, preserve the streak semantics as
        // timeout instead of attributing an already-expired streak to the
        // later background/reset/prestige/restore action.
        endReason:
          endReason !== 'timeout' && flushedAt - combo.lastHarvestedAt > COMBO_WINDOW_MS
            ? 'timeout'
            : endReason,
        context: combo.context,
      });
    },
    [farmAnalytics],
  );

  const recordManualHarvestCombo = useCallback(
    (harvestedAt: number, baseRevenue: number, context: GameAnalyticsContext) => {
      const safeHarvestedAt = Number.isFinite(harvestedAt) ? harvestedAt : Date.now();
      const previous = manualHarvestComboRef.current;
      if (previous != null) {
        const gapMs = safeHarvestedAt - previous.lastHarvestedAt;
        // A delayed timer must not merge two streaks. A clock rollback also
        // starts a fresh window instead of producing a negative duration.
        if (gapMs < 0 || gapMs > COMBO_WINDOW_MS) {
          flushManualHarvestCombo('timeout');
        }
      }

      const active = manualHarvestComboRef.current;
      const revenue = Number.isFinite(baseRevenue) ? Math.max(0, baseRevenue) : 0;
      const next: ManualHarvestComboAccumulator =
        active == null
          ? {
              count: 1,
              startedAt: safeHarvestedAt,
              lastHarvestedAt: safeHarvestedAt,
              baseRevenueTotal: revenue,
              context,
            }
          : {
              ...active,
              count: active.count + 1,
              lastHarvestedAt: safeHarvestedAt,
              baseRevenueTotal: active.baseRevenueTotal + revenue,
              context,
            };
      manualHarvestComboRef.current = next;

      if (manualHarvestComboTimerRef.current != null) {
        clearTimeout(manualHarvestComboTimerRef.current);
      }
      const generation = manualHarvestComboGenerationRef.current + 1;
      manualHarvestComboGenerationRef.current = generation;
      // A harvest exactly COMBO_WINDOW_MS after the previous one still belongs
      // to the same streak (`gap > window` is the split boundary). Schedule one
      // millisecond beyond the inclusive deadline so timer/input queue order
      // cannot make that equality nondeterministic.
      const remainingMs = Math.max(0, next.lastHarvestedAt + COMBO_WINDOW_MS + 1 - Date.now());
      manualHarvestComboTimerRef.current = setTimeout(() => {
        if (manualHarvestComboGenerationRef.current !== generation) {
          return;
        }
        flushManualHarvestCombo('timeout');
      }, remainingMs);
    },
    [flushManualHarvestCombo],
  );

  // StrictMode mounts/unmounts effects speculatively in development. Cleanup
  // therefore cancels local timers without emitting an artificial session end.
  useEffect(
    () => () => {
      manualHarvestComboGenerationRef.current += 1;
      if (manualHarvestComboTimerRef.current != null) {
        clearTimeout(manualHarvestComboTimerRef.current);
        manualHarvestComboTimerRef.current = null;
      }
      manualHarvestComboRef.current = null;
      manualHarvestComboPendingEndReasonRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (pendingCommandEffectsRef.current.length === 0) {
      return;
    }

    const effects = pendingCommandEffectsRef.current;
    pendingCommandEffectsRef.current = [];

    for (const effect of effects) {
      if (handledCommandEffectIdsRef.current.has(effect.id)) {
        continue;
      }
      handledCommandEffectIdsRef.current.add(effect.id);

      if (effect.type === 'plantBlocked') {
        if (effect.reason === 'areaLocked') {
          toast(messages.areaFirstToast);
        } else if (effect.reason === 'cropLocked') {
          toast(messages.breedRequiredToast);
        } else if (effect.reason === 'insufficientGold') {
          toast(messages.insufficientGoldToast);
        }
        continue;
      }

      if (effect.type === 'cropPlanted') {
        const { event } = effect;
        // Pop the fresh sprout in and give a light tap so planting feels as
        // tactile as harvesting. Manual path only, so auto-replant stays silent.
        plantPulseTokenRef.current += 1;
        const token = plantPulseTokenRef.current;
        setPlantPulses((prev) => ({ ...prev, [event.plotIndex]: token }));
        triggerHaptic(15);
        playSoundEffect('plant');
        farmAnalytics.trackCropPlanted(event.cropKey, event.areaKey, event.cropTier, event.cost, analyticsContext());
        continue;
      }

      if (effect.type === 'harvestedAll') {
        // Release the guard up front so it resets even if feedback below throws,
        // and on a no-op (drift cleared the plots) — the button can never stick.
        harvestAllInFlightRef.current = false;
        if (effect.harvestedCount > 0) {
          // One floating "+gold" per harvested plot keeps the spatial reward;
          // the overlay self-caps concurrent pops, so a full grid stays cheap.
          // The HUD pulse, toast, sound, and haptic fire once for the whole
          // batch instead of stacking dozens of buzzes and toasts.
          for (const fx of effect.fx) {
            if (fx.goldGained > 0) {
              harvestFxRef.current?.spawn(
                fx.plotIndex,
                `+${formatMoney(fx.goldGained, locale)}`,
                fx.tone
              );
            }
          }
          if (effect.firstMutationFlash != null) {
            mutationFlashRef.current?.flash(effect.firstMutationFlash);
            playSoundEffect('mutation');
          }
          if (effect.firstHarvest != null) {
            showFirstHarvestCelebration({
              cropIcon: effect.firstHarvest.cropIcon,
              goldFormatted: formatMoney(effect.firstHarvest.goldGained, locale),
            });
          }
          const first = effect.rankUps[0];
          if (first != null) {
            const crop = getCrop(first.cropKey);
            showMasteryRankUpCelebration({
              cropIcon: crop.icon,
              cropName: getLocalizedCropName(first.cropKey),
              rankKey: first.rankKey,
              rankIcon: first.rankIcon,
              rankName: getMasteryRankLabel(first.rankKey, locale).name,
            });
          }
          // Donation mode converts the batch into research points; key the toast
          // on RP earned (not "gold === 0") so a future zero-value crop still
          // reads as a harvest rather than a donation.
          if (effect.totalRpGained > 0) {
            toast(messages.harvestAllDonatedToast(formatMoney(effect.totalRpGained, locale), effect.harvestedCount));
          } else if (effect.replantedCount != null && effect.replantedCount > 0) {
            // 수확 후 재심기(#252): 한 탭의 결과(수확·재심 수)를 한 토스트로 알려, 골드
            // 부족 부분 성공("수확은 됐는데 일부만 재심")도 명확히 인지되게 한다. 두 번의
            // toast()는 서로 덮어써 마지막 것만 보이므로 결합 메시지 하나로 표시한다.
            toast(
              messages.harvestReplantToast(
                formatMoney(effect.totalGoldGained, locale),
                effect.harvestedCount,
                effect.replantedCount
              )
            );
          } else {
            toast(messages.harvestAllToast(formatMoney(effect.totalGoldGained, locale), effect.harvestedCount));
          }
          if (effect.totalGoldGained > 0) {
            pulseGold();
          }
          farmAnalytics.trackHarvestAll({
            harvestedCount: effect.harvestedCount,
            totalGold: effect.totalGoldGained,
            specialCount: effect.specialCount,
            context: analyticsContext(),
          });
          if (effect.specialCount > 0 && Platform.OS === 'android') {
            triggerHaptic([0, 24, 36, 48]);
          } else {
            triggerHaptic(50);
          }
          if (gameSettings.soundEffectsEnabled && audio.isSupported) {
            void audio.playHarvest();
          }
          incrementCombo(effect.harvestedCount);
        }
        continue;
      }

      if (effect.type === 'readyItemsCollected') {
        // Release the synchronous guard even for a stale/no-op attempt so the
        // next completed set can always be collected.
        collectAllReadyInFlightRef.current[effect.surface] = false;
        if (effect.collectedCount > 0) {
          if (effect.totalGold > 0) {
            pulseGold();
          }
          toast(
            effect.surface === 'animals'
              ? messages.animalsCollectedAllToast(formatMoney(effect.totalGold, locale), effect.collectedCount)
              : messages.workshopCollectedAllToast(formatMoney(effect.totalGold, locale), effect.collectedCount)
          );
        }
        continue;
      }

      if (effect.type === 'achievementsClaimed') {
        achievementClaimInFlightRef.current = false;
        if (effect.claims.length === 0) {
          continue;
        }
        const context = analyticsContext();
        let totalStars = 0;
        for (const claim of effect.claims) {
          totalStars += claim.starsAwarded;
          farmAnalytics.trackAchievementClaimed({
            trackKey: claim.trackKey,
            tier: claim.tier,
            starsAwarded: claim.starsAwarded,
            context,
          });
        }
        toast(
          effect.mode === 'all'
            ? messages.achievementClaimedAllToast(totalStars)
            : messages.achievementClaimedToast(totalStars),
        );
        triggerHaptic(50);
        playSoundEffect('reward');
        continue;
      }

      const { event } = effect;
      const context = analyticsContext();
      recordManualHarvestCombo(effect.now, event.goldGained, context);
      farmAnalytics.trackCropHarvested({
        cropKey: event.cropKey,
        areaKey: event.areaKey,
        cropTier: event.cropTier,
        revenue: event.goldGained,
        isFirstMeaningfulHarvest: event.isFirstMeaningfulHarvest,
        isFirstCropHarvest: event.isNewCropDiscovery,
        context,
      });
      if (event.isFirstMeaningfulHarvest) {
        showFirstHarvestCelebration({
          cropIcon: getCrop(event.cropKey).icon,
          goldFormatted: formatMoney(event.goldGained, locale),
        });
      }
      if (event.newMasteryRank != null) {
        const crop = getCrop(event.cropKey);
        showMasteryRankUpCelebration({
          cropIcon: crop.icon,
          cropName: getLocalizedCropName(event.cropKey),
          rankKey: event.newMasteryRank.key,
          rankIcon: event.newMasteryRank.icon,
          rankName: getMasteryRankLabel(event.newMasteryRank.key, locale).name,
        });
      } else if (event.donated) {
        toast(messages.donatedToast(formatMoney(event.rpGained, locale)));
      } else if (event.mutation != null) {
        toast(
          messages.mutationHarvestedToast(
            getMutationLabel(event.mutation.key, locale).name,
            event.mutation.icon,
            formatMoney(event.goldGained, locale)
          )
        );
      } else {
        toast(
          event.boostActive
            ? messages.harvestedBoostToast(formatMoney(event.goldGained, locale), event.boostMultiplier)
            : messages.harvestedToast(formatMoney(event.goldGained, locale))
        );
      }
      if (
        effect.shouldShowHarvestBonusNudge &&
        gameStateRef.current.onboardingCompleted &&
        !event.isFirstMeaningfulHarvest
      ) {
        setGameState((state) => ({ ...state, adUsage: recordHarvestBonusAdPrompt(state, effect.now) }));
        setActiveSheet({ type: 'harvestBonus' });
      }
      const isSpecialHarvest = event.mutation != null || event.newMasteryRank != null || event.boostActive;
      // 배너와 동일한 해금 기준으로 오늘의 작물을 판정해야 분석 집계가 어긋나지 않는다.
      const cropOfTheDayStatus = getCropOfTheDayStatus(effect.now, gameStateRef.current);
      const isCropOfTheDay = event.cropKey === cropOfTheDayStatus.cropKey;
      if (isCropOfTheDay) {
        farmAnalytics.trackCropOfTheDayHarvested({
          cropKey: event.cropKey,
          multiplier: cropOfTheDayStatus.multiplier,
          context: analyticsContext(),
        });
      }
      const mutationKey = event.mutation?.key;
      const popTone: HarvestPop['tone'] = isMutationCelebrationKey(mutationKey)
        ? mutationKey
        : isSpecialHarvest || isCropOfTheDay
          ? 'special'
          : 'normal';
      if (event.goldGained > 0) {
        harvestFxRef.current?.spawn(
          event.plotIndex,
          `+${formatMoney(event.goldGained, locale)}`,
          popTone
        );
        pulseGold();
      }
      if (event.mutation != null) {
        if (isMutationCelebrationKey(event.mutation.key)) {
          mutationFlashRef.current?.flash(event.mutation.key);
        }
        playSoundEffect('mutation');
      }
      if (event.isNewCropDiscovery) {
        const crop = getCrop(event.cropKey);
        discoveryBannerRef.current?.show(crop.icon, getLocalizedCropName(event.cropKey));
      }
      // A celebratory double-buzz marks rare moments (mutation, mastery rank-up,
      // active boost); ordinary harvests keep the light single tap. The pattern
      // is Android-only: iOS uses a fixed-length vibration and treats array
      // entries as wait gaps, so a "short double tap" can't be expressed there -
      // we fall back to the standard single buzz.
      if (isSpecialHarvest && Platform.OS === 'android') {
        triggerHaptic([0, 24, 36, 48]);
      } else {
        triggerHaptic(50);
      }
      if (gameSettings.soundEffectsEnabled && audio.isSupported) {
        void audio.playHarvest();
      }
      incrementCombo(1);
    }

    // AppState can arrive between a native tap and this post-commit effect.
    // Preserve that boundary so the just-completed command is still emitted
    // even when no accumulator existed at the exact AppState callback.
    const pendingEndReason = manualHarvestComboPendingEndReasonRef.current;
    if (pendingEndReason != null && manualHarvestComboRef.current != null) {
      flushManualHarvestCombo(pendingEndReason);
    }
  }, [
    analyticsContext,
    audio,
    commandEffectVersion,
    farmAnalytics,
    gameSettings.soundEffectsEnabled,
    getLocalizedCropName,
    incrementCombo,
    locale,
    messages,
    playSoundEffect,
    pulseGold,
    flushManualHarvestCombo,
    recordManualHarvestCombo,
    showFirstHarvestCelebration,
    showMasteryRankUpCelebration,
    toast,
    triggerHaptic,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedGame() {
      const savedState = await persistence.readPersistedGameState();
      const lastSeenAt = (await persistence.readLastSeenAt?.()) ?? null;
      if (cancelled) {
        return;
      }
      const onboardingPending = savedState.onboardingCompleted === false;
      let normalizedSavedState: GameState = {
        ...savedState,
        onboardingCompleted: !onboardingPending,
        onboardingStep: onboardingPending ? resolveOnboardingStep(savedState, savedState.onboardingStep) : null,
        dailyBonusState: normalizeDailyBonusState(savedState.dailyBonusState as unknown),
      };
      // Normalize onboarding and dailyBonusState here even when a custom
      // readPersistedGameState skips migrateLoadedState (their TypeScript types
      // can still be absent or malformed at runtime).
      // Greet returning players with a recap of what waited for them. Computed
      // off the freshly loaded save (not React state, which hasn't committed
      // yet) so the very first frame after a long absence shows the summary.
      const now = Date.now();
      const summary = getReturnSummary(normalizedSavedState, lastSeenAt, now);
      const returnSettlementSourceSeenAt =
        typeof lastSeenAt === 'number' && Number.isFinite(lastSeenAt) && lastSeenAt > 0
          ? Math.floor(lastSeenAt)
          : null;
      let lastSeenCommitted = false;
      if (
        summary != null &&
        onboardingPending &&
        summary.offlineGold > 0 &&
        returnSettlementSourceSeenAt != null
      ) {
        // An unfinished first-session guide must not be covered by a return
        // sheet. Settle the load-time snapshot immediately instead of keeping a
        // volatile deferred reward whose amount could change after a harvest or
        // disappear on remount. Persist the credit before advancing lastSeenAt
        // so a process exit cannot lose the reward window.
        if (normalizedSavedState.onboardingReturnSettledAt !== returnSettlementSourceSeenAt) {
          normalizedSavedState = {
            ...collectReturnOfflineGold(normalizedSavedState, summary.awayMs, now).state,
            onboardingReturnSettledAt: returnSettlementSourceSeenAt,
          };
          await persistence.writePersistedGameState(normalizedSavedState);
        }
        await persistence.writeLastSeenAt?.(now);
        lastSeenCommitted = true;
        if (cancelled) {
          return;
        }
      }

      setGameState(normalizedSavedState);
      setIsSaveLoaded(true);

      if (summary != null && !onboardingPending) {
        const welcomeBackSheet: ActiveSheet = { type: 'welcomeBack', summary };
        setActiveSheet(welcomeBackSheet);
        farmAnalytics.trackReturnSummaryShown({
          awayMs: summary.awayMs,
          offlineGold: summary.offlineGold,
          readyCropCount: summary.readyCropCount,
          context: analyticsContext(normalizedSavedState),
        });
      }
      // Mark "seen" immediately so a quick reload doesn't replay the recap.
      if (!lastSeenCommitted) {
        void persistence.writeLastSeenAt?.(now);
      }

      // Check daily login bonus. Completed players keep the welcome-back sheet
      // priority. During onboarding the return sheet is intentionally
      // suppressed, so an available daily bonus is deferred behind the guide.
      if (summary == null || onboardingPending) {
        // Normalize defensively: a custom readPersistedGameState may skip
        // migrateLoadedState, leaving dailyBonusState absent for old saves.
        const preview = previewDailyBonus(
          normalizedSavedState.dailyBonusState,
          now,
          getRewardedGoldAmount(normalizedSavedState)
        );
        if (preview.available) {
          const dailyBonusSheet: DailyBonusSheet = { type: 'dailyBonus', source: 'auto_popup' };
          if (onboardingPending) {
            deferredOnboardingSheetRef.current = dailyBonusSheet;
          } else {
            setActiveSheet(dailyBonusSheet);
          }
        }
      }
    }

    void loadSavedGame();

    return () => {
      cancelled = true;
    };
  }, [persistence]);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedSettings() {
      const savedSettings = await persistence.readPersistedGameSettings?.();
      if (cancelled) {
        return;
      }
      setGameSettings(normalizeFarmGameSettings(savedSettings, preferredLocale));
      setIsSettingsLoaded(true);
    }

    void loadSavedSettings();

    return () => {
      cancelled = true;
    };
  }, [persistence, preferredLocale]);

  useEffect(() => {
    if (!isSaveLoaded) {
      return;
    }
    void persistence.writePersistedGameState(gameState);
  }, [gameState, isSaveLoaded, persistence]);

  // An explicitly incomplete guide always owns the first foreground surface,
  // regardless of how much progress the save already contains. The persisted
  // step resumes exactly where the previous session stopped; a plant-step
  // resume restores a deterministic valid crop because selectedTool is UI-only.
  useEffect(() => {
    if (!isSaveLoaded || gameState.onboardingCompleted || onboardingStep != null) {
      return;
    }
    onboardingFinishCommittedRef.current = false;
    const resumeStep = resolveOnboardingStep(gameState, gameState.onboardingStep);
    if (resumeStep === 'plant' && selectedTool === 'harvest') {
      const cropKey = getOnboardingCropKey(gameState);
      if (cropKey != null) {
        setSelectedArea(getCrop(cropKey).area);
        setSelectedTool(cropKey);
      }
    }
    setOnboardingStep(resumeStep);
  }, [isSaveLoaded, gameState, onboardingStep, selectedTool]);

  // Advance to the next step as the player actually performs each action. The
  // reward step waits for explicit confirmation instead of trapping a new
  // player behind an unaffordable expansion purchase. The whole
  // gameState is a dependency: every setGameState produces a fresh reference, so
  // this re-runs on every state change and always reads the latest values (no
  // stale closure, no missed transition).
  useEffect(() => {
    if (onboardingStep == null || gameState.onboardingCompleted) {
      return;
    }
    if (onboardingStep === 'selectSeed' && selectedTool !== 'harvest') {
      advanceOnboarding('plant');
      return;
    }
    if (onboardingStep === 'plant' && gameState.plots.some((plot) => plot.cropType != null)) {
      advanceOnboarding('harvest');
      return;
    }
    if (onboardingStep === 'harvest' && gameState.harvestedCropKeys.length > 0) {
      advanceOnboarding('reward');
    }
  }, [onboardingStep, selectedTool, gameState, advanceOnboarding]);

  // Emit the onboarding funnel step-view once per step entry. Guarded by a ref so
  // it fires only when the step actually changes, not on every render tick (the
  // effect re-runs each tick because analyticsContext depends on gameState).
  useEffect(() => {
    if (onboardingStep == null) {
      onboardingStepViewedRef.current = null;
      return;
    }
    if (onboardingStepViewedRef.current === onboardingStep) {
      return;
    }
    onboardingStepViewedRef.current = onboardingStep;
    farmAnalytics.trackOnboardingStepView({
      step: onboardingStep,
      stepIndex: ONBOARDING_STEPS.indexOf(onboardingStep) + 1,
      context: analyticsContext(),
    });
  }, [onboardingStep, farmAnalytics, analyticsContext]);

  // Play a short, distinct emphasis burst on the seed strip (native driver, so
  // the seed buttons stay interactive). Used to actively point the eye at the
  // affordable seed when the player is stuck or misfires (#362).
  const playSeedNudgeBurst = useCallback(() => {
    seedNudgeBurst.stopAnimation();
    seedNudgeBurst.setValue(0);
    Animated.sequence([
      Animated.timing(seedNudgeBurst, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(seedNudgeBurst, {
        toValue: 0,
        duration: 620,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [seedNudgeBurst]);

  // Fire onboarding_stall once per step entry if the player lingers without
  // acting for ONBOARDING_STALL_MS (#274). The step changes the instant the
  // player acts, so this effect's cleanup clears the timer before it fires —
  // a stall event therefore only lands when the player is genuinely stuck.
  // Reads the analytics context from a ref so lingering doesn't re-arm on every
  // tick (the effect depends only on the step, not on gameState).
  useEffect(() => {
    if (onboardingStep == null) {
      return;
    }
    const step = onboardingStep;
    const timer = setTimeout(() => {
      const buildContext = analyticsContextRef.current;
      if (buildContext == null) {
        return;
      }
      farmAnalytics.trackOnboardingStall({
        step,
        stepIndex: ONBOARDING_STEPS.indexOf(step) + 1,
        dwellSeconds: Math.round(ONBOARDING_STALL_MS / 1000),
        context: buildContext(),
      });
      // #362: selectSeed에서 정체가 감지되면(15초 무행동) 씨앗을 어디서 고르는지
      // 능동적으로 한 번 짚어준다. 세션당 1회 가드는 shouldFireStallNudge로 판정.
      if (shouldFireStallNudge(step, stallNudgePlayedRef.current)) {
        stallNudgePlayedRef.current = true;
        playSeedNudgeBurst();
      }
    }, ONBOARDING_STALL_MS);
    return () => clearTimeout(timer);
  }, [onboardingStep, farmAnalytics, playSeedNudgeBurst]);

  // Loop a gentle pulse on the seed-strip emphasis ring while the selectSeed step
  // is active so the place to tap reads louder for brand-new players; stop and
  // reset when the step moves on. Drives only the overlay ring's opacity (native
  // driver), so the seed buttons themselves stay fully opaque.
  useEffect(() => {
    if (onboardingStep !== 'selectSeed') {
      seedHighlightPulse.stopAnimation();
      seedHighlightPulse.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(seedHighlightPulse, {
          toValue: 1,
          duration: 720,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(seedHighlightPulse, {
          toValue: 0,
          duration: 720,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [onboardingStep, seedHighlightPulse]);

  // Surface the notification permission prompt only after the first harvest
  // ("aha") AND once onboarding is complete. Gating on onboardingCompleted keeps
  // it from colliding with the coachmarks. Skip it for players who have already
  // seen it (harvestNotificationPromptSeen) or whose platform has no support. If
  // notifications are already enabled, don't ask — just settle the flag.
  useEffect(() => {
    if (!isSaveLoaded || !isSettingsLoaded || notificationPromptResolvedRef.current) return;
    if (!notifications.isSupported) return;
    if (gameState.harvestNotificationPromptSeen) return;
    if (!gameState.onboardingCompleted || gameState.harvestedCropKeys.length === 0) return;
    // The permission education modal is the last post-activation surface. Let
    // the first-harvest celebration and any deferred daily/return sheet finish
    // first so two foreground modals are never mounted together.
    if (firstHarvestNotice != null || activeSheet != null) return;
    notificationPromptResolvedRef.current = true;
    if (gameSettings.harvestNotificationsEnabled) {
      markHarvestNotificationPromptSeen();
      return;
    }
    const generation = notificationPromptGenerationSequenceRef.current + 1;
    notificationPromptGenerationSequenceRef.current = generation;
    activeNotificationPromptGenerationRef.current = generation;
    setNotificationPromptGeneration(generation);
  }, [
    isSaveLoaded,
    isSettingsLoaded,
    notifications,
    gameState.harvestNotificationPromptSeen,
    gameState.onboardingCompleted,
    gameState.harvestedCropKeys.length,
    gameSettings.harvestNotificationsEnabled,
    firstHarvestNotice,
    activeSheet,
  ]);

  // Keep the "last seen" timestamp fresh while the player is active so the
  // welcome-back recap measures the real gap since they left — not the time
  // since their last save-triggering action. A light heartbeat covers the
  // common case; an app-background write captures the exact moment they leave.
  useEffect(() => {
    if (!isSaveLoaded) {
      return;
    }
    const markSeen = () => void persistence.writeLastSeenAt?.(Date.now());
    const heartbeat = setInterval(markSeen, LAST_SEEN_HEARTBEAT_MS);
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        manualHarvestComboPendingEndReasonRef.current = 'background';
        markSeen();
        flushCropReadySummary();
        flushManualHarvestCombo('background');
      } else if (nextState === 'active') {
        manualHarvestComboPendingEndReasonRef.current = null;
      }
    });
    return () => {
      clearInterval(heartbeat);
      subscription.remove();
      flushCropReadySummary();
    };
  }, [flushCropReadySummary, flushManualHarvestCombo, isSaveLoaded, persistence]);

  useEffect(() => {
    if (!isSettingsLoaded) {
      return;
    }
    void persistence.writePersistedGameSettings?.(gameSettings);
  }, [gameSettings, isSettingsLoaded, persistence]);

  useEffect(() => {
    if (!isSaveLoaded || !isSettingsLoaded) {
      return;
    }

    if (!notifications.isSupported || !gameSettings.harvestNotificationsEnabled) {
      void notifications.cancelHarvestReady();
      lastScheduledHarvestReadyAtRef.current = null;
      return;
    }

    const now = Date.now();
    const nextReadyAt = getNextHarvestReadyAt(gameState, now);
    if (nextReadyAt == null) {
      void notifications.cancelHarvestReady();
      lastScheduledHarvestReadyAtRef.current = null;
      return;
    }

    const readyAtMs = Math.max(nextReadyAt, now + HARVEST_NOTIFICATION_MIN_LEAD_MS);
    // Guard both the OS (re)registration and the analytics event on the stable
    // underlying target (nextReadyAt), not the floored readyAtMs. When the next
    // harvest is within the 60s lead floor, readyAtMs = now + 60s drifts on every
    // 250ms tick, which previously re-registered the notifee schedule (cancel+create
    // 4×/sec) and re-emitted notification_scheduled on every tick (#363: one session
    // logged 92). nextReadyAt is the crop's fixed ready time, so keying off it
    // (re)schedules + logs once per actual target — the crop_of_the_day pattern.
    if (lastScheduledHarvestReadyAtRef.current !== nextReadyAt) {
      lastScheduledHarvestReadyAtRef.current = nextReadyAt;
      void notifications.scheduleHarvestReady({
        readyAtMs,
        title: messages.harvestReadyNotificationTitle,
        body: messages.harvestReadyNotificationBody,
      });
      farmAnalytics.trackNotificationScheduled({
        kind: 'harvest',
        leadTimeMs: Math.max(0, readyAtMs - now),
        context: analyticsContext(),
      });
    }
  }, [
    analyticsContext,
    farmAnalytics,
    gameSettings.harvestNotificationsEnabled,
    gameState,
    isSaveLoaded,
    isSettingsLoaded,
    messages.harvestReadyNotificationBody,
    messages.harvestReadyNotificationTitle,
    notifications,
  ]);

  // Comeback reminders (R4): nudge players back for the daily bonus and the new
  // featured crop. Gated by its own toggle, separate from harvest reminders so
  // the two never conflict (distinct notification ids/channels on the platform).
  useEffect(() => {
    if (!isSaveLoaded || !isSettingsLoaded) {
      return;
    }

    if (!notifications.isSupported || !gameSettings.comebackRemindersEnabled) {
      void notifications.cancelReminder('dailyBonus');
      void notifications.cancelReminder('cropOfTheDay');
      lastScheduledDailyReminderAtRef.current = null;
      lastScheduledCropReminderAtRef.current = null;
      return;
    }

    const now = Date.now();

    // Daily bonus: fire when the 24h cooldown expires. While never-claimed or
    // already-claimable, there is nothing to wait for, so cancel any pending one.
    const dailyReadyAt = getDailyBonusReminderAt(gameState.dailyBonusState, now);
    if (dailyReadyAt == null) {
      void notifications.cancelReminder('dailyBonus');
      lastScheduledDailyReminderAtRef.current = null;
    } else if (lastScheduledDailyReminderAtRef.current !== dailyReadyAt) {
      // Guard OS registration + analytics on the stable dailyReadyAt (cooldown
      // expiry), not the floored dailyReminderAtMs, and keep the notifee schedule
      // inside the guard so it isn't re-registered on every 250ms tick (#363).
      // Mirrors the crop_of_the_day pattern below.
      lastScheduledDailyReminderAtRef.current = dailyReadyAt;
      const dailyReminderAtMs = Math.max(dailyReadyAt, now + HARVEST_NOTIFICATION_MIN_LEAD_MS);
      void notifications.scheduleReminder('dailyBonus', {
        readyAtMs: dailyReminderAtMs,
        title: messages.dailyBonusReminderNotificationTitle,
        body: messages.dailyBonusReminderNotificationBody,
      });
      farmAnalytics.trackNotificationScheduled({
        kind: 'daily_bonus',
        leadTimeMs: Math.max(0, dailyReminderAtMs - now),
        context: analyticsContext(),
      });
    }

    // Crop of the day: a single nudge when the next daily window opens (UTC
    // midnight). One per day keeps it from being intrusive. Only (re)schedule
    // when the target time actually changes — this effect depends on the whole
    // gameState and re-runs on every tick, so an unconditional call would churn
    // notifee with a redundant cancel+create even though windowEndAt is stable.
    // Toggle-off resets the ref in the cancel branch above (daily 분기와 일관).
    const cropReminderAtMs = Math.max(
      getCropOfTheDayStatus(now).windowEndAt,
      now + HARVEST_NOTIFICATION_MIN_LEAD_MS
    );
    if (lastScheduledCropReminderAtRef.current !== cropReminderAtMs) {
      lastScheduledCropReminderAtRef.current = cropReminderAtMs;
      void notifications.scheduleReminder('cropOfTheDay', {
        readyAtMs: cropReminderAtMs,
        title: messages.cropOfTheDayReminderNotificationTitle,
        body: messages.cropOfTheDayReminderNotificationBody,
      });
      farmAnalytics.trackNotificationScheduled({
        kind: 'crop_of_the_day',
        leadTimeMs: Math.max(0, cropReminderAtMs - now),
        context: analyticsContext(),
      });
    }
  }, [
    analyticsContext,
    farmAnalytics,
    gameSettings.comebackRemindersEnabled,
    gameState,
    isSaveLoaded,
    isSettingsLoaded,
    messages.cropOfTheDayReminderNotificationBody,
    messages.cropOfTheDayReminderNotificationTitle,
    messages.dailyBonusReminderNotificationBody,
    messages.dailyBonusReminderNotificationTitle,
    notifications,
  ]);

  useEffect(() => {
    void audio.setBackgroundMusicEnabled(gameSettings.backgroundMusicEnabled && audio.isSupported);

    return () => {
      void audio.setBackgroundMusicEnabled(false);
    };
  }, [audio, gameSettings.backgroundMusicEnabled]);

  useEffect(() => {
    if (!isSaveLoaded || gameStartTrackedRef.current) {
      return;
    }

    gameStartTrackedRef.current = true;
    const context = analyticsContext();
    farmAnalytics.trackGameStart(context);
    farmAnalytics.trackFarmScreen(context);
    toast(messages.saveLoadedToast);
  }, [analyticsContext, isSaveLoaded, messages.saveLoadedToast, toast]);

  useEffect(() => {
    if (activeSheet?.type !== 'resetConfirm') {
      setResetConfirmText('');
    }
  }, [activeSheet]);

  useEffect(() => {
    // analyticsContext는 [gameState] 의존이라 gameState 변경마다 identity가 바뀐다.
    // 이 effect의 deps에 넣으면 시트가 열린 동안 gameState 갱신마다 재실행되어
    // impression이 재발화되므로, deps에서 제외하고 stable ref로 최신 컨텍스트를 만든다.
    const buildContext = analyticsContextRef.current;

    // welcomeBack(offlineBonus)은 시트 타입 전이 가드와 별개로 capturedAt 가드로
    // 중복을 막는다. ad 지원 여부가 늦게 확정될 수 있어(타입 전이 없이 deps만 변경)
    // 타입 전이 가드보다 먼저, 독립적으로 평가한다.
    if (
      activeSheet?.type === 'welcomeBack' &&
      activeSheet.summary.offlineGold > 0 &&
      rewardedAd.isAdSupported &&
      offlineBonusImpressionAtRef.current !== activeSheet.summary.capturedAt &&
      buildContext != null
    ) {
      offlineBonusImpressionAtRef.current = activeSheet.summary.capturedAt;
      farmAnalytics.trackAdRewardImpression(
        'offlineBonusAd',
        getRewardedAdPlacement('offlineBonusAd'),
        buildContext()
      );
    }

    // 시트 타입 전이당 1회만 발화. 같은 시트가 열린 채 재실행되면 여기서 종료한다.
    // 시트를 닫았다(null 등 다른 타입)가 다시 열면 타입이 바뀌므로 다시 1회 발화한다.
    const sheetType = activeSheet?.type ?? null;
    if (sheetImpressionTypeRef.current === sheetType) {
      return;
    }
    sheetImpressionTypeRef.current = sheetType;
    if (buildContext == null) {
      return;
    }

    if (activeSheet?.type === 'shop') {
      const context = buildContext();
      farmAnalytics.trackAdRewardImpression('rewardedGold', getRewardedAdPlacement('rewardedGold'), context);
      farmAnalytics.trackAdRewardImpression('plotDiscountAd', getRewardedAdPlacement('plotDiscountAd'), context);
    }
    if (activeSheet?.type === 'growthAd') {
      farmAnalytics.trackAdRewardImpression('growthAd', getRewardedAdPlacement('growthAd'), buildContext());
    }
    if (activeSheet?.type === 'harvestBonus') {
      farmAnalytics.trackAdRewardImpression('harvestBonusAd', getRewardedAdPlacement('harvestBonusAd'), buildContext());
    }
    if (activeSheet?.type === 'collection') {
      farmAnalytics.trackCollectionScreen(buildContext());
    }
  }, [activeSheet, rewardedAd.isAdSupported, farmAnalytics]);

  // 보상형 광고 CTA가 노출되는 시트가 열릴 때 아직 로드되지 않았다면 재로드를 킥해
  // 클릭 시점 미로드로 인한 실패(#374)를 줄인다. 이미 준비됐거나 미지원이면 no-op이고,
  // 로드가 끝나 isAdReady가 true로 뒤집히면 가드에 걸려 반복 킥하지 않는다.
  useEffect(() => {
    const sheetType = activeSheet?.type;
    const isAdBearingSheet =
      sheetType === 'shop' ||
      sheetType === 'growthAd' ||
      sheetType === 'harvestBonus' ||
      sheetType === 'welcomeBack' ||
      sheetType === 'wheel';
    if (isAdBearingSheet && rewardedAd.isAdSupported && !rewardedAd.isAdReady) {
      rewardedAd.reloadAd?.();
    }
  }, [activeSheet?.type, rewardedAd.isAdSupported, rewardedAd.isAdReady]);

  useEffect(() => {
    const id = setInterval(() => {
      tickNowMsRef.current = Date.now();
      setTick((value) => (value + 1) % 1_000_000);
    }, GAME_TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Time-of-day backdrop. The 250ms game tick (the `tick` state) already
  // re-renders this component, so each render reads the current local
  // minute-of-day and memoizes the tone on the integer minute — the background
  // color recomputes at most once per minute (no extra interval, no per-tick
  // churn) and shifts gradually across day/dusk/night.
  const minutesOfDay = getLocalMinutesOfDay(new Date());
  const environmentTone = useMemo(() => getEnvironmentTone(minutesOfDay), [minutesOfDay]);

  // Header stats show the full modifier stack (upgrades, mastery-independent
  // prestige skills, region scaling) so the display matches the actual math;
  // the ad boost stays on its own line.
  const globalModifiers = useMemo(() => getGlobalModifiers(gameState), [gameState]);
  const activeFarmOfflineGoldPerHour = useMemo(
    () => getActiveFarmOfflineGoldPerHour(gameState),
    [gameState]
  );
  const researchLevel = useMemo(
    () => getMinUpgradeLevel(gameState),
    [gameState.upgrades.profit, gameState.upgrades.speed]
  );
  const visibleCropKeys = useMemo(
    () =>
      isAreaUnlocked(gameState, selectedArea)
        ? (Object.keys(CROPS) as CropKey[]).filter((key) => getCrop(key).area === selectedArea)
        : [],
    [gameState, selectedArea]
  );
  // #274 대표 씨앗(바로 시작 CTA): 잠긴 구역·미해금 작물을 제외하고 실제로 심을 수
  // 있는 첫 작물만 고른다. 후보가 없으면 null → CTA 자체를 숨겨(무동작 CTA 방지),
  // "탭해도 아무 일 없는" 정체 유발을 막는다. 선택 구역과 무관하게 전 구역에서
  // 찾으므로 어떤 상태에서도 심기 가능한 씨앗이 있으면 반드시 하나를 고른다.
  const quickStartCropKey = useMemo<CropKey | null>(
    () => getOnboardingCropKey(gameState),
    [gameState]
  );
  const areaCropCounts = useMemo(() => {
    return FARM_AREAS.reduce(
      (acc, area) => {
        acc[area.key] = (Object.keys(CROPS) as CropKey[]).filter((key) => getCrop(key).area === area.key).length;
        return acc;
      },
      {} as Record<AreaKey, number>
    );
  }, []);
  const collectionSummary = useMemo(() => getCollectionSummary(gameState), [gameState]);
  const farmRecordStats = useMemo<FarmRecordStats>(
    () => ({
      totalHarvests: gameState.lifetimeStats.totalHarvests,
      cropAndIdleGoldEarned: gameState.lifetimeStats.totalGoldEarned,
      mutationHarvests: gameState.lifetimeStats.mutationsFound,
      prestigeCount: gameState.lifetimeStats.prestigeCount,
      researchPointsEarned: gameState.research.totalPointsEarned,
      breedsUnlocked: gameState.lifetimeStats.breedsUnlocked,
      collectionDiscoveredCount: collectionSummary.discoveredCount,
      collectionTotalCount: collectionSummary.totalCount,
    }),
    [
      gameState.lifetimeStats,
      gameState.research.totalPointsEarned,
      collectionSummary.discoveredCount,
      collectionSummary.totalCount,
    ]
  );
  const claimableCollectionCount = collectionSummary.claimableCount;
  const claimableAchievementCount = useMemo(() => getClaimableAchievementCount(gameState), [gameState]);
  // Daily-mission badge: how many of today's missions are completed and waiting to
  // be claimed. Recomputed on every state change; the date only flips at midnight.
  const missionClaimableCount = useMemo(
    () =>
      getDailyMissionsSnapshot(
        gameState.dailyMissionState,
        Date.now(),
        gameState.unlockedAreas,
        undefined,
        rewardedAd.isAdSupported
      ).missions.filter((mission) => mission.claimable).length +
      getWeeklyMissionsSnapshot(
        gameState.weeklyMissionState,
        Date.now(),
        gameState.unlockedAreas,
        undefined,
        rewardedAd.isAdSupported
      ).missions.filter((mission) => mission.claimable).length,
    [gameState, rewardedAd.isAdSupported]
  );
  const labActionableCount = useMemo(
    () =>
      RESEARCH_NODES.filter((node) => canUnlockNode(gameState, node.key)).length +
      BREEDING_RECIPES.filter((recipe) => getBreedingRecipeStatus(gameState, recipe).breedable).length,
    [gameState]
  );
  // 마지막으로 Lab을 연 이후 새로 생긴 해금 기회가 있을 때만 배지를 띄운다. 사용자가 RP를
  // 모으려고 일부러 미루는 경우 매번 조르지 않도록, 확인한 기회는 다시 표시하지 않는다.
  const hasUnseenLabOpportunity = useMemo(() => hasUnseenResearchOpportunity(gameState), [gameState]);
  const labBadgeCount = hasUnseenLabOpportunity ? labActionableCount : 0;
  const selectedAreaLabel = getLocalizedAreaLabel(selectedArea);
  const selectedAreaUnlocked = isAreaUnlocked(gameState, selectedArea);
  const rewardedGoldLimit = useMemo(
    () => getRewardedAdLimitStatus(gameState, 'rewardedGold', Date.now(), locale),
    [gameState, locale, tick]
  );
  // The shop gold-reward item is gated by rewardedGoldLimit; the plot-discount
  // item by its own daily-capped plotDiscountLimit (defined below). The badge
  // lights up when either reward is currently available.
  const plotDiscountLimit = useMemo(
    () => getRewardedAdLimitStatus(gameState, 'plotDiscountAd', Date.now(), locale),
    [gameState, locale, tick]
  );
  const plotDiscountAvailable =
    plotDiscountLimit.allowed && gameState.unlockedPlotCount < MAX_PLOTS;
  const shopAdBadgeCount =
    rewardedAd.isAdSupported && rewardedAd.isAdReady && (rewardedGoldLimit.allowed || plotDiscountAvailable)
      ? 1
      : 0;
  const upgradeReadyCount =
    (gameState.gold >= getUpgradeCost('speed', gameState.upgrades.speed) ? 1 : 0) +
    (gameState.gold >= getUpgradeCost('profit', gameState.upgrades.profit) ? 1 : 0);
  const shopBadgeCount = shopAdBadgeCount + upgradeReadyCount;
  const growthAdLimit = useMemo(
    () => getRewardedAdLimitStatus(gameState, 'growthAd', Date.now(), locale),
    [gameState, locale, tick]
  );
  const harvestBonusAdLimit = useMemo(
    () => getRewardedAdLimitStatus(gameState, 'harvestBonusAd', Date.now(), locale),
    [gameState, locale, tick]
  );
  const offlineBonusAdLimit = useMemo(
    () => getRewardedAdLimitStatus(gameState, 'offlineBonusAd', Date.now(), locale),
    [gameState, locale, tick]
  );
  const wheelBonusAdLimit = useMemo(
    () => getRewardedAdLimitStatus(gameState, 'wheelBonusAd', Date.now(), locale),
    [gameState, locale, tick]
  );
  const harvestBonusBoost = useMemo(() => getHarvestBonusBoostStatus(gameState), [gameState, tick]);
  const cropOfTheDay = useMemo(
    () => getCropOfTheDayStatus(tickNowMsRef.current, gameState),
    [tick, gameState]
  );
  const weeklyEvent = useMemo(
    () => getWeeklyEventStatus(tickNowMsRef.current, gameState.unlockedAreas),
    [tick, gameState.unlockedAreas]
  );
  const weeklyEventPresentation = getWeeklyEventPresentation(messages, weeklyEvent.typeKey, weeklyEvent.axis);
  const rawBoostRemainingMs = harvestBonusBoost.remainingMs;
  const safeBoostRemainingMs = Number.isFinite(rawBoostRemainingMs) ? Math.max(0, rawBoostRemainingMs) : 0;
  const farmProductivity = useMemo(
    () => getFarmHourlyProductivity(gameState),
    [gameState, harvestBonusBoost.multiplier]
  );
  const cropEconomyByKey = useMemo(
    () =>
      (Object.keys(CROPS) as CropKey[]).reduce(
        (acc, cropKey) => {
          const modifiers = getCropModifiers(gameState, cropKey);
          acc[cropKey] = getCropEconomyEstimate(cropKey, {
            speedMultiplier: modifiers.speedMultiplier,
            profitMultiplier: modifiers.profitMultiplier,
            harvestMultiplier: modifiers.harvestMultiplier,
            costMultiplier: modifiers.cropCostMultiplier,
          });
          return acc;
        },
        {} as Record<CropKey, CropEconomyEstimate>
      ),
    [gameState, harvestBonusBoost.multiplier]
  );
  // Seed-strip display order for the selected area. Pure sort in farm-core; the
  // profit key comes from the already-computed, modifier-aware economy map.
  const sortedCropKeys = useMemo(
    () =>
      sortCropKeysForStrip(
        visibleCropKeys,
        seedSortMode,
        (cropKey) => cropEconomyByKey[cropKey]?.netProfitPerHour ?? 0
      ),
    [visibleCropKeys, seedSortMode, cropEconomyByKey]
  );
  const readyPlotCount = useMemo(() => getReadyPlotCount(gameState), [gameState]);
  // Plant-all affordance for the currently selected crop tool: how many empty
  // plots could be sown and the gold it costs. 'harvest' yields zeros so the
  // button stays hidden. Recomputed each tick so gold/plot changes stay live.
  const plantAllPreview = useMemo(
    () =>
      selectedTool !== 'harvest'
        ? getPlantAllPreview(gameState, selectedTool, tickNowMsRef.current)
        : { plantableCount: 0, totalCost: 0, emptyPlotCount: 0 },
    [gameState, selectedTool, tick]
  );
  // Blocks a second "Harvest All" tap until the in-flight batch finishes; the
  // command drain effect releases it after each attempt (success or no-op).
  const harvestAllInFlightRef = useRef(false);
  const collectAllReadyInFlightRef = useRef({ animals: false, workshop: false });
  // 비료 성공 부수효과(토스트·시트 닫힘)를 시트 1회 오픈당 한 번만 발화하게 하는
  // 가드. 시트가 열릴 때 false로 리셋한다(#227 리뷰).
  const fertilizeGuardRef = useRef(false);
  // 전체 비료(#359) 노출/라벨용 프리뷰. plantAllPreview와 동일하게 tick마다 재계산한다.
  const fertilizeAllPreview = useMemo(
    () => previewFertilizeAll(gameState, tickNowMsRef.current),
    [gameState, tick]
  );
  // 2탭 확인의 "확인 대기" 상태. 핸들러 분기는 ref(동기, 더블탭 경쟁 방지)로 판정하고,
  // state는 버튼 라벨 재렌더용으로만 미러링한다.
  const fertilizeAllArmedRef = useRef(false);
  const [fertilizeAllArmed, setFertilizeAllArmed] = useState(false);
  const fertilizeAllDisarmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 언마운트 시 확인 자동해제 타이머를 정리한다(리크 방지).
  useEffect(() => {
    return () => {
      if (fertilizeAllDisarmTimerRef.current != null) {
        clearTimeout(fertilizeAllDisarmTimerRef.current);
      }
    };
  }, []);
  // 익은 작물 summary 중복 방지 상태(plotId → 집계한 심기 인스턴스 startTime).
  // 250ms 틱 루프가 setGameState 커밋 전에 다시 돌아 같은 익음을 반복 집계하던 문제
  // (#266)를 막는다. ref로 보관해 렌더 간 유지하면서 즉시 갱신한다.
  const cropReadyLogStateRef = useRef<CropReadyLogState>({});
  const chainIncome = useMemo(() => getChainIncome(gameState), [gameState, tick]);
  const purchasablePrestigeSkillCount = useMemo(
    () =>
      PRESTIGE_SKILLS.filter((skill) => {
        const cost = getSkillCost(gameState, skill.key);
        return cost != null && gameState.prestige.stars >= cost;
      }).length,
    [gameState]
  );
  const mapActionableCount = useMemo(
    () =>
      (chainIncome.accruedGold > 0 ? 1 : 0) +
      (canPrestige(gameState).allowed ? 1 : 0) +
      purchasablePrestigeSkillCount,
    [chainIncome.accruedGold, gameState, purchasablePrestigeSkillCount]
  );
  const nextAreaGoal = useMemo(() => getNextAreaGoal(gameState), [gameState]);

  useEffect(() => {
    const now = Date.now();
    let next = gameState;

    let growthUpdated = false;
    // 심기 인스턴스당 1회만 집계되도록, 이번 틱에 새로 익은 plot.id 집합을 먼저 구한다.
    // (커밋 지연으로 같은 익음이 여러 틱 반복 집계되는 것을 방지 — #266)
    const newlyReadyPlotIds = new Set(collectNewlyReadyPlotIds(next, cropReadyLogStateRef.current, now));
    const newlyReadySummaryEntries: CropReadySummaryEntry[] = [];
    const grownPlots = next.plots.map((plot) => {
      if (plot.id >= next.unlockedPlotCount) {
        return plot;
      }
      if (plot.cropType == null || !isPlotGrowthComplete(next, plot, now)) {
        return plot;
      }
      const crop = getCrop(plot.cropType);
      growthUpdated = true;
      if (newlyReadyPlotIds.has(plot.id)) {
        newlyReadySummaryEntries.push({ cropKey: plot.cropType, areaKey: crop.area, cropTier: crop.tier });
      }
      return { ...plot, state: 2 as const };
    });
    cropReadySummaryRef.current = accumulateCropReadySummary(
      cropReadySummaryRef.current,
      newlyReadySummaryEntries,
      now,
    );
    if (growthUpdated) {
      next = { ...next, plots: grownPlots };
    }

    // Automation shares the manual harvest pipeline but stays silent: no
    // toast/vibration/sound, and no per-crop analytics from the tick loop.
    const automation = runAutomationTick(next, { now });
    const summary = autoHarvestSummaryRef.current;
    if (automation.harvestedCount > 0) {
      next = automation.state;
      if (summary.harvestedCount === 0 && summary.replantedCount === 0) {
        // First accumulation opens a fresh batching window.
        summary.windowStartedAt = now;
      }
      summary.harvestedCount += automation.harvestedCount;
      summary.replantedCount += automation.replantedCount;
    }
    // Flush is decoupled from harvest occurrence so a pending batch still goes
    // out (one interval later) when automation stops harvesting or is toggled
    // off mid-window.
    if (summary.harvestedCount > 0 && now - summary.windowStartedAt >= AUTO_HARVEST_SUMMARY_INTERVAL_MS) {
      farmAnalytics.trackAutoHarvestSummary({
        harvestedCount: summary.harvestedCount,
        replantedCount: summary.replantedCount,
        context: analyticsContext(),
      });
      autoHarvestSummaryRef.current = { harvestedCount: 0, replantedCount: 0, windowStartedAt: now };
    }
    if (isCropReadySummaryDue(cropReadySummaryRef.current, now, CROP_READY_SUMMARY_INTERVAL_MS)) {
      flushCropReadySummary(analyticsContext(next), now);
    }

    if (next !== gameState) {
      setGameState(() => next);
    }
  }, [analyticsContext, flushCropReadySummary, gameState, tick]);

  function openShop() {
    setShopTab('expand');
    setActiveSheet({ type: 'shop' });
  }

  function openCollection() {
    setActiveSheet({ type: 'collection' });
  }

  function claimCollectionRewardByKey(rewardKey: CollectionRewardKey) {
    // A fast double tap re-enters with the same (pre-render) gameState, so guard
    // synchronously: the gold is already idempotent inside the updater, but the
    // toast/analytics side-effects below must fire exactly once per claim.
    if (claimedRewardKeysRef.current.has(rewardKey)) {
      return;
    }
    const preview = claimCollectionReward(gameState, rewardKey);
    if (preview == null) {
      return;
    }
    claimedRewardKeysRef.current.add(rewardKey);
    setGameState((state) => claimCollectionReward(state, rewardKey)?.state ?? state);
    farmAnalytics.trackCollectionRewardClaimed({
      rewardKey,
      rewardValue: preview.awardedGold,
      context: analyticsContext(),
    });
    toast(messages.collectionRewardClaimedToast(formatMoney(preview.awardedGold, locale)));
    triggerHaptic(50);
    pulseGold();
    playSoundEffect('reward');
  }

  function openAchievements() {
    setActiveSheet({ type: 'achievements' });
  }

  function openMissions() {
    setActiveSheet({ type: 'missions' });
  }

  // navRow 과밀 정리(#241): 상시 진입점을 상점·미션 2개로 줄이고, 나머지(룰렛·도감·
  // 연구소·개척·업적)는 '더보기' 시트 한 뎁스 뒤로 묶는다. 각 항목의 배지는 유실되지
  // 않도록 더보기 버튼에 롤업 합산(moreRollupBadge)으로 노출한다.
  function openMore() {
    setActiveSheet({ type: 'more' });
  }

  function openDailyBonus(source: DailyBonusSource) {
    if (!isDailyBonusAvailable(gameState.dailyBonusState, Date.now())) {
      return;
    }
    setActiveSheet({ type: 'dailyBonus', source });
  }

  // 오늘의 작물 chip 탭 → 보조 지표를 모은 '농장 현황' 시트를 연다(#233). 새 navRow
  // 진입점을 늘리지 않고 기존 chip 하나로만 진입한다.
  function openStats() {
    setActiveSheet({ type: 'stats' });
  }

  // Spin result/animation state lives inside WheelSheet and resets on mount, so
  // reopening the wheel always starts from the spin prompt (or the cooldown
  // message), never a stale reward.
  function openWheel() {
    setActiveSheet({ type: 'wheel' });
  }

  async function spinWheelWithAd(): Promise<WheelReward | null> {
    if (wheelBonusSpinInFlightRef.current) {
      return null;
    }
    const requestedAt = Date.now();
    const requestedState = gameStateRef.current;
    if (!getWheelStatus(requestedState.wheelState, requestedAt).canBonusSpin) {
      return null;
    }

    // Reserve one eligible spin and its roll before opening the SDK. The native
    // ad can cross the daily reset boundary; earned must still commit the exact
    // entitlement the player started, instead of showing a reward animation
    // after a fresh-day recheck silently rejects the state transition.
    const roll = Math.random();
    const preview = spinBonusWheel(
      requestedState.wheelState,
      getRewardedGoldAmount(requestedState),
      requestedAt,
      () => roll
    );
    if (preview == null) {
      return null;
    }

    wheelBonusSpinInFlightRef.current = true;
    try {
      const earned = await showRewardedAd('wheelBonusAd', 1, () => undefined, {
        keepSheetOnFailure: true,
        keepSheetOnSuccess: true,
        applyRewardState: (state, rewardedAt) => {
          const committedResult = {
            reward: preview.reward,
            newState: {
              ...preview.newState,
              // Cooldown starts when the SDK confirms the reward. The count's
              // day remains the request day, so crossing 04:00 does not consume
              // the new day's bonus allowance before its free spin.
              lastBonusSpinAt: rewardedAt,
            },
          };
          return applyWheelReward(state, committedResult, rewardedAt);
        },
      });
      if (!earned) {
        return null;
      }
      playSoundEffect('wheelSpin');
      return preview.reward;
    } finally {
      wheelBonusSpinInFlightRef.current = false;
    }
  }

  // 동물 사육 시트('더보기' 뒤). 축사 건설/급여/수확은 모두 core의 순수 함수에
  // 위임하고, 여기서는 상태 반영과 토스트/펄스만 담당한다. 각 액션은 functional
  // updater 안에서 재검증해 이중 차감/이중 수확을 막는다.
  function openAnimals() {
    setActiveSheet({ type: 'animals' });
  }

  function buyAnimal(key: AnimalKey) {
    setGameState((state) => {
      const next = purchaseAnimal(state, key);
      if (next == null) {
        toast(messages.insufficientGoldToast);
        return state;
      }
      toast(messages.animalBuiltToast(getAnimalLabel(key, locale).name));
      return next;
    });
  }

  function feedAnimalNow(key: AnimalKey) {
    setGameState((state) => {
      const next = feedAnimal(state, key, Date.now());
      if (next == null) {
        toast(messages.insufficientGoldToast);
        return state;
      }
      toast(messages.animalFedToast(getAnimalLabel(key, locale).name));
      return next;
    });
  }

  function collectAnimalProduce(key: AnimalKey) {
    setGameState((state) => {
      const next = collectProduce(state, key, Date.now());
      if (next == null) {
        return state;
      }
      pulseGold();
      toast(messages.animalCollectedToast(getAnimalLabel(key, locale).name));
      return next;
    });
  }

  function collectAllReadyItems(surface: 'animals' | 'workshop') {
    if (collectAllReadyInFlightRef.current[surface]) {
      return;
    }

    collectAllReadyInFlightRef.current[surface] = true;
    const now = Date.now();
    const effectId = ++commandEffectIdRef.current;
    setGameState((state) => {
      const result =
        surface === 'animals' ? collectAllReadyProduce(state, now) : collectAllReadyCrafts(state, now);
      // The synchronous in-flight ref keeps a second press out of this setter.
      // React may still replay one functional updater in development, so the
      // operation ID is deduped against both queued and already-drained effects.
      if (
        !handledCommandEffectIdsRef.current.has(effectId) &&
        !pendingCommandEffectsRef.current.some((effect) => effect.id === effectId)
      ) {
        pendingCommandEffectsRef.current.push({
          id: effectId,
          type: 'readyItemsCollected',
          surface,
          collectedCount: result.collectedCount,
          totalGold: result.totalGold,
        });
      }
      return result.collectedCount > 0 ? result.state : state;
    });
    setCommandEffectVersion((version) => version + 1);
  }

  function collectAllAnimalProduce() {
    collectAllReadyItems('animals');
  }

  // 생산 가공 공방 시트('더보기' 뒤). 가공 시작/수집은 core 순수 함수에 위임하고,
  // functional updater 안에서 재검증해 이중 차감/이중 수집을 막는다.
  function openWorkshop() {
    setActiveSheet({ type: 'workshop' });
  }

  function startCraftNow(key: ProductionRecipeKey) {
    setGameState((state) => {
      const next = startCraft(state, key, Date.now());
      if (next == null) {
        toast(messages.workshopNeedIngredientsToast);
        return state;
      }
      toast(messages.workshopStartedToast(getProductionRecipeLabel(key, locale).name));
      return next;
    });
  }

  function collectCraftNow(key: ProductionRecipeKey) {
    setGameState((state) => {
      const next = collectCraft(state, key, Date.now());
      if (next == null) {
        return state;
      }
      pulseGold();
      toast(messages.workshopCollectedToast(getProductionRecipeLabel(key, locale).name));
      return next;
    });
  }

  function cancelCraftNow(key: ProductionRecipeKey) {
    const now = Date.now();
    setGameState((state) => {
      const next = cancelCraft(state, key, now);
      if (next == null) {
        return state;
      }
      toast(messages.workshopCanceledToast(getProductionRecipeLabel(key, locale).name));
      return next;
    });
  }

  function collectAllCrafts() {
    collectAllReadyItems('workshop');
  }

  function claimMissionReward(slot: number) {
    const now = Date.now();
    // Functional updater keeps the claim idempotent: a concurrent second tap
    // evaluates claimMission against the already-updated state, gets null, and
    // leaves gold untouched. The reward is read from the holder for the toast.
    const rewardHolder: { gold: number | null } = { gold: null };
    setGameState((prev) => {
      const beforeGold = prev.gold;
      // 진행도 스케일 광고 보상을 주입해 시트 표시 금액과 동일한 스케일로 지급한다.
      const next = claimMission(prev, slot, now, getRewardedGoldAmount(prev), rewardedAd.isAdSupported);
      if (next == null) {
        return prev;
      }
      rewardHolder.gold = next.gold - beforeGold;
      return next;
    });
    if (rewardHolder.gold != null) {
      toast(messages.missionClaimedToast(formatMoney(rewardHolder.gold, locale)));
    }
  }

  function claimWeeklyMissionReward(slot: number) {
    const now = Date.now();
    // Same idempotent functional-updater pattern as the daily claim: a concurrent
    // second tap evaluates claimWeeklyMission against the already-updated state,
    // gets null, and leaves gold untouched. The reward is read for the toast.
    const rewardHolder: { gold: number | null } = { gold: null };
    setGameState((prev) => {
      const beforeGold = prev.gold;
      // 일일 미션 수령과 동일하게 진행도 스케일 광고 보상을 주입한다.
      const next = claimWeeklyMission(prev, slot, now, getRewardedGoldAmount(prev), rewardedAd.isAdSupported);
      if (next == null) {
        return prev;
      }
      rewardHolder.gold = next.gold - beforeGold;
      return next;
    });
    if (rewardHolder.gold != null) {
      toast(messages.missionClaimedToast(formatMoney(rewardHolder.gold, locale)));
    }
  }

  function claimAchievement(trackKey: AchievementTrackKey) {
    if (achievementClaimInFlightRef.current) {
      return;
    }
    achievementClaimInFlightRef.current = true;
    const effectId = ++commandEffectIdRef.current;
    setGameState((state) => {
      const result = claimNextAchievementTier(state, trackKey);
      if (!pendingCommandEffectsRef.current.some((effect) => effect.id === effectId)) {
        pendingCommandEffectsRef.current.push({
          id: effectId,
          type: 'achievementsClaimed',
          mode: 'single',
          claims:
            result == null
              ? []
              : [{ trackKey, tier: result.claimedTier, starsAwarded: result.starsAwarded }],
        });
      }
      return result?.state ?? state;
    });
    setCommandEffectVersion((version) => version + 1);
  }

  function claimAllAchievementRewards() {
    if (achievementClaimInFlightRef.current) {
      return;
    }
    achievementClaimInFlightRef.current = true;
    const effectId = ++commandEffectIdRef.current;
    setGameState((state) => {
      const result = claimAllAchievements(state);
      if (!pendingCommandEffectsRef.current.some((effect) => effect.id === effectId)) {
        pendingCommandEffectsRef.current.push({
          id: effectId,
          type: 'achievementsClaimed',
          mode: 'all',
          claims: result.claims,
        });
      }
      return result.state;
    });
    setCommandEffectVersion((version) => version + 1);
  }

  function selectTitle(titleKey: TitleKey | null) {
    // setActiveTitle ignores locked titles; only toast when the change is real.
    if (titleKey != null && !isTitleUnlocked(gameState, titleKey)) {
      return;
    }
    setGameState((state) => setActiveTitle(state, titleKey));
    toast(
      titleKey == null
        ? messages.titleUnequippedToast
        : messages.titleEquippedToast(getTitleLabel(titleKey, locale).name)
    );
  }

  function openLab() {
    // Lab을 여는 순간 현재 해금 기회를 "확인됨"으로 표시해 진입 유도 배지를 해제한다.
    setGameState((state) => acknowledgeResearchOpportunities(state));
    setActiveSheet({ type: 'lab' });
  }

  // #367 딥 기능 코치마크를 확인됨으로 저장(어느 버튼을 눌러도 1회성 플래그가 켜져 재노출
  // 되지 않는다).
  function dismissFeatureCoachmark(key: FeatureCoachmarkKey) {
    setGameState((state) => markFeatureCoachmarkSeen(state, key));
  }

  // '보러가기': 확인됨으로 저장하고 해당 기능의 시트를 연다(교배는 연구소 시트 안에 있다).
  function openFeatureCoachmark(key: FeatureCoachmarkKey) {
    dismissFeatureCoachmark(key);
    switch (key) {
      case 'animals':
        openAnimals();
        break;
      case 'workshop':
        openWorkshop();
        break;
      case 'lab':
      case 'breeding':
        openLab();
        break;
      case 'chain':
        openMap();
        break;
    }
  }

  function toggleAutomation(key: keyof GameState['automationSettings']) {
    setGameState((state) => ({
      ...state,
      automationSettings: { ...state.automationSettings, [key]: !state.automationSettings[key] },
    }));
  }

  function unlockResearchNode(nodeKey: ResearchNodeKey) {
    if (!canUnlockNode(gameState, nodeKey)) {
      toast(messages.insufficientRpToast);
      return;
    }
    setGameState((state) => unlockNode(state, nodeKey) ?? state);
    farmAnalytics.trackResearchNodeUnlocked({ nodeKey, context: analyticsContext() });
    playSoundEffect('unlock');
    toast(messages.researchNodeUnlockedToast(getResearchNodeLabel(nodeKey, locale).name));
  }

  function breedHybrid(cropKey: CropKey) {
    if (breedCrop(gameState, cropKey) == null) {
      toast(messages.insufficientRpToast);
      return;
    }
    setGameState((state) => breedCrop(state, cropKey) ?? state);
    farmAnalytics.trackBreedUnlocked({ cropKey, context: analyticsContext() });
    toast(messages.bredToast(getLocalizedCropName(cropKey)));
  }

  function openMap() {
    setActiveSheet({ type: 'map' });
  }

  function collectChain() {
    const now = Date.now();
    const collected = collectChainIncome(gameState, now);
    if (collected == null) {
      return;
    }
    setGameState((state) => collectChainIncome(state, now)?.state ?? state);
    farmAnalytics.trackChainCollected({
      collectedGold: collected.collectedGold,
      farmCount: gameState.chainFarms.length,
      context: analyticsContext(),
    });
    toast(messages.chainCollectedToast(formatMoney(collected.collectedGold, locale)));
  }

  // Reserves one immutable welcome-back snapshot before any state transition or
  // side effect. Amounts come from the card's capture instant, not live plot
  // phases. During a rewarded request only its earned callback may reserve it.
  function reserveReturnSummary(summary: ReturnSummary, allowDuringOfflineBonusAd = false) {
    if (offlineBonusAdInFlightRef.current && !allowDuringOfflineBonusAd) {
      return false;
    }
    if (completedReturnSummaryAtRef.current === summary.capturedAt) {
      return false;
    }
    completedReturnSummaryAtRef.current = summary.capturedAt;

    farmAnalytics.trackReturnSummaryCollected({
      awayMs: summary.awayMs,
      offlineGold: summary.offlineGold,
      readyCropCount: summary.readyCropCount,
      context: analyticsContext(),
    });

    if (summary.chainGold > 0) {
      farmAnalytics.trackChainCollected({
        collectedGold: summary.chainGold,
        farmCount: gameState.chainFarms.length,
        context: analyticsContext(),
      });
      toast(messages.chainCollectedToast(formatMoney(summary.chainGold, locale)));
    }
    return true;
  }

  // Default 1× settlement. The synchronous reservation prevents rapid native
  // taps and implicit-close races from claiming the same snapshot twice.
  function collectReturnSummaryOffline(summary: ReturnSummary) {
    if (!reserveReturnSummary(summary)) {
      return false;
    }
    if (summary.offlineGold > 0) {
      setGameState((state) => collectReturnSummaryOfflineGold(state, summary).state);
    }
    return true;
  }

  function dismissWelcomeBack(summary: ReturnSummary) {
    if (!collectReturnSummaryOffline(summary)) {
      return;
    }
    setActiveSheet(null);
    void maybeShowReturnAd();
  }

  // The return timestamp is committed as soon as the saved game loads. Settle
  // the recap before navigating away from it so a direct ranch/workshop CTA
  // cannot discard accrued offline gold for that already-consumed window.
  function openReturnReadySheet(summary: ReturnSummary, target: 'animals' | 'workshop') {
    if (!collectReturnSummaryOffline(summary)) {
      return;
    }
    setActiveSheet({ type: target });
  }

  function openPrestigeConfirm() {
    setActiveSheet({ type: 'prestigeConfirm' });
  }

  function confirmPrestige(productivitySnapshotAt: number) {
    const now = Date.now();
    const guardLevel = gameState.prestige.level;
    if (prestigedLevelsRef.current.has(guardLevel)) {
      return;
    }
    const result = prestigeFarm(gameState, prestigeArchetype, now, productivitySnapshotAt);
    if (result == null) {
      setActiveSheet(null);
      return;
    }
    flushManualHarvestCombo('prestige');
    flushCropReadySummary();
    cropReadyLogStateRef.current = {};
    prestigedLevelsRef.current.add(guardLevel);
    // First graduation (level 0 → 1) and guide not yet seen: queue the one-time
    // chain-income guide to appear once the graduation celebration clears.
    if (guardLevel === 0 && !gameState.prestigeGuideSeen) {
      prestigeGuidePendingRef.current = true;
    }
    // Drop any pending auto-harvest batch so old-farm counts never flush
    // under the new farm's analytics context.
    autoHarvestSummaryRef.current = { harvestedCount: 0, replantedCount: 0, windowStartedAt: 0 };
    if (comboTimerRef.current != null) {
      clearTimeout(comboTimerRef.current);
      comboTimerRef.current = null;
    }
    setHarvestCombo(0);
    setGameState((state) => prestigeFarm(state, prestigeArchetype, now, productivitySnapshotAt)?.state ?? state);
    setSelectedArea(FIRST_AREA.key);
    setSelectedTool('harvest');
    setActiveSheet(null);
    farmAnalytics.trackPrestige({
      archetype: prestigeArchetype,
      starsAwarded: result.starsAwarded,
      chainGoldPerHour: result.chainFarm.goldPerHour,
      context: analyticsContext(),
    });
    showPrestigeGraduation({
      regionIcon: REGION_ARCHETYPES.find((a) => a.key === prestigeArchetype)?.icon ?? '🏁',
      regionName: getRegionArchetypeLabel(prestigeArchetype, locale).name,
      starsAwarded: result.starsAwarded,
    });
  }

  // Closes the first-graduation guide and persists the flag so it never returns.
  function dismissPrestigeGuide() {
    setPrestigeGuide(false);
    setGameState((state) => (state.prestigeGuideSeen ? state : { ...state, prestigeGuideSeen: true }));
  }

  function purchaseSkill(skillKey: PrestigeSkillKey) {
    if (buySkill(gameState, skillKey) == null) {
      toast(messages.insufficientStarsToast);
      return;
    }
    setGameState((state) => buySkill(state, skillKey) ?? state);
    farmAnalytics.trackPrestigeSkillPurchased({
      skillKey,
      nextLevel: (gameState.prestige.skills[skillKey] ?? 0) + 1,
      context: analyticsContext(),
    });
    toast(messages.skillPurchasedToast(getPrestigeSkillLabel(skillKey, locale).name));
  }

  function openSettings() {
    setActiveSheet({ type: 'settings' });
  }

  function openResetConfirm() {
    setResetConfirmText('');
    setActiveSheet({ type: 'resetConfirm' });
  }

  function updateGameSettings(nextSettings: Partial<FarmGameSettings>) {
    setGameSettings((settings) => normalizeFarmGameSettings({ ...settings, ...nextSettings }));
  }

  async function toggleHarvestNotifications() {
    if (gameSettings.harvestNotificationsEnabled) {
      updateGameSettings({ harvestNotificationsEnabled: false });
      await notifications.cancelHarvestReady();
      return;
    }

    if (!notifications.isSupported) {
      toast(messages.notificationUnsupportedDesc);
      return;
    }

    const granted = await notifications.requestPermission();
    if (!granted) {
      toast(messages.notificationPermissionDeniedToast);
      return;
    }

    updateGameSettings({ harvestNotificationsEnabled: true });
  }

  async function toggleComebackReminders() {
    if (gameSettings.comebackRemindersEnabled) {
      updateGameSettings({ comebackRemindersEnabled: false });
      await notifications.cancelReminder('dailyBonus');
      await notifications.cancelReminder('cropOfTheDay');
      return;
    }

    if (!notifications.isSupported) {
      toast(messages.notificationUnsupportedDesc);
      return;
    }

    const granted = await notifications.requestPermission();
    if (!granted) {
      toast(messages.notificationPermissionDeniedToast);
      return;
    }

    updateGameSettings({ comebackRemindersEnabled: true });
  }

  // Permanently record the prompt as seen so it never reappears (the settings
  // toggle stays available either way).
  function markHarvestNotificationPromptSeen() {
    setGameState((state) =>
      state.harvestNotificationPromptSeen ? state : { ...state, harvestNotificationPromptSeen: true }
    );
  }

  async function acceptNotificationPrompt(generation: number) {
    if (activeNotificationPromptGenerationRef.current !== generation) {
      return;
    }
    activeNotificationPromptGenerationRef.current = null;
    setNotificationPromptGeneration(null);
    markHarvestNotificationPromptSeen();
    if (!notifications.isSupported) return;
    const granted = await notifications.requestPermission();
    if (!granted) {
      toast(messages.notificationPermissionDeniedToast);
      return;
    }
    // The education prompt explicitly covers both categories. Persist them
    // together, while Settings keeps the two toggles independently reversible.
    updateGameSettings({
      harvestNotificationsEnabled: true,
      comebackRemindersEnabled: true,
    });
  }

  // Dismissing with "Maybe later" also retires the prompt for good, keeping the
  // decline/re-ask behavior consistent.
  function declineNotificationPrompt(generation: number) {
    if (activeNotificationPromptGenerationRef.current !== generation) {
      return;
    }
    activeNotificationPromptGenerationRef.current = null;
    setNotificationPromptGeneration(null);
    markHarvestNotificationPromptSeen();
  }

  function selectArea(area: AreaKey) {
    setSelectedArea(area);
    if (selectedTool !== 'harvest' && getCrop(selectedTool).area !== area) {
      setSelectedTool('harvest');
    }
  }

  function selectCrop(cropKey: CropKey) {
    const crop = getCrop(cropKey);
    if (!isAreaUnlocked(gameState, crop.area)) {
      toast(messages.lockedCropToast);
      return;
    }
    if (!isCropPlantable(gameState, cropKey)) {
      toast(messages.breedRequiredToast);
      return;
    }
    // During the first instruction, only an affordable seed may advance the
    // guide to "plant". Regular play still allows preselecting expensive seeds,
    // but doing so here would strand a new player on an impossible next action.
    // Rather than a bare rejection toast, steer the eye to the affordable seed:
    // switch to its area (so it's visible in the strip) and fire the emphasis
    // burst (#362). We still keep the toast so the reason for the redirect reads.
    if (
      onboardingStepRef.current === 'selectSeed' &&
      gameState.gold < getCropPurchaseCost(gameState, cropKey, Date.now())
    ) {
      toast(messages.insufficientGoldToast);
      const nudge = resolveUnaffordableSeedNudge(gameState, cropKey, 'selectSeed', Date.now());
      if (nudge != null) {
        setSelectedArea(getCrop(nudge.cropKey).area);
        playSeedNudgeBurst();
      }
      return;
    }

    const isFirstSeedSelection = !firstSeedSelectedRef.current;
    firstSeedSelectedRef.current = true;
    farmAnalytics.trackSeedSelected(cropKey, crop.area, isFirstSeedSelection, analyticsContext());
    setSelectedArea(crop.area);
    setSelectedTool(cropKey);
  }

  // #274: selectSeed 코치마크 "바로 시작" — 심을 수 있는 대표 씨앗을 자동 선택한다.
  // selectCrop을 그대로 태우므로 first_seed_selected 계측과 씨앗 선택 상태 세팅이
  // 직접 선택과 동일하게 일어나고, 이어서 진행 이펙트가 selectSeed→plant로 넘겨
  // onboarding_step_view(step=plant)까지 한 번에 발화한다. quickStartCropKey는 이미
  // 해금·심기 가능 작물만 담으므로 selectCrop이 거절(잠김/미해금)로 no-op되지 않는다.
  function quickStartOnboarding() {
    if (quickStartCropKey == null) {
      return;
    }
    selectCrop(quickStartCropKey);
  }

  async function showRewardedAd(
    type: RewardedAdType,
    rewardValue: number,
    onReward: () => void,
    options: {
      keepSheetOnFailure?: boolean;
      keepSheetOnSuccess?: boolean;
      applyRewardState?: (state: GameState, rewardedAt: number) => GameState;
    } = {}
  ) {
    // Tag the whole funnel with the type's canonical placement so blocked/click/
    // completed/failed all aggregate per placement (single source of truth).
    const placement = getRewardedAdPlacement(type);
    const limit = getRewardedAdLimitStatus(gameState, type, Date.now(), locale);
    if (!limit.allowed) {
      farmAnalytics.trackAdLimitBlocked(type, placement, limit.reason, analyticsContext());
      toast(limit.reason);
      return false;
    }

    if (!rewardedAd.isAdReady) {
      farmAnalytics.trackAdRewardFailed(
        type,
        placement,
        rewardedAd.isAdSupported ? 'not_ready' : 'unsupported',
        analyticsContext()
      );
      toast(rewardedAd.isAdSupported ? messages.adPreparingToast : messages.adUnsupportedToast);
      return false;
    }

    farmAnalytics.trackAdRewardClick(type, placement, analyticsContext());
    const attemptShow = async (): Promise<RewardedAdShowResult> => {
      try {
        return await rewardedAd.showAd();
      } catch {
        // showAd 자체가 throw하면 실패 결과로 정규화해 재시도·최종 실패 처리를
        // 한 경로로 통일한다(reason은 최후 fallback show_ad_threw).
        return { status: 'failed', error: 'show_ad_threw' };
      }
    };

    let result = await attemptShow();
    // show 실패(notReady/failed) 시 컨트롤러 재로드 후 1회만 재시도한다(#374 AC3).
    // reloadAd는 로드 완료를 기다렸다 resolve하므로, 그 뒤 showAd는 최신 로드 상태를
    // 읽는다. reloadAd 미지원 컨트롤러(unsupported·일부 목)는 재시도 없이 그대로 실패.
    if (shouldRetryRewardedShow(result) && rewardedAd.reloadAd) {
      try {
        await rewardedAd.reloadAd();
      } catch {
        // 재로드 실패는 최초 결과를 유지한 채 재시도만 진행한다(무한 재시도 금지).
      }
      result = await attemptShow();
    }

    if (result.status === 'earned') {
      const rewardedAt = Date.now();
      if (!options.keepSheetOnSuccess) {
        setActiveSheet(null);
      }
      onReward();
      farmAnalytics.trackAdRewardCompleted({
        type,
        placement,
        rewardValue,
        context: analyticsContext(),
      });
      setGameState((state) => {
        const rewardedState = options.applyRewardState?.(state, rewardedAt) ?? state;
        return {
          ...rewardedState,
          adUsage: recordRewardedAdUsage(rewardedState, type, rewardedAt),
          // Any rewarded-ad view counts toward the "watch an ad" daily + weekly mission.
          dailyMissionState: recordAdWatchProgress(
            rewardedState.dailyMissionState,
            rewardedAt,
            rewardedState.unlockedAreas
          ),
          weeklyMissionState: recordWeeklyAdWatchProgress(
            rewardedState.weeklyMissionState,
            rewardedAt,
            rewardedState.unlockedAreas
          ),
        };
      });
      return true;
    }

    if (!options.keepSheetOnFailure) {
      setActiveSheet(null);
    }
    farmAnalytics.trackAdRewardFailed(type, placement, getAdFailureReason(result), analyticsContext());
    toast(result.status === 'dismissed' ? messages.adDismissedToast : messages.adFailedToast);

    return false;
  }

  async function maybeShowMilestoneAd() {
    if (!interstitialAd.isAdReady) {
      return;
    }

    const now = Date.now();
    if (now - lastInterstitialShownAtRef.current < getAdLimits().interstitialMilestoneCooldownMs) {
      return;
    }

    lastInterstitialShownAtRef.current = now;
    await interstitialAd.showAd();
  }

  // A non-intrusive interstitial on session return, shown after the player has
  // collected their welcome-back recap. Skipped during the first session /
  // onboarding, when no ad is ready, or while the persisted return cooldown is
  // still active, so returning players see it at most once per cooldown window.
  async function maybeShowReturnAd() {
    if (onboardingStep != null) {
      return;
    }
    if (!interstitialAd.isAdReady) {
      return;
    }
    const now = Date.now();
    // Decide and record against the freshest state inside the updater: the
    // welcome-back dismiss just queued a state change, so the closure gameState
    // is stale. Gating + stamping atomically keeps the persisted cooldown honest
    // (a stale snapshot can't replay the ad or reset returnInterstitialAt).
    // willShow carries the decision out to the side effect below.
    let willShow = false;
    setGameState((state) => {
      if (!state.onboardingCompleted || !canShowReturnInterstitial(state, now)) {
        return state;
      }
      willShow = true;
      return { ...state, adUsage: recordReturnInterstitial(state, now) };
    });
    if (!willShow) {
      return;
    }
    farmAnalytics.trackInterstitialShown('return_welcome_back', analyticsContext());
    await interstitialAd.showAd();
    // Stamp the shared milestone throttle only after the ad actually played, so a
    // milestone interstitial doesn't immediately stack on top of this one — and a
    // return ad that never showed never suppresses the milestone slot.
    lastInterstitialShownAtRef.current = Date.now();
  }

  async function rewardReturnOfflineGoldFromAd(summary: ReturnSummary) {
    if (
      summary.offlineGold <= 0 ||
      offlineBonusAdInFlightRef.current ||
      completedReturnSummaryAtRef.current === summary.capturedAt
    ) {
      return;
    }

    offlineBonusAdInFlightRef.current = true;
    let rewardReserved = false;
    try {
      await showRewardedAd(
        'offlineBonusAd',
        // Match the existing rewarded-ad contract: reward_value is the result
        // presented after completion (the total 2× payout for this placement).
        summary.offlineGold * OFFLINE_BONUS_MULTIPLIER,
        () => {
          rewardReserved = reserveReturnSummary(summary, true);
          if (!rewardReserved) return;
          pulseGold();
          toast(messages.welcomeBackDoubleAdToast(formatMoney(summary.offlineGold, locale)));
        },
        {
          // A dismissed/failed ad must leave the recap and its guaranteed 1×
          // claim intact. Only an earned result closes the sheet.
          keepSheetOnFailure: true,
          // Base payout + bonus, ad usage, and ad-mission progress are committed
          // by showRewardedAd in one functional updater on the freshest state.
          applyRewardState: (state) =>
            rewardReserved
              ? collectReturnSummaryOfflineGoldWithAdBonus(state, summary).state
              : state,
        }
      );
    } finally {
      offlineBonusAdInFlightRef.current = false;
    }
  }

  async function rewardGoldFromAd() {
    const amount = getRewardedGoldAmount(gameState);
    await showRewardedAd('rewardedGold', amount, () => {
      setGameState((state) => ({ ...state, gold: state.gold + amount }));
      toast(messages.receivedGoldToast(formatMoney(amount, locale)));
    });
  }

  async function rewardDiscountedPlotFromAd() {
    if (gameState.unlockedPlotCount >= MAX_PLOTS) {
      toast(messages.allPlotsUnlockedToast);
      return;
    }

    // The ad no longer hands out a free plot; it discounts the next plot's gold
    // price. The player still pays (reduced) gold, so the plot sink is preserved.
    // Capacity is checked up front so we never burn the daily-limited ad on a
    // purchase the player can't afford.
    const discountedCost = getDiscountedPlotCost(gameState.unlockedPlotCount);
    if (gameState.gold < discountedCost) {
      toast(messages.insufficientGoldToast);
      return;
    }

    await showRewardedAd('plotDiscountAd', discountedCost, () => {
      setGameState((state) => {
        const cost = getDiscountedPlotCost(state.unlockedPlotCount);
        if (state.unlockedPlotCount >= MAX_PLOTS || state.gold < cost) {
          return state;
        }
        farmAnalytics.trackPlotUnlocked({
          method: 'ad',
          cost,
          nextPlotCount: state.unlockedPlotCount + 1,
          context: analyticsContext(state),
        });
        return { ...state, gold: state.gold - cost, unlockedPlotCount: state.unlockedPlotCount + 1 };
      });
      toast(messages.rewardedPlotToast(formatMoney(discountedCost, locale)));
    });
  }

  async function confirmReset() {
    if (resetConfirmText !== resetConfirmValue) {
      toast(messages.resetInputRequiredToast(resetConfirmValue));
      return;
    }
    await persistence.removePersistedGameState();
    // removePersistedGameState is async; flush only after it settles so ticks
    // during the await cannot leave old-farm buckets for the reset state.
    flushManualHarvestCombo('reset');
    flushCropReadySummary();
    cropReadyLogStateRef.current = {};
    claimedRewardKeysRef.current.clear();
    achievementClaimInFlightRef.current = false;
    prestigedLevelsRef.current.clear();
    autoHarvestSummaryRef.current = { harvestedCount: 0, replantedCount: 0, windowStartedAt: 0 };
    if (comboTimerRef.current != null) {
      clearTimeout(comboTimerRef.current);
      comboTimerRef.current = null;
    }
    setHarvestCombo(0);
    const resetState = createInitialState();
    deferredOnboardingSheetRef.current = previewDailyBonus(
      resetState.dailyBonusState,
      Date.now(),
      getRewardedGoldAmount(resetState)
    ).available
      ? { type: 'dailyBonus', source: 'auto_popup' }
      : null;
    onboardingStepViewedRef.current = null;
    onboardingFinishCommittedRef.current = false;
    notificationPromptResolvedRef.current = false;
    activeNotificationPromptGenerationRef.current = null;
    setNotificationPromptGeneration(null);
    setOnboardingStep(null);
    setGameState(resetState);
    setSelectedArea(FIRST_AREA.key);
    setSelectedTool('harvest');
    setActiveSheet(null);
    toast(messages.resetDoneToast);
  }

  function cloudBackupOutcomeMessage(status: FarmCloudSaveBackupOutcome['status']) {
    switch (status) {
      case 'backed_up':
        return messages.cloudBackupDoneToast;
      case 'disabled':
        return messages.cloudSaveDisabledToast;
      case 'signed_out':
        return messages.cloudSaveSignedOutToast;
      default:
        return messages.cloudSaveErrorToast;
    }
  }

  function cloudRestoreOutcomeMessage(status: FarmCloudSaveRestoreOutcome['status']) {
    switch (status) {
      case 'restored':
        return messages.cloudRestoreDoneToast;
      case 'missing':
        return messages.cloudRestoreMissingToast;
      case 'invalid':
        return messages.cloudRestoreInvalidToast;
      case 'disabled':
        return messages.cloudSaveDisabledToast;
      case 'signed_out':
        return messages.cloudSaveSignedOutToast;
      default:
        return messages.cloudSaveErrorToast;
    }
  }

  async function backupToCloud() {
    if (cloudSaveBusy) {
      return;
    }
    setCloudSaveBusy(true);
    setCloudSaveNotice(messages.cloudBackupInProgress);
    try {
      const outcome = await cloudSave.backupNow(gameState);
      const notice = cloudBackupOutcomeMessage(outcome.status);
      setCloudSaveNotice(notice);
      toast(notice);
    } finally {
      setCloudSaveBusy(false);
    }
  }

  async function restoreFromCloud() {
    if (cloudSaveBusy) {
      return;
    }
    setCloudSaveBusy(true);
    setCloudSaveNotice(messages.cloudRestoreInProgress);
    try {
      const outcome = await cloudSave.restoreFromCloud();
      if (outcome.status === 'restored') {
        flushManualHarvestCombo('cloud_restore');
        flushCropReadySummary();
        cropReadyLogStateRef.current = {};
        // The cloud payload may come from an older app version, so run it through
        // the same migration/normalization as the load path before showing it.
        const restored = migrateLoadedState(outcome.gameState, createInitialState());
        const normalizedRestored: GameState = {
          ...restored,
          dailyBonusState: normalizeDailyBonusState(restored.dailyBonusState as unknown),
        };
        setGameState(normalizedRestored);
        deferredOnboardingSheetRef.current =
          !normalizedRestored.onboardingCompleted &&
          previewDailyBonus(
            normalizedRestored.dailyBonusState,
            Date.now(),
            getRewardedGoldAmount(normalizedRestored)
          ).available
            ? { type: 'dailyBonus', source: 'auto_popup' }
            : null;
        onboardingStepViewedRef.current = null;
        onboardingFinishCommittedRef.current = false;
        notificationPromptResolvedRef.current = normalizedRestored.harvestNotificationPromptSeen;
        activeNotificationPromptGenerationRef.current = null;
        setNotificationPromptGeneration(null);
        setOnboardingStep(null);
        setSelectedArea(FIRST_AREA.key);
        setSelectedTool('harvest');
        if (!normalizedRestored.onboardingCompleted) {
          setActiveSheet(null);
        }
      }
      const notice = cloudRestoreOutcomeMessage(outcome.status);
      setCloudSaveNotice(notice);
      toast(notice);
    } finally {
      setCloudSaveBusy(false);
    }
  }

  function plantCrop(index: number, cropKey: CropKey) {
    const now = Date.now();
    const effectId = ++commandEffectIdRef.current;
    setGameState((state) => {
      const result = executeFarmGameCommand(
        state,
        { type: 'plantCrop', plotIndex: index, cropKey },
        { now, rng: Math.random }
      );

      if (result.status === 'blocked') {
        pendingCommandEffectsRef.current.push({ id: effectId, type: 'plantBlocked', reason: result.reason });
        return state;
      }
      const event = result.events[0];
      if (event?.type === 'cropPlanted') {
        pendingCommandEffectsRef.current.push({ id: effectId, type: 'cropPlanted', event });
      }
      return result.state;
    });
    setCommandEffectVersion((version) => version + 1);
  }

  function harvestCrop(index: number) {
    const now = Date.now();
    const effectId = ++commandEffectIdRef.current;
    setGameState((state) => {
      const roll = Math.random();
      const result = executeFarmGameCommand(
        state,
        { type: 'harvestCrop', plotIndex: index },
        { now, rng: () => roll }
      );
      if (result.status === 'blocked') {
        return state;
      }
      const event = result.events[0];
      if (event?.type === 'cropHarvested') {
        pendingCommandEffectsRef.current.push({
          id: effectId,
          type: 'cropHarvested',
          event,
          now,
          shouldShowHarvestBonusNudge:
            rewardedAd.isAdReady &&
            getRewardedAdLimitStatus(result.state, 'harvestBonusAd', now).allowed &&
            getHarvestBonusPromptStatus(result.state, now).allowed &&
            !event.boostActive,
        });
      }
      return result.state;
    });
    setCommandEffectVersion((version) => version + 1);
  }

  function harvestAllCrops() {
    // Re-entry guard: a fast double-tap before the batch re-renders (and the
    // button disappears) would otherwise replay the feedback. The drain effect
    // clears the flag after every attempt, so the next ripe set stays harvestable.
    if (harvestAllInFlightRef.current) {
      return;
    }

    const now = Date.now();
    const effectId = ++commandEffectIdRef.current;
    // One stable roll per plot index — not a flat sequence. Built outside the
    // updater so a StrictMode double-invoke reuses the same rolls, and keyed by
    // index so a plot's outcome never shifts with the surrounding ripe set.
    const rollByPlot: Record<number, number> = {};
    const rollFor = (plotIndex: number) => {
      const existing = rollByPlot[plotIndex];
      if (existing != null) {
        return existing;
      }
      const roll = Math.random();
      rollByPlot[plotIndex] = roll;
      return roll;
    };

    harvestAllInFlightRef.current = true;
    setGameState((state) => {
      // Compute on the authoritative committed state and queue the feedback from
      // here, so the FX/toast/analytics always reflect exactly what was harvested
      // even if a concurrent tick shifted the ripe set after this tap.
      const result = performHarvestAll(state, { now, rollFor });
      enqueueHarvestAllFeedback(result, effectId);
      return result.harvestedCount > 0 ? result.state : state;
    });
    setCommandEffectVersion((version) => version + 1);
  }

  // Queues the batched "Harvest All" feedback (floating gold per plot, mutation
  // flash, rank-ups, first-harvest aha) for a computed HarvestAllResult. Shared by
  // plain Harvest All and Harvest-then-Replant (#252) so both drive identical FX.
  function enqueueHarvestAllFeedback(result: HarvestAllResult, effectId: number, replantedCount = 0) {
    // Guard the queue against a StrictMode/concurrent double-invoke of the updater:
    // keep at most one effect per id. (The drain loop also dedupes by id, so
    // feedback never doubles either way — this just keeps the queue clean.)
    if (pendingCommandEffectsRef.current.some((pending) => pending.id === effectId)) {
      return;
    }
    let firstMutationFlash: MutationCelebrationKey | null = null;
    let firstHarvest: { cropIcon: string; goldGained: number } | null = null;
    const rankUps: { cropKey: CropKey; rankKey: MasteryRankKey; rankIcon: string }[] = [];
    for (const { outcome } of result.harvests) {
      const mk = outcome.mutation?.key;
      firstMutationFlash = selectRarestMutationFlash(firstMutationFlash, mk);
      if (outcome.isFirstMeaningfulHarvest) {
        firstHarvest = { cropIcon: getCrop(outcome.cropKey).icon, goldGained: outcome.goldGained };
      }
      if (outcome.newMasteryRank != null) {
        rankUps.push({
          cropKey: outcome.cropKey,
          rankKey: outcome.newMasteryRank.key,
          rankIcon: outcome.newMasteryRank.icon,
        });
      }
    }
    pendingCommandEffectsRef.current.push({
      id: effectId,
      type: 'harvestedAll',
      fx: result.harvests.map(({ plotIndex, outcome }) => {
        const mk = outcome.mutation?.key;
        const tone: HarvestPop['tone'] = isMutationCelebrationKey(mk)
          ? mk
          : outcome.mutation != null || outcome.newMasteryRank != null || outcome.boostActive
            ? 'special'
            : 'normal';
        return { plotIndex, goldGained: outcome.goldGained, tone };
      }),
      rankUps,
      firstMutationFlash,
      firstHarvest,
      totalGoldGained: result.totalGoldGained,
      totalRpGained: result.totalRpGained,
      harvestedCount: result.harvestedCount,
      specialCount: result.specialCount,
      replantedCount,
    });
  }

  // "Harvest then Replant" (#252): harvest every ripe plot and immediately re-sow
  // the freed plots with the selected crop (or, when the harvest tool is active,
  // the crop that was just growing) in one tap — removing the harvest→plant 2-tap
  // friction of the idle/return loop. Reuses the pure performHarvestAndReplant, so
  // gold-limited partial replant and all harvest side effects match the manual path.
  function harvestAllAndReplant() {
    if (harvestAllInFlightRef.current) {
      return;
    }
    // Replant crop: the selected seed, or — when the harvest tool is active — the
    // crop of the first ripe plot ("what was just growing"). Null only if nothing
    // is ripe (then it degrades to a plain Harvest All via the pure function).
    const replantCropKey: CropKey | null =
      selectedTool !== 'harvest'
        ? selectedTool
        : (gameState.plots.find((plot) => plot.id < gameState.unlockedPlotCount && plot.state === 2)?.cropType ??
          null);

    const now = Date.now();
    const effectId = ++commandEffectIdRef.current;
    const rollByPlot: Record<number, number> = {};
    const rollFor = (plotIndex: number) => {
      const existing = rollByPlot[plotIndex];
      if (existing != null) {
        return existing;
      }
      const roll = Math.random();
      rollByPlot[plotIndex] = roll;
      return roll;
    };

    harvestAllInFlightRef.current = true;
    setGameState((state) => {
      // No crop to replant (harvest tool + nothing ripe resolved): fall back to a
      // plain harvest so the tap is never a no-op when plots are ripe.
      if (replantCropKey == null) {
        const harvest = performHarvestAll(state, { now, rollFor });
        enqueueHarvestAllFeedback(harvest, effectId);
        return harvest.harvestedCount > 0 ? harvest.state : state;
      }
      const result = performHarvestAndReplant(state, replantCropKey, { now, rollFor });
      enqueueHarvestAllFeedback(result.harvest, effectId, result.plantedCount);
      return result.harvest.harvestedCount > 0 ? result.state : state;
    });
    setCommandEffectVersion((version) => version + 1);
  }

  // Manual "Plant All": sow the selected crop into every empty unlocked plot up to
  // the gold limit, in one tap. Planting has no random outcome, so (unlike Harvest
  // All) the feedback is computed from the current state and fired once for the
  // whole batch — a sprout pop per filled plot, but a single haptic and toast.
  function plantAllCrops() {
    if (selectedTool === 'harvest') {
      return;
    }
    const cropKey = selectedTool;
    const now = Date.now();
    const preview = getPlantAllPreview(gameState, cropKey, now);
    if (preview.plantableCount === 0) {
      return;
    }
    // The empty unlocked plots performPlantAll will fill, in plot order, up to the
    // affordable count — so the sprout pops land on exactly those tiles.
    const plantedIndices: number[] = [];
    for (
      let index = 0;
      index < gameState.plots.length && plantedIndices.length < preview.plantableCount;
      index += 1
    ) {
      const plot = gameState.plots[index];
      if (plot != null && plot.id < gameState.unlockedPlotCount && plot.state === 0) {
        plantedIndices.push(index);
      }
    }

    setGameState((state) => performPlantAll(state, cropKey, now).state);

    setPlantPulses((prev) => {
      const next = { ...prev };
      for (const index of plantedIndices) {
        plantPulseTokenRef.current += 1;
        next[index] = plantPulseTokenRef.current;
      }
      return next;
    });
    triggerHaptic(15);
    toast(messages.plantedAllToast(preview.plantableCount));
    // Keep the planting funnel accurate: one breadcrumb per seed sown, matching
    // what tapping each plot individually would have logged.
    const crop = getCrop(cropKey);
    const cost = getCropPurchaseCost(gameState, cropKey, now);
    for (let i = 0; i < preview.plantableCount; i += 1) {
      farmAnalytics.trackCropPlanted(cropKey, crop.area, crop.tier, cost, analyticsContext());
    }
  }

  function handlePlotClick(index: number) {
    if (index >= gameState.unlockedPlotCount) {
      openShop();
      return;
    }

    const plot = gameState.plots[index];
    if (plot == null) {
      return;
    }

    if (plot.state === 2) {
      harvestCrop(index);
      return;
    }

    if (selectedTool !== 'harvest') {
      if (plot.state === 0) {
        plantCrop(index, selectedTool);
        return;
      }

      if (plot.state === 1 && plot.cropType != null && plot.startTime != null) {
        const remainingMs = getPlotRemainingGrowthMs(gameState, plot);

        // No upper cap: long-duration crops qualify too and get a partial skip
        // (see applyGrowthAdSkip). The lower bound just avoids an ad for a crop
        // that is about to finish on its own anyway.
        const adPathAvailable = remainingMs >= GROWTH_AD_MIN_REMAINING_MS && rewardedAd.isAdSupported;
        // 골드 비료(#227)는 광고 지원 여부와 무관하게 성장 중이면 항상 가능하므로,
        // 광고 스킵 또는 비료 중 하나라도 가능하면 성장 가속 시트를 연다.
        const fertilizerCost = getFertilizerCost(gameState, plot);
        // 광고 지원 + 일일 한도 도달은 (비료로 시트가 열리든 아니든) 항상 계측한다.
        const adLimitBlocked = adPathAvailable && !growthAdLimit.allowed;
        if (adLimitBlocked) {
          farmAnalytics.trackAdLimitBlocked('growthAd', getRewardedAdPlacement('growthAd'), growthAdLimit.reason, analyticsContext());
        }
        if ((adPathAvailable && growthAdLimit.allowed) || fertilizerCost > 0) {
          // 새 시트 오픈마다 비료 성공 가드를 리셋해 이번 오픈의 적용을 허용한다.
          fertilizeGuardRef.current = false;
          setActiveSheet({
            type: 'growthAd',
            plotIndex: index,
            cropKey: plot.cropType,
            remainingMs,
          });
        } else if (adLimitBlocked) {
          // 시트가 열리지 않는 광고 전용 경로에서만 한도 사유를 토스트로 안내한다
          // (시트가 열리는 경우엔 시트 안 광고 버튼의 비활성 사유 라벨로 노출됨).
          toast(growthAdLimit.reason);
        } else {
          toast(messages.growingToast);
        }
      }
      return;
    }

    if (plot.state === 0) {
      toast(messages.selectSeedToast);
    }
  }

  async function completeGrowthWithAd(plotIndex: number) {
    // Preview the tier from the committed state so the toast can name the amount;
    // the actual mutation runs inside the updater on live state (StrictMode-safe).
    const previewPlot = gameState.plots[plotIndex];
    const previewRemaining = previewPlot != null ? getPlotRemainingGrowthMs(gameState, previewPlot) : 0;
    const previewSkip = getGrowthAdSkipMs(previewRemaining);
    const willComplete = previewSkip >= previewRemaining;
    await showRewardedAd('growthAd', 1, () => {
      setGameState((state) => applyGrowthAdSkip(state, plotIndex).state);
      setActiveSheet(null);
      toast(
        willComplete
          ? messages.growthDoneToast
          : messages.growthSkipToast(formatDuration(previewSkip, locale))
      );
    });
  }

  // 골드 비료(#227): 성장 중 플롯의 남은 성장을 골드로 즉시 완료한다.
  //
  // 상태 갱신과 안내(토스트·시트 닫힘)를 커밋 상태에서 계산한 "단일 결과"에서만
  // 파생시켜, 둘이 서로 어긋날 여지를 없앤다(preview/updater 이중 판정 제거). 적용된
  // 결과 상태를 그대로 setGameState에 넘기므로 토스트가 말하는 차감과 실제 차감이
  // 항상 동일하다. 성공 부수효과는 fertilizeGuardRef로 시트 오픈당 한 번만 발화해
  // 이벤트 재호출/StrictMode에도 중복 알림이 없다(골드/플롯은 결과 상태 1회 반영).
  function applyFertilizerNow(plotIndex: number) {
    const plot = gameState.plots[plotIndex];
    if (plot == null) {
      return;
    }
    // 커밋 상태에서 미리 판정(가격·충분 여부)해 토스트/시트 분기를 정하고, 실제 상태
    // 변경은 아래 함수형 updater가 라이브 상태에서 다시 적용한다(광고 스킵 경로
    // completeGrowthWithAd와 동일한 preview + 함수형 updater 구조). concrete state를
    // 넘기면 그 사이 큐잉된 timer tick의 setGameState를 덮어써 lost update가 나므로,
    // 반드시 (state) => ... updater로 커밋해 항상 최신 base에 한 번만 적용한다.
    const preview = applyFertilizer(gameState, plot.id);
    if (!preview.applied) {
      // 비활성 버튼 우회 호출(a11y/외부 ref) 방어 겸 실패 안내: 골드 부족(cost>0)은
      // 조용히 무시("비활성 버튼은 입력을 받지 않는다"는 UX 약속 유지), cost===0
      // (이미 완료/남은 성장 없음)은 시트를 닫고 완료 안내.
      if (preview.cost <= 0) {
        setActiveSheet(null);
        toast(messages.alreadyGrownToast);
      }
      return;
    }
    if (fertilizeGuardRef.current) {
      return;
    }
    fertilizeGuardRef.current = true;
    setGameState((state) => applyFertilizer(state, plot.id).state);
    setActiveSheet(null);
    toast(messages.fertilizerDoneToast(formatMoney(preview.cost, locale)));
  }

  // 전체 비료(#359) 확인 상태 해제(타이머 정리 포함).
  function disarmFertilizeAll() {
    fertilizeAllArmedRef.current = false;
    setFertilizeAllArmed(false);
    if (fertilizeAllDisarmTimerRef.current != null) {
      clearTimeout(fertilizeAllDisarmTimerRef.current);
      fertilizeAllDisarmTimerRef.current = null;
    }
  }

  // 전체 비료(#359): 성장 중인 밭 전체를 골드로 즉시 완료한다. 큰 지출이므로 1차 탭은
  // 확인 단계(버튼 라벨이 확인 문구로 전환), 2차 탭에서만 실행한다. 실행 시점 커밋
  // 상태로 프리뷰를 다시 계산해 토스트가 말하는 수/골드와 실제 차감을 일치시키고, 실제
  // 상태 변경은 함수형 updater가 라이브 상태에서 한 번만 적용한다(plantAllCrops와 동일).
  function onFertilizeAllPress() {
    const now = Date.now();
    const preview = previewFertilizeAll(gameState, now);
    if (preview.affordableCount < FERTILIZE_ALL_MIN_COUNT) {
      // tick으로 대상이 임계 미만이 되었으면 조용히 확인 해제(경계 상황 방어).
      disarmFertilizeAll();
      return;
    }
    if (!fertilizeAllArmedRef.current) {
      fertilizeAllArmedRef.current = true;
      setFertilizeAllArmed(true);
      if (fertilizeAllDisarmTimerRef.current != null) {
        clearTimeout(fertilizeAllDisarmTimerRef.current);
      }
      fertilizeAllDisarmTimerRef.current = setTimeout(disarmFertilizeAll, FERTILIZE_ALL_CONFIRM_WINDOW_MS);
      return;
    }
    disarmFertilizeAll();
    setGameState((state) => applyFertilizerToAllGrowing(state, now).state);
    triggerHaptic(15);
    toast(
      messages.fertilizeAllDoneToast(preview.affordableCount, formatMoney(preview.totalCost, locale))
    );
  }

  async function activateHarvestBonusWithAd() {
    await showRewardedAd('harvestBonusAd', HARVEST_BONUS_MULTIPLIER, () => {
      setActiveSheet(null);
      toast(
        messages.harvestBonusActivatedToast(
          formatRemainingTime(HARVEST_BONUS_BOOST_DURATION_MS, locale),
          HARVEST_BONUS_MULTIPLIER
        )
      );
    });
  }

  const toolHint = useMemo(() => {
    if (!selectedAreaUnlocked) {
      return messages.lockedAreaHint(
        selectedAreaLabel.name,
        getAreaUnlockRequirementText(gameState, selectedArea, locale)
      );
    }
    if (selectedTool === 'harvest') {
      return messages.harvestHint;
    }
    return messages.plantHint(
      getLocalizedCropName(selectedTool),
      formatMoney(getCropPurchaseCost(gameState, selectedTool), locale),
      formatSignedPercent(getCropEconomy(cropEconomyByKey, selectedTool).roiPercent, locale)
    );
  }, [
    cropEconomyByKey,
    gameState,
    getLocalizedCropName,
    locale,
    messages,
    selectedArea,
    selectedAreaLabel.name,
    selectedAreaUnlocked,
    selectedTool,
  ]);

  // Stable, index-based press handler so memoized PlotCells keep referential
  // equality across the 250ms tick and plant-pulse updates. handlePlotClick
  // closes over fast-changing state, so route through a ref instead of a dep.
  const handlePlotClickRef = useRef(handlePlotClick);
  handlePlotClickRef.current = handlePlotClick;
  const onPlotPress = useCallback((index: number) => handlePlotClickRef.current(index), []);

  // Stable, key-based tool selection so memoized ToolButtons keep referential
  // equality across the 250ms tick. selectCrop closes over fast-changing state,
  // so route through a ref instead of threading it as a useCallback dep.
  const selectToolRef = useRef<(toolKey: ToolKey) => void>(() => undefined);
  selectToolRef.current = (toolKey: ToolKey) => {
    if (toolKey === 'harvest') {
      setSelectedTool('harvest');
      return;
    }
    selectCrop(toolKey);
  };
  const onSelectTool = useCallback((toolKey: ToolKey) => selectToolRef.current(toolKey), []);

  // Recomputed every render tick (250ms) so displayed streak/gold always
  // reflects the current time — matching what claimDailyBonus will award
  // within one tick when the player taps.
  const dailyBonusPreview =
    activeSheet?.type === 'dailyBonus'
      ? previewDailyBonus(gameState.dailyBonusState, Date.now(), getRewardedGoldAmount(gameState))
      : { available: false as const, streak: 1, goldAwarded: 50 };
  // #376 자동 수령 후엔 고정해 둔 수령값을 우선 표시한다. 자동 수령 effect가 실행되기
  // 직전(열람 첫 프레임)엔 dailyBonusClaim이 아직 null이라 preview로 폴백하는데,
  // preview와 claim은 같은 수령 전 상태에 같은 공식을 적용하므로 값이 동일하다.
  const dailyBonusDisplay = dailyBonusClaim ?? {
    streak: dailyBonusPreview.streak,
    goldAwarded: dailyBonusPreview.goldAwarded,
  };
  const dailyBonusAvailable = isDailyBonusAvailable(
    gameState.dailyBonusState,
    tickNowMsRef.current
  );

  // Wheel spin availability for the nav badge. The sheet itself (WheelSheet)
  // recomputes its own status from gameState + now on every render tick.
  const wheelSpinReady = getWheelStatus(gameState.wheelState, tickNowMsRef.current).canSpin;

  // 수확 준비된 동물 수 — '동물' 진입점(및 더보기 롤업) 배지로 노출해 재방문을 유도한다.
  const animalsReadyCount = getAnimalStates(gameState, tickNowMsRef.current).filter(
    (status) => status.phase === 'ready'
  ).length;

  // 수집 준비된 가공품 수 — '공방' 진입점(및 더보기 롤업) 배지로 노출.
  const workshopReadyCount = getProductionStates(gameState, tickNowMsRef.current).filter(
    (status) => status.phase === 'ready'
  ).length;

  // '더보기' 시트로 묶은 진입점(#241, #294). 각 항목의 claimable/actionable 배지를 함께
  // 들고 다녀서, 더보기 버튼에는 롤업 합산 배지를, 시트 안에서는 항목별 배지를 보여준다.
  const moreMenuEntries: {
    key: string;
    label: string;
    accessibilityLabel: string;
    badge: number;
    onPress: () => void;
  }[] = [
    ...(dailyBonusAvailable
      ? [
          {
            key: 'dailyBonus',
            label: messages.dailyBonusButton,
            accessibilityLabel: messages.dailyBonusButtonAccessibilityLabel,
            badge: 1,
            onPress: () => openDailyBonus('more'),
          },
        ]
      : []),
    {
      key: 'wheel',
      label: messages.wheelButton,
      accessibilityLabel: messages.wheelButtonAccessibilityLabel,
      badge: wheelSpinReady ? 1 : 0,
      onPress: openWheel,
    },
    {
      key: 'collection',
      label: messages.collectionButton,
      accessibilityLabel: messages.collectionButtonAccessibilityLabel,
      badge: claimableCollectionCount,
      onPress: openCollection,
    },
    {
      key: 'lab',
      label: messages.labButton,
      accessibilityLabel: messages.labButtonAccessibilityLabel,
      badge: labBadgeCount,
      onPress: openLab,
    },
    {
      key: 'animals',
      label: messages.animalsButton,
      accessibilityLabel: messages.animalsButtonAccessibilityLabel,
      badge: animalsReadyCount,
      onPress: openAnimals,
    },
    {
      key: 'workshop',
      label: messages.workshopButton,
      accessibilityLabel: messages.workshopButtonAccessibilityLabel,
      badge: workshopReadyCount,
      onPress: openWorkshop,
    },
    {
      key: 'map',
      label: messages.mapButton,
      accessibilityLabel: messages.mapButtonAccessibilityLabel,
      badge: mapActionableCount,
      onPress: openMap,
    },
    {
      key: 'achievements',
      label: messages.achievementsButton,
      accessibilityLabel: messages.achievementsButtonAccessibilityLabel,
      badge: claimableAchievementCount,
      onPress: openAchievements,
    },
  ];
  const moreRollupBadge = moreMenuEntries.reduce((sum, entry) => sum + entry.badge, 0);

  // '더보기' 시트 내부 그룹화(#270): 항목을 성격별 섹션으로 묶어 스캔 비용을 낮춘다.
  // 일일 보너스는 수령 가능할 때만 일일 섹션에 추가되고, 항목 배지가 상단에 롤업된다(#294).
  const moreMenuEntryByKey = new Map(moreMenuEntries.map((entry) => [entry.key, entry]));
  const moreMenuSections: { key: string; title: string; entryKeys: string[] }[] = [
    { key: 'daily', title: messages.moreSectionDaily, entryKeys: ['dailyBonus', 'wheel', 'collection'] },
    { key: 'production', title: messages.moreSectionProduction, entryKeys: ['animals', 'workshop'] },
    { key: 'growth', title: messages.moreSectionGrowth, entryKeys: ['lab', 'map', 'achievements'] },
  ];

  // Outline the target the current onboarding step points at to draw the eye.
  const onboardingSeedHighlight = onboardingStep === 'selectSeed';
  const onboardingPlotHighlight = onboardingStep === 'plant' || onboardingStep === 'harvest';

  // #367: 기본 온보딩을 마친 뒤, 다른 오버레이/시트가 떠 있지 않은 메인 화면에서만 딥 기능
  // 코치마크를 1개 노출한다. 가용 판정은 core의 순수 함수라 now에 의존하지 않아 틱마다
  // 흔들리지 않는다. 확인하면 markFeatureCoachmarkSeen로 저장되어 다시 뜨지 않는다.
  const pendingFeatureCoachmark =
    gameState.onboardingCompleted &&
    onboardingStep == null &&
    activeSheet == null &&
    firstHarvestNotice == null &&
    notificationPromptGeneration == null &&
    !prestigeGuide
      ? getPendingFeatureCoachmark(gameState)
      : null;

  return (
    <View testID="farm-root" style={[styles.root, { backgroundColor: environmentTone.backgroundColor }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={[styles.headerTop, isMobileMarket && styles.mobileHeaderTop]}>
          <View testID="title-group" style={[styles.titleGroup, isMobileMarket && styles.mobileTitleGroup]}>
            <Text style={styles.homeIcon}>🏡</Text>
            <View style={styles.titleTextGroup}>
              <Text style={styles.title}>{messages.appTitle}</Text>
              <View style={styles.subtitleRow}>
                <Text style={styles.subtitle}>{messages.appSubtitle}</Text>
                {gameState.activeTitle != null ? (
                  <Text style={styles.titleBadge} numberOfLines={1}>
                    {getTitleLabel(gameState.activeTitle, locale).name}
                  </Text>
                ) : null}
                <Pressable
                  testID="cotd-chip"
                  accessibilityRole="button"
                  accessibilityLabel={`${messages.cropOfTheDayLabel}, ${getLocalizedCropName(cropOfTheDay.cropKey)}`}
                  hitSlop={6}
                  style={styles.cotdChip}
                  onPress={openStats}
                >
                  <Text style={styles.cotdChipText} numberOfLines={1}>
                    🌱 {getCrop(cropOfTheDay.cropKey).icon} {getLocalizedCropName(cropOfTheDay.cropKey)} ×
                    {cropOfTheDay.multiplier} ›
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              testID="prestige-stars-chip"
              accessibilityRole="button"
              accessibilityLabel={messages.prestigeStarsChipAccessibilityLabel(
                gameState.prestige.stars,
                purchasablePrestigeSkillCount
              )}
              hitSlop={6}
              style={({ pressed }) => [styles.starsChip, pressed && styles.starsChipPressed]}
              onPress={openMap}
            >
              <Text style={styles.starsChipText}>★ {gameState.prestige.stars}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={messages.settingsAccessibilityLabel}
              hitSlop={8}
              style={styles.settingsButton}
              onPress={openSettings}
            >
              <Text style={styles.settingsButtonText}>⚙</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.statsPanel}>
          <View style={styles.assetRow}>
            {/* The whole asset block scales as one unit (anchored left so it
                grows into its own space, not into the panel border) for a
                consistent "cha-ching" on harvest. */}
            <Animated.View style={[styles.assetPulse, { transform: [{ scale: goldPulseScale }] }]}>
              <Text style={styles.coinIcon}>💰</Text>
              <View style={styles.assetTextGroup}>
                <Text style={styles.label}>{messages.assetLabel}</Text>
                <Text style={styles.money} numberOfLines={1}>
                  {formatMoney(gameState.gold, locale)}G
                </Text>
              </View>
            </Animated.View>
          </View>
          <View style={styles.summaryColumn}>
            <Text style={styles.productivityText} numberOfLines={1}>
              {messages.productivity(formatHourlyGold(farmProductivity.netProfitPerHour, locale))}
            </Text>
          </View>
        </View>

        {nextAreaGoal != null ? (
          <NextGoalBar
            goal={nextAreaGoal}
            messages={messages}
            locale={locale}
            getAreaName={(areaKey) => getLocalizedAreaLabel(areaKey).name}
            onPress={openShop}
          />
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navRow}>
          <NavButton
            testID="shop-nav-button"
            label={messages.shopButton}
            badge={shopBadgeCount}
            onPress={openShop}
          />
          <NavButton
            label={messages.missionsButton}
            badge={missionClaimableCount}
            accessibilityLabel={messages.missionsButtonAccessibilityLabel}
            onPress={openMissions}
          />
          <NavButton
            testID="more-nav-button"
            label={messages.moreButton}
            badge={moreRollupBadge}
            accessibilityLabel={messages.moreButtonAccessibilityLabel}
            onPress={openMore}
          />
        </ScrollView>
      </View>

      {onboardingStep != null ? (
        <FarmOnboarding
          step={onboardingStep}
          messages={messages}
          onSkip={skipOnboarding}
          onRewardConfirm={completeOnboarding}
          onQuickStart={quickStartCropKey != null ? quickStartOnboarding : undefined}
        />
      ) : null}

      <View testID="farm-stage" style={styles.farmStage}>
        <EnvironmentBackdrop
          phase={environmentTone.phase}
          minutesOfDay={minutesOfDay}
          backgroundColor={environmentTone.backgroundColor}
        />
        <ScrollView
          testID="farm-scroll"
          contentContainerStyle={[styles.mainContent, onboardingStep != null && styles.mainContentOnboarding]}
          style={styles.main}
        >
          <View
            testID="plot-grid-container"
            style={[styles.plotGridContainer, onboardingPlotHighlight && styles.onboardingPlotTint]}
          >
            <View testID="plot-grid" style={styles.plotGrid}>
              {gameState.plots.map((plot, index) => {
                // Resolve growth ratio and countdown together so the crop modifiers
                // are computed once per tile per tick instead of once for each.
                const growth = getPlotGrowthDisplay(gameState, plot);
                const unlocked = index < gameState.unlockedPlotCount;
                // Fabric (New Architecture) fails to commit the conditional child
                // swaps inside PlotCell when a plot transitions (empty→growing→ready
                // or locked→unlocked): the tile background updates but the harvest
                // badge and crop-icon subtrees stay blank, even though the data is
                // correct (harvest still yields gold). Initial mount renders fine, so
                // encoding the render-branch inputs into the key remounts the tile on
                // transition and forces Fabric down the working mount path.
                return (
                  <PlotCell
                    key={`${plot.id}-${unlocked ? 'u' : 'l'}-${plot.state}`}
                    index={index}
                    plot={plot}
                    unlocked={unlocked}
                    progressRatio={growth.growthRatio}
                    growthCountdown={
                      plot.state === 1 ? formatDuration(growth.remainingWallClockMs, locale) : undefined
                    }
                    tileSize={plotTileSize}
                    messages={messages}
                    cropName={plot.cropType != null ? getLocalizedCropName(plot.cropType) : undefined}
                    plantToken={plantPulses[index]}
                    onPlantPulseDone={clearPlantPulse}
                    onPress={onPlotPress}
                  />
                );
              })}
              <HarvestFxOverlay ref={harvestFxRef} tileSize={plotTileSize} />
            </View>
            {onboardingPlotHighlight ? (
              <View
                testID="onboarding-plot-highlight"
                pointerEvents="none"
                style={styles.onboardingPlotHighlight}
              />
            ) : null}
          </View>
          <FarmAnimalStrip
            gameState={gameState}
            now={tickNowMsRef.current}
            messages={messages}
            onPress={openAnimals}
          />
          <FarmDecorationStrip gameState={gameState} />
        </ScrollView>
      </View>

      <View testID="tool-strip" style={[styles.toolStrip, { paddingBottom: bottomSafeInset + 10 }]}>
        {readyPlotCount >= HARVEST_ALL_MIN_COUNT ? (
          // 익은 밭이 다수면 '전체 수확'과 '수확 후 재심기'(#252)를 나란히 제공한다.
          // 배치는 필요할 때만 나타나는 전용 행으로 두어 평상시 세로 공간을 절약한다.
          <View style={styles.toolActionRow}>
            <HarvestAllButton label={messages.harvestAllButton(readyPlotCount)} onPress={harvestAllCrops} />
            <HarvestAllButton
              testID="harvest-replant-button"
              label={messages.harvestReplantButton}
              onPress={harvestAllAndReplant}
            />
          </View>
        ) : selectedTool !== 'harvest' &&
          onboardingStep == null &&
          plantAllPreview.plantableCount > 0 &&
          plantAllPreview.emptyPlotCount >= PLANT_ALL_MIN_COUNT ? (
          <View style={styles.toolActionRow}>
            <HarvestAllButton
              label={messages.plantAllButton(
                plantAllPreview.plantableCount,
                formatMoney(plantAllPreview.totalCost, locale)
              )}
              onPress={plantAllCrops}
            />
          </View>
        ) : null}

        {/* 전체 비료(#359): 성장 중이면서 지금 감당 가능한 밭이 임계 이상일 때만 나타나는
            조건부 행(상시 요소 아님). 1탭 확인 → 2탭 실행으로 큰 골드 지출을 방어한다. */}
        {fertilizeAllPreview.affordableCount >= FERTILIZE_ALL_MIN_COUNT ? (
          <View style={styles.toolActionRow}>
            <HarvestAllButton
              testID="fertilize-all-button"
              label={
                fertilizeAllArmed
                  ? messages.fertilizeAllConfirmButton(
                      fertilizeAllPreview.affordableCount,
                      formatMoney(fertilizeAllPreview.totalCost, locale)
                    )
                  : messages.fertilizeAllButton(
                      fertilizeAllPreview.affordableCount,
                      formatMoney(fertilizeAllPreview.totalCost, locale)
                    )
              }
              onPress={onFertilizeAllPress}
            />
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.areaTabs}>
          {FARM_AREAS.map((area) => {
            const unlocked = isAreaUnlocked(gameState, area.key);
            const active = selectedArea === area.key;
            const areaLabel = getLocalizedAreaLabel(area.key);
            return (
              <Pressable
                key={area.key}
                testID={`area-tab-${area.key}`}
                style={[styles.areaTab, !unlocked && styles.lockedAreaTab, active && styles.activeAreaTab]}
                onPress={() => selectArea(area.key)}
              >
                <Text style={[styles.areaTabName, active && styles.activeAreaTabName]}>
                  {!unlocked ? '🔒 ' : ''}
                  {areaLabel.name}
                </Text>
                <Text style={styles.areaTabCount}>{messages.areaCropCount(areaCropCounts[area.key] ?? 0)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* 선택 도구 안내와 정렬을 같은 행에 두어 정렬 버튼 왼쪽의 빈 면을 정보로 활용한다.
            잠긴 구역/작물 1종인 구역은 정렬 버튼만 숨기고 안내가 전체 폭을 쓴다. */}
        <View testID="seed-meta-row" style={styles.seedMetaRow}>
          <Text style={styles.toolHint} numberOfLines={1}>
            {toolHint}
          </Text>
          {visibleCropKeys.length > 1 ? (
            <Pressable
              testID="seed-sort-toggle"
              style={styles.seedSortToggle}
              onPress={() => setSeedSortMode((mode) => nextSeedSortMode(mode))}
              accessibilityRole="button"
              accessibilityLabel={messages.seedSortAccessibilityLabel}
            >
              <Text style={styles.seedSortToggleText}>
                {messages.seedSortLabel(
                  seedSortMode === 'profit'
                    ? messages.seedSortProfit
                    : seedSortMode === 'growth'
                      ? messages.seedSortGrowth
                      : messages.seedSortDefault
                )}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={onboardingSeedHighlight ? styles.onboardingHighlight : undefined}>
          <ScrollView
            testID="seed-strip-scroll"
            horizontal
            showsHorizontalScrollIndicator
            contentContainerStyle={styles.toolScroll}
          >
            <ToolButton
              active={selectedTool === 'harvest'}
              icon="🖐️"
              name={messages.harvestTool}
              toolKey="harvest"
              onSelect={onSelectTool}
            />
            {sortedCropKeys.map((key) => {
              const crop = getCrop(key);
              const cropCost = getCropPurchaseCost(gameState, key);
              const masteryRank = getMasteryStatus(gameState, key).rank;
              const isNew = !gameState.harvestedCropKeys.includes(key);
              // 판매 보너스 배지(#226): 씨앗을 고르는 시점에서 어떤 작물이 지금
              // 보너스 대상인지 바로 보이도록, HUD 배너와 동일한 순수 함수 결과
              // (cropOfTheDay/weeklyEvent)를 그대로 재사용해 배지 배수를 만든다.
              // memo(ToolButton) 얕은 비교가 깨지지 않도록 배열이 아닌 문자열
              // 프리미티브로 넘긴다. 보너스가 없는 작물은 undefined → 동등 비교.
              const cotdBadge = key === cropOfTheDay.cropKey ? `⭐×${cropOfTheDay.multiplier}` : undefined;
              // 기본 판매 축제는 🎉, 황금 판매 주말은 🪙, 수확 축제는 ⚡ 배지로
              // 같은 axis 안의 typeKey 플레이버까지 구분한다.
              const weeklyBadge =
                weeklyEvent.active && weeklyEvent.cropKeys.includes(key)
                  ? `${weeklyEventPresentation.badgeIcon}×${weeklyEvent.multiplier}`
                  : undefined;
              const bonusA11yParts: string[] = [];
              if (cotdBadge != null) {
                bonusA11yParts.push(`${messages.cropOfTheDayLabel} ×${cropOfTheDay.multiplier}`);
              }
              if (weeklyBadge != null) {
                bonusA11yParts.push(`${weeklyEventPresentation.activeLabel} ×${weeklyEvent.multiplier}`);
              }
              return (
                <ToolButton
                  key={key}
                  testID={`seed-tool-${key}`}
                  active={selectedTool === key}
                  icon={crop.icon}
                  cropKey={key}
                  name={getLocalizedCropName(key)}
                  cost={formatMoney(cropCost, locale)}
                  roi={messages.roi(formatSignedPercent(getCropEconomy(cropEconomyByKey, key).roiPercent, locale))}
                  affordable={gameState.gold >= cropCost}
                  masteryIcon={masteryRank?.icon}
                  isNew={isNew}
                  newLabel={messages.newCropBadge}
                  cotdBadge={cotdBadge}
                  weeklyBadge={weeklyBadge}
                  bonusA11yLabel={bonusA11yParts.length > 0 ? bonusA11yParts.join(', ') : undefined}
                  toolKey={key}
                  onSelect={onSelectTool}
                />
              );
            })}
            {!selectedAreaUnlocked ? (
              <Pressable style={styles.lockedNotice} onPress={openShop}>
                <Text style={styles.lockedNoticeTitle}>{messages.lockedAreaTitle(selectedAreaLabel.name)}</Text>
                <Text style={styles.lockedNoticeDesc} numberOfLines={2}>
                  {getAreaUnlockRequirementText(gameState, selectedArea, locale)}
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>
          {onboardingSeedHighlight ? (
            // Louder green ring whose opacity pulses to draw the eye to the seed
            // strip during the selectSeed step (#159). Sits above the strip but
            // lets taps fall through to the seed buttons underneath.
            <Animated.View
              pointerEvents="none"
              style={[styles.onboardingSeedPulseRing, { opacity: seedHighlightPulse }]}
            />
          ) : null}
          {onboardingSeedHighlight ? (
            // One-shot emphasis burst layered over the ambient ring: a brief
            // brighter flash + slight scale-out fired on stall / unaffordable tap
            // to actively point at the affordable seed (#362).
            <Animated.View
              testID="onboarding-seed-nudge-burst"
              pointerEvents="none"
              style={[
                styles.onboardingSeedNudgeRing,
                {
                  opacity: seedNudgeBurst,
                  transform: [
                    { scale: seedNudgeBurst.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) },
                  ],
                },
              ]}
            />
          ) : null}
        </View>
      </View>

      {toastMessage != null ? (
        <View pointerEvents="none" style={[styles.toast, { bottom: bottomSafeInset + 142 }]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      ) : null}

      <MutationFlashOverlay ref={mutationFlashRef} />

      <DiscoveryBanner
        ref={discoveryBannerRef}
        title={messages.newCropDiscoveryTitle}
        subtitle={messages.newCropDiscoverySubtitle}
        bottomInset={bottomSafeInset}
      />

      {harvestCombo >= 2 ? (
        <View pointerEvents="none" style={styles.comboOverlay}>
          <ComboDisplay count={harvestCombo} messages={messages} />
        </View>
      ) : null}

      <Sheet
        activeSheet={activeSheet}
        description={getSheetDescription(activeSheet, messages, locale, getLocalizedCropName, collectionSummary, dailyBonusDisplay.streak)}
        title={getSheetTitle(activeSheet, messages)}
        closeLabel={messages.sheetCloseAccessibilityLabel}
        bottomInset={bottomSafeInset}
        canClose={() => activeSheet?.type !== 'welcomeBack' || !offlineBonusAdInFlightRef.current}
        onClose={() => {
          if (activeSheet?.type === 'welcomeBack' && !collectReturnSummaryOffline(activeSheet.summary)) {
            return false;
          }
          closeSheet();
          return true;
        }}
      >
        {shouldRenderShopTabBar(activeSheet?.type) ? (
          (() => {
            // #372: 5개 이질 섹션을 4개 탭(확장/업그레이드/꾸미기/보상)으로 분리해
            // 한 탭에 해당 섹션만 렌더한다. 탭 구성·가시성·선택 폴백은 순수 로직
            // (shopTabs)에 위임하고, 여기서는 기존 렌더 블록을 탭별로 재배치만 한다.
            const adSupported = rewardedAd.isAdSupported;
            const visibleShopTabs = getVisibleShopTabs({ adSupported });
            const activeShopTab = resolveActiveShopTab(shopTab, { adSupported });
            const shopTabLabels: Record<ShopTabKey, string> = {
              expand: messages.shopTabExpand,
              upgrade: messages.shopTabUpgrade,
              decorate: messages.shopTabDecorate,
              rewards: messages.shopTabRewards,
            };
            // 탭이 섹션을 뎁스 뒤로 숨기므로, 기존 상점 nav 배지 신호(수령 가능 광고·
            // 구매 가능 업그레이드)를 탭 배지로 보존해 놓치지 않게 한다(getShopTabBadge).
            const shopTabBadgeCounts = { upgradeReadyCount, rewardReadyCount: shopAdBadgeCount };
            return (
              <View>
                <View testID="shop-tab-bar" style={styles.shopTabBar}>
                  {visibleShopTabs.map((key) => {
                    const active = key === activeShopTab;
                    return (
                      <Pressable
                        key={key}
                        testID={`shop-tab-${key}`}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={shopTabLabels[key]}
                        style={[styles.shopTabButton, active && styles.shopTabButtonActive]}
                        onPress={() => setShopTab(key)}
                      >
                        <Text style={[styles.shopTabButtonText, active && styles.shopTabButtonTextActive]}>
                          {shopTabLabels[key]}
                        </Text>
                        {getShopTabBadge(key, shopTabBadgeCounts) > 0 ? (
                          <View style={styles.shopTabBadge}>
                            <Text style={styles.shopTabBadgeText}>{getShopTabBadge(key, shopTabBadgeCounts)}</Text>
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>

                {activeShopTab === 'expand' ? (
                  <View testID="shop-tab-panel-expand">
                    <Text style={styles.sheetSectionTitle}>{messages.territorySection}</Text>
                    <ShopPlotRow
                      gameState={gameState}
                      locale={locale}
                      messages={messages}
                      setGameState={setGameState}
                      getAnalyticsContext={analyticsContext}
                      analytics={farmAnalytics}
                      onDone={toast}
                      onMilestone={() => void maybeShowMilestoneAd()}
                    />

                    <Text style={styles.sheetSectionTitle}>{messages.areaUnlockSection}</Text>
                    <ShopAreaUnlockRows
                      gameState={gameState}
                      locale={locale}
                      messages={messages}
                      setGameState={setGameState}
                      getAnalyticsContext={analyticsContext}
                      analytics={farmAnalytics}
                      onDone={toast}
                      onMilestone={() => void maybeShowMilestoneAd()}
                      onUnlocked={() => playSoundEffect('unlock')}
                    />
                  </View>
                ) : null}

                {activeShopTab === 'upgrade' ? (
                  <View testID="shop-tab-panel-upgrade">
                    <Text style={styles.sheetSectionTitle}>{messages.researchSection}</Text>
                    <Text style={styles.researchSummary}>
                      {messages.researchSummary(researchLevel, gameState.upgrades.speed, gameState.upgrades.profit)}
                    </Text>
                    <ShopUpgradeRow
                      kind="speed"
                      gameState={gameState}
                      locale={locale}
                      messages={messages}
                      setGameState={setGameState}
                      getAnalyticsContext={analyticsContext}
                      analytics={farmAnalytics}
                      onDone={toast}
                      onMilestone={() => void maybeShowMilestoneAd()}
                    />
                    <ShopUpgradeRow
                      kind="profit"
                      gameState={gameState}
                      locale={locale}
                      messages={messages}
                      setGameState={setGameState}
                      getAnalyticsContext={analyticsContext}
                      analytics={farmAnalytics}
                      onDone={toast}
                      onMilestone={() => void maybeShowMilestoneAd()}
                    />
                  </View>
                ) : null}

                {activeShopTab === 'decorate' ? (
                  <View testID="shop-tab-panel-decorate">
                    <Text style={styles.sheetSectionTitle}>{messages.decorationSection}</Text>
                    <Text style={styles.researchSummary}>{messages.decorationSummary}</Text>
                    <ShopDecorationRows
                      gameState={gameState}
                      locale={locale}
                      messages={messages}
                      setGameState={setGameState}
                      onDone={toast}
                    />
                  </View>
                ) : null}

                {activeShopTab === 'rewards' && adSupported ? (
                  <View testID="shop-tab-panel-rewards">
                    <Text style={styles.sheetSectionTitle}>{messages.adRewardsSection}</Text>
                    <AdRewardCard
                      title={messages.rewardedGoldTitle(formatMoney(getRewardedGoldAmount(gameState), locale))}
                      desc={rewardedGoldLimit.allowed ? messages.rewardedGoldReadyDesc(REWARDED_GOLD_WINDOW_MS / 60000, REWARDED_GOLD_MAX_USES_PER_WINDOW) : rewardedGoldLimit.reason}
                      cta={
                        rewardedAd.isAdReady && rewardedGoldLimit.allowed
                          ? messages.rewardReceiveCta
                          : messages.rewardWaitCta
                      }
                      disabled={!rewardedAd.isAdReady || !rewardedGoldLimit.allowed}
                      onPress={() => void rewardGoldFromAd()}
                    />
                    <AdRewardCard
                      title={messages.rewardedPlotTitle}
                      desc={
                        plotDiscountLimit.allowed
                          ? messages.rewardedPlotReadyDesc(
                              Math.round(PLOT_DISCOUNT_AD_PERCENT * 100),
                              formatMoney(getPlotCost(gameState.unlockedPlotCount), locale),
                              formatMoney(getDiscountedPlotCost(gameState.unlockedPlotCount), locale)
                            )
                          : plotDiscountLimit.reason
                      }
                      cta={
                        rewardedAd.isAdReady && plotDiscountLimit.allowed ? messages.rewardOpenCta : messages.rewardWaitCta
                      }
                      disabled={
                        !rewardedAd.isAdReady || !plotDiscountLimit.allowed || gameState.unlockedPlotCount >= MAX_PLOTS
                      }
                      onPress={() => void rewardDiscountedPlotFromAd()}
                    />
                  </View>
                ) : null}
              </View>
            );
          })()
        ) : null}

        {activeSheet?.type === 'missions' ? (
          <MissionsSheet
            gameState={gameState}
            locale={locale}
            messages={messages}
            now={Date.now()}
            adSupported={rewardedAd.isAdSupported}
            onClaim={claimMissionReward}
            onClaimWeekly={claimWeeklyMissionReward}
          />
        ) : null}

        {activeSheet?.type === 'more' ? (
          <View style={styles.moreMenu}>
            {moreMenuSections.map((section, sectionIndex) => (
              <View
                key={section.key}
                style={[styles.moreMenuSection, sectionIndex > 0 && styles.moreMenuSectionDivided]}
              >
                <Text style={styles.moreMenuSectionTitle}>{section.title}</Text>
                {section.entryKeys.map((entryKey) => {
                  const entry = moreMenuEntryByKey.get(entryKey);
                  if (entry == null) return null;
                  return (
                    <MoreMenuButton
                      key={entry.key}
                      label={entry.label}
                      badge={entry.badge}
                      accessibilityLabel={entry.accessibilityLabel}
                      onPress={entry.onPress}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        ) : null}

        {activeSheet?.type === 'stats' ? (
          <StatsSheet
            messages={messages}
            locale={locale}
            researchLevel={researchLevel}
            profitMultiplier={globalModifiers.profitMultiplier}
            speedMultiplier={globalModifiers.speedMultiplier}
            boostActive={harvestBonusBoost.active}
            boostMultiplier={harvestBonusBoost.multiplier}
            boostRemainingMs={safeBoostRemainingMs}
            offlineGoldPerHour={activeFarmOfflineGoldPerHour}
            offlineIncomeCapMs={OFFLINE_INCOME_CAP_MS}
            weeklyEventActive={weeklyEvent.active}
            weeklyEventAreaName={getLocalizedAreaLabel(weeklyEvent.areaKey).name}
            weeklyEventMultiplier={weeklyEvent.multiplier}
            weeklyEventAxis={weeklyEvent.axis}
            weeklyEventTypeKey={weeklyEvent.typeKey}
            weeklyEventRemainingMs={Math.max(
              0,
              (weeklyEvent.active ? weeklyEvent.windowEndAt : weeklyEvent.windowStartAt) - tickNowMsRef.current
            )}
            farmRecords={farmRecordStats}
          />
        ) : null}

        {activeSheet?.type === 'collection' ? (
          <CollectionSheet
            gameState={gameState}
            locale={locale}
            messages={messages}
            collectionSummary={collectionSummary}
            onClaimReward={claimCollectionRewardByKey}
          />
        ) : null}

        {activeSheet?.type === 'lab' ? (
          <LabSheet
            gameState={gameState}
            locale={locale}
            messages={messages}
            onToggleAutomation={toggleAutomation}
            onUnlockNode={unlockResearchNode}
            onBreed={breedHybrid}
          />
        ) : null}

        {activeSheet?.type === 'map' ? (
          <ChainMapSheet
            gameState={gameState}
            locale={locale}
            messages={messages}
            now={Date.now()}
            onCollectChain={collectChain}
            onOpenPrestigeConfirm={openPrestigeConfirm}
            onBuySkill={purchaseSkill}
          />
        ) : null}

        {activeSheet?.type === 'prestigeConfirm' ? (
          <PrestigeConfirmSheet
            gameState={gameState}
            locale={locale}
            messages={messages}
            now={Date.now()}
            selectedArchetype={prestigeArchetype}
            onSelectArchetype={setPrestigeArchetype}
            onConfirm={confirmPrestige}
            onCancel={openMap}
          />
        ) : null}

        {activeSheet?.type === 'achievements' ? (
          <AchievementsSheet
            gameState={gameState}
            locale={locale}
            messages={messages}
            onClaim={claimAchievement}
            onClaimAll={claimAllAchievementRewards}
            onSelectTitle={selectTitle}
          />
        ) : null}

        {activeSheet?.type === 'settings' ? (
          <View>
            <Text style={styles.sheetSectionTitle}>{messages.soundSection}</Text>
            <SettingToggle
              label={messages.soundEffectsLabel}
              desc={audio.isSupported ? messages.soundEffectsEnabledDesc : messages.soundUnsupportedDesc}
              value={gameSettings.soundEffectsEnabled && audio.isSupported}
              disabled={!audio.isSupported}
              onPress={() => updateGameSettings({ soundEffectsEnabled: !gameSettings.soundEffectsEnabled })}
            />
            <SettingToggle
              label={messages.backgroundMusicLabel}
              desc={audio.isSupported ? messages.backgroundMusicDesc : messages.soundUnsupportedDesc}
              value={gameSettings.backgroundMusicEnabled && audio.isSupported}
              disabled={!audio.isSupported}
              onPress={() => updateGameSettings({ backgroundMusicEnabled: !gameSettings.backgroundMusicEnabled })}
            />
            <SettingToggle
              label={messages.hapticsLabel}
              desc={messages.hapticsDesc}
              value={gameSettings.hapticsEnabled}
              onPress={() => updateGameSettings({ hapticsEnabled: !gameSettings.hapticsEnabled })}
            />

            <Text style={styles.sheetSectionTitle}>{messages.notificationSection}</Text>
            <SettingToggle
              label={messages.harvestNotificationsLabel}
              desc={notifications.isSupported ? messages.harvestNotificationsDesc : messages.notificationUnsupportedDesc}
              value={gameSettings.harvestNotificationsEnabled && notifications.isSupported}
              disabled={!notifications.isSupported}
              onPress={() => void toggleHarvestNotifications()}
            />
            <SettingToggle
              label={messages.comebackRemindersLabel}
              desc={notifications.isSupported ? messages.comebackRemindersDesc : messages.notificationUnsupportedDesc}
              value={gameSettings.comebackRemindersEnabled && notifications.isSupported}
              disabled={!notifications.isSupported}
              onPress={() => void toggleComebackReminders()}
            />

            <Text style={styles.sheetSectionTitle}>{messages.languageSection}</Text>
            <View style={styles.languageOptions}>
              {SUPPORTED_LOCALES.map((option) => {
                const active = locale === option;
                return (
                  <Pressable
                    key={option}
                    testID={`language-option-${option}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={languageOptionLabels[option]}
                    style={[styles.languageOption, active && styles.activeLanguageOption]}
                    onPress={() => updateGameSettings({ locale: option })}
                  >
                    <Text style={[styles.languageOptionText, active && styles.activeLanguageOptionText]}>
                      {languageOptionLabels[option]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={sheetPartStyles.settingDesc}>{messages.languageDesc}</Text>

            {cloudSave.isSupported ? (
              <CloudSaveSection
                title={messages.cloudBackupSection}
                desc={messages.cloudBackupDesc}
                notice={cloudSaveNotice}
                backupLabel={messages.cloudBackupAction}
                restoreLabel={messages.cloudRestoreAction}
                busy={cloudSaveBusy}
                onBackup={() => void backupToCloud()}
                onRestore={() => void restoreFromCloud()}
              />
            ) : null}

            <Text style={styles.sheetSectionTitle}>{messages.gameDataSection}</Text>
            <SheetAction label={messages.resetFarmAction} danger onPress={openResetConfirm} />
          </View>
        ) : null}

        {activeSheet?.type === 'growthAd'
          ? (() => {
              // A short crop is fully skipped (existing label); a long crop only
              // gets a partial cut, so name the amount the ad removes.
              const skipMs = getGrowthAdSkipMs(activeSheet.remainingMs);
              const fullSkip = skipMs >= activeSheet.remainingMs;
              const actionLabel = growthAdLimit.allowed
                ? fullSkip
                  ? messages.growthAdAction
                  : messages.growthAdSkipAction(formatDuration(skipMs, locale))
                : growthAdLimit.reason;
              // 광고 경로는 광고 지원 + 최소 남은 성장 조건을 만족할 때만 노출한다
              // (비료 단독으로 시트가 열린 경우 광고 버튼은 숨긴다).
              const adPathAvailable =
                rewardedAd.isAdSupported && activeSheet.remainingMs >= GROWTH_AD_MIN_REMAINING_MS;
              // 골드 비료(#227): 성장 중 플롯이면 항상 노출, 가격 표시. 골드 부족 시 비활성.
              const fertilizerPlot = gameState.plots[activeSheet.plotIndex];
              const fertilizerCost = fertilizerPlot != null ? getFertilizerCost(gameState, fertilizerPlot) : 0;
              return (
                <View>
                  {adPathAvailable ? (
                    <SheetAction
                      testID="growth-ad-action"
                      label={actionLabel}
                      disabled={!rewardedAd.isAdReady || !growthAdLimit.allowed}
                      onPress={() => void completeGrowthWithAd(activeSheet.plotIndex)}
                    />
                  ) : null}
                  {fertilizerCost > 0 ? (
                    <SheetAction
                      testID="fertilizer-action"
                      label={messages.fertilizerAction(formatMoney(fertilizerCost, locale))}
                      disabled={gameState.gold < fertilizerCost}
                      onPress={() => applyFertilizerNow(activeSheet.plotIndex)}
                    />
                  ) : null}
                  {!adPathAvailable && fertilizerCost <= 0 ? (
                    // 시트가 열린 뒤 tick으로 남은 성장이 0이 되고 광고 경로도 없어
                    // 가속 옵션이 사라진 경우, 빈 시트 대신 완료 안내를 보여준다(대기
                    // 버튼으로 닫을 수 있음).
                    <Text testID="growth-sheet-empty-note" style={styles.sheetSectionTitle}>
                      {messages.alreadyGrownToast}
                    </Text>
                  ) : null}
                  <SheetAction label={messages.waitAction} secondary onPress={() => setActiveSheet(null)} />
                </View>
              );
            })()
          : null}

        {activeSheet?.type === 'harvestBonus' ? (
          <View>
            <SheetAction
              label={
                harvestBonusAdLimit.allowed
                  ? messages.harvestBonusAction(
                      formatRemainingTime(HARVEST_BONUS_BOOST_DURATION_MS, locale),
                      HARVEST_BONUS_MULTIPLIER
                    )
                  : harvestBonusAdLimit.reason
              }
              disabled={!rewardedAd.isAdReady || !harvestBonusAdLimit.allowed}
              onPress={() => void activateHarvestBonusWithAd()}
            />
            <SheetAction label={messages.declineAction} secondary onPress={() => setActiveSheet(null)} />
          </View>
        ) : null}

        {activeSheet?.type === 'dailyBonus' ? (
          <View>
            {/* #376 열람 즉시 자동 수령: 탭-수령 버튼을 없애고 "수령 완료" 표시(streak +
                획득 골드)와 확인(닫기) 버튼 1개만 남긴다. 실제 지급·계측은 열람 시점의
                자동 수령 effect가 처리한다. */}
            <View style={styles.welcomeBackRow}>
              <Text style={styles.welcomeBackIcon}>🎁</Text>
              <View style={styles.welcomeBackRowText}>
                <Text style={styles.welcomeBackRowLabel}>
                  {getDailyBonusLabel(dailyBonusDisplay.streak, dailyBonusDisplay.goldAwarded, locale).streakLabel}
                </Text>
                <Text style={styles.welcomeBackRowValue}>
                  +{formatMoney(dailyBonusDisplay.goldAwarded, locale)}G
                </Text>
              </View>
            </View>
            <SheetAction label={messages.dailyBonusConfirmAction} onPress={() => setActiveSheet(null)} />
          </View>
        ) : null}

        {activeSheet?.type === 'wheel' ? (
          <WheelSheet
            gameState={gameState}
            locale={locale}
            messages={messages}
            now={Date.now()}
            onSpin={() => {
              const now = Date.now();
              // Guard against clock reversal or a stale render: don't spin
              // when locked at tap time.
              if (!getWheelStatus(gameState.wheelState, now).canSpin) {
                return null;
              }
              // Compute the spin once, synchronously, so the state updater
              // stays pure (no side effects inside it — React can double-invoke
              // updaters in StrictMode). A null result means it's no longer
              // spinnable.
              const result = spinWheel(gameState.wheelState, getRewardedGoldAmount(gameState), now);
              if (result == null) {
                return null;
              }
              // Apply with a functional updater that re-checks against the
              // latest state, so a second tap landing in the same tick (before
              // a re-render) can't double-award: the second apply sees
              // lastFreeSpinAt already set for today and returns prev unchanged.
              // 보상은 이 시점(연출 시작 전)에 확정·지급된다 — 연출 중 시트가 닫혀도
              // 유실/이중 지급이 없다(#208 불변 조건, WheelSheet는 연출만 담당).
              // 보상 적용은 core의 순수 함수(applyWheelReward)에 위임한다: gold(골드
              // 가산), rp(연구 포인트 + 누적치 가산), harvest_boost(광고 부스트와
              // 동일한 만료 경로로 연장). 여기서는 이중지급 가드만 담당.
              setGameState((prev) =>
                getWheelStatus(prev.wheelState, now).canSpin ? applyWheelReward(prev, result, now) : prev
              );
              // 스핀 연출 시작과 동시에 감속 틱 사운드를 깐다(2000ms, WheelSheet의
              // ease-out 커브와 같은 길이로 구운 트랙 — scripts/synth-audio-sfx.py).
              playSoundEffect('wheelSpin');
              return result.reward;
            }}
            onBonusSpin={spinWheelWithAd}
            bonusAdSupported={rewardedAd.isAdSupported}
            bonusAdReady={rewardedAd.isAdReady}
            bonusAdAllowed={wheelBonusAdLimit.allowed}
            bonusAdBlockedReason={wheelBonusAdLimit.reason}
            onBonusImpression={() =>
              farmAnalytics.trackAdRewardImpression(
                'wheelBonusAd',
                getRewardedAdPlacement('wheelBonusAd'),
                analyticsContext()
              )
            }
            onRevealed={(reward) => {
              // 연출 종료(당첨 슬롯 정지) 후에 타입별 토스트를 노출한다.
              switch (reward.type) {
                case 'rp':
                  toast(messages.wheelRewardRpToast(formatMoney(reward.rp, locale)));
                  break;
                case 'harvest_boost':
                  toast(
                    messages.wheelRewardBoostToast(
                      formatRemainingTime(reward.durationMs, locale),
                      HARVEST_BONUS_MULTIPLIER
                    )
                  );
                  break;
                case 'gold':
                default:
                  pulseGold();
                  toast(messages.wheelRewardToast(formatMoney(reward.gold, locale)));
                  break;
              }
            }}
          />
        ) : null}

        {activeSheet?.type === 'animals' ? (
          <AnimalsSheet
            gameState={gameState}
            locale={locale}
            messages={messages}
            now={Date.now()}
            onPurchase={buyAnimal}
            onFeed={feedAnimalNow}
            onCollect={collectAnimalProduce}
            onCollectAll={collectAllAnimalProduce}
          />
        ) : null}

        {activeSheet?.type === 'workshop' ? (
          <WorkshopSheet
            gameState={gameState}
            locale={locale}
            messages={messages}
            now={Date.now()}
            getCropName={getLocalizedCropName}
            onStart={startCraftNow}
            onCancel={cancelCraftNow}
            onCollect={collectCraftNow}
            onCollectAll={collectAllCrafts}
          />
        ) : null}

        {activeSheet?.type === 'welcomeBack' ? (
          <View>
            {activeSheet.summary.offlineGold > 0 ? (
              <View style={styles.welcomeBackRow}>
                <Text style={styles.welcomeBackIcon}>💰</Text>
                <View style={styles.welcomeBackRowText}>
                  <Text style={styles.welcomeBackRowLabel}>{messages.welcomeBackOfflineLabel}</Text>
                  <Text style={styles.welcomeBackRowValue}>
                    +{formatMoney(activeSheet.summary.offlineGold, locale)}G
                  </Text>
                </View>
              </View>
            ) : null}
            {activeSheet.summary.readyCropCount > 0 ? (
              <View style={styles.welcomeBackRow}>
                <Text style={styles.welcomeBackIcon}>🧺</Text>
                <View style={styles.welcomeBackRowText}>
                  <Text style={styles.welcomeBackRowLabel}>{messages.welcomeBackReadyLabel}</Text>
                  <Text style={styles.welcomeBackRowValue}>
                    {messages.welcomeBackReadyValue(activeSheet.summary.readyCropCount)}
                  </Text>
                </View>
              </View>
            ) : null}
            {activeSheet.summary.readyAnimalCount > 0 ? (
              <Pressable
                testID="welcome-back-animal-row"
                accessibilityRole="button"
                accessibilityLabel={`${messages.welcomeBackAnimalLabel}, ${messages.welcomeBackAnimalValue(
                  activeSheet.summary.readyAnimalCount
                )}`}
                style={({ pressed }) => [styles.welcomeBackRow, pressed && styles.welcomeBackRowPressed]}
                onPress={() => {
                  if (activeSheet?.type !== 'welcomeBack') return;
                  openReturnReadySheet(activeSheet.summary, 'animals');
                }}
              >
                <Text style={styles.welcomeBackIcon}>🐔</Text>
                <View style={styles.welcomeBackRowText}>
                  <Text style={styles.welcomeBackRowLabel}>{messages.welcomeBackAnimalLabel}</Text>
                  <Text style={styles.welcomeBackRowValue} numberOfLines={1}>
                    {messages.welcomeBackAnimalValue(activeSheet.summary.readyAnimalCount)}
                  </Text>
                </View>
                <Text style={styles.welcomeBackRowChevron}>›</Text>
              </Pressable>
            ) : null}
            {activeSheet.summary.readyCraftCount > 0 ? (
              <Pressable
                testID="welcome-back-craft-row"
                accessibilityRole="button"
                accessibilityLabel={`${messages.welcomeBackCraftLabel}, ${messages.welcomeBackCraftValue(
                  activeSheet.summary.readyCraftCount
                )}`}
                style={({ pressed }) => [styles.welcomeBackRow, pressed && styles.welcomeBackRowPressed]}
                onPress={() => {
                  if (activeSheet?.type !== 'welcomeBack') return;
                  openReturnReadySheet(activeSheet.summary, 'workshop');
                }}
              >
                <Text style={styles.welcomeBackIcon}>🏭</Text>
                <View style={styles.welcomeBackRowText}>
                  <Text style={styles.welcomeBackRowLabel}>{messages.welcomeBackCraftLabel}</Text>
                  <Text style={styles.welcomeBackRowValue} numberOfLines={1}>
                    {messages.welcomeBackCraftValue(activeSheet.summary.readyCraftCount)}
                  </Text>
                </View>
                <Text style={styles.welcomeBackRowChevron}>›</Text>
              </Pressable>
            ) : null}
            {activeSheet.summary.dailyBonusAvailable ? (
              <View style={styles.welcomeBackRow}>
                <Text style={styles.welcomeBackIcon}>🎁</Text>
                <View style={styles.welcomeBackRowText}>
                  <Text style={styles.welcomeBackRowLabel}>{messages.welcomeBackDailyLabel}</Text>
                  <Text style={styles.welcomeBackRowValue}>{messages.welcomeBackDailyValue}</Text>
                </View>
              </View>
            ) : null}
            {/* First-action CTA: harvest right away when crops are ready, otherwise nudge
                toward the daily-bonus claim. When both apply, harvest leads (core loop) and
                the daily claim is offered as a secondary CTA. */}
            {activeSheet.summary.readyCropCount > 0 ? (
              <SheetAction
                label={messages.welcomeBackHarvestAction}
                onPress={() => {
                  if (activeSheet?.type !== 'welcomeBack') return;
                  if (!collectReturnSummaryOffline(activeSheet.summary)) return;
                  setActiveSheet(null);
                  harvestAllCrops();
                  void maybeShowReturnAd();
                }}
              />
            ) : null}
            {activeSheet.summary.dailyBonusAvailable ? (
              <SheetAction
                label={messages.welcomeBackDailyAction}
                secondary={activeSheet.summary.readyCropCount > 0}
                onPress={() => {
                  if (activeSheet?.type !== 'welcomeBack') return;
                  if (!collectReturnSummaryOffline(activeSheet.summary)) return;
                  // Jump straight to the daily sheet. It is the next interaction, so we skip
                  // the return ad here to avoid covering the claim flow.
                  setActiveSheet({ type: 'dailyBonus', source: 'welcome_back' });
                }}
              />
            ) : null}
            {activeSheet.summary.offlineGold > 0 && rewardedAd.isAdSupported ? (
              <SheetAction
                testID="welcome-back-double-ad-action"
                secondary
                label={
                  offlineBonusAdLimit.allowed
                    ? messages.welcomeBackDoubleAdAction(
                        formatMoney(activeSheet.summary.offlineGold * OFFLINE_BONUS_MULTIPLIER, locale)
                      )
                    : offlineBonusAdLimit.reason
                }
                disabled={!rewardedAd.isAdReady || !offlineBonusAdLimit.allowed}
                onPress={() => void rewardReturnOfflineGoldFromAd(activeSheet.summary)}
              />
            ) : null}
            <SheetAction
              secondary={activeSheet.summary.readyCropCount > 0 || activeSheet.summary.dailyBonusAvailable}
              label={
                activeSheet.summary.offlineGold > 0
                  ? messages.welcomeBackCollectAction(formatMoney(activeSheet.summary.offlineGold, locale))
                  : messages.welcomeBackConfirmAction
              }
              onPress={() => {
                if (activeSheet?.type !== 'welcomeBack') return;
                dismissWelcomeBack(activeSheet.summary);
              }}
            />
          </View>
        ) : null}

        {activeSheet?.type === 'resetConfirm' ? (
          <View>
            <Text style={styles.resetWarning}>{messages.resetWarning}</Text>
            <TextInput
              accessibilityLabel={messages.resetInputAccessibilityLabel}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={messages.resetInputPlaceholder(resetConfirmValue)}
              style={styles.resetInput}
              value={resetConfirmText}
              onChangeText={setResetConfirmText}
            />
            <SheetAction
              label={messages.resetDeleteAction}
              danger
              disabled={resetConfirmText !== resetConfirmValue}
              onPress={() => void confirmReset()}
            />
            <SheetAction label={messages.resetKeepAction} secondary onPress={() => setActiveSheet(null)} />
          </View>
        ) : null}
      </Sheet>

      {/* Rendered last so it appears above the Sheet and all other overlays. */}
      {masteryRankUpNotice != null ? (
        <MasteryRankUpOverlay
          key={masteryRankUpNotice.id}
          notice={masteryRankUpNotice}
          messages={messages}
          onDismiss={dismissMasteryRankUpCelebration}
        />
      ) : null}
      {prestigeGraduationNotice != null ? (
        <PrestigeGraduationOverlay
          key={prestigeGraduationNotice.id}
          notice={prestigeGraduationNotice}
          messages={messages}
          onDismiss={dismissPrestigeGraduation}
        />
      ) : null}
      {firstHarvestNotice != null ? (
        <FirstHarvestOverlay
          key={firstHarvestNotice.id}
          notice={firstHarvestNotice}
          messages={messages}
          onDismiss={dismissFirstHarvestCelebration}
        />
      ) : null}
      {notificationPromptGeneration != null ? (
        <NotificationPromptOverlay
          messages={messages}
          onAccept={() => {
            void acceptNotificationPrompt(notificationPromptGeneration);
          }}
          onDecline={() => declineNotificationPrompt(notificationPromptGeneration)}
        />
      ) : null}
      {prestigeGuide ? (
        <PrestigeGuideOverlay messages={messages} onDismiss={dismissPrestigeGuide} />
      ) : null}
      {pendingFeatureCoachmark != null ? (
        <FeatureCoachmarkOverlay
          key={pendingFeatureCoachmark}
          featureKey={pendingFeatureCoachmark}
          messages={messages}
          onOpen={() => openFeatureCoachmark(pendingFeatureCoachmark)}
          onDismiss={() => dismissFeatureCoachmark(pendingFeatureCoachmark)}
        />
      ) : null}
    </View>
  );
}

function NavButton({
  label,
  badge,
  accessibilityLabel,
  testID,
  highlight = false,
  onPress,
}: {
  label: string;
  badge?: number;
  accessibilityLabel?: string;
  testID?: string;
  highlight?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      style={[styles.navButton, highlight && styles.navButtonHighlight]}
      onPress={onPress}
    >
      <Text style={styles.navButtonText}>{label}</Text>
      {badge != null && badge > 0 ? (
        <View style={styles.collectionBadge}>
          <Text style={styles.collectionBadgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// '더보기' 시트 안의 항목 버튼(#241). navRow에서 내려온 진입점을 전폭 행으로 나열하고,
// 각 항목의 배지(claimable/actionable)를 우측에 그대로 노출해 발견성을 유지한다.
function MoreMenuButton({
  label,
  badge,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  badge?: number;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      style={styles.moreMenuButton}
      onPress={onPress}
    >
      <Text style={styles.moreMenuButtonText}>{label}</Text>
      {badge != null && badge > 0 ? (
        <View style={styles.moreMenuBadge}>
          <Text style={styles.moreMenuBadgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// Swaps in for the tool hint the moment a couple of plots ripen, turning a
// row of individual taps into one satisfying batch harvest. It pops in and
// breathes gently so the eye catches the call-to-action without nagging.
function HarvestAllButton({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  const entranceRef = useRef<Animated.Value | null>(null);
  if (entranceRef.current == null) {
    entranceRef.current = new Animated.Value(0);
  }
  const entrance = entranceRef.current;
  const pulseRef = useRef<Animated.Value | null>(null);
  if (pulseRef.current == null) {
    pulseRef.current = new Animated.Value(0);
  }
  const pulse = pulseRef.current;

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.timing(entrance, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.back(2.4)),
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 720,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 720,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      ),
    ]);
    animation.start();
    return () => animation.stop();
  }, [entrance, pulse]);

  const scale = Animated.multiply(
    entrance.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
    pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] })
  );

  return (
    <Pressable
      testID={testID}
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [pressed && styles.harvestAllButtonPressed]}
      onPress={onPress}
    >
      <Animated.View style={[styles.harvestAllButton, { opacity: entrance, transform: [{ scale }] }]}>
        <Text style={styles.harvestAllButtonText} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// Mastery rank-up celebration: full-screen overlay that marks the moment a crop
// reaches a new mastery tier (Bronze → Silver → Gold → Prism). The card springs
// in from below-center; the crop emoji bounces in first, then the rank badge
// fades in with a slight delay so each element lands in sequence.
// Auto-dismisses after MASTERY_RANK_UP_CELEBRATION_DURATION_MS; tapping anywhere
// on the backdrop also dismisses it early.
function MasteryRankUpOverlay({
  notice,
  messages,
  onDismiss,
}: {
  notice: MasteryRankUpNotice;
  messages: FarmMessages;
  onDismiss: () => void;
}) {
  const backdropRef = useRef<Animated.Value | null>(null);
  if (backdropRef.current == null) backdropRef.current = new Animated.Value(0);
  const backdrop = backdropRef.current;

  const cardScaleRef = useRef<Animated.Value | null>(null);
  if (cardScaleRef.current == null) cardScaleRef.current = new Animated.Value(0.6);
  const cardScale = cardScaleRef.current;

  const cropScaleRef = useRef<Animated.Value | null>(null);
  if (cropScaleRef.current == null) cropScaleRef.current = new Animated.Value(0.2);
  const cropScale = cropScaleRef.current;

  const rankEntranceRef = useRef<Animated.Value | null>(null);
  if (rankEntranceRef.current == null) rankEntranceRef.current = new Animated.Value(0);
  const rankEntrance = rankEntranceRef.current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(cardScale, {
        toValue: 1,
        damping: 15,
        stiffness: 280,
        mass: 0.8,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(100),
        Animated.spring(cropScale, {
          toValue: 1,
          damping: 9,
          stiffness: 200,
          mass: 0.5,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(260),
        Animated.spring(rankEntrance, {
          toValue: 1,
          damping: 12,
          stiffness: 260,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    return () => {
      backdrop.stopAnimation();
      cardScale.stopAnimation();
      cropScale.stopAnimation();
      rankEntrance.stopAnimation();
    };
  }, [backdrop, cardScale, cropScale, rankEntrance]);

  const rankColor = MASTERY_RANK_COLORS[notice.rankKey];

  const rankEntranceScale = rankEntrance.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  return (
    <Pressable testID="mastery-rank-up-overlay" style={StyleSheet.absoluteFill} onPress={onDismiss}>
      <Animated.View style={[styles.masteryBackdrop, { opacity: backdrop }]} />
      <View style={styles.masteryCenter} pointerEvents="none">
        <Animated.View testID="mastery-rank-up-card" style={[styles.masteryCard, { transform: [{ scale: cardScale }] }]}>
          <Text style={styles.masteryTitle}>{messages.masteryRankUpTitle}</Text>
          <Animated.Text style={[styles.masteryCropIcon, { transform: [{ scale: cropScale }] }]}>
            {notice.cropIcon}
          </Animated.Text>
          <Animated.Text
            style={[
              styles.masteryRankBadge,
              { color: rankColor, opacity: rankEntrance, transform: [{ scale: rankEntranceScale }] },
            ]}
          >
            {notice.rankIcon} {notice.rankName}
          </Animated.Text>
          <Text style={styles.masteryCropName}>{notice.cropName}</Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

// Prestige graduation ceremony: full-screen overlay shown when the player
// completes a prestige — the game's biggest milestone. The region icon springs
// in with extra energy; stars slide up from below so the reward reads as the
// climax. Auto-dismisses after PRESTIGE_GRADUATION_CELEBRATION_DURATION_MS;
// tapping anywhere on the overlay (backdrop or card) also dismisses early —
// the inner View uses pointerEvents="none" so all touches reach the Pressable.
function PrestigeGraduationOverlay({
  notice,
  messages,
  onDismiss,
}: {
  notice: PrestigeGraduationNotice;
  messages: FarmMessages;
  onDismiss: () => void;
}) {
  const backdrop = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.5)).current;
  const iconScale = useRef(new Animated.Value(0.1)).current;
  const starsEntrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(cardScale, {
        toValue: 1,
        damping: 14,
        stiffness: 260,
        mass: 0.9,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(80),
        Animated.spring(iconScale, {
          toValue: 1,
          damping: 7,
          stiffness: 180,
          mass: 0.6,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(300),
        Animated.spring(starsEntrance, {
          toValue: 1,
          damping: 11,
          stiffness: 240,
          useNativeDriver: true,
        }),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
  }, [backdrop, cardScale, iconScale, starsEntrance]);

  const starsTranslateY = starsEntrance.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });

  return (
    <Pressable testID="prestige-graduation-overlay" style={StyleSheet.absoluteFill} onPress={onDismiss}>
      <Animated.View style={[styles.prestigeBackdrop, { opacity: backdrop }]} />
      <View style={styles.prestigeCenter} pointerEvents="none">
        <Animated.View
          testID="prestige-graduation-card"
          style={[styles.prestigeCard, { transform: [{ scale: cardScale }] }]}
        >
          <Text style={styles.prestigeTitle}>{messages.prestigeGraduationTitle}</Text>
          <Animated.Text style={[styles.prestigeRegionIcon, { transform: [{ scale: iconScale }] }]}>
            {notice.regionIcon}
          </Animated.Text>
          <Text style={styles.prestigeRegionName}>{notice.regionName}</Text>
          <Animated.Text
            style={[
              styles.prestigeStarsBadge,
              { opacity: starsEntrance, transform: [{ translateY: starsTranslateY }] },
            ]}
          >
            {messages.prestigeGraduationStarsLabel(notice.starsAwarded)}
          </Animated.Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

// First-harvest ceremony: a warm, compact card that springs in when the player
// harvests for the very first time. Lighter than the prestige overlay (no
// full-screen dim) — the farm stays visible so it feels like an "in-world"
// celebration rather than a modal. Auto-dismisses after
// FIRST_HARVEST_CELEBRATION_DURATION_MS; tap anywhere to dismiss early.
function FirstHarvestOverlay({
  notice,
  messages,
  onDismiss,
}: {
  notice: FirstHarvestNotice;
  messages: FarmMessages;
  onDismiss: () => void;
}) {
  const cardScale = useRef(new Animated.Value(0.5)).current;
  const cropScale = useRef(new Animated.Value(0.1)).current;
  const goldEntrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.parallel([
      Animated.spring(cardScale, {
        toValue: 1,
        damping: 13,
        stiffness: 270,
        mass: 0.8,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(60),
        Animated.spring(cropScale, {
          toValue: 1,
          damping: 7,
          stiffness: 200,
          mass: 0.5,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(280),
        Animated.spring(goldEntrance, {
          toValue: 1,
          damping: 12,
          stiffness: 260,
          useNativeDriver: true,
        }),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
  }, [cardScale, cropScale, goldEntrance]);

  const goldTranslateY = goldEntrance.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });

  return (
    <Pressable testID="first-harvest-overlay" style={StyleSheet.absoluteFill} onPress={onDismiss}>
      <View style={styles.firstHarvestCenter} pointerEvents="none">
        <Animated.View
          testID="first-harvest-card"
          style={[styles.firstHarvestCard, { transform: [{ scale: cardScale }] }]}
        >
          <Text style={styles.firstHarvestTitle}>{messages.firstHarvestTitle}</Text>
          <Animated.Text style={[styles.firstHarvestCropIcon, { transform: [{ scale: cropScale }] }]}>
            {notice.cropIcon}
          </Animated.Text>
          <Animated.Text
            style={[
              styles.firstHarvestGold,
              { opacity: goldEntrance, transform: [{ translateY: goldTranslateY }] },
            ]}
          >
            +{notice.goldFormatted}G
          </Animated.Text>
          <Text style={styles.firstHarvestSubtitle}>{messages.firstHarvestSubtitle}</Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

// Soft permission prompt shown right after the first harvest. Instead of firing
// the OS permission dialog immediately, it explains the value first and only
// calls requestPermission for players who opt in.
function NotificationPromptOverlay({
  messages,
  onAccept,
  onDecline,
}: {
  messages: FarmMessages;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    // Fabric renders this absoluteFill overlay in normal flow — pushing the game
    // UI up with no dim backdrop — when it mounts as a plain View child. Hosting
    // it in a Modal (the pattern Sheet already uses) restores the true overlay.
    <Modal transparent visible animationType="fade" onRequestClose={onDecline}>
      <View testID="notification-prompt-overlay" style={styles.notificationPromptBackdrop}>
        <View testID="notification-prompt-card" style={styles.notificationPromptCard}>
          <Text style={styles.notificationPromptIcon}>🔔</Text>
          <Text style={styles.notificationPromptTitle}>{messages.notificationPromptTitle}</Text>
          <Text style={styles.notificationPromptDesc}>{messages.notificationPromptDesc}</Text>
          <View style={styles.notificationPromptActions}>
            <Pressable
              testID="notification-prompt-decline"
              style={[styles.notificationPromptButton, styles.notificationPromptDeclineButton]}
              onPress={onDecline}
              accessibilityRole="button"
              accessibilityLabel={messages.notificationPromptDecline}
            >
              <Text style={styles.notificationPromptDeclineText}>{messages.notificationPromptDecline}</Text>
            </Pressable>
            <Pressable
              testID="notification-prompt-accept"
              style={[styles.notificationPromptButton, styles.notificationPromptAcceptButton]}
              onPress={onAccept}
              accessibilityRole="button"
              accessibilityLabel={messages.notificationPromptAccept}
            >
              <Text style={styles.notificationPromptAcceptText}>{messages.notificationPromptAccept}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// One-time guide shown right after the player's first graduation, explaining the
// passive chain-income concept so the prestige reset doesn't feel like a loss.
// Dismissing it persists prestigeGuideSeen so it never returns.
function PrestigeGuideOverlay({
  messages,
  onDismiss,
}: {
  messages: FarmMessages;
  onDismiss: () => void;
}) {
  return (
    // See NotificationPromptOverlay: Fabric mis-renders this absoluteFill overlay
    // as normal flow unless it is hosted in a Modal.
    <Modal transparent visible animationType="fade" onRequestClose={onDismiss}>
      <View testID="prestige-guide-overlay" style={styles.notificationPromptBackdrop}>
        <View testID="prestige-guide-card" style={styles.notificationPromptCard}>
          <Text style={styles.notificationPromptIcon}>🔗</Text>
          <Text style={styles.notificationPromptTitle}>{messages.prestigeGuideTitle}</Text>
          <Text style={styles.notificationPromptDesc}>{messages.prestigeGuideBody}</Text>
          <View style={styles.notificationPromptActions}>
            <Pressable
              testID="prestige-guide-confirm"
              style={[styles.notificationPromptButton, styles.notificationPromptAcceptButton]}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel={messages.prestigeGuideConfirm}
            >
              <Text style={styles.notificationPromptAcceptText}>{messages.prestigeGuideConfirm}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// #367 딥 기능(동물·공방·연구소·교배·개척) 최초 해금 시 노출하는 1회성 발견성 코치마크.
// 아이콘·제목·설명·CTA를 담은 팝오버 오버레이로, 상단 HUD/navRow에 상시 요소를 더하지
// 않는다. '보러가기'는 해당 시트를 열고, 어느 버튼을 눌러도 확인됨으로 저장되어 재노출되지
// 않는다(core의 markFeatureCoachmarkSeen).
const FEATURE_COACHMARK_ICON: Record<FeatureCoachmarkKey, string> = {
  animals: '🐔',
  workshop: '🏭',
  lab: '🔬',
  breeding: '🧬',
  chain: '🗺️',
};

function getFeatureCoachmarkText(
  key: FeatureCoachmarkKey,
  messages: FarmMessages
): { title: string; description: string } {
  switch (key) {
    case 'animals':
      return { title: messages.featureCoachmarkAnimalsTitle, description: messages.featureCoachmarkAnimalsDesc };
    case 'workshop':
      return { title: messages.featureCoachmarkWorkshopTitle, description: messages.featureCoachmarkWorkshopDesc };
    case 'lab':
      return { title: messages.featureCoachmarkLabTitle, description: messages.featureCoachmarkLabDesc };
    case 'breeding':
      return { title: messages.featureCoachmarkBreedingTitle, description: messages.featureCoachmarkBreedingDesc };
    case 'chain':
      return { title: messages.featureCoachmarkChainTitle, description: messages.featureCoachmarkChainDesc };
  }
}

function FeatureCoachmarkOverlay({
  featureKey,
  messages,
  onOpen,
  onDismiss,
}: {
  featureKey: FeatureCoachmarkKey;
  messages: FarmMessages;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const { title, description } = getFeatureCoachmarkText(featureKey, messages);
  return (
    // PrestigeGuideOverlay와 동일하게 Modal에 호스팅해야 Fabric이 absoluteFill 오버레이를
    // 정상 렌더한다.
    <Modal transparent visible animationType="fade" onRequestClose={onDismiss}>
      <View testID="feature-coachmark-overlay" style={styles.notificationPromptBackdrop}>
        <View testID="feature-coachmark-card" style={styles.notificationPromptCard}>
          <Text style={styles.featureCoachmarkEyebrow}>{messages.featureCoachmarkEyebrow}</Text>
          <Text style={styles.notificationPromptIcon}>{FEATURE_COACHMARK_ICON[featureKey]}</Text>
          <Text style={styles.notificationPromptTitle}>{title}</Text>
          <Text style={styles.notificationPromptDesc}>{description}</Text>
          <View style={styles.notificationPromptActions}>
            <Pressable
              testID="feature-coachmark-dismiss"
              style={[styles.notificationPromptButton, styles.notificationPromptDeclineButton]}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel={messages.featureCoachmarkDismiss}
            >
              <Text style={styles.notificationPromptDeclineText}>{messages.featureCoachmarkDismiss}</Text>
            </Pressable>
            <Pressable
              testID="feature-coachmark-open"
              style={[styles.notificationPromptButton, styles.notificationPromptAcceptButton]}
              onPress={onOpen}
              accessibilityRole="button"
              accessibilityLabel={messages.featureCoachmarkOpen}
            >
              <Text style={styles.notificationPromptAcceptText}>{messages.featureCoachmarkOpen}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Shows a growing streak counter when the player rapidly harvests multiple
// plots in quick succession. Punches out on each count update so the number
// change is unmistakable; tiers escalate icon and color at 5× and 10×.
// Tier breakthroughs (normal→great, great→legendary) trigger an extra-large
// burst and a brief wobble so the milestone feels meaningfully different from
// a regular count increment.
function ComboDisplay({ count, messages }: { count: number; messages: FarmMessages }) {
  const scaleRef = useRef<Animated.Value | null>(null);
  if (scaleRef.current == null) {
    scaleRef.current = new Animated.Value(0.6);
  }
  const scale = scaleRef.current;

  // Fades out as the combo window expires so the player sees "it's ending — tap more!"
  const expiryRef = useRef<Animated.Value | null>(null);
  if (expiryRef.current == null) {
    expiryRef.current = new Animated.Value(1);
  }
  const expiry = expiryRef.current;

  const rotateRef = useRef<Animated.Value | null>(null);
  if (rotateRef.current == null) {
    rotateRef.current = new Animated.Value(0);
  }
  const rotate = rotateRef.current;

  const prevCountRef = useRef(0);

  useEffect(() => {
    const prevCount = prevCountRef.current;
    prevCountRef.current = count;

    const isTierUp =
      (prevCount < COMBO_GREAT_THRESHOLD && count >= COMBO_GREAT_THRESHOLD) ||
      (prevCount < COMBO_LEGENDARY_THRESHOLD && count >= COMBO_LEGENDARY_THRESHOLD);

    scale.stopAnimation();
    rotate.stopAnimation();
    rotate.setValue(0);

    const scaleAnim = Animated.sequence([
      Animated.timing(scale, {
        toValue: isTierUp ? 1.65 : 1.25,
        duration: isTierUp ? 100 : 80,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        damping: isTierUp ? 7 : 12,
        stiffness: isTierUp ? 200 : 240,
        mass: isTierUp ? 0.8 : 0.6,
        useNativeDriver: true,
      }),
    ]);

    if (isTierUp) {
      const wobble = Animated.sequence([
        Animated.timing(rotate, { toValue: 1, duration: 55, useNativeDriver: true }),
        Animated.timing(rotate, { toValue: -1, duration: 55, useNativeDriver: true }),
        Animated.timing(rotate, { toValue: 0.5, duration: 45, useNativeDriver: true }),
        Animated.spring(rotate, { toValue: 0, damping: 10, stiffness: 300, useNativeDriver: true }),
      ]);
      Animated.parallel([scaleAnim, wobble]).start();
    } else {
      rotate.setValue(0);
      scaleAnim.start();
    }

    return () => {
      scale.stopAnimation();
      rotate.stopAnimation();
    };
  }, [scale, rotate, count]);

  // Reset to fully visible on each harvest, then fade to 25% over the combo window.
  // The last 40% of the window (600 ms) transitions from fully visible to dim,
  // signalling "tap fast or lose your combo!" without being distracting early on.
  useEffect(() => {
    expiry.stopAnimation();
    expiry.setValue(1);
    const animation = Animated.timing(expiry, {
      toValue: 0,
      duration: COMBO_WINDOW_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [expiry, count]);

  useEffect(() => {
    return () => {
      scale.stopAnimation();
      expiry.stopAnimation();
      rotate.stopAnimation();
    };
  }, [scale, expiry, rotate, count]);

  const opacity = expiry.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0.25, 1, 1],
  });
  const rotateInterp = rotate.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-8deg', '0deg', '8deg'] });

  const tier =
    count >= COMBO_LEGENDARY_THRESHOLD ? 'legendary' : count >= COMBO_GREAT_THRESHOLD ? 'great' : 'normal';
  const icon = tier === 'legendary' ? '⚡' : tier === 'great' ? '🔥' : '🌾';

  return (
    <Animated.View
      style={[
        styles.comboDisplay,
        tier === 'great' && styles.comboDisplayGreat,
        tier === 'legendary' && styles.comboDisplayLegendary,
        { opacity, transform: [{ scale }, { rotate: rotateInterp }] },
      ]}
    >
      <Text
        style={[
          styles.comboText,
          tier === 'great' && styles.comboTextGreat,
          tier === 'legendary' && styles.comboTextLegendary,
        ]}
      >
        {icon} {messages.comboLabel(count)}
      </Text>
    </Animated.View>
  );
}

// Compact progress bar shown in the header that surfaces the single most
// actionable next milestone (next area unlock) so players have a clear target
// during crop growth wait times. Tapping it opens the shop directly.
function NextGoalBar({
  goal,
  messages,
  locale,
  getAreaName,
  onPress,
}: {
  goal: NonNullable<NextAreaGoal>;
  messages: FarmMessages;
  locale: SupportedLocale;
  getAreaName: (areaKey: AreaKey) => string;
  onPress: () => void;
}) {
  const areaName = getAreaName(goal.areaKey);

  if (goal.kind === 'ready') {
    return (
      <Pressable testID="next-goal-bar" style={styles.nextGoalBar} onPress={onPress}>
        <Text style={styles.nextGoalReadyText} numberOfLines={1}>
          {messages.nextGoalReady(areaName)}
        </Text>
      </Pressable>
    );
  }

  let label: string;
  if (goal.kind === 'gold') {
    label = messages.nextGoalGold(areaName, formatMoney(goal.total - goal.current, locale));
  } else if (goal.kind === 'harvest') {
    label = messages.nextGoalHarvest(areaName, goal.current, goal.total);
  } else {
    label = messages.nextGoalUpgrade(areaName, goal.current, goal.total);
  }
  const ratio = goal.total > 0 ? Math.max(0, Math.min(goal.current / goal.total, 1)) : 0;

  return (
    <Pressable testID="next-goal-bar" style={styles.nextGoalBar} onPress={onPress}>
      <Text style={styles.nextGoalLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.nextGoalTrack}>
        <View style={[styles.nextGoalFill, { width: `${Math.round(ratio * 100)}%` }]} />
      </View>
    </Pressable>
  );
}

// Slide-up banner that celebrates the first harvest of a new crop type.
// Rendered via an imperative handle so the banner can animate in/out without
// lifting crop state into FarmGame or triggering a full re-render.
const DiscoveryBanner = React.forwardRef<
  DiscoveryBannerHandle,
  { title: string; subtitle: string; bottomInset: number }
>(function DiscoveryBanner({ title, subtitle, bottomInset }, ref) {
  const [entry, setEntry] = useState<{ icon: string; name: string } | null>(null);
  const translateYRef = useRef<Animated.Value | null>(null);
  if (translateYRef.current == null) {
    translateYRef.current = new Animated.Value(80);
  }
  const translateY = translateYRef.current;

  const opacityRef = useRef<Animated.Value | null>(null);
  if (opacityRef.current == null) {
    opacityRef.current = new Animated.Value(0);
  }
  const opacity = opacityRef.current;

  // Holds the running animation so the useEffect cleanup can cancel it, and so
  // show() can interrupt a still-playing sequence.
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  // Generation counter: each show() call increments this and closes over the
  // new value. The completion callback only calls setEntry(null) when its
  // captured token still matches — stale completions from a previous sequence
  // (including the Animated.delay timer inside the sequence) are discarded.
  const animTokenRef = useRef(0);
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      animationRef.current?.stop();
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      show(icon: string, name: string) {
        // Stop the previous CompositeAnimation first. Calling stopAnimation()
        // on individual values only pauses value updates; it does NOT cancel
        // the CompositeAnimation's own delay timer, which could fire
        // setEntry(null) after the new entry is already showing.
        animationRef.current?.stop();
        setEntry({ icon, name });
        translateY.setValue(80);
        opacity.setValue(0);
        const token = ++animTokenRef.current;
        animationRef.current = Animated.sequence([
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: 0,
              duration: 320,
              easing: Easing.out(Easing.back(1.6)),
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 1,
              duration: 200,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          Animated.delay(1800),
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: -20,
              duration: 340,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 280,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]);
        animationRef.current.start(({ finished }) => {
          if (finished && isMountedRef.current && animTokenRef.current === token) {
            setEntry(null);
          }
        });
      },
    }),
    [translateY, opacity]
  );

  // Always mounted so the native animated node is live before show() starts
  // the animation. Returning null when entry == null would create a race:
  // setEntry() schedules a re-render while the native animation starts
  // immediately, so the first frames can be lost before the view mounts.
  return (
    <Animated.View
      pointerEvents="none"
      testID="discovery-banner"
      style={[
        styles.discoveryBanner,
        { bottom: bottomInset + DISCOVERY_BANNER_BASE_BOTTOM, transform: [{ translateY }], opacity },
      ]}
    >
      {entry != null ? (
        <>
          <Text style={styles.discoveryBannerIcon}>{entry.icon}</Text>
          <View>
            <Text style={styles.discoveryBannerTitle}>{title}</Text>
            <Text style={styles.discoveryBannerName}>{entry.name}</Text>
            <Text style={styles.discoveryBannerSubtitle}>{subtitle}</Text>
          </View>
        </>
      ) : null}
    </Animated.View>
  );
});

// Full-screen flash overlay for rare mutation harvests. Each rarity owns an
// independent native animated value, but a new jackpot retires every active
// layer first so rapid mixed harvests never blend into a strobe. Higher rarities
// use stronger, longer flashes.
const MutationFlashOverlay = React.forwardRef<MutationFlashHandle>(function MutationFlashOverlay(_, ref) {
  const opacitiesRef = useRef<Record<MutationCelebrationKey, Animated.Value> | null>(null);
  if (opacitiesRef.current == null) {
    opacitiesRef.current = {
      golden: new Animated.Value(0),
      rainbow: new Animated.Value(0),
      giant: new Animated.Value(0),
      prism: new Animated.Value(0),
    };
  }
  const opacities = opacitiesRef.current;

  useImperativeHandle(
    ref,
    () => ({
      flash(mutationKey) {
        const opacity = opacities[mutationKey];
        const config = MUTATION_CELEBRATION_CONFIG[mutationKey];
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          mutationFlashTestHook?.(mutationKey);
        }
        for (const key of MUTATION_CELEBRATION_KEYS) {
          opacities[key].stopAnimation();
          opacities[key].setValue(0);
        }
        // Avoid Animated.delay here: stopAnimation() does not reliably interrupt
        // a delay stage mid-sequence in React Native, which can make rapid mixed
        // mutations snap. Any desired hold is folded into the rise duration.
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: config.flashPeakOpacity,
            duration: config.flashRiseMs,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: config.flashFadeMs,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start();
      },
    }),
    [opacities]
  );

  return (
    <>
      {MUTATION_CELEBRATION_KEYS.map((mutationKey) => (
        <Animated.View
          key={mutationKey}
          pointerEvents="none"
          testID={`mutation-flash-${mutationKey}`}
          style={[
            styles.mutationFlash,
            {
              opacity: opacities[mutationKey],
              backgroundColor: MUTATION_CELEBRATION_CONFIG[mutationKey].flashColor,
            },
          ]}
        />
      ))}
    </>
  );
});

// Memoized so a tick or a single plot's plant-pulse update never reconciles the
// other (up to 24) plot subtrees. Relies on stable, index-based callbacks and
// performPlant/performHarvest keeping untouched plot object refs intact.
const PlotCell = React.memo(function PlotCell({
  index,
  plot,
  unlocked,
  progressRatio,
  growthCountdown,
  tileSize,
  messages,
  cropName,
  plantToken,
  onPlantPulseDone,
  onPress,
}: {
  index: number;
  plot: GameState['plots'][number];
  unlocked: boolean;
  progressRatio: number;
  growthCountdown: string | undefined;
  tileSize: number;
  messages: FarmMessages;
  cropName: string | undefined;
  plantToken: number | undefined;
  onPlantPulseDone: (index: number) => void;
  onPress: (index: number) => void;
}) {
  const tileSizeStyle = { width: tileSize, height: tileSize };
  const handlePress = () => onPress(index);
  // Announce plots with a human-readable 1-based number for screen readers.
  const plotNumber = index + 1;

  if (!unlocked) {
    return (
      <Pressable
        testID={`plot-cell-${index}`}
        accessibilityRole="button"
        accessibilityLabel={messages.plotLockedAccessibilityLabel(plotNumber)}
        accessibilityState={{ disabled: true }}
        style={[styles.plotTile, tileSizeStyle, styles.lockedPlot]}
        onPress={handlePress}
      >
        <Text style={styles.lockIcon}>🔒</Text>
      </Pressable>
    );
  }

  if (plot.state === 0) {
    return (
      <Pressable
        testID={`plot-cell-${index}`}
        accessibilityRole="button"
        accessibilityLabel={messages.plotEmptyAccessibilityLabel(plotNumber)}
        style={[styles.plotTile, tileSizeStyle, styles.emptyPlot]}
        onPress={handlePress}
      >
        <Text style={styles.emptyPlotText}>{messages.emptyPlot}</Text>
      </Pressable>
    );
  }

  const crop = plot.cropType != null ? getCrop(plot.cropType) : null;
  // Fall back to the empty-plot label when the crop name is missing (unreachable
  // by type, but guards against an empty accessibility label).
  const plotAccessibilityLabel =
    cropName == null
      ? messages.plotEmptyAccessibilityLabel(plotNumber)
      : plot.state === 2
        ? messages.plotReadyAccessibilityLabel(cropName)
        : messages.plotGrowingAccessibilityLabel(cropName, growthCountdown);
  // Four-stage growth reveal (see getCropGrowthStage): a generic sprout, then a
  // leaf, then a dim/shrunk preview of the crop's own icon (budding), then the
  // full icon (mature). This lets crops look distinct well before harvest instead
  // of all sharing 🌱/🌿 until 65%. Ready plots always show the full crop icon.
  const growthStage: CropGrowthStage = plot.state === 1 ? getCropGrowthStage(progressRatio) : 'mature';
  const nearlyReady = plot.state === 1 && isCropNearlyReady(progressRatio);
  const cropIconGlyph = crop?.icon ?? '🌿';
  const growingGlyph =
    growthStage === 'sprout' ? '🌱' : growthStage === 'sapling' ? '🌿' : cropIconGlyph;

  return (
    <Pressable
      testID={`plot-cell-${index}`}
      accessibilityRole="button"
      accessibilityLabel={plotAccessibilityLabel}
      style={[styles.plotTile, tileSizeStyle, plot.state === 2 ? styles.readyPlot : styles.growingPlot]}
      onPress={handlePress}
    >
      {plot.state === 2 ? (
        <View style={styles.harvestBadge}>
          <Text style={styles.harvestBadgeText}>{messages.readyBadge}</Text>
        </View>
      ) : null}
      {plot.state === 1 && crop != null && plot.startTime != null ? (
        <>
          {growthCountdown != null ? (
            <View style={[styles.growthTimer, { maxWidth: Math.max(0, tileSize - 10) }]}>
              <Text style={styles.growthTimerText} numberOfLines={1} ellipsizeMode="tail">
                {growthCountdown}
              </Text>
            </View>
          ) : null}
          <GrowthProgressBar progressRatio={progressRatio} />
        </>
      ) : null}
      {plot.state === 2 ? (
        <ReadyCropIcon cropKey={plot.cropType ?? null} icon={cropIconGlyph} phaseSeed={plot.id} />
      ) : (
        <GrowingCropIcon
          cropKey={plot.cropType ?? null}
          icon={growingGlyph}
          stage={growthStage}
          nearlyReady={nearlyReady}
          plantToken={plantToken}
          onPlantPulseDone={() => onPlantPulseDone(index)}
        />
      )}
    </Pressable>
  );
});

function ReadyCropIcon({
  cropKey,
  icon,
  phaseSeed,
}: {
  cropKey: CropKey | null;
  icon: string;
  phaseSeed: number;
}) {
  const artSource = useCropArtSource(cropKey);
  const [artFailed, setArtFailed] = useState(false);
  const pulseRef = useRef<Animated.Value | null>(null);
  if (pulseRef.current == null) {
    pulseRef.current = new Animated.Value(0);
  }
  const pulse = pulseRef.current;

  useEffect(() => {
    // Stagger each plot's pulse by a stable per-plot offset so a grid of ripe
    // crops breathes organically instead of beating in robotic unison.
    const startDelay = (phaseSeed % 7) * 90;
    const animation = Animated.sequence([
      Animated.delay(startDelay),
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 650,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 650,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      ),
    ]);
    animation.start();
    return () => animation.stop();
  }, [pulse, phaseSeed]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });

  if (artSource != null && !artFailed) {
    return (
      <Animated.View style={{ transform: [{ scale }] }}>
        <Image
          source={artSource}
          onError={() => setArtFailed(true)}
          style={styles.readyCropImage}
          resizeMode="contain"
        />
      </Animated.View>
    );
  }
  return <Animated.Text style={[styles.readyCropIcon, { transform: [{ scale }] }]}>{icon}</Animated.Text>;
}

// The growing-crop sprout. On a fresh manual plant (plantToken set), it bounces
// in once so tapping an empty plot feels tactile. Auto-replant and save-load
// pass no token, so reopening the app never re-pops every growing plot.
function GrowingCropIcon({
  cropKey,
  icon,
  stage,
  nearlyReady,
  plantToken,
  onPlantPulseDone,
}: {
  cropKey: CropKey | null;
  icon: string;
  stage: CropGrowthStage;
  nearlyReady: boolean;
  plantToken: number | undefined;
  onPlantPulseDone: () => void;
}) {
  // sprout/sapling share the generic stage art; budding/mature show the crop's
  // own art (the budding dim/shrink treatment below applies to both paths).
  const art = useFarmArt();
  const cropArtSource = useCropArtSource(cropKey);
  const artSource =
    stage === 'sprout' || stage === 'sapling' ? (art.stageIcon?.(stage) ?? null) : cropArtSource;
  const [artFailed, setArtFailed] = useState(false);
  const popRef = useRef<Animated.Value | null>(null);
  if (popRef.current == null) {
    popRef.current = new Animated.Value(1);
  }
  const pop = popRef.current;
  // Separate looping value for the "almost ready" pulse so it composes with the
  // one-shot plant pop without fighting over the same driver.
  const readyPulseRef = useRef<Animated.Value | null>(null);
  if (readyPulseRef.current == null) {
    readyPulseRef.current = new Animated.Value(0);
  }
  const readyPulse = readyPulseRef.current;
  const lastTokenRef = useRef<number | undefined>(undefined);
  const onDoneRef = useRef(onPlantPulseDone);
  onDoneRef.current = onPlantPulseDone;

  useEffect(() => {
    if (plantToken == null || plantToken === lastTokenRef.current) {
      return undefined;
    }
    lastTokenRef.current = plantToken;
    pop.setValue(0);
    const animation = Animated.timing(pop, {
      toValue: 1,
      duration: PLANT_POP_DURATION_MS,
      easing: Easing.out(Easing.back(2.2)),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) {
        // Clear the parent token so a later remount never re-triggers the pop.
        onDoneRef.current();
      }
    });
    return () => animation.stop();
  }, [plantToken, pop]);

  useEffect(() => {
    // Only crops in the final stretch pulse, so a grid of early plots stays calm
    // and the loop runs on at most the few plots that are about to ripen.
    if (!nearlyReady) {
      readyPulse.setValue(0);
      return undefined;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(readyPulse, {
          toValue: 1,
          duration: 620,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(readyPulse, {
          toValue: 0,
          duration: 620,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [nearlyReady, readyPulse]);

  // The budding stage shows the crop's own icon as a dim, shrunk preview so the
  // reveal feels gradual; sprout/sapling glyphs and the mature icon render full.
  const previewScale = stage === 'budding' ? 0.78 : 1;
  const previewOpacity = stage === 'budding' ? 0.72 : 1;
  const popScale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const popOpacity = pop.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.2, 1, 1] });
  const pulseScale = readyPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const scale = Animated.multiply(Animated.multiply(popScale, previewScale), pulseScale);
  const opacity = Animated.multiply(popOpacity, previewOpacity);

  if (artSource != null && !artFailed) {
    return (
      <Animated.View style={{ opacity, transform: [{ scale }] }}>
        <Image
          source={artSource}
          onError={() => setArtFailed(true)}
          style={styles.cropImage}
          resizeMode="contain"
        />
      </Animated.View>
    );
  }
  return (
    <Animated.Text style={[styles.cropIcon, { opacity, transform: [{ scale }] }]}>{icon}</Animated.Text>
  );
}

const HarvestFxOverlay = React.forwardRef<HarvestFxHandle, { tileSize: number }>(function HarvestFxOverlay(
  { tileSize },
  ref
) {
  const [pops, setPops] = useState<HarvestPop[]>([]);
  const idRef = useRef(0);

  useImperativeHandle(
    ref,
    () => ({
      spawn(index, label, tone) {
        const id = (idRef.current += 1);
        setPops((prev) => {
          // Cap concurrent pops so rapid tapping can never grow the overlay
          // unbounded before each pop self-removes at the end of its animation.
          const next = prev.length >= 8 ? prev.slice(prev.length - 7) : prev;
          return [...next, { id, index, label, tone }];
        });
      },
    }),
    []
  );

  const remove = useCallback((id: number) => {
    setPops((prev) => prev.filter((pop) => pop.id !== id));
  }, []);

  return (
    <>
      {pops.map((pop) => (
        <HarvestPopText key={pop.id} pop={pop} tileSize={tileSize} onDone={remove} />
      ))}
    </>
  );
});

function HarvestPopText({
  pop,
  tileSize,
  onDone,
}: {
  pop: HarvestPop;
  tileSize: number;
  onDone: (id: number) => void;
}) {
  const progressRef = useRef<Animated.Value | null>(null);
  if (progressRef.current == null) {
    progressRef.current = new Animated.Value(0);
  }
  const progress = progressRef.current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const mutationTone = pop.tone === 'normal' || pop.tone === 'special' ? null : pop.tone;
  const mutationConfig = mutationTone == null ? null : MUTATION_CELEBRATION_CONFIG[mutationTone];

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: mutationConfig?.popDurationMs ?? 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) {
        onDoneRef.current(pop.id);
      }
    });
    return () => animation.stop();
  }, [mutationConfig?.popDurationMs, pop.id, progress]);

  const col = pop.index % PLOT_COLUMNS;
  const row = Math.floor(pop.index / PLOT_COLUMNS);
  const left = col * (tileSize + PLOT_GAP);
  const top = row * (tileSize + PLOT_GAP);

  const isMutationTone = mutationConfig != null;
  const yTop = -tileSize * (mutationConfig?.popRiseMultiplier ?? 0.55);
  // Scale start and max are larger for mutation tones to give the jackpot pop extra punch;
  // normal/special keep their original 0.6 start so existing harvest feel is unchanged.
  const scaleStart = isMutationTone ? 0.4 : 0.6;
  const scaleMax = mutationConfig?.popScaleMax ?? 1.15;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [tileSize * 0.2, yTop],
  });
  const scale = progress.interpolate({
    inputRange: [0, 0.25, 1],
    outputRange: [scaleStart, scaleMax, 1],
  });
  // Mutation pops fade in a touch faster (0.1 vs 0.12) and out a touch earlier (0.6
  // vs 0.65) so the longer animation duration feels proportionate; normal/special keep
  // the original timing so their feel is unchanged.
  const opacity = progress.interpolate({
    inputRange: isMutationTone ? [0, 0.1, 0.6, 1] : [0, 0.12, 0.65, 1],
    outputRange: [0, 1, 1, 0],
  });

  const icon = mutationConfig == null ? '' : `${mutationConfig.popIcon} `;

  return (
    <View pointerEvents="none" style={[styles.harvestPop, { left, top, width: tileSize, height: tileSize }]}>
      <Animated.Text
        testID={`harvest-pop-${pop.tone}`}
        style={[
          styles.harvestPopText,
          pop.tone === 'special' && styles.harvestPopTextSpecial,
          pop.tone === 'golden' && styles.harvestPopTextGolden,
          pop.tone === 'rainbow' && styles.harvestPopTextRainbow,
          pop.tone === 'giant' && styles.harvestPopTextGiant,
          pop.tone === 'prism' && styles.harvestPopTextPrism,
          { opacity, transform: [{ translateY }, { scale }] },
        ]}
      >
        {icon}{pop.label}
      </Animated.Text>
    </View>
  );
}

function GrowthProgressBar({ progressRatio }: { progressRatio: number }) {
  const progressScaleRef = useRef<Animated.Value | null>(null);
  if (progressScaleRef.current == null) {
    progressScaleRef.current = new Animated.Value(progressRatio);
  }
  const progressScale = progressScaleRef.current;
  // Recomputed on every parent re-render (the 250ms game tick), so the bar
  // advances in small steps instead of one animation spanning the whole grow time.
  const targetRatio = progressRatio;

  useEffect(() => {
    if (targetRatio >= 1) {
      progressScale.stopAnimation();
      progressScale.setValue(1);
      return undefined;
    }

    // Animate only across a single game tick. Driving a native animation over
    // the full remaining grow time made React Native precompute one frame per
    // 60fps step of that duration: legend-tier crops (e.g. world_tree, growTime
    // 5 days) generated millions of frames, freezing the JS thread and crashing
    // the app the moment such a crop was planted or its save was reloaded.
    const animation = Animated.timing(progressScale, {
      toValue: targetRatio,
      duration: PROGRESS_ANIMATION_DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animation.start();

    return () => {
      animation.stop();
    };
  }, [progressScale, targetRatio]);

  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, { transform: [{ scaleX: progressScale }] }]} />
    </View>
  );
}

function Sheet({
  activeSheet,
  children,
  description,
  title,
  closeLabel,
  bottomInset,
  canClose,
  onClose,
}: {
  activeSheet: ActiveSheet;
  children: React.ReactNode;
  description: string;
  title: string;
  closeLabel: string;
  // 하단 시스템 UI와 시트 하단 버튼이 겹치지 않도록 확보할 하단 인셋(#236).
  bottomInset: number;
  // Rewarded-ad requests may temporarily own a sheet snapshot. Reject the
  // native close before animating so a pending request cannot leave an
  // invisible, still-mounted modal behind.
  canClose?: () => boolean;
  onClose: () => boolean | void;
}) {
  const dragYRef = useRef<Animated.Value | null>(null);
  if (dragYRef.current == null) {
    dragYRef.current = new Animated.Value(SHEET_DISMISS_TRANSLATE_Y);
  }
  const dragY = dragYRef.current;
  const wasVisibleRef = useRef(false);
  const isClosingRef = useRef(false);
  const dimmedOpacity = dragY.interpolate({
    inputRange: [0, SHEET_DISMISS_TRANSLATE_Y],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const shouldHandleSheetDrag = useCallback((dy: number, dx: number) => dy > 4 && Math.abs(dy) > Math.abs(dx), []);
  const restoreSheetPosition = useCallback(() => {
    dragY.stopAnimation();
    Animated.spring(dragY, {
      toValue: 0,
      damping: 18,
      stiffness: 220,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [dragY]);
  const closeSheetWithAnimation = useCallback(() => {
    if (isClosingRef.current) {
      return;
    }
    if (canClose?.() === false) {
      restoreSheetPosition();
      return;
    }

    isClosingRef.current = true;
    dragY.stopAnimation();
    Animated.timing(dragY, {
      toValue: SHEET_DISMISS_TRANSLATE_Y,
      duration: SHEET_ANIMATION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      isClosingRef.current = false;
      if (finished && onClose() === false) {
        // The close became invalid while the animation was running (for
        // example, a rewarded request acquired the welcome-back snapshot).
        restoreSheetPosition();
      }
    });
  }, [canClose, dragY, onClose, restoreSheetPosition]);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => shouldHandleSheetDrag(gestureState.dy, gestureState.dx),
        onMoveShouldSetPanResponderCapture: (_, gestureState) =>
          shouldHandleSheetDrag(gestureState.dy, gestureState.dx),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          dragY.stopAnimation();
        },
        onPanResponderMove: (_, gestureState) => {
          dragY.setValue(Math.max(0, gestureState.dy));
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > SHEET_DISMISS_DRAG_DISTANCE || gestureState.vy > SHEET_DISMISS_VELOCITY) {
            closeSheetWithAnimation();
            return;
          }

          restoreSheetPosition();
        },
        onPanResponderTerminate: () => {
          restoreSheetPosition();
        },
      }),
    [closeSheetWithAnimation, dragY, restoreSheetPosition, shouldHandleSheetDrag]
  );

  useEffect(() => {
    const isVisible = activeSheet != null;

    if (isVisible && !wasVisibleRef.current) {
      isClosingRef.current = false;
      dragY.stopAnimation();
      dragY.setValue(SHEET_DISMISS_TRANSLATE_Y);
      Animated.timing(dragY, {
        toValue: 0,
        duration: SHEET_ANIMATION_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }

    if (!isVisible) {
      isClosingRef.current = false;
      dragY.stopAnimation();
      dragY.setValue(SHEET_DISMISS_TRANSLATE_Y);
    }

    wasVisibleRef.current = isVisible;
  }, [activeSheet, dragY]);

  return (
    <Modal transparent visible={activeSheet != null} animationType="none" onRequestClose={closeSheetWithAnimation}>
      <KeyboardAvoidingView behavior="padding" style={styles.modalRoot}>
        <Animated.View style={[StyleSheet.absoluteFillObject, styles.modalBackdrop, { opacity: dimmedOpacity }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            style={StyleSheet.absoluteFillObject}
            onPress={closeSheetWithAnimation}
          />
        </Animated.View>
        <Animated.View style={[styles.sheet, { transform: [{ translateY: dragY }] }]}>
          <View testID="sheet-drag-handle" style={styles.sheetDragArea} {...panResponder.panHandlers}>
            <View style={styles.sheetHandle} />
          </View>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Text style={styles.sheetDescription}>{description}</Text>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.sheetContent,
              { paddingBottom: SHEET_CONTENT_BASE_PADDING_BOTTOM + bottomInset },
            ]}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function getSheetTitle(activeSheet: ActiveSheet, messages: FarmMessages) {
  if (activeSheet?.type === 'growthAd') {
    return messages.sheetTitleGrowthAd;
  }
  if (activeSheet?.type === 'achievements') {
    return messages.sheetTitleAchievements;
  }
  if (activeSheet?.type === 'lab') {
    return messages.sheetTitleLab;
  }
  if (activeSheet?.type === 'map') {
    return messages.sheetTitleMap;
  }
  if (activeSheet?.type === 'prestigeConfirm') {
    return messages.sheetTitlePrestigeConfirm;
  }
  if (activeSheet?.type === 'harvestBonus') {
    return messages.sheetTitleHarvestBonus;
  }
  if (activeSheet?.type === 'dailyBonus') {
    return messages.sheetTitleDailyBonus;
  }
  if (activeSheet?.type === 'wheel') {
    return messages.sheetTitleWheel;
  }
  if (activeSheet?.type === 'animals') {
    return messages.sheetTitleAnimals;
  }
  if (activeSheet?.type === 'workshop') {
    return messages.sheetTitleWorkshop;
  }
  if (activeSheet?.type === 'welcomeBack') {
    return messages.sheetTitleWelcomeBack;
  }
  if (activeSheet?.type === 'settings') {
    return messages.sheetTitleSettings;
  }
  if (activeSheet?.type === 'resetConfirm') {
    return messages.sheetTitleResetConfirm;
  }
  if (activeSheet?.type === 'collection') {
    return messages.sheetTitleCollection;
  }
  if (activeSheet?.type === 'missions') {
    return messages.sheetTitleMissions;
  }
  if (activeSheet?.type === 'more') {
    return messages.sheetTitleMore;
  }
  if (activeSheet?.type === 'stats') {
    return messages.sheetTitleStats;
  }
  return messages.sheetTitleShop;
}

function getSheetDescription(
  activeSheet: ActiveSheet,
  messages: FarmMessages,
  locale: SupportedLocale,
  getLocalizedCropName: (cropKey: CropKey) => string,
  collectionSummary: CollectionSummary,
  dailyBonusStreak: number
) {
  if (activeSheet?.type === 'collection') {
    return messages.sheetDescriptionCollection(collectionSummary.discoveredCount, collectionSummary.totalCount);
  }
  if (activeSheet?.type === 'missions') {
    return messages.sheetDescriptionMissions;
  }
  if (activeSheet?.type === 'more') {
    return messages.sheetDescriptionMore;
  }
  if (activeSheet?.type === 'stats') {
    return messages.sheetDescriptionStats;
  }
  if (activeSheet?.type === 'achievements') {
    return messages.sheetDescriptionAchievements;
  }
  if (activeSheet?.type === 'lab') {
    return messages.sheetDescriptionLab;
  }
  if (activeSheet?.type === 'map') {
    return messages.sheetDescriptionMap;
  }
  if (activeSheet?.type === 'prestigeConfirm') {
    return messages.sheetDescriptionPrestigeConfirm;
  }
  if (activeSheet?.type === 'growthAd') {
    return messages.sheetDescriptionGrowthAd(
      getLocalizedCropName(activeSheet.cropKey),
      formatRemainingTime(activeSheet.remainingMs, locale)
    );
  }
  if (activeSheet?.type === 'harvestBonus') {
    return messages.sheetDescriptionHarvestBonus(
      formatRemainingTime(HARVEST_BONUS_BOOST_DURATION_MS, locale),
      HARVEST_BONUS_MULTIPLIER
    );
  }
  if (activeSheet?.type === 'dailyBonus') {
    return messages.sheetDescriptionDailyBonus(dailyBonusStreak);
  }
  if (activeSheet?.type === 'wheel') {
    return messages.sheetDescriptionWheel;
  }
  if (activeSheet?.type === 'animals') {
    return messages.sheetDescriptionAnimals;
  }
  if (activeSheet?.type === 'workshop') {
    return messages.sheetDescriptionWorkshop;
  }
  if (activeSheet?.type === 'welcomeBack') {
    return messages.sheetDescriptionWelcomeBack(formatDuration(activeSheet.summary.awayMs, locale));
  }
  if (activeSheet?.type === 'settings') {
    return messages.sheetDescriptionSettings;
  }
  if (activeSheet?.type === 'resetConfirm') {
    return messages.sheetDescriptionResetConfirm(messages.resetConfirmText);
  }
  return messages.sheetDescriptionShop;
}

// Memoized so the per-area crop row skips the 250ms idle tick: all props are
// primitives and onSelect/toolKey are stable, so unchanged buttons keep
// referential equality and never re-render until cost/affordability/selection
// actually changes. (masteryRank is passed as a primitive icon string to avoid
// the object-identity churn that would otherwise defeat the memo every render.)
const ToolButton = React.memo(function ToolButton({
  active,
  icon,
  cropKey,
  name,
  cost,
  roi,
  affordable,
  masteryIcon,
  isNew,
  newLabel,
  cotdBadge,
  weeklyBadge,
  bonusA11yLabel,
  toolKey,
  testID,
  onSelect,
}: {
  active: boolean;
  icon: string;
  // Seed tools pass their crop key so the icon can render generated art;
  // the harvest tool leaves it unset and keeps its emoji glyph.
  cropKey?: CropKey;
  name: string;
  cost?: string;
  roi?: string;
  affordable?: boolean;
  masteryIcon?: string;
  isNew?: boolean;
  newLabel?: string;
  // 판매 보너스 배지 텍스트(예: '⭐×2' / '🎉×1.5'). 없으면 미노출(#226).
  cotdBadge?: string;
  weeklyBadge?: string;
  bonusA11yLabel?: string;
  toolKey: ToolKey;
  testID?: string;
  onSelect: (toolKey: ToolKey) => void;
}) {
  const baseA11yLabel = cost != null ? `${name}, ${cost}` : name;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={bonusA11yLabel != null ? `${baseA11yLabel}, ${bonusA11yLabel}` : baseA11yLabel}
      accessibilityState={{ selected: active }}
      style={[styles.toolButton, active && styles.activeToolButton]}
      onPress={() => onSelect(toolKey)}
    >
      <CropGlyph cropKey={cropKey} emoji={icon} size={24} textStyle={styles.toolIcon} />
      <Text style={styles.toolName} numberOfLines={1}>
        {name}
      </Text>
      {cost != null ? (
        <Text style={[styles.toolCost, affordable === false && styles.toolCostUnaffordable]}>{cost}</Text>
      ) : null}
      {roi != null ? <Text style={styles.toolRoi}>{roi}</Text> : null}
      {masteryIcon != null ? (
        <View pointerEvents="none" style={styles.toolMasteryBadge}>
          <Text style={styles.toolMasteryBadgeText}>{masteryIcon}</Text>
        </View>
      ) : null}
      {isNew === true && newLabel != null ? (
        <View pointerEvents="none" style={styles.toolNewBadge}>
          <Text style={styles.toolNewBadgeText}>{newLabel}</Text>
        </View>
      ) : null}
      {cotdBadge != null || weeklyBadge != null ? (
        <View pointerEvents="none" style={styles.toolBonusBadgeRow}>
          {cotdBadge != null ? (
            <View testID={`seed-bonus-cotd-${toolKey}`} style={styles.toolBonusBadge}>
              <Text style={styles.toolBonusBadgeText}>{cotdBadge}</Text>
            </View>
          ) : null}
          {weeklyBadge != null ? (
            <View testID={`seed-bonus-weekly-${toolKey}`} style={styles.toolBonusBadge}>
              <Text style={styles.toolBonusBadgeText}>{weeklyBadge}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
});

function ShopPlotRow({
  gameState,
  locale,
  messages,
  setGameState,
  getAnalyticsContext,
  analytics,
  onDone,
  onMilestone,
}: {
  gameState: GameState;
  locale: SupportedLocale;
  messages: FarmMessages;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  getAnalyticsContext: GetAnalyticsContext;
  analytics: FarmAnalytics;
  onDone: (msg: string) => void;
  onMilestone: () => void;
}) {
  const isMax = gameState.unlockedPlotCount >= MAX_PLOTS;
  const cost = getPlotCost(gameState.unlockedPlotCount);
  const canBuy = !isMax && gameState.gold >= cost;

  return (
    <ShopCard
      title={messages.shopPlotTitle}
      desc={messages.shopPlotDesc(gameState.unlockedPlotCount)}
      price={isMax ? messages.completePrice : `${formatMoney(cost, locale)}G`}
      disabled={isMax || !canBuy}
      onPress={() => {
        if (isMax) {
          onDone(messages.noMoreExpansionToast);
          return;
        }
        if (gameState.gold < cost) {
          onDone(messages.insufficientGoldToast);
          return;
        }
        setGameState((state) => ({
          ...state,
          gold: state.gold - cost,
          unlockedPlotCount: state.unlockedPlotCount + 1,
        }));
        analytics.trackPlotUnlocked({
          method: 'gold',
          cost,
          nextPlotCount: gameState.unlockedPlotCount + 1,
          context: getAnalyticsContext(gameState),
        });
        onDone(messages.plotExpandedToast);
        onMilestone();
      }}
    />
  );
}

function ShopAreaUnlockRows({
  gameState,
  locale,
  messages,
  setGameState,
  getAnalyticsContext,
  analytics,
  onDone,
  onMilestone,
  onUnlocked,
}: {
  gameState: GameState;
  locale: SupportedLocale;
  messages: FarmMessages;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  getAnalyticsContext: GetAnalyticsContext;
  analytics: FarmAnalytics;
  onDone: (msg: string) => void;
  onMilestone: () => void;
  // Fired after a successful unlock commit (SFX hook; host owns the guard).
  onUnlocked: () => void;
}) {
  const lockedAreas = FARM_AREAS.filter((area) => !isAreaUnlocked(gameState, area.key));
  // Gated areas (research-unlocked) sit outside the sequential progression.
  const sequentialAreas = lockedAreas.filter((area) => area.unlock.gate == null);
  const gatedAreas = lockedAreas.filter((area) => area.unlock.gate != null);

  if (lockedAreas.length === 0) {
    return (
      <ShopCard
        title={messages.allAreasUnlockedTitle}
        desc={messages.allAreasUnlockedDesc}
        price={messages.completePrice}
        disabled
        onPress={() => undefined}
      />
    );
  }

  const renderAreaCard = (area: (typeof FARM_AREAS)[number], isNextArea: boolean) => {
    const canBuy = isNextArea && canUnlockArea(gameState, area.key);
    const areaLabel = getAreaLabel(area.key, locale);
    const requirementText = getAreaUnlockRequirementText(gameState, area.key, locale);

    return (
      <ShopCard
        key={area.key}
        title={messages.areaOpenTitle(areaLabel.name)}
        desc={`${areaLabel.target} · ${requirementText}`}
        price={`${formatMoney(area.unlock.cost, locale)}G`}
        disabled={!canBuy}
        onPress={() => {
          analytics.trackAreaUnlockClicked(area.key, getAnalyticsContext(gameState));
          if (!isNextArea) {
            onDone(messages.previousAreaRequiredToast);
            return;
          }
          if (!canUnlockArea(gameState, area.key)) {
            onDone(messages.areaRequirementsMissingToast);
            return;
          }

          setGameState((state) => {
            if (!canUnlockArea(state, area.key)) {
              return state;
            }
            return {
              ...state,
              gold: state.gold - area.unlock.cost,
              unlockedAreas: [...state.unlockedAreas, area.key],
            };
          });
          analytics.trackAreaUnlocked({
            areaKey: area.key,
            cost: area.unlock.cost,
            context: getAnalyticsContext(gameState),
          });
          onUnlocked();
          onDone(messages.areaOpenedToast(areaLabel.name));
          onMilestone();
        }}
      />
    );
  };

  return (
    <>
      {sequentialAreas.map((area, index) => renderAreaCard(area, index === 0))}
      {gatedAreas.map((area) => renderAreaCard(area, true))}
    </>
  );
}

// Cosmetic layer that surfaces owned decorations on the main farm screen so the
// gold spent on them is actually visible (the shop copy promises "decorate your
// farm"). Rendered below the plot grid — never over it — so it can't cover a
// plant/harvest hit area, and hidden entirely when nothing is owned. Purely
// decorative, so the whole strip is removed from the accessibility tree to keep
// it from interrupting the plot-state labels a screen-reader user relies on.
// 소유 동물 스트립(#360): 농장 장면 하단(장식 스트립과 동일 레이어)에 소유 동물을
// 아이콘으로 요약 노출한다. phase==='ready' 동물은 미세 강조(글로우+뱃지)로 수확 가능함을
// 알리고, 스트립 전체가 하나의 탭 타깃으로 기존 동물 시트(openAnimals)를 연다. 소유
// 0마리면 장식 스트립과 동일하게 렌더하지 않으며, 카운트다운/급여 등 상세는 두지 않는다
// (홈은 요약만). 순수 표시 아이콘은 Pressable 하나로 묶여 스크린리더에는 탭 라벨만 읽힌다.
function FarmAnimalStrip({
  gameState,
  now,
  messages,
  onPress,
}: {
  gameState: GameState;
  now: number;
  messages: FarmMessages;
  onPress: () => void;
}) {
  const owned = getAnimalStates(gameState, now).filter((status) => status.owned);
  if (owned.length === 0) {
    return null;
  }
  const readyCount = owned.filter((status) => status.phase === 'ready').length;
  return (
    <Pressable
      testID="animal-strip"
      style={styles.animalStrip}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={messages.animalStripAccessibilityLabel(readyCount)}
    >
      {owned.map((status) => {
        const ready = status.phase === 'ready';
        return (
          <View key={status.key} style={[styles.animalStripItem, ready && styles.animalStripItemReady]}>
            <Text style={styles.animalStripIcon}>{status.icon}</Text>
            {ready ? (
              <View testID={`animal-strip-ready-${status.key}`} style={styles.animalStripReadyBadge} />
            ) : null}
          </View>
        );
      })}
    </Pressable>
  );
}

function FarmDecorationStrip({ gameState }: { gameState: GameState }) {
  const placed = getPlacedDecorations(gameState);
  if (placed.length === 0) {
    return null;
  }
  return (
    <View
      style={styles.decorationStrip}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {placed.map((decoration) => (
        <Text key={decoration.key} style={styles.decorationStripIcon}>
          {decoration.icon}
        </Text>
      ))}
    </View>
  );
}

function ShopDecorationRows({
  gameState,
  locale,
  messages,
  setGameState,
  onDone,
}: {
  gameState: GameState;
  locale: SupportedLocale;
  messages: FarmMessages;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  onDone: (msg: string) => void;
}) {
  return (
    <>
      {DECORATIONS.map((decoration) => {
        const label = getDecorationLabel(decoration.key, locale);
        const owned = isDecorationOwned(gameState.placedDecorations, decoration.key);
        const affordable = canPurchaseDecoration(gameState, decoration.key);
        const goldProgress =
          owned || affordable ? undefined : Math.min(1, gameState.gold / decoration.price);

        return (
          <ShopCard
            key={decoration.key}
            title={`${decoration.icon} ${label.name}`}
            desc={owned ? messages.decorationOwnedDesc(label.description) : label.description}
            price={owned ? messages.decorationOwnedBadge : `${formatMoney(decoration.price, locale)}G`}
            disabled={owned || !affordable}
            goldProgress={goldProgress}
            onPress={() => {
              setGameState((state) => {
                const next = purchaseDecoration(state, decoration.key);
                if (next == null) {
                  onDone(messages.insufficientGoldToast);
                  return state;
                }
                onDone(messages.decorationPurchasedToast(label.name));
                return next;
              });
            }}
          />
        );
      })}
    </>
  );
}

function ShopUpgradeRow({
  kind,
  gameState,
  locale,
  messages,
  setGameState,
  getAnalyticsContext,
  analytics,
  onDone,
  onMilestone,
}: {
  kind: 'speed' | 'profit';
  gameState: GameState;
  locale: SupportedLocale;
  messages: FarmMessages;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  getAnalyticsContext: GetAnalyticsContext;
  analytics: FarmAnalytics;
  onDone: (msg: string) => void;
  onMilestone: () => void;
}) {
  const level = gameState.upgrades[kind];
  const cost = getUpgradeCost(kind, level);
  const title = kind === 'speed' ? messages.speedUpgradeTitle : messages.profitUpgradeTitle;
  const desc = kind === 'speed' ? messages.speedUpgradeDesc : messages.profitUpgradeDesc;
  const disabled = gameState.gold < cost;
  const goldProgress = disabled ? Math.min(1, gameState.gold / cost) : undefined;
  const [burstGeneration, setBurstGeneration] = useState(0);
  const purchasedLevelRef = useRef<number | null>(null);

  return (
    <View style={styles.upgradeCardHost}>
      <ShopCard
        title={title}
        desc={messages.upgradeDescWithLevel(desc, level)}
        price={`${formatMoney(cost, locale)}G`}
        priceTone={kind}
        disabled={disabled}
        goldProgress={goldProgress}
        onPress={() => {
          // A same-frame second press still sees the same level closure. Record
          // that level synchronously, then allow the next purchase as soon as
          // React renders the incremented level and its newly calculated cost.
          if (disabled || purchasedLevelRef.current === level) {
            if (disabled) {
              onDone(messages.insufficientGoldToast);
            }
            return;
          }
          purchasedLevelRef.current = level;
          setBurstGeneration((generation) => generation + 1);
          setGameState((state) => ({
            ...state,
            gold: state.gold - cost,
            upgrades: { ...state.upgrades, [kind]: state.upgrades[kind] + 1 },
          }));
          analytics.trackUpgradePurchased({
            kind,
            cost,
            nextLevel: level + 1,
            context: getAnalyticsContext(gameState),
          });
          onDone(messages.researchCompletedToast);
          onMilestone();
        }}
      />
      {burstGeneration > 0 ? (
        <UpgradeBurst
          key={burstGeneration}
          kind={kind}
          onComplete={() =>
            setBurstGeneration((current) => (current === burstGeneration ? 0 : current))
          }
        />
      ) : null}
    </View>
  );
}

const UPGRADE_BURST_SPARK_COUNT = 8;

// A small, decorative burst contained inside the purchased upgrade card. Keep
// it on the JS driver so its coordinates follow a scrolling Modal card instead
// of leaving a detached native layer behind during ScrollView movement.
function UpgradeBurst({ kind, onComplete }: { kind: 'speed' | 'profit'; onComplete: () => void }) {
  const progressRef = useRef<Animated.Value | null>(null);
  if (progressRef.current == null) {
    progressRef.current = new Animated.Value(0);
  }
  const progress = progressRef.current;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: UPGRADE_BURST_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    const timer = setTimeout(() => onCompleteRef.current(), UPGRADE_BURST_DURATION_MS);
    return () => {
      animation.stop();
      clearTimeout(timer);
    };
  }, [progress]);

  const opacity = progress.interpolate({ inputRange: [0, 0.72, 1], outputRange: [1, 0.8, 0] });
  const ringScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.18] });
  const iconScale = progress.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0.8, 1.2, 0.8],
  });

  return (
    <View
      testID={`upgrade-burst-${kind}`}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.upgradeBurstOverlay}
    >
      <View style={styles.upgradeBurstCenter}>
        <Animated.View
          style={[
            styles.upgradeBurstRing,
            kind === 'speed' ? styles.upgradeBurstRingSpeed : styles.upgradeBurstRingProfit,
            { opacity, transform: [{ scale: ringScale }] },
          ]}
        />
        {Array.from({ length: UPGRADE_BURST_SPARK_COUNT }, (_, index) => {
          const angle = (Math.PI * 2 * index) / UPGRADE_BURST_SPARK_COUNT;
          const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * 42] });
          const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * 30] });
          const sparkScale = progress.interpolate({ inputRange: [0, 0.22, 1], outputRange: [0.5, 1, 0.4] });
          return (
            <Animated.View
              key={index}
              style={[
                styles.upgradeBurstSpark,
                kind === 'speed' ? styles.upgradeBurstSparkSpeed : styles.upgradeBurstSparkProfit,
                { opacity, transform: [{ translateX }, { translateY }, { scale: sparkScale }] },
              ]}
            />
          );
        })}
        <Animated.Text style={[styles.upgradeBurstIcon, { opacity, transform: [{ scale: iconScale }] }]}>
          {kind === 'speed' ? '⚡' : '✦'}
        </Animated.Text>
      </View>
    </View>
  );
}
