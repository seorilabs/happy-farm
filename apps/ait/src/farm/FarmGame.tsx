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
  canPrestige,
  canUnlockNode,
  claimNextAchievementTier,
  collectChainIncome,
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
  GROWTH_AD_MAX_SKIP_MS,
  GROWTH_AD_MIN_REMAINING_MS,
  HARVEST_BONUS_BOOST_DURATION_MS,
  HARVEST_BONUS_MULTIPLIER,
  INTERSTITIAL_MILESTONE_COOLDOWN_MS,
  MAX_PLOTS,
  REWARDED_GOLD_AMOUNT,
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
  canUnlockArea,
  claimCollectionReward,
  createFarmAnalytics,
  createInitialState,
  DEFAULT_LOCALE,
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
  getPlotCost,
  getPlotGrowthDisplay,
  getPlotRemainingGrowthMs,
  getRewardedAdLimitStatus,
  getUpgradeCost,
  isAreaUnlocked,
  isCropPlantable,
  isPlotGrowthComplete,
  isTitleUnlocked,
  normalizeLocale,
  performHarvestAll,
  getReadyPlotCount,
  recordHarvestBonusAdPrompt,
  recordRewardedAdUsage,
  type CropHarvestedGameEvent,
  type CropPlantedGameEvent,
  type CropEconomyEstimate,
  type FarmGameCommandBlockedReason,
  type SupportedLocale,
} from '../../../../packages/farm-core/src';
import {
  claimDailyBonus,
  getDailyBonusLabel,
  isDailyBonusAvailable,
  type DailyBonusResult,
  type DailyBonusState,
} from '../../../../packages/farm-core/src/dailyBonus';

import { DEFAULT_FARM_GAME_SETTINGS, normalizeFarmGameSettings, type FarmGameSettings } from './gameSettings';
import { getFarmMessages, type FarmMessages } from './i18n';
import { AchievementsSheet } from './components/AchievementsSheet';
import { ChainMapSheet, PrestigeConfirmSheet } from './components/ChainMapSheet';
import { CollectionSheet } from './components/CollectionSheet';
import { LabSheet } from './components/LabSheet';
import { AdRewardCard, SettingToggle, SheetAction, ShopCard, sheetPartStyles } from './components/SheetParts';

const REWARDED_AD_GROUP_ID = 'ait.v2.live.6fc77adf3f034cd6';
const INTERSTITIAL_AD_GROUP_ID = '';
const PLOT_COLUMNS = 4;
const PLOT_GAP = 10;
const MAIN_HORIZONTAL_PADDING = 16;
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
const PROGRESS_ANIMATION_DURATION_MS = GAME_TICK_INTERVAL_MS;
// Fresh-plant sprout "bounce in" duration.
const PLANT_POP_DURATION_MS = 320;
// The "Harvest All" shortcut only appears once enough plots are ripe that
// tapping each one becomes a chore; a single ripe plot is a quick one-tap.
const HARVEST_ALL_MIN_COUNT = 2;
// Harvest combo: the window (ms) within which consecutive manual harvests
// build a streak counter. Tier thresholds gate icon/color escalation and
// audio milestone cues.
const COMBO_WINDOW_MS = 1500;
export const COMBO_GREAT_THRESHOLD = 5;
export const COMBO_LEGENDARY_THRESHOLD = 10;
export const MASTERY_RANK_UP_CELEBRATION_DURATION_MS = 2600;
export const PRESTIGE_GRADUATION_CELEBRATION_DURATION_MS = 3500;
export const FIRST_HARVEST_CELEBRATION_DURATION_MS = 3200;
const SHEET_DISMISS_DRAG_DISTANCE = 96;
const SHEET_DISMISS_VELOCITY = 1.1;
const SHEET_DISMISS_TRANSLATE_Y = 520;
const SHEET_ANIMATION_DURATION_MS = 180;
const SHEET_DRAG_HIT_TARGET_HEIGHT = 36;
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
  | { type: 'dailyBonus'; result: DailyBonusResult }
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
  readDailyBonusState?: () => Promise<DailyBonusState>;
  writeDailyBonusState?: (state: DailyBonusState) => Promise<void>;
};

type UseFarmAd = (adGroupId: string) => RewardedAdController;
type FarmAnalytics = ReturnType<typeof createFarmAnalytics>;
type FarmGameMarket = 'appsInToss' | 'mobile';

export type FarmGameAudio = {
  isSupported: boolean;
  playHarvest: () => void | Promise<void>;
  // Fire-and-forget: implementations must not throw or return a rejectable Promise.
  playComboMilestone: (tier: 'great' | 'legendary') => void;
  setBackgroundMusicEnabled: (enabled: boolean) => void | Promise<void>;
};

export type FarmGameProps = {
  persistence?: FarmGamePersistence;
  analytics?: FarmAnalytics;
  useRewardedAd?: UseFarmAd;
  useInterstitialAd?: UseFarmAd;
  audio?: FarmGameAudio;
  market?: FarmGameMarket;
  preferredLocale?: SupportedLocale;
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
      fx: { plotIndex: number; goldGained: number; special: boolean }[];
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

function useFarmSafeAreaInsets() {
  try {
    return useSafeAreaInsets();
  } catch {
    return EMPTY_SAFE_AREA_INSETS;
  }
}

export default function FarmGame({
  persistence = defaultPersistence,
  analytics = defaultFarmAnalytics,
  useRewardedAd = useUnsupportedAd,
  useInterstitialAd = useUnsupportedAd,
  audio = defaultFarmAudio,
  market = 'appsInToss',
  preferredLocale = DEFAULT_LOCALE,
}: FarmGameProps = {}) {
  const insets = useFarmSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isSaveLoaded, setIsSaveLoaded] = useState(false);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const [gameSettings, setGameSettings] = useState<FarmGameSettings>(DEFAULT_FARM_GAME_SETTINGS);
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
  const [firstHarvestNotice, setFirstHarvestNotice] = useState<FirstHarvestNotice | null>(null);
  const firstHarvestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstHarvestNoticeIdRef = useRef(0);
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
  const rewardedAd = useRewardedAd(REWARDED_AD_GROUP_ID);
  const interstitialAd = useInterstitialAd(INTERSTITIAL_AD_GROUP_ID);
  const farmAnalytics = analytics;
  const isMobileMarket = market === 'mobile';
  const locale = normalizeLocale(gameSettings.locale);
  const messages = useMemo(() => getFarmMessages(locale), [locale]);
  const resetConfirmValue = messages.resetConfirmText;
  const getLocalizedCropName = useCallback((cropKey: CropKey) => getCropLabel(cropKey, locale).name, [locale]);
  const getLocalizedAreaLabel = useCallback((areaKey: AreaKey) => getAreaLabel(areaKey, locale), [locale]);

  const [gameState, setGameState] = useState<GameState>(() => createInitialState());
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
    }, PRESTIGE_GRADUATION_CELEBRATION_DURATION_MS);
  }, []);
  const dismissPrestigeGraduation = useCallback(() => {
    if (prestigeGraduationTimerRef.current != null) {
      clearTimeout(prestigeGraduationTimerRef.current);
      prestigeGraduationTimerRef.current = null;
    }
    setPrestigeGraduationNotice(null);
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
        Vibration.vibrate(15);
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
                fx.special ? 'special' : 'normal'
              );
            }
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
            Vibration.vibrate([0, 24, 36, 48]);
          } else {
            Vibration.vibrate(50);
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
      const mutationKey = event.mutation?.key;
      const popTone: HarvestPop['tone'] =
        mutationKey === 'rainbow'
          ? 'rainbow'
          : mutationKey === 'golden'
            ? 'golden'
            : isSpecialHarvest
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
        Vibration.vibrate([0, 24, 36, 48]);
      } else {
        Vibration.vibrate(50);
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
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedGame() {
      const savedState = await persistence.readPersistedGameState();
      const lastSeenAt = (await persistence.readLastSeenAt?.()) ?? null;
      if (cancelled) {
        return;
      }
      setGameState(savedState);
      setIsSaveLoaded(true);

      // Greet returning players with a recap of what waited for them. Computed
      // off the freshly loaded save (not React state, which hasn't committed
      // yet) so the very first frame after a long absence shows the summary.
      const now = Date.now();
      const summary = getReturnSummary(savedState, lastSeenAt, now);
      if (summary != null) {
        setActiveSheet({ type: 'welcomeBack', summary });
      }
      // Mark "seen" immediately so a quick reload doesn't replay the recap.
      void persistence.writeLastSeenAt?.(now);

      // Check and claim the daily login bonus. Only shown when no
      // welcome-back sheet is queued, so the two modals don't stack.
      if (summary == null && persistence.readDailyBonusState != null) {
        const dailyBonusState = await persistence.readDailyBonusState();
        if (isDailyBonusAvailable(dailyBonusState, now)) {
          const dailyBonusResult = claimDailyBonus(dailyBonusState, now);
          if (dailyBonusResult != null) {
            setGameState((prev) => ({ ...prev, gold: prev.gold + dailyBonusResult.goldAwarded }));
            void persistence.writeDailyBonusState?.(dailyBonusResult.newState);
            setActiveSheet({ type: 'dailyBonus', result: dailyBonusResult });
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
      farmAnalytics.trackAdRewardImpression('rewardedGold', 'shop_gold_reward', context);
      farmAnalytics.trackAdRewardImpression('rewardedGold', 'shop_free_plot', context);
    }
    if (activeSheet?.type === 'growthAd') {
      farmAnalytics.trackAdRewardImpression('growthAd', 'growth_ad_sheet', analyticsContext());
    }
    if (activeSheet?.type === 'harvestBonus') {
      farmAnalytics.trackAdRewardImpression('harvestBonusAd', 'harvest_bonus_sheet', analyticsContext());
    }
    if (activeSheet?.type === 'collection') {
      farmAnalytics.trackCollectionScreen(analyticsContext());
    }
  }, [activeSheet, analyticsContext]);

  useEffect(() => {
    const id = setInterval(() => setTick((value) => (value + 1) % 1_000_000), GAME_TICK_INTERVAL_MS);
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
  const selectedAreaLabel = getLocalizedAreaLabel(selectedArea);
  const selectedAreaUnlocked = isAreaUnlocked(gameState, selectedArea);
  const rewardedGoldLimit = useMemo(
    () => getRewardedAdLimitStatus(gameState, 'rewardedGold', Date.now(), locale),
    [gameState, locale, tick]
  );
  // Both shop ad items (gold reward + free plot) are gated by rewardedGoldLimit.
  // growthAdLimit and harvestBonusAdLimit gate separate flows (plot-tap / post-harvest
  // nudge) that are not accessible from the shop, so only rewardedGoldLimit is relevant.
  const shopAdBadgeCount = rewardedAd.isAdSupported && rewardedAd.isAdReady && rewardedGoldLimit.allowed ? 1 : 0;
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
    try { Vibration.vibrate(50); } catch { /* non-critical haptic */ }
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
    try { Vibration.vibrate(50); } catch { /* non-critical haptic */ }
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

  // Closes the welcome-back recap. When passive income piled up while away we
  // sweep it straight into the player's purse so the recap doubles as a
  // one-tap collect — returning should feel like an instant reward, not a chore.
  function dismissWelcomeBack(collectOffline: boolean) {
    if (collectOffline) {
      collectChain();
    }
    setActiveSheet(null);
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
    const limit = getRewardedAdLimitStatus(gameState, type, Date.now(), locale);
    if (!limit.allowed) {
      farmAnalytics.trackAdLimitBlocked(type, limit.reason, analyticsContext());
      toast(limit.reason);
      return false;
    }

    if (!rewardedAd.isAdReady) {
      farmAnalytics.trackAdRewardFailed(
        type,
        rewardedAd.isAdSupported ? 'not_ready' : 'unsupported',
        analyticsContext()
      );
      toast(rewardedAd.isAdSupported ? messages.adPreparingToast : messages.adUnsupportedToast);
      return false;
    }

    farmAnalytics.trackAdRewardClick(type, analyticsContext());
    let result: RewardedAdShowResult;
    try {
      result = await rewardedAd.showAd();
    } catch {
      setActiveSheet(null);
      farmAnalytics.trackAdRewardFailed(type, 'show_ad_threw', analyticsContext());
      toast(messages.adFailedToast);
      return false;
    }

    if (result.status === 'earned') {
      const rewardedAt = Date.now();
      setActiveSheet(null);
      onReward();
      farmAnalytics.trackAdRewardCompleted({
        type,
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
    farmAnalytics.trackAdRewardFailed(type, getAdFailureReason(result), analyticsContext());
    toast(result.status === 'dismissed' ? messages.adDismissedToast : messages.adFailedToast);

    return false;
  }

  async function maybeShowMilestoneAd() {
    if (!interstitialAd.isAdReady) {
      return;
    }

    const now = Date.now();
    if (now - lastInterstitialShownAtRef.current < INTERSTITIAL_MILESTONE_COOLDOWN_MS) {
      return;
    }

    lastInterstitialShownAtRef.current = now;
    await interstitialAd.showAd();
  }

  async function rewardGoldFromAd(amount = REWARDED_GOLD_AMOUNT) {
    await showRewardedAd('rewardedGold', amount, () => {
      setGameState((state) => ({ ...state, gold: state.gold + amount }));
      toast(messages.receivedGoldToast(formatMoney(amount, locale)));
    });
  }

  async function rewardFreePlotFromAd() {
    if (gameState.unlockedPlotCount >= MAX_PLOTS) {
      toast(messages.allPlotsUnlockedToast);
      return;
    }

    await showRewardedAd('rewardedGold', 1, () => {
      setGameState((state) => {
        if (state.unlockedPlotCount >= MAX_PLOTS) {
          return state;
        }
        farmAnalytics.trackPlotUnlocked({
          method: 'ad',
          cost: 0,
          nextPlotCount: state.unlockedPlotCount + 1,
          context: analyticsContext(state),
        });
        return { ...state, unlockedPlotCount: state.unlockedPlotCount + 1 };
      });
      toast(messages.rewardedPlotToast);
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
        pendingCommandEffectsRef.current.push({
          id: effectId,
          type: 'harvestedAll',
          fx: result.harvests.map(({ plotIndex, outcome }) => ({
            plotIndex,
            goldGained: outcome.goldGained,
            special: outcome.mutation != null || outcome.newMasteryRank != null || outcome.boostActive,
          })),
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

        if (
          remainingMs >= GROWTH_AD_MIN_REMAINING_MS &&
          remainingMs <= GROWTH_AD_MAX_SKIP_MS &&
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
            farmAnalytics.trackAdLimitBlocked('growthAd', growthAdLimit.reason, analyticsContext());
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
    await showRewardedAd('growthAd', 1, () => {
      setGameState((state) => {
        const plot = state.plots[plotIndex];
        if (plot == null || plot.state !== 1) {
          return state;
        }
        const next = [...state.plots];
        next[plotIndex] = { ...plot, state: 2 };
        return { ...state, plots: next };
      });
      setActiveSheet(null);
      toast(messages.growthDoneToast);
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
          <NavButton testID="shop-nav-button" label={messages.shopButton} badge={shopBadgeCount} onPress={openShop} />
          <NavButton
            label={messages.collectionButton}
            badge={claimableCollectionCount}
            accessibilityLabel={messages.collectionButtonAccessibilityLabel}
            onPress={openCollection}
          />
          <NavButton
            label={messages.labButton}
            badge={labActionableCount}
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

      <ScrollView contentContainerStyle={styles.mainContent} style={styles.main}>
        <View style={styles.plotGrid}>
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

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolScroll}>
          <ToolButton
            active={selectedTool === 'harvest'}
            icon="🖐️"
            name={messages.harvestTool}
            onPress={() => setSelectedTool('harvest')}
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
                masteryRank={masteryRank}
                isNew={isNew}
                newLabel={messages.newCropBadge}
                onPress={() => selectCrop(key)}
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
        description={getSheetDescription(activeSheet, messages, locale, getLocalizedCropName, collectionSummary)}
        title={getSheetTitle(activeSheet, messages)}
        onClose={closeSheet}
      >
        {activeSheet?.type === 'shop' ? (
          <View>
            {rewardedAd.isAdSupported ? (
              <>
                <Text style={styles.sheetSectionTitle}>{messages.adRewardsSection}</Text>
                <AdRewardCard
                  title={messages.rewardedGoldTitle(formatMoney(REWARDED_GOLD_AMOUNT, locale))}
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
                  desc={rewardedGoldLimit.allowed ? messages.rewardedPlotReadyDesc : rewardedGoldLimit.reason}
                  cta={
                    rewardedAd.isAdReady && rewardedGoldLimit.allowed ? messages.rewardOpenCta : messages.rewardWaitCta
                  }
                  disabled={
                    !rewardedAd.isAdReady || !rewardedGoldLimit.allowed || gameState.unlockedPlotCount >= MAX_PLOTS
                  }
                  onPress={() => void rewardFreePlotFromAd()}
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