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
// build a streak counter. Tier thresholds gate icon/color escalation.
const COMBO_WINDOW_MS = 1500;
const COMBO_GREAT_THRESHOLD = 5;
const COMBO_LEGENDARY_THRESHOLD = 10;
// Gold bonus ratios applied on top of the base harvest value while in combo.
const COMBO_GREAT_BONUS_RATIO = 0.1;
const COMBO_LEGENDARY_BONUS_RATIO = 0.25;

// Pure function: gold bonus for the given combo streak and base harvest value.
// `streak` must already include the current harvest (i.e. comboAtTap + 1).
// Donation harvests pass baseGold = 0 so the result is always 0 — no special-case needed.
export function computeComboGoldBonus(streak: number, baseGold: number): number {
  if (streak >= COMBO_LEGENDARY_THRESHOLD) {
    return Math.floor(baseGold * COMBO_LEGENDARY_BONUS_RATIO);
  }
  if (streak >= COMBO_GREAT_THRESHOLD) {
    return Math.floor(baseGold * COMBO_GREAT_BONUS_RATIO);
  }
  return 0;
}
export const MASTERY_RANK_UP_CELEBRATION_DURATION_MS = 2600;
const SHEET_DISMISS_DRAG_DISTANCE = 96;
const SHEET_DISMISS_VELOCITY = 1.1;
const SHEET_DISMISS_TRANSLATE_Y = 520;
const SHEET_ANIMATION_DURATION_MS = 180;
const SHEET_DRAG_HIT_TARGET_HEIGHT = 36;
const EMPTY_SAFE_AREA_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

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

type UseFarmAd = (adGroupId: string) => RewardedAdController;
type FarmAnalytics = ReturnType<typeof createFarmAnalytics>;
type FarmGameMarket = 'appsInToss' | 'mobile';

export type FarmGameAudio = {
  isSupported: boolean;
  playHarvest: () => void | Promise<void>;
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
      comboBonus: number;
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

const defaultFarmAnalytics = createFarmAnalytics();
const defaultFarmAudio: FarmGameAudio = {
  isSupported: false,
  playHarvest: () => undefined,
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
  // Ref-shadowed combo count so harvestCrop can read the current streak
  // synchronously inside the setGameState updater without a stale closure.
  const harvestComboRef = useRef(0);
  const [masteryRankUpNotice, setMasteryRankUpNotice] = useState<MasteryRankUpNotice | null>(null);
  const masteryRankUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const masteryNoticeIdRef = useRef(0);
  // Per-plot "just planted" tokens. Bumped only on a manual plant so the fresh
  // sprout bounces in (auto-replant and save-load stay silent). Keyed by index.
  const [plantPulses, setPlantPulses] = useState<Record<number, number>>({});
  const plantPulseTokenRef = useRef(0);
  const harvestFxRef = useRef<HarvestFxHandle>(null);
  const mutationFlashRef = useRef<MutationFlashHandle>(null);
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
    harvestComboRef.current += count;
    setHarvestCombo(harvestComboRef.current);
    comboTimerRef.current = setTimeout(() => {
      harvestComboRef.current = 0;
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
    };
  }, []);

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
      const totalGoldShown = event.goldGained + effect.comboBonus;
      const mutationKey = event.mutation?.key;
      const popTone: HarvestPop['tone'] =
        mutationKey === 'rainbow'
          ? 'rainbow'
          : mutationKey === 'golden'
            ? 'golden'
            : isSpecialHarvest || effect.comboBonus > 0
              ? 'special'
              : 'normal';
      if (totalGoldShown > 0) {
        harvestFxRef.current?.spawn(
          event.plotIndex,
          `+${formatMoney(totalGoldShown, locale)}`,
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
      // ref was already advanced eagerly in harvestCrop; just sync the display state.
      setHarvestCombo(harvestComboRef.current);
    }
  }, [
    analyticsContext,
    audio,
    commandEffectVersion,
    farmAnalytics,
    gameSettings.soundEffectsEnabled,
    getLocalizedCropName,
    locale,
    messages,
    pulseGold,
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
  const growthAdLimit = useMemo(
    () => getRewardedAdLimitStatus(gameState, 'growthAd', Date.now(), locale),
    [gameState, locale, tick]
  );
  const harvestBonusAdLimit = useMemo(
    () => getRewardedAdLimitStatus(gameState, 'harvestBonusAd', Date.now(), locale),
    [gameState, locale, tick]
  );
  const harvestBonusBoost = useMemo(() => getHarvestBonusBoostStatus(gameState), [gameState, tick]);
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
    harvestComboRef.current = 0;
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
    toast(
      messages.prestigeDoneToast(getRegionArchetypeLabel(prestigeArchetype, locale).name, result.starsAwarded)
    );
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
    harvestComboRef.current = 0;
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
    // Eagerly capture and advance the combo ref so back-to-back harvests
    // within a single render frame see the correct streak depth. The ref is
    // the source of truth for bonus calculation; setHarvestCombo (for the
    // display) is synced to it in the pending-effect drain loop after commit.
    const comboAtTap = harvestComboRef.current;
    harvestComboRef.current += 1;
    // Reset the decay window so every tap extends the streak correctly even
    // before the effects are flushed.
    if (comboTimerRef.current != null) {
      clearTimeout(comboTimerRef.current);
    }
    comboTimerRef.current = setTimeout(() => {
      harvestComboRef.current = 0;
      setHarvestCombo(0);
      comboTimerRef.current = null;
    }, COMBO_WINDOW_MS);
    const roll = Math.random();
    setGameState((state) => {
      const result = executeFarmGameCommand(
        state,
        { type: 'harvestCrop', plotIndex: index },
        { now, rng: () => roll }
      );
      if (result.status === 'blocked') {
        // Undo the eager ref increment — the harvest didn't happen.
        // Math.max guards against double-decrement on StrictMode re-invoke.
        harvestComboRef.current = Math.max(0, harvestComboRef.current - 1);
        return state;
      }
      const event = result.events[0];
      if (event?.type !== 'cropHarvested') {
        return result.state;
      }

      // Combo gold bonus: applied only to non-donation gold harvests. We check
      // event.donated explicitly rather than relying on goldGained===0 so the
      // guard stays valid if donation semantics ever change.
      const comboBonus = !event.donated ? computeComboGoldBonus(comboAtTap + 1, event.goldGained) : 0;
      const nextState =
        comboBonus > 0
          ? {
              ...result.state,
              gold: result.state.gold + comboBonus,
              lifetimeStats: {
                ...result.state.lifetimeStats,
                totalGoldEarned: result.state.lifetimeStats.totalGoldEarned + comboBonus,
              },
            }
          : result.state;

      // Guard against StrictMode/concurrent double-invoke of this updater:
      // push at most one effect per effectId (same pattern as harvestAllCrops).
      if (!pendingCommandEffectsRef.current.some((pending) => pending.id === effectId)) {
        pendingCommandEffectsRef.current.push({
          id: effectId,
          type: 'cropHarvested',
          event,
          now,
          comboBonus,
          shouldShowHarvestBonusNudge:
            rewardedAd.isAdReady &&
            getRewardedAdLimitStatus(nextState, 'harvestBonusAd', now).allowed &&
            getHarvestBonusPromptStatus(nextState, now).allowed &&
            !event.boostActive,
        });
      }
      return nextState;
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
            <Text style={styles.starsChip}>★ {gameState.prestige.stars}</Text>
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
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navRow}>
          <NavButton label={messages.shopButton} onPress={openShop} />
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
            return (
              <ToolButton
                key={key}
                active={selectedTool === key}
                icon={crop.icon}
                name={getLocalizedCropName(key)}
                cost={formatMoney(cropCost, locale)}
                roi={messages.roi(formatSignedPercent(getCropEconomy(cropEconomyByKey, key).roiPercent, locale))}
                affordable={gameState.gold >= cropCost}
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
                  desc={rewardedGoldLimit.allowed ? messages.rewardedGoldReadyDesc : rewardedGoldLimit.reason}
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

            <Text style={styles.sheetSectionTitle}>{messages.languageSection}</Text>
            <SheetAction
              label={messages.languageSwitchLabel}
              secondary
              onPress={() => updateGameSettings({ locale: locale === 'ko-KR' ? 'en-US' : 'ko-KR' })}
            />
            <Text style={sheetPartStyles.settingDesc}>{messages.languageDesc}</Text>

            <Text style={styles.sheetSectionTitle}>{messages.gameDataSection}</Text>
            <SheetAction label={messages.resetFarmAction} danger onPress={openResetConfirm} />
          </View>
        ) : null}

        {activeSheet?.type === 'growthAd' ? (
          <View>
            <SheetAction
              label={growthAdLimit.allowed ? messages.growthAdAction : growthAdLimit.reason}
              disabled={!rewardedAd.isAdReady || !growthAdLimit.allowed}
              onPress={() => void completeGrowthWithAd(activeSheet.plotIndex)}
            />
            <SheetAction label={messages.waitAction} secondary onPress={() => setActiveSheet(null)} />
          </View>
        ) : null}

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
            <SheetAction
              label={
                activeSheet.summary.offlineGold > 0
                  ? messages.welcomeBackCollectAction(formatMoney(activeSheet.summary.offlineGold, locale))
                  : messages.welcomeBackConfirmAction
              }
              onPress={() => dismissWelcomeBack(activeSheet.type === 'welcomeBack' && activeSheet.summary.offlineGold > 0)}
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
    </View>
  );
}

function NavButton({
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
    <Pressable accessibilityLabel={accessibilityLabel} style={styles.navButton} onPress={onPress}>
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

// Shows a growing streak counter when the player rapidly harvests multiple
// plots in quick succession. Punches out on each count update so the number
// change is unmistakable; tiers escalate icon and color at 5× and 10×.
// Animation: quick pop to 1.25× then spring back to 1.0, starting from
// whatever scale the previous animation left — no snapping on rapid taps.
function ComboDisplay({ count, messages }: { count: number; messages: FarmMessages }) {
  const scaleRef = useRef<Animated.Value | null>(null);
  if (scaleRef.current == null) {
    scaleRef.current = new Animated.Value(0.6);
  }
  const scale = scaleRef.current;

  useEffect(() => {
    scale.stopAnimation();
    const animation = Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.25,
        duration: 80,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        damping: 12,
        stiffness: 240,
        mass: 0.6,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [scale, count]);

  useEffect(() => {
    return () => scale.stopAnimation();
  }, [scale]);

  const tier =
    count >= COMBO_LEGENDARY_THRESHOLD ? 'legendary' : count >= COMBO_GREAT_THRESHOLD ? 'great' : 'normal';
  const icon = tier === 'legendary' ? '⚡' : tier === 'great' ? '🔥' : '🌾';

  return (
    <Animated.View
      style={[
        styles.comboDisplay,
        tier === 'great' && styles.comboDisplayGreat,
        tier === 'legendary' && styles.comboDisplayLegendary,
        { transform: [{ scale }] },
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
  plantToken: number | undefined;
  onPlantPulseDone: (index: number) => void;
  onPress: (index: number) => void;
}) {
  const tileSizeStyle = { width: tileSize, height: tileSize };
  const handlePress = () => onPress(index);

  if (!unlocked) {
    return (
      <Pressable testID={`plot-cell-${index}`} style={[styles.plotTile, tileSizeStyle, styles.lockedPlot]} onPress={handlePress}>
        <Text style={styles.lockIcon}>🔒</Text>
      </Pressable>
    );
  }

  if (plot.state === 0) {
    return (
      <Pressable testID={`plot-cell-${index}`} style={[styles.plotTile, tileSizeStyle, styles.emptyPlot]} onPress={handlePress}>
        <Text style={styles.emptyPlotText}>{messages.emptyPlot}</Text>
      </Pressable>
    );
  }

  const crop = plot.cropType != null ? getCrop(plot.cropType) : null;
  // Reveal the actual crop icon at ≥65% growth so players can see what's
  // ripening and feel anticipation before the harvest tap.
  const icon =
    plot.state === 2 || progressRatio >= 0.65
      ? (crop?.icon ?? '🌿')
      : progressRatio >= 0.3
        ? '🌿'
        : '🌱';

  return (
    <Pressable
      testID={`plot-cell-${index}`}
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
        <ReadyCropIcon icon={icon} phaseSeed={plot.id} />
      ) : (
        <GrowingCropIcon
          icon={icon}
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
  plantToken,
  onPlantPulseDone,
}: {
  icon: string;
  plantToken: number | undefined;
  onPlantPulseDone: () => void;
}) {
  const popRef = useRef<Animated.Value | null>(null);
  if (popRef.current == null) {
    popRef.current = new Animated.Value(1);
  }
  const pop = popRef.current;
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

  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const opacity = pop.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.2, 1, 1] });

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
  onClose,
}: {
  activeSheet: ActiveSheet;
  children: React.ReactNode;
  description: string;
  title: string;
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
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeSheetWithAnimation} />
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
  collectionSummary: CollectionSummary
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

function ToolButton({
  active,
  icon,
  name,
  cost,
  roi,
  affordable,
  onPress,
}: {
  active: boolean;
  icon: string;
  name: string;
  cost?: string;
  roi?: string;
  affordable?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.toolButton, active && styles.activeToolButton]} onPress={onPress}>
      <Text style={styles.toolIcon}>{icon}</Text>
      <Text style={styles.toolName} numberOfLines={1}>
        {name}
      </Text>
      {cost != null ? (
        <Text style={[styles.toolCost, affordable === false && styles.toolCostUnaffordable]}>{cost}</Text>
      ) : null}
      {roi != null ? <Text style={styles.toolRoi}>{roi}</Text> : null}
    </Pressable>
  );
}

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

  return (
    <ShopCard
      title={title}
      desc={messages.upgradeDescWithLevel(desc, level)}
      price={`${formatMoney(cost, locale)}G`}
      priceTone={kind}
      disabled={disabled}
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f1f8e9',
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#d9e7ce',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
  },
  mobileHeaderTop: {
    justifyContent: 'space-between',
  },
  titleGroup: {
    minWidth: 0,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mobileTitleGroup: {
    flex: 1,
  },
  homeIcon: {
    fontSize: 26,
  },
  title: {
    color: '#253126',
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
    color: '#247241',
    backgroundColor: '#dff1df',
    fontSize: 11,
    fontWeight: '800',
  },
  headerActions: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  titleBadge: {
    marginTop: 2,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
    color: '#6f57d9',
    backgroundColor: '#efeafd',
    fontSize: 11,
    fontWeight: '800',
  },
  starsChip: {
    minHeight: 34,
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 10,
    lineHeight: 34,
    color: '#8a4b0f',
    backgroundColor: '#fff3d6',
    fontSize: 13,
    fontWeight: '900',
  },
  navRow: {
    gap: 8,
    paddingTop: 8,
  },
  navButton: {
    minHeight: 34,
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#edf2f7',
  },
  navButtonText: {
    color: '#344054',
    fontSize: 13,
    fontWeight: '800',
  },
  settingsButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#edf2f7',
  },
  settingsButtonText: {
    color: '#4a5568',
    fontSize: 17,
    fontWeight: '800',
  },
  statsPanel: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#f1d98a',
    borderRadius: 8,
    backgroundColor: '#fff8d8',
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 10,
  },
  assetRow: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  assetPulse: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    transformOrigin: 'left center',
  },
  coinIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: '#f6c343',
    textAlign: 'center',
    lineHeight: 30,
    fontSize: 17,
  },
  assetTextGroup: {
    minWidth: 0,
    flex: 1,
  },
  label: {
    color: '#667085',
    fontSize: 11,
    fontWeight: '700',
  },
  money: {
    color: '#7a4b00',
    fontSize: 24,
    fontWeight: '900',
  },
  summaryColumn: {
    flexShrink: 0,
    maxWidth: '48%',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  researchBadge: {
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    color: '#ffffff',
    backgroundColor: '#6f57d9',
    fontSize: 11,
    fontWeight: '900',
  },
  productivityText: {
    marginTop: 3,
    color: '#247241',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right',
  },
  statList: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  compactStat: {
    alignItems: 'flex-end',
  },
  profitStat: {
    color: '#247241',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
  },
  speedStat: {
    color: '#2f7de1',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
  },
  boostStat: {
    color: '#b54708',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
  },
  boostRemaining: {
    marginTop: 1,
    color: '#8a4b0f',
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'right',
  },
  main: {
    flex: 1,
  },
  mainContent: {
    padding: 16,
  },
  plotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: PLOT_GAP,
  },
  harvestPop: {
    position: 'absolute',
    zIndex: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  harvestPopText: {
    color: '#f7b733',
    fontSize: 18,
    fontWeight: '900',
    textShadowColor: 'rgba(31, 41, 55, 0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  harvestPopTextSpecial: {
    color: '#ffd23f',
    fontSize: 22,
    textShadowColor: 'rgba(180, 83, 9, 0.95)',
    textShadowRadius: 4,
  },
  harvestPopTextGolden: {
    color: '#fbbf24',
    fontSize: 30,
    textShadowColor: 'rgba(180, 83, 9, 0.95)',
    textShadowRadius: 8,
  },
  harvestPopTextRainbow: {
    color: '#c084fc',
    fontSize: 38,
    textShadowColor: 'rgba(109, 40, 217, 0.95)',
    textShadowRadius: 10,
  },
  mutationFlash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 8,
  },
  toast: {
    position: 'absolute',
    left: 18,
    right: 18,
    zIndex: 20,
    alignItems: 'center',
  },
  toastText: {
    maxWidth: '100%',
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: 'rgba(31, 41, 55, 0.94)',
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    textAlign: 'center',
  },
  plotTile: {
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  lockedPlot: {
    opacity: 0.62,
    borderColor: '#c7d0d9',
    backgroundColor: '#e9eef2',
  },
  lockIcon: {
    fontSize: 25,
    lineHeight: 30,
  },
  emptyPlot: {
    borderColor: '#cdbb98',
    backgroundColor: '#e7d8bd',
  },
  emptyPlotText: {
    color: '#6b5d48',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  growingPlot: {
    borderColor: '#5e4631',
    backgroundColor: '#7c5e42',
  },
  readyPlot: {
    borderColor: '#73b76e',
    backgroundColor: '#dff1df',
  },
  harvestBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: '#e5484d',
  },
  harvestBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  growthTimer: {
    position: 'absolute',
    top: 5,
    left: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 7,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
  },
  growthTimerText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  progressTrack: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
  },
  progressFill: {
    width: '100%',
    height: '100%',
    backgroundColor: '#76d275',
    transformOrigin: 'left center',
  },
  cropIcon: {
    fontSize: 28,
    lineHeight: 32,
  },
  readyCropIcon: {
    fontSize: 32,
    lineHeight: 36,
  },
  toolStrip: {
    paddingTop: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#d9e7ce',
    backgroundColor: '#ffffff',
  },
  toolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toolLabel: {
    color: '#667085',
    fontSize: 13,
    fontWeight: '800',
  },
  toolHint: {
    minWidth: 0,
    flex: 1,
    color: '#247241',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
  },
  harvestAllButton: {
    minHeight: 34,
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 16,
    backgroundColor: '#2e9e57',
    shadowColor: '#1c5f37',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  harvestAllButtonPressed: {
    opacity: 0.85,
  },
  harvestAllButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  areaTabs: {
    gap: 8,
    paddingTop: 10,
    paddingBottom: 2,
  },
  areaTab: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f7fafc',
  },
  activeAreaTab: {
    borderColor: '#4d9d56',
    backgroundColor: '#edf8ed',
  },
  lockedAreaTab: {
    backgroundColor: '#edf2f7',
  },
  areaTabName: {
    color: '#344054',
    fontSize: 13,
    fontWeight: '900',
  },
  activeAreaTabName: {
    color: '#247241',
  },
  areaTabCount: {
    color: '#7b8794',
    fontSize: 11,
    fontWeight: '800',
  },
  toolScroll: {
    gap: 10,
    paddingTop: 8,
    paddingBottom: 4,
  },
  toolButton: {
    width: 82,
    height: 88,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  activeToolButton: {
    borderColor: '#4d9d56',
    backgroundColor: '#edf8ed',
  },
  toolIcon: {
    fontSize: 24,
  },
  toolName: {
    maxWidth: '100%',
    color: '#253126',
    fontSize: 12,
    fontWeight: '900',
  },
  toolCost: {
    color: '#8f5c00',
    fontSize: 10,
    fontWeight: '900',
  },
  toolCostUnaffordable: {
    color: '#b42318',
  },
  toolRoi: {
    color: '#247241',
    fontSize: 10,
    fontWeight: '900',
  },
  lockedNotice: {
    width: 260,
    minHeight: 76,
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#c7d0d9',
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f7fafc',
  },
  lockedNoticeTitle: {
    color: '#253126',
    fontSize: 13,
    fontWeight: '900',
  },
  lockedNoticeDesc: {
    color: '#667085',
    fontSize: 11,
    fontWeight: '700',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    backgroundColor: 'rgba(16, 24, 40, 0.45)',
  },
  sheet: {
    maxHeight: '86%',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    paddingTop: 0,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
  },
  sheetDragArea: {
    marginHorizontal: -20,
    height: SHEET_DRAG_HIT_TARGET_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 10,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d0d5dd',
  },
  sheetTitle: {
    color: '#253126',
    fontSize: 21,
    fontWeight: '900',
  },
  sheetDescription: {
    marginTop: 4,
    color: '#667085',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  sheetContent: {
    paddingTop: 14,
    paddingBottom: 28,
  },
  sheetSectionTitle: {
    marginTop: 12,
    marginBottom: 8,
    color: '#667085',
    fontSize: 13,
    fontWeight: '900',
  },
  researchSummary: {
    marginTop: -2,
    marginBottom: 10,
    color: '#344054',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  resetWarning: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    color: '#b42318',
    backgroundColor: '#fff1f0',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  welcomeBackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f3faf1',
    borderWidth: 1,
    borderColor: '#d6ecd0',
  },
  welcomeBackIcon: {
    fontSize: 28,
    marginRight: 14,
  },
  welcomeBackRowText: {
    flex: 1,
  },
  welcomeBackRowLabel: {
    color: '#5b6b58',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  welcomeBackRowValue: {
    color: '#1f7a3d',
    fontSize: 20,
    fontWeight: '900',
  },
  resetInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 8,
    paddingHorizontal: 14,
    color: '#253126',
    backgroundColor: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  collectionBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#e5484d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  collectionBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  comboOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // Shift above true center so the combo sits over the plot grid,
    // not the tool strip. paddingBottom lifts the visual center upward.
    paddingBottom: 120,
    zIndex: 9,
  },
  comboDisplay: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(31, 41, 55, 0.88)',
  },
  comboDisplayGreat: {
    backgroundColor: 'rgba(154, 52, 18, 0.92)',
  },
  comboDisplayLegendary: {
    backgroundColor: 'rgba(120, 70, 0, 0.95)',
  },
  comboText: {
    color: '#f7b733',
    fontSize: 24,
    fontWeight: '900',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  comboTextGreat: {
    color: '#ff8c42',
    fontSize: 28,
  },
  comboTextLegendary: {
    color: '#ffd23f',
    fontSize: 32,
  },
  masteryBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
  },
  masteryCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  masteryCard: {
    width: 268,
    paddingHorizontal: 28,
    paddingVertical: 28,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  masteryTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#667085',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  masteryCropIcon: {
    fontSize: 68,
    lineHeight: 76,
    marginVertical: 2,
  },
  masteryRankBadge: {
    fontSize: 30,
    fontWeight: '900',
  },
  masteryCropName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#344054',
    marginTop: 4,
  },
});
