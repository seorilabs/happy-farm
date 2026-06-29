import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Easing,
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
  REGION_ARCHETYPES,
  RESEARCH_NODES,
  breedCrop,
  buySkill,
  getCropOfTheDayStatus,
  getWeeklyEventStatus,
  canPrestige,
  canUnlockNode,
  claimNextAchievementTier,
  collectChainIncome,
  collectReturnOfflineGold,
  acknowledgeResearchOpportunities,
  hasUnseenResearchOpportunity,
  getBreedingRecipeStatus,
  getChainIncome,
  getClaimableAchievementCount,
  getCropModifiers,
  getCropPurchaseCost,
  getFarmHourlyProductivity,
  getGlobalModifiers,
  getPrestigeSkillLabel,
  getRegionArchetypeLabel,
  getResearchNodeLabel,
  getTitleLabel,
  prestigeFarm,
  runAutomationTick,
  setActiveTitle,
  unlockNode,
  type AchievementTrackKey,
  type MasteryRankKey,
  type PrestigeSkillKey,
  type RegionArchetypeKey,
  type ResearchNodeKey,
  type TitleKey,
  GROWTH_AD_MIN_REMAINING_MS,
  applyGrowthAdSkip,
  getGrowthAdSkipMs,
  HARVEST_BONUS_BOOST_DURATION_MS,
  HARVEST_BONUS_MULTIPLIER,
  getAdLimits,
  MAX_PLOTS,
  PLOT_DISCOUNT_AD_PERCENT,
  getRewardedGoldAmount,
  REWARDED_GOLD_MAX_USES_PER_WINDOW,
  REWARDED_GOLD_WINDOW_MS,
  type AreaKey,
  type CollectionRewardKey,
  type CropKey,
  type GameAnalyticsContext,
  type GameState,
  type RewardedAdController,
  type RewardedAdShowResult,
  type RewardedAdType,
  canShowReturnInterstitial,
  canUnlockArea,
  claimCollectionReward,
  createFarmAnalytics,
  getRewardedAdPlacement,
  createInitialState,
  migrateLoadedState,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  executeFarmGameCommand,
  formatDuration,
  formatHourlyGold,
  formatMoney,
  formatRemainingTime,
  formatSignedPercent,
  getReturnSummary,
  type ReturnSummary,
  getAreaLabel,
  getAreaUnlockRequirementText,
  getCollectionSummary,
  type CollectionSummary,
  getCropLabel,
  getCropEconomyEstimate,
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
  isTitleUnlocked,
  normalizeLocale,
  performHarvestAll,
  performPlantAll,
  getPlantAllPreview,
  getReadyPlotCount,
  recordHarvestBonusAdPrompt,
  recordReturnInterstitial,
  recordRewardedAdUsage,
  type CropHarvestedGameEvent,
  type CropPlantedGameEvent,
  type CropEconomyEstimate,
  type FarmGameCommandBlockedReason,
  type SupportedLocale,
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
import { getFarmMessages, type FarmMessages } from './i18n';
import { AchievementsSheet } from './components/AchievementsSheet';
import { ChainMapSheet, PrestigeConfirmSheet } from './components/ChainMapSheet';
import { CollectionSheet } from './components/CollectionSheet';
import { FarmOnboarding, ONBOARDING_STEPS, type OnboardingStep } from './components/FarmOnboarding';
import { LabSheet } from './components/LabSheet';
import { AdRewardCard, CloudSaveSection, SettingToggle, SheetAction, ShopCard, sheetPartStyles } from './components/SheetParts';
import { MAIN_HORIZONTAL_PADDING, PLOT_COLUMNS, PLOT_GAP } from './farmGameLayout';
import { styles } from './farmGameStyles';

// Game tick: drives idle re-renders so time-based UI (growth, cooldowns) advances.
// The growth bar animates one tick at a time, so its duration is tied to this value
// rather than hardcoded separately.
export const GAME_TICK_INTERVAL_MS = 250;
// Auto-harvest analytics are batched into one summary event per interval.
const AUTO_HARVEST_SUMMARY_INTERVAL_MS = 60_000;
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
// Harvest combo: the window (ms) within which consecutive manual harvests
// build a streak counter. Tier thresholds gate icon/color escalation and
// audio milestone cues.
const COMBO_WINDOW_MS = 1500;
export const COMBO_GREAT_THRESHOLD = 5;
export const COMBO_LEGENDARY_THRESHOLD = 10;
export const MASTERY_RANK_UP_CELEBRATION_DURATION_MS = 2600;
export const PRESTIGE_GRADUATION_CELEBRATION_DURATION_MS = 3500;
export const FIRST_HARVEST_CELEBRATION_DURATION_MS = 3200;
// Safety net for the final onboarding step: if a new player never grows their
// farm (e.g. keeps spending on something the unlock check doesn't track), the
// "first unlock" coachmark auto-dismisses after this long so it can never stick
// around forever.
export const ONBOARDING_UNLOCK_SAFETY_TIMEOUT_MS = 5 * 60_000;
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

// Region scaling can push multipliers far past the upgrade range, so switch
// to a whole-number display once a decimal stops being informative.
function formatStatMultiplier(value: number) {
  return value >= 100 ? `×${Math.round(value).toLocaleString()}` : `×${value.toFixed(1)}`;
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

type ActiveSheet =
  | { type: 'shop' }
  | { type: 'collection' }
  | { type: 'achievements' }
  | { type: 'lab' }
  | { type: 'map' }
  | { type: 'prestigeConfirm' }
  | { type: 'settings' }
  | { type: 'growthAd'; plotIndex: number; cropKey: CropKey; remainingMs: number }
  | { type: 'harvestBonus' }
  | { type: 'welcomeBack'; summary: ReturnSummary }
  | { type: 'dailyBonus' }
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

export type FarmGameAudio = {
  isSupported: boolean;
  playHarvest: () => void | Promise<void>;
  // Fire-and-forget: implementations must not throw or return a rejectable Promise.
  playComboMilestone: (tier: 'great' | 'legendary') => void;
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
  notifications?: FarmGameNotifications;
  market?: FarmGameMarket;
  preferredLocale?: SupportedLocale;
  adGroupIds?: FarmGameAdGroupIds;
};

type GetAnalyticsContext = (state?: GameState) => GameAnalyticsContext;
type ToolKey = 'harvest' | CropKey;
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
      firstMutationFlash: 'golden' | 'rainbow' | null;
      // Carries the lifetime-first-harvest signal when the batch contains it, so
      // the "aha" celebration fires even if the very first harvest came through
      // Harvest All (e.g. a new player whose starter plots ripen together).
      firstHarvest: { cropIcon: string; goldGained: number } | null;
      totalGoldGained: number;
      totalRpGained: number;
      harvestedCount: number;
      specialCount: number;
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
  tone: 'normal' | 'special' | 'golden' | 'rainbow';
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
  flash: (mutationKey: 'golden' | 'rainbow') => void;
};

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

export default function FarmGame({
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
  const { width: windowWidth } = useWindowDimensions();
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
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
  const [notificationPrompt, setNotificationPrompt] = useState(false);
  // Guards the prompt decision so it runs only once per mount.
  const notificationPromptResolvedRef = useRef(false);
  // Current step of the first-session onboarding coachmark; null hides it.
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep | null>(null);
  // Mirror of the current step for stable callbacks (skip handler) that must read
  // the latest step without being recreated on every render.
  const onboardingStepRef = useRef<OnboardingStep | null>(null);
  onboardingStepRef.current = onboardingStep;
  // Tracks the last step we emitted an onboarding_step_view for, so the funnel
  // event fires once per step entry instead of on every render tick.
  const onboardingStepViewedRef = useRef<OnboardingStep | null>(null);
  // Stable handle to the latest analyticsContext (assigned after it is defined),
  // so the onboarding skip/complete handlers and safety timeout can build a fresh
  // context without being recreated on every tick.
  const analyticsContextRef = useRef<GetAnalyticsContext | null>(null);
  // Guards the one-time onboarding start.
  const onboardingInitRef = useRef(false);
  // Soft pulse driving the seed-strip emphasis ring while the selectSeed step is
  // active, so the place to tap reads louder for brand-new players (#159).
  const seedHighlightPulseRef = useRef<Animated.Value | null>(null);
  if (seedHighlightPulseRef.current == null) {
    seedHighlightPulseRef.current = new Animated.Value(0);
  }
  const seedHighlightPulse = seedHighlightPulseRef.current;
  // Progression snapshot taken when onboarding starts. The final "first unlock"
  // step finishes once any of these counters grows — a plot, an area, a growth/
  // profit upgrade, or a research node/breed — so the guide doesn't stall when a
  // new player's first purchase isn't a plot or an area.
  const onboardingBaselineRef = useRef<{
    plotCount: number;
    areaCount: number;
    speedLevel: number;
    profitLevel: number;
    researchNodeCount: number;
    breedCount: number;
  } | null>(null);
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
  const claimedAchievementKeysRef = useRef<Set<string>>(new Set());
  const commandEffectIdRef = useRef(0);
  const pendingCommandEffectsRef = useRef<PendingFarmCommandEffect[]>([]);
  const handledCommandEffectIdsRef = useRef<Set<number>>(new Set());
  const [commandEffectVersion, setCommandEffectVersion] = useState(0);
  // Double-tap guard for confirmPrestige: the state updater is idempotent,
  // but the toast/analytics must fire exactly once per graduated level.
  const prestigedLevelsRef = useRef<Set<number>>(new Set());
  const autoHarvestSummaryRef = useRef({ harvestedCount: 0, replantedCount: 0, windowStartedAt: 0 });
  const rewardedAd = useRewardedAd(adGroupIds.rewarded);
  const interstitialAd = useInterstitialAd(adGroupIds.interstitial);
  const farmAnalytics = analytics;
  const isMobileMarket = market === 'mobile';
  const locale = normalizeLocale(gameSettings.locale);
  const messages = useMemo(() => getFarmMessages(locale), [locale]);
  const resetConfirmValue = messages.resetConfirmText;
  // The language picker shows each language by its own endonym, so these labels
  // read the same regardless of the currently active locale.
  const languageOptionLabels: Record<SupportedLocale, string> = {
    'ko-KR': messages.languageOptionKo,
    'en-US': messages.languageOptionEn,
  };
  const getLocalizedCropName = useCallback((cropKey: CropKey) => getCropLabel(cropKey, locale).name, [locale]);
  const getLocalizedAreaLabel = useCallback((areaKey: AreaKey) => getAreaLabel(areaKey, locale), [locale]);

  const [gameState, setGameState] = useState<GameState>(() => createInitialState());
  // 콜백 의존성을 늘리지 않고 최신 gameState를 읽기 위한 ref(매 렌더 동기화).
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const [selectedTool, setSelectedTool] = useState<ToolKey>('harvest');
  const [selectedArea, setSelectedArea] = useState<AreaKey>(FIRST_AREA.key);
  const [prestigeArchetype, setPrestigeArchetype] = useState<RegionArchetypeKey>(
    REGION_ARCHETYPES[0]?.key ?? 'plains'
  );
  const [tick, setTick] = useState(0);
  const plotTileSize = useMemo(() => {
    const availableWidth = windowWidth - MAIN_HORIZONTAL_PADDING * 2 - PLOT_GAP * (PLOT_COLUMNS - 1);
    return Math.max(48, Math.floor(availableWidth / PLOT_COLUMNS));
  }, [windowWidth]);

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
  // Finishes onboarding (shared by complete/skip). Sets the save flag so it
  // never resurfaces on later launches.
  const finishOnboarding = useCallback(() => {
    setOnboardingStep(null);
    setGameState((state) => (state.onboardingCompleted ? state : { ...state, onboardingCompleted: true }));
  }, []);
  // User-initiated skip: log which step they bailed on, then finish. Kept stable
  // by reading the step from a ref so the coachmark's onSkip prop is steady.
  const skipOnboarding = useCallback(() => {
    const current = onboardingStepRef.current;
    const buildContext = analyticsContextRef.current;
    if (current != null && buildContext != null) {
      farmAnalytics.trackOnboardingSkip({
        skippedStep: current,
        stepIndex: ONBOARDING_STEPS.indexOf(current) + 1,
        context: buildContext(),
      });
    }
    finishOnboarding();
  }, [farmAnalytics, finishOnboarding]);
  // Natural/auto completion (reached the final unlock step or the safety
  // timeout). Distinct from skip so the funnel separates "finished" from
  // "gave up". Stable for the safety-timeout effect.
  const completeOnboarding = useCallback(() => {
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

      const { event } = effect;
      farmAnalytics.trackCropHarvested({
        cropKey: event.cropKey,
        areaKey: event.areaKey,
        cropTier: event.cropTier,
        revenue: event.goldGained,
        isFirstMeaningfulHarvest: event.isFirstMeaningfulHarvest,
        isFirstCropHarvest: event.isNewCropDiscovery,
        context: analyticsContext(),
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
      if (effect.shouldShowHarvestBonusNudge) {
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
      const popTone: HarvestPop['tone'] =
        mutationKey === 'rainbow'
          ? 'rainbow'
          : mutationKey === 'golden'
            ? 'golden'
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
        const mutKey = event.mutation.key;
        if (mutKey === 'golden' || mutKey === 'rainbow') {
          mutationFlashRef.current?.flash(mutKey);
        }
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
    pulseGold,
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
      // Normalize dailyBonusState here so that gameState always holds a valid
      // DailyBonusState even when a custom readPersistedGameState skips
      // migrateLoadedState (the TypeScript type says it's DailyBonusState, but
      // the value may be absent or malformed at runtime).
      setGameState({
        ...savedState,
        dailyBonusState: normalizeDailyBonusState(savedState.dailyBonusState as unknown),
      });
      setIsSaveLoaded(true);

      // Greet returning players with a recap of what waited for them. Computed
      // off the freshly loaded save (not React state, which hasn't committed
      // yet) so the very first frame after a long absence shows the summary.
      const now = Date.now();
      const summary = getReturnSummary(savedState, lastSeenAt, now);
      if (summary != null) {
        setActiveSheet({ type: 'welcomeBack', summary });
        farmAnalytics.trackReturnSummaryShown({
          awayMs: summary.awayMs,
          offlineGold: summary.offlineGold,
          readyCropCount: summary.readyCropCount,
          context: analyticsContext(savedState),
        });
      }
      // Mark "seen" immediately so a quick reload doesn't replay the recap.
      void persistence.writeLastSeenAt?.(now);

      // Check daily login bonus. Only shown when no welcome-back sheet is
      // queued. dailyBonusState lives inside the game save so gold and bonus
      // state are always committed atomically — no separate crash-recovery needed.
      if (summary == null) {
        // Normalize defensively: a custom readPersistedGameState may skip
        // migrateLoadedState, leaving dailyBonusState absent for old saves.
        const preview = previewDailyBonus(
          normalizeDailyBonusState(savedState.dailyBonusState as unknown),
          now,
          getRewardedGoldAmount(savedState)
        );
        if (preview.available) {
          setActiveSheet({ type: 'dailyBonus' });
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

  // Start onboarding once, right after the save loads, only for brand-new
  // players with no progress at all. (Returning players get onboardingCompleted
  // set true by migrateLoadedState, and any in-memory state that already has
  // harvests is treated as experienced too.)
  useEffect(() => {
    if (!isSaveLoaded || onboardingInitRef.current) {
      return;
    }
    onboardingInitRef.current = true;
    const alreadyPlayed =
      gameState.onboardingCompleted ||
      gameState.harvestedCropKeys.length > 0 ||
      gameState.lifetimeStats.totalHarvests > 0 ||
      gameState.prestige.level > 0;
    if (alreadyPlayed) {
      return;
    }
    onboardingBaselineRef.current = {
      plotCount: gameState.unlockedPlotCount,
      areaCount: gameState.unlockedAreas.length,
      speedLevel: gameState.upgrades.speed,
      profitLevel: gameState.upgrades.profit,
      researchNodeCount: gameState.research.unlockedNodes.length,
      breedCount: gameState.research.unlockedBreeds.length,
    };
    setOnboardingStep('selectSeed');
  }, [isSaveLoaded, gameState]);

  // Advance to the next step as the player actually performs each action, and
  // finish onboarding once the final "first unlock" step is done. The whole
  // gameState is a dependency: every setGameState produces a fresh reference, so
  // this re-runs on every state change and always reads the latest values (no
  // stale closure, no missed transition).
  useEffect(() => {
    if (onboardingStep == null || gameState.onboardingCompleted) {
      return;
    }
    if (onboardingStep === 'selectSeed' && selectedTool !== 'harvest') {
      setOnboardingStep('plant');
      return;
    }
    if (onboardingStep === 'plant' && gameState.plots.some((plot) => plot.cropType != null)) {
      setOnboardingStep('harvest');
      return;
    }
    if (onboardingStep === 'harvest' && gameState.harvestedCropKeys.length > 0) {
      setOnboardingStep('unlock');
      return;
    }
    if (onboardingStep === 'unlock') {
      const baseline = onboardingBaselineRef.current;
      // Any farm-growing purchase counts as the "first unlock": a plot, an area,
      // a growth/profit upgrade, or a research node/breed.
      const unlockedSomething =
        baseline != null &&
        (gameState.unlockedPlotCount > baseline.plotCount ||
          gameState.unlockedAreas.length > baseline.areaCount ||
          gameState.upgrades.speed > baseline.speedLevel ||
          gameState.upgrades.profit > baseline.profitLevel ||
          gameState.research.unlockedNodes.length > baseline.researchNodeCount ||
          gameState.research.unlockedBreeds.length > baseline.breedCount);
      if (unlockedSomething) {
        completeOnboarding();
      }
    }
  }, [onboardingStep, selectedTool, gameState, completeOnboarding]);

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

  // Safety net: never let the final "first unlock" coachmark linger forever. If
  // the player lingers on this step without growing their farm, auto-finish (this
  // still counts as a completion for the funnel, not a skip).
  useEffect(() => {
    if (onboardingStep !== 'unlock') {
      return;
    }
    const timer = setTimeout(completeOnboarding, ONBOARDING_UNLOCK_SAFETY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [onboardingStep, completeOnboarding]);

  // Surface the notification permission prompt only after the first harvest
  // ("aha") AND once onboarding is complete. Gating on onboardingCompleted keeps
  // it from colliding with the coachmarks. Skip it for players who have already
  // seen it (harvestNotificationPromptSeen) or whose platform has no support. If
  // notifications are already enabled, don't ask — just settle the flag.
  useEffect(() => {
    if (!isSaveLoaded || notificationPromptResolvedRef.current) return;
    if (!notifications.isSupported) return;
    if (gameState.harvestNotificationPromptSeen) return;
    if (!gameState.onboardingCompleted || gameState.harvestedCropKeys.length === 0) return;
    notificationPromptResolvedRef.current = true;
    if (gameSettings.harvestNotificationsEnabled) {
      markHarvestNotificationPromptSeen();
      return;
    }
    setNotificationPrompt(true);
  }, [
    isSaveLoaded,
    notifications,
    gameState.harvestNotificationPromptSeen,
    gameState.onboardingCompleted,
    gameState.harvestedCropKeys.length,
    gameSettings.harvestNotificationsEnabled,
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
        markSeen();
      }
    });
    return () => {
      clearInterval(heartbeat);
      subscription.remove();
    };
  }, [isSaveLoaded, persistence]);

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
    void notifications.scheduleHarvestReady({
      readyAtMs,
      title: messages.harvestReadyNotificationTitle,
      body: messages.harvestReadyNotificationBody,
    });
    // Only measure when the scheduled target changed; the per-tick re-schedule
    // is noise and would otherwise emit on every render.
    if (lastScheduledHarvestReadyAtRef.current !== readyAtMs) {
      lastScheduledHarvestReadyAtRef.current = readyAtMs;
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
    } else {
      const dailyReminderAtMs = Math.max(dailyReadyAt, now + HARVEST_NOTIFICATION_MIN_LEAD_MS);
      void notifications.scheduleReminder('dailyBonus', {
        readyAtMs: dailyReminderAtMs,
        title: messages.dailyBonusReminderNotificationTitle,
        body: messages.dailyBonusReminderNotificationBody,
      });
      if (lastScheduledDailyReminderAtRef.current !== dailyReminderAtMs) {
        lastScheduledDailyReminderAtRef.current = dailyReminderAtMs;
        farmAnalytics.trackNotificationScheduled({
          kind: 'daily_bonus',
          leadTimeMs: Math.max(0, dailyReminderAtMs - now),
          context: analyticsContext(),
        });
      }
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
    if (activeSheet?.type === 'shop') {
      const context = analyticsContext();
      farmAnalytics.trackAdRewardImpression('rewardedGold', getRewardedAdPlacement('rewardedGold'), context);
      farmAnalytics.trackAdRewardImpression('plotDiscountAd', getRewardedAdPlacement('plotDiscountAd'), context);
    }
    if (activeSheet?.type === 'growthAd') {
      farmAnalytics.trackAdRewardImpression('growthAd', getRewardedAdPlacement('growthAd'), analyticsContext());
    }
    if (activeSheet?.type === 'harvestBonus') {
      farmAnalytics.trackAdRewardImpression('harvestBonusAd', getRewardedAdPlacement('harvestBonusAd'), analyticsContext());
    }
    if (activeSheet?.type === 'collection') {
      farmAnalytics.trackCollectionScreen(analyticsContext());
    }
  }, [activeSheet, analyticsContext]);

  useEffect(() => {
    const id = setInterval(() => {
      tickNowMsRef.current = Date.now();
      setTick((value) => (value + 1) % 1_000_000);
    }, GAME_TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Header stats show the full modifier stack (upgrades, mastery-independent
  // prestige skills, region scaling) so the display matches the actual math;
  // the ad boost stays on its own line.
  const globalModifiers = useMemo(() => getGlobalModifiers(gameState), [gameState]);
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
  const claimableCollectionCount = collectionSummary.claimableCount;
  const claimableAchievementCount = useMemo(() => getClaimableAchievementCount(gameState), [gameState]);
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
  const harvestBonusBoost = useMemo(() => getHarvestBonusBoostStatus(gameState), [gameState, tick]);
  const cropOfTheDay = useMemo(
    () => getCropOfTheDayStatus(tickNowMsRef.current, gameState),
    [tick, gameState]
  );
  const weeklyEvent = useMemo(() => getWeeklyEventStatus(tickNowMsRef.current), [tick]);
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
  const chainIncome = useMemo(() => getChainIncome(gameState), [gameState, tick]);
  const mapActionableCount = useMemo(
    () => (chainIncome.accruedGold > 0 ? 1 : 0) + (canPrestige(gameState).allowed ? 1 : 0),
    [chainIncome.accruedGold, gameState]
  );
  const nextAreaGoal = useMemo(() => getNextAreaGoal(gameState), [gameState]);

  useEffect(() => {
    const now = Date.now();
    let next = gameState;

    let growthUpdated = false;
    const grownPlots = next.plots.map((plot) => {
      if (plot.id >= next.unlockedPlotCount) {
        return plot;
      }
      if (plot.cropType == null || !isPlotGrowthComplete(next, plot, now)) {
        return plot;
      }
      const crop = getCrop(plot.cropType);
      growthUpdated = true;
      farmAnalytics.trackCropReady(plot.cropType, crop.area, crop.tier, analyticsContext());
      return { ...plot, state: 2 as const };
    });
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

    if (next !== gameState) {
      setGameState(() => next);
    }
  }, [analyticsContext, gameState, tick]);

  function openShop() {
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
    _callGoldPulseHook();
    if (gameSettings.soundEffectsEnabled && audio.isSupported) {
      try {
        void Promise.resolve(audio.playHarvest()).catch(() => undefined);
      } catch {
        // SFX errors are non-critical.
      }
    }
  }

  function openAchievements() {
    setActiveSheet({ type: 'achievements' });
  }

  function claimAchievement(trackKey: AchievementTrackKey) {
    const preview = claimNextAchievementTier(gameState, trackKey);
    if (preview == null) {
      return;
    }
    // Same double-tap guard pattern as collection rewards: state updates are
    // idempotent, but the toast must fire exactly once per claimed tier.
    const guardKey = `${trackKey}:${preview.claimedTier}`;
    if (claimedAchievementKeysRef.current.has(guardKey)) {
      return;
    }
    claimedAchievementKeysRef.current.add(guardKey);
    setGameState((state) => claimNextAchievementTier(state, trackKey)?.state ?? state);
    farmAnalytics.trackAchievementClaimed({
      trackKey,
      tier: preview.claimedTier,
      starsAwarded: preview.starsAwarded,
      context: analyticsContext(),
    });
    toast(messages.achievementClaimedToast(preview.starsAwarded));
    triggerHaptic(50);
    if (gameSettings.soundEffectsEnabled && audio.isSupported) {
      try {
        void Promise.resolve(audio.playHarvest()).catch(() => undefined);
      } catch {
        // SFX errors are non-critical.
      }
    }
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

  // Settles every kind of offline gold owed on return — chain accrual and the
  // active farm's pre-prestige accrual — in one inseparable step via the core
  // collectReturnOfflineGold. Binding them here is the fix for the asymmetry
  // where the two could be collected independently: there is exactly one path,
  // so chain and active gold are always swept together or not at all. The chain
  // toast/analytics mirror the standalone collectChain for parity.
  function settleReturnOffline(summary: ReturnSummary) {
    if (summary.offlineGold <= 0) {
      return;
    }
    const now = Date.now();
    // Read (not settle) the chain accrual purely to drive the toast/analytics,
    // then settle chain + active farm exactly once inside collectReturnOfflineGold.
    // getChainIncome is non-mutating, so chain is settled a single time (no double
    // computation) while keeping chain-collected feedback at parity with collectChain.
    const chainGold = getChainIncome(gameState, now).accruedGold;
    setGameState((state) => collectReturnOfflineGold(state, summary.awayMs, now).state);
    if (chainGold > 0) {
      farmAnalytics.trackChainCollected({
        collectedGold: chainGold,
        farmCount: gameState.chainFarms.length,
        context: analyticsContext(),
      });
      toast(messages.chainCollectedToast(formatMoney(chainGold, locale)));
    }
  }

  // Closes the welcome-back recap. The recap's sole dismiss affordance is the
  // "collect" button (it doubles as a one-tap collect — returning should feel
  // like an instant reward, not a chore), so collectOffline is an explicit
  // accept signal: offline gold — chain AND active farm together — is settled
  // only when the player actually collects, never on a hypothetical close path.
  function dismissWelcomeBack(summary: ReturnSummary | null, collectOffline: boolean) {
    if (collectOffline && summary != null) {
      settleReturnOffline(summary);
    }
    setActiveSheet(null);
    void maybeShowReturnAd();
  }

  // Shared settlement for the welcome-back action CTAs: record the analytics
  // event and always sweep any accrued offline income into the purse. Both CTAs
  // (harvest / daily) call this so offline gold is never lost no matter which
  // first action the player picks.
  function collectReturnSummaryOffline(summary: ReturnSummary) {
    farmAnalytics.trackReturnSummaryCollected({
      awayMs: summary.awayMs,
      offlineGold: summary.offlineGold,
      readyCropCount: summary.readyCropCount,
      context: analyticsContext(),
    });
    settleReturnOffline(summary);
  }

  function openPrestigeConfirm() {
    setActiveSheet({ type: 'prestigeConfirm' });
  }

  function confirmPrestige() {
    const now = Date.now();
    const guardLevel = gameState.prestige.level;
    if (prestigedLevelsRef.current.has(guardLevel)) {
      return;
    }
    const result = prestigeFarm(gameState, prestigeArchetype, now);
    if (result == null) {
      setActiveSheet(null);
      return;
    }
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
    setGameState((state) => prestigeFarm(state, prestigeArchetype, now)?.state ?? state);
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

  async function acceptNotificationPrompt() {
    setNotificationPrompt(false);
    markHarvestNotificationPromptSeen();
    if (!notifications.isSupported) return;
    const granted = await notifications.requestPermission();
    if (!granted) {
      toast(messages.notificationPermissionDeniedToast);
      return;
    }
    updateGameSettings({ harvestNotificationsEnabled: true });
  }

  // Dismissing with "Maybe later" also retires the prompt for good, keeping the
  // decline/re-ask behavior consistent.
  function declineNotificationPrompt() {
    setNotificationPrompt(false);
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

    const isFirstSeedSelection = !firstSeedSelectedRef.current;
    firstSeedSelectedRef.current = true;
    farmAnalytics.trackSeedSelected(cropKey, crop.area, isFirstSeedSelection, analyticsContext());
    setSelectedArea(crop.area);
    setSelectedTool(cropKey);
  }

  async function showRewardedAd(type: RewardedAdType, rewardValue: number, onReward: () => void) {
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
    let result: RewardedAdShowResult;
    try {
      result = await rewardedAd.showAd();
    } catch {
      setActiveSheet(null);
      farmAnalytics.trackAdRewardFailed(type, placement, 'show_ad_threw', analyticsContext());
      toast(messages.adFailedToast);
      return false;
    }

    if (result.status === 'earned') {
      const rewardedAt = Date.now();
      setActiveSheet(null);
      onReward();
      farmAnalytics.trackAdRewardCompleted({
        type,
        placement,
        rewardValue,
        context: analyticsContext(),
      });
      setGameState((state) => ({
        ...state,
        adUsage: recordRewardedAdUsage(state, type, rewardedAt),
      }));
      return true;
    }

    setActiveSheet(null);
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
    claimedRewardKeysRef.current.clear();
    claimedAchievementKeysRef.current.clear();
    prestigedLevelsRef.current.clear();
    autoHarvestSummaryRef.current = { harvestedCount: 0, replantedCount: 0, windowStartedAt: 0 };
    if (comboTimerRef.current != null) {
      clearTimeout(comboTimerRef.current);
      comboTimerRef.current = null;
    }
    setHarvestCombo(0);
    setGameState(createInitialState());
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
        // The cloud payload may come from an older app version, so run it through
        // the same migration/normalization as the load path before showing it.
        const restored = migrateLoadedState(outcome.gameState, createInitialState());
        setGameState({
          ...restored,
          dailyBonusState: normalizeDailyBonusState(restored.dailyBonusState as unknown),
        });
        setSelectedArea(FIRST_AREA.key);
        setSelectedTool('harvest');
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
      // Guard the queue against a StrictMode/concurrent double-invoke of this
      // updater: keep at most one effect per id. (The drain loop also dedupes by
      // id, so feedback never doubles either way — this just keeps the queue clean.)
      if (!pendingCommandEffectsRef.current.some((pending) => pending.id === effectId)) {
        let firstMutationFlash: 'golden' | 'rainbow' | null = null;
        let firstHarvest: { cropIcon: string; goldGained: number } | null = null;
        const rankUps: { cropKey: CropKey; rankKey: MasteryRankKey; rankIcon: string }[] = [];
        for (const { outcome } of result.harvests) {
          const mk = outcome.mutation?.key;
          if (mk === 'rainbow') {
            firstMutationFlash = 'rainbow';
          } else if (mk === 'golden' && firstMutationFlash == null) {
            firstMutationFlash = 'golden';
          }
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
            const tone: HarvestPop['tone'] =
              mk === 'rainbow' ? 'rainbow' : mk === 'golden' ? 'golden' :
              outcome.mutation != null || outcome.newMasteryRank != null || outcome.boostActive ? 'special' : 'normal';
            return { plotIndex, goldGained: outcome.goldGained, tone };
          }),
          rankUps,
          firstMutationFlash,
          firstHarvest,
          totalGoldGained: result.totalGoldGained,
          totalRpGained: result.totalRpGained,
          harvestedCount: result.harvestedCount,
          specialCount: result.specialCount,
        });
      }
      return result.harvestedCount > 0 ? result.state : state;
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
        if (
          remainingMs >= GROWTH_AD_MIN_REMAINING_MS &&
          rewardedAd.isAdSupported
        ) {
          if (growthAdLimit.allowed) {
            setActiveSheet({
              type: 'growthAd',
              plotIndex: index,
              cropKey: plot.cropType,
              remainingMs,
            });
          } else {
            farmAnalytics.trackAdLimitBlocked('growthAd', getRewardedAdPlacement('growthAd'), growthAdLimit.reason, analyticsContext());
            toast(growthAdLimit.reason);
          }
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

  // Outline the target the current onboarding step points at to draw the eye.
  const onboardingSeedHighlight = onboardingStep === 'selectSeed';
  const onboardingPlotHighlight = onboardingStep === 'plant' || onboardingStep === 'harvest';
  const onboardingShopHighlight = onboardingStep === 'unlock';

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={[styles.headerTop, isMobileMarket && styles.mobileHeaderTop]}>
          <View style={[styles.titleGroup, isMobileMarket && styles.mobileTitleGroup]}>
            <Text style={styles.homeIcon}>🏡</Text>
            <View>
              <Text style={styles.title}>{messages.appTitle}</Text>
              <View style={styles.subtitleRow}>
                <Text style={styles.subtitle}>{messages.appSubtitle}</Text>
                {gameState.activeTitle != null ? (
                  <Text style={styles.titleBadge} numberOfLines={1}>
                    {getTitleLabel(gameState.activeTitle, locale).name}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.headerActions}>
            <Text testID="prestige-stars-chip" style={styles.starsChip}>★ {gameState.prestige.stars}</Text>
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
            <Text style={styles.researchBadge}>{messages.researchBadge(researchLevel)}</Text>
            <Text style={styles.productivityText} numberOfLines={1}>
              {messages.productivity(formatHourlyGold(farmProductivity.netProfitPerHour, locale))}
            </Text>
            <View style={styles.statList}>
              <View style={styles.compactStat}>
                <Text style={styles.label}>{messages.profitLabel}</Text>
                <Text style={styles.profitStat}>{formatStatMultiplier(globalModifiers.profitMultiplier)}</Text>
              </View>
              <View style={styles.compactStat}>
                <Text style={styles.label}>{messages.growthLabel}</Text>
                <Text style={styles.speedStat}>{formatStatMultiplier(globalModifiers.speedMultiplier)}</Text>
              </View>
              {harvestBonusBoost.active ? (
                <View style={styles.compactStat}>
                  <Text style={styles.label}>{messages.boostLabel}</Text>
                  <Text style={styles.boostStat}>×{harvestBonusBoost.multiplier.toFixed(1)}</Text>
                  <Text testID="boost-remaining" style={styles.boostRemaining}>
                    {formatRemainingTime(safeBoostRemainingMs, locale)}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.cotdRow}>
              <Text style={styles.label}>{messages.cropOfTheDayLabel}</Text>
              <Text style={styles.cotdText} numberOfLines={1}>
                {getCrop(cropOfTheDay.cropKey).icon} {getLocalizedCropName(cropOfTheDay.cropKey)} ×{cropOfTheDay.multiplier}
              </Text>
            </View>
            {weeklyEvent.active ? (
              <View style={styles.cotdRow} testID="weekly-event-banner">
                <Text style={styles.label}>🎉 {messages.weeklyEventLabel}</Text>
                <Text style={styles.cotdText} numberOfLines={1}>
                  {messages.weeklyEventDesc(
                    getLocalizedAreaLabel(weeklyEvent.areaKey).name,
                    weeklyEvent.multiplier,
                    formatRemainingTime(Math.max(0, weeklyEvent.windowEndAt - tickNowMsRef.current), locale)
                  )}
                </Text>
              </View>
            ) : null}
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
            highlight={onboardingShopHighlight}
            onPress={openShop}
          />
          <NavButton
            label={messages.collectionButton}
            badge={claimableCollectionCount}
            accessibilityLabel={messages.collectionButtonAccessibilityLabel}
            onPress={openCollection}
          />
          <NavButton
            label={messages.labButton}
            badge={labBadgeCount}
            accessibilityLabel={messages.labButtonAccessibilityLabel}
            onPress={openLab}
          />
          <NavButton
            label={messages.mapButton}
            badge={mapActionableCount}
            accessibilityLabel={messages.mapButtonAccessibilityLabel}
            onPress={openMap}
          />
          <NavButton
            label={messages.achievementsButton}
            badge={claimableAchievementCount}
            accessibilityLabel={messages.achievementsButtonAccessibilityLabel}
            onPress={openAchievements}
          />
        </ScrollView>
      </View>

      {onboardingStep != null ? (
        <FarmOnboarding step={onboardingStep} messages={messages} onSkip={skipOnboarding} />
      ) : null}

      <ScrollView contentContainerStyle={styles.mainContent} style={styles.main}>
        <View style={[styles.plotGrid, onboardingPlotHighlight && styles.onboardingHighlight]}>
          {gameState.plots.map((plot, index) => {
            // Resolve growth ratio and countdown together so the crop modifiers
            // are computed once per tile per tick instead of once for each.
            const growth = getPlotGrowthDisplay(gameState, plot);
            return (
              <PlotCell
                key={plot.id}
                index={index}
                plot={plot}
                unlocked={index < gameState.unlockedPlotCount}
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
      </ScrollView>

      <View style={[styles.toolStrip, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.toolHeader}>
          <Text style={styles.toolLabel}>{messages.toolLabel}</Text>
          {readyPlotCount >= HARVEST_ALL_MIN_COUNT ? (
            <HarvestAllButton
              label={messages.harvestAllButton(readyPlotCount)}
              onPress={harvestAllCrops}
            />
          ) : selectedTool !== 'harvest' &&
            onboardingStep == null &&
            plantAllPreview.plantableCount > 0 &&
            plantAllPreview.emptyPlotCount >= PLANT_ALL_MIN_COUNT ? (
            // Keep the per-crop ROI hint and add the batch-plant shortcut beside it
            // (not in place of it) so selecting a seed never hides its economics.
            <View style={styles.toolHeaderRight}>
              <Text style={styles.toolHint} numberOfLines={1}>
                {toolHint}
              </Text>
              <HarvestAllButton
                label={messages.plantAllButton(
                  plantAllPreview.plantableCount,
                  formatMoney(plantAllPreview.totalCost, locale)
                )}
                onPress={plantAllCrops}
              />
            </View>
          ) : (
            <Text style={styles.toolHint} numberOfLines={1}>
              {toolHint}
            </Text>
          )}
        </View>

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

        <View style={onboardingSeedHighlight ? styles.onboardingHighlight : undefined}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolScroll}>
            <ToolButton
              active={selectedTool === 'harvest'}
              icon="🖐️"
              name={messages.harvestTool}
              toolKey="harvest"
              onSelect={onSelectTool}
            />
            {visibleCropKeys.map((key) => {
              const crop = getCrop(key);
              const cropCost = getCropPurchaseCost(gameState, key);
              const masteryRank = getMasteryStatus(gameState, key).rank;
              const isNew = !gameState.harvestedCropKeys.includes(key);
              return (
                <ToolButton
                  key={key}
                  active={selectedTool === key}
                  icon={crop.icon}
                  name={getLocalizedCropName(key)}
                  cost={formatMoney(cropCost, locale)}
                  roi={messages.roi(formatSignedPercent(getCropEconomy(cropEconomyByKey, key).roiPercent, locale))}
                  affordable={gameState.gold >= cropCost}
                  masteryIcon={masteryRank?.icon}
                  isNew={isNew}
                  newLabel={messages.newCropBadge}
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
        </View>
      </View>

      {toastMessage != null ? (
        <View pointerEvents="none" style={[styles.toast, { bottom: insets.bottom + 142 }]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      ) : null}

      <MutationFlashOverlay ref={mutationFlashRef} />

      <DiscoveryBanner
        ref={discoveryBannerRef}
        title={messages.newCropDiscoveryTitle}
        subtitle={messages.newCropDiscoverySubtitle}
      />

      {harvestCombo >= 2 ? (
        <View pointerEvents="none" style={styles.comboOverlay}>
          <ComboDisplay count={harvestCombo} messages={messages} />
        </View>
      ) : null}

      <Sheet
        activeSheet={activeSheet}
        description={getSheetDescription(activeSheet, messages, locale, getLocalizedCropName, collectionSummary, dailyBonusPreview.streak)}
        title={getSheetTitle(activeSheet, messages)}
        closeLabel={messages.sheetCloseAccessibilityLabel}
        onClose={closeSheet}
      >
        {activeSheet?.type === 'shop' ? (
          <View>
            {rewardedAd.isAdSupported ? (
              <>
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
              </>
            ) : null}

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
            />

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
              return (
                <View>
                  <SheetAction
                    label={actionLabel}
                    disabled={!rewardedAd.isAdReady || !growthAdLimit.allowed}
                    onPress={() => void completeGrowthWithAd(activeSheet.plotIndex)}
                  />
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
            <View style={styles.welcomeBackRow}>
              <Text style={styles.welcomeBackIcon}>🎁</Text>
              <View style={styles.welcomeBackRowText}>
                <Text style={styles.welcomeBackRowLabel}>
                  {getDailyBonusLabel(dailyBonusPreview.streak, dailyBonusPreview.goldAwarded, locale).streakLabel}
                </Text>
                <Text style={styles.welcomeBackRowValue}>
                  +{formatMoney(dailyBonusPreview.goldAwarded, locale)}G
                </Text>
              </View>
            </View>
            <SheetAction
              label={messages.dailyBonusClaimAction(formatMoney(dailyBonusPreview.goldAwarded, locale))}
              onPress={() => {
                const now = Date.now();
                // Guard against clock reversal or race: if the bonus is no
                // longer available at tap time, keep the Sheet open rather than
                // closing it silently with no feedback.
                if (!isDailyBonusAvailable(gameState.dailyBonusState, now)) {
                  return;
                }
                // The functional updater preserves idempotency: a concurrent
                // second tap evaluates claimDailyBonus against the already-
                // updated prev.dailyBonusState and gets null, so gold is only
                // awarded once.
                // Capture the actually-applied claim from the functional
                // updater so analytics fires exactly once: a concurrent second
                // tap evaluates against the already-updated state, gets null,
                // and leaves the holder empty — so no duplicate emit. (A holder
                // object is used so TS keeps the union type after the closure.)
                const claimHolder: { value: { streak: number; goldAwarded: number } | null } = { value: null };
                setGameState((prev) => {
                  const result = claimDailyBonus(prev.dailyBonusState, now, getRewardedGoldAmount(prev));
                  if (result == null) return prev;
                  claimHolder.value = { streak: result.streak, goldAwarded: result.goldAwarded };
                  return {
                    ...prev,
                    gold: prev.gold + result.goldAwarded,
                    dailyBonusState: result.newState,
                  };
                });
                if (claimHolder.value != null) {
                  farmAnalytics.trackDailyBonusClaimed({
                    streak: claimHolder.value.streak,
                    rewardValue: claimHolder.value.goldAwarded,
                    context: analyticsContext(),
                  });
                }
                setActiveSheet(null);
              }}
            />
          </View>
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
                  collectReturnSummaryOffline(activeSheet.summary);
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
                  collectReturnSummaryOffline(activeSheet.summary);
                  // Jump straight to the daily sheet. It is the next interaction, so we skip
                  // the return ad here to avoid covering the claim flow.
                  setActiveSheet({ type: 'dailyBonus' });
                }}
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
                const summary = activeSheet.summary;
                farmAnalytics.trackReturnSummaryCollected({
                  awayMs: summary.awayMs,
                  offlineGold: summary.offlineGold,
                  readyCropCount: summary.readyCropCount,
                  context: analyticsContext(),
                });
                dismissWelcomeBack(summary, summary.offlineGold > 0);
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
      {notificationPrompt ? (
        <NotificationPromptOverlay
          messages={messages}
          onAccept={acceptNotificationPrompt}
          onDecline={declineNotificationPrompt}
        />
      ) : null}
      {prestigeGuide ? (
        <PrestigeGuideOverlay messages={messages} onDismiss={dismissPrestigeGuide} />
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

// Swaps in for the tool hint the moment a couple of plots ripen, turning a
// row of individual taps into one satisfying batch harvest. It pops in and
// breathes gently so the eye catches the call-to-action without nagging.
function HarvestAllButton({ label, onPress }: { label: string; onPress: () => void }) {
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
  { title: string; subtitle: string }
>(function DiscoveryBanner({ title, subtitle }, ref) {
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
      style={[styles.discoveryBanner, { transform: [{ translateY }], opacity }]}
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

// Full-screen flash overlay for rare mutation harvests. Two overlay layers
// (golden and rainbow) driven independently so both can coexist without shared
// state; native driver keeps the flash cheap even at the moment of a burst.
const MutationFlashOverlay = React.forwardRef<MutationFlashHandle>(function MutationFlashOverlay(_, ref) {
  const goldenOpacityRef = useRef<Animated.Value | null>(null);
  if (goldenOpacityRef.current == null) {
    goldenOpacityRef.current = new Animated.Value(0);
  }
  const goldenOpacity = goldenOpacityRef.current;

  const rainbowOpacityRef = useRef<Animated.Value | null>(null);
  if (rainbowOpacityRef.current == null) {
    rainbowOpacityRef.current = new Animated.Value(0);
  }
  const rainbowOpacity = rainbowOpacityRef.current;

  useImperativeHandle(
    ref,
    () => ({
      flash(mutationKey: 'golden' | 'rainbow') {
        if (mutationKey === 'rainbow') {
          rainbowOpacity.stopAnimation();
          rainbowOpacity.setValue(0);
          // Avoid Animated.delay here: stopAnimation() does not reliably interrupt
          // a delay stage mid-sequence in React Native, which can cause the opacity
          // to snap unexpectedly when rapid successive mutations overlap. The 80ms
          // "hold" is folded into the fade-in duration instead (150 + 80 = 230ms).
          Animated.sequence([
            Animated.timing(rainbowOpacity, {
              toValue: 0.45,
              duration: 230,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(rainbowOpacity, {
              toValue: 0,
              duration: 600,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
          ]).start();
        } else {
          goldenOpacity.stopAnimation();
          goldenOpacity.setValue(0);
          Animated.sequence([
            Animated.timing(goldenOpacity, {
              toValue: 0.36,
              duration: 120,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(goldenOpacity, {
              toValue: 0,
              duration: 400,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
    }),
    [goldenOpacity, rainbowOpacity]
  );

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[styles.mutationFlash, { opacity: goldenOpacity, backgroundColor: '#fde68a' }]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.mutationFlash, { opacity: rainbowOpacity, backgroundColor: '#c084fc' }]}
      />
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
        <ReadyCropIcon icon={cropIconGlyph} phaseSeed={plot.id} />
      ) : (
        <GrowingCropIcon
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

// Ripe crops gently pulse so harvestable plots draw the eye in a full grid,
// reinforcing the "see ready -> tap" loop. Native-driven loop keeps it cheap
// even with every plot ripe at once.
function ReadyCropIcon({ icon, phaseSeed }: { icon: string; phaseSeed: number }) {
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

  return <Animated.Text style={[styles.readyCropIcon, { transform: [{ scale }] }]}>{icon}</Animated.Text>;
}

// The growing-crop sprout. On a fresh manual plant (plantToken set), it bounces
// in once so tapping an empty plot feels tactile. Auto-replant and save-load
// pass no token, so reopening the app never re-pops every growing plot.
function GrowingCropIcon({
  icon,
  stage,
  nearlyReady,
  plantToken,
  onPlantPulseDone,
}: {
  icon: string;
  stage: CropGrowthStage;
  nearlyReady: boolean;
  plantToken: number | undefined;
  onPlantPulseDone: () => void;
}) {
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

  useEffect(() => {
    const dur = pop.tone === 'rainbow' ? 1400 : pop.tone === 'golden' ? 1100 : 900;
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: dur,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) {
        onDoneRef.current(pop.id);
      }
    });
    return () => animation.stop();
  }, [pop.id, pop.tone, progress]);

  const col = pop.index % PLOT_COLUMNS;
  const row = Math.floor(pop.index / PLOT_COLUMNS);
  const left = col * (tileSize + PLOT_GAP);
  const top = row * (tileSize + PLOT_GAP);

  const isMutationTone = pop.tone === 'golden' || pop.tone === 'rainbow';
  const yTop =
    pop.tone === 'rainbow' ? -tileSize * 0.95 : pop.tone === 'golden' ? -tileSize * 0.78 : -tileSize * 0.55;
  // Scale start and max are larger for mutation tones to give the jackpot pop extra punch;
  // normal/special keep their original 0.6 start so existing harvest feel is unchanged.
  const scaleStart = isMutationTone ? 0.4 : 0.6;
  const scaleMax = pop.tone === 'rainbow' ? 1.65 : pop.tone === 'golden' ? 1.45 : 1.15;

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

  const icon = pop.tone === 'rainbow' ? '🌈 ' : pop.tone === 'golden' ? '✨ ' : '';

  return (
    <View pointerEvents="none" style={[styles.harvestPop, { left, top, width: tileSize, height: tileSize }]}>
      <Animated.Text
        style={[
          styles.harvestPopText,
          pop.tone === 'special' && styles.harvestPopTextSpecial,
          pop.tone === 'golden' && styles.harvestPopTextGolden,
          pop.tone === 'rainbow' && styles.harvestPopTextRainbow,
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
  onClose,
}: {
  activeSheet: ActiveSheet;
  children: React.ReactNode;
  description: string;
  title: string;
  closeLabel: string;
  onClose: () => void;
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
  const closeSheetWithAnimation = useCallback(() => {
    if (isClosingRef.current) {
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
      if (finished) {
        onClose();
      }
    });
  }, [dragY, onClose]);
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

          Animated.spring(dragY, {
            toValue: 0,
            damping: 18,
            stiffness: 220,
            mass: 0.8,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(dragY, {
            toValue: 0,
            damping: 18,
            stiffness: 220,
            mass: 0.8,
            useNativeDriver: true,
          }).start();
        },
      }),
    [closeSheetWithAnimation, dragY, shouldHandleSheetDrag]
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
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
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
  name,
  cost,
  roi,
  affordable,
  masteryIcon,
  isNew,
  newLabel,
  toolKey,
  onSelect,
}: {
  active: boolean;
  icon: string;
  name: string;
  cost?: string;
  roi?: string;
  affordable?: boolean;
  masteryIcon?: string;
  isNew?: boolean;
  newLabel?: string;
  toolKey: ToolKey;
  onSelect: (toolKey: ToolKey) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cost != null ? `${name}, ${cost}` : name}
      accessibilityState={{ selected: active }}
      style={[styles.toolButton, active && styles.activeToolButton]}
      onPress={() => onSelect(toolKey)}
    >
      <Text style={styles.toolIcon}>{icon}</Text>
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

  return (
    <ShopCard
      title={title}
      desc={messages.upgradeDescWithLevel(desc, level)}
      price={`${formatMoney(cost, locale)}G`}
      priceTone={kind}
      disabled={disabled}
      goldProgress={goldProgress}
      onPress={() => {
        if (disabled) {
          onDone(messages.insufficientGoldToast);
          return;
        }
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
  );
}

