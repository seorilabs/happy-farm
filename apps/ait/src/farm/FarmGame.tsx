import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
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
  CROPS,
  FARM_AREAS,
  GROWTH_AD_MAX_SKIP_MS,
  GROWTH_AD_MIN_REMAINING_MS,
  HARVEST_BONUS_BOOST_DURATION_MS,
  HARVEST_BONUS_MULTIPLIER,
  INTERSTITIAL_MILESTONE_COOLDOWN_MS,
  MAX_PLOTS,
  REWARDED_GOLD_AMOUNT,
  type AreaKey,
  type CropKey,
  type GameAnalyticsContext,
  type GameState,
  type RewardedAdController,
  type RewardedAdShowResult,
  type RewardedAdType,
  canUnlockArea,
  createFarmAnalytics,
  createInitialState,
  DEFAULT_LOCALE,
  formatHourlyGold,
  formatMoney,
  formatRemainingTime,
  formatSignedPercent,
  getAreaLabel,
  getAreaUnlockRequirementText,
  getCropLabel,
  getCropEconomyEstimate,
  getFarmProductivityEstimate,
  getGameAnalyticsContext,
  getHarvestBonusBoostStatus,
  getHarvestBonusPromptStatus,
  getMinUpgradeLevel,
  getPlotCost,
  getProfitMultiplier,
  getRewardedAdLimitStatus,
  getSpeedMultiplier,
  getUpgradeCost,
  isAreaUnlocked,
  normalizeLocale,
  recordHarvestBonusAdPrompt,
  recordRewardedAdUsage,
  type CropEconomyEstimate,
  type SupportedLocale,
} from '../../../../packages/farm-core/src';

import { DEFAULT_FARM_GAME_SETTINGS, normalizeFarmGameSettings, type FarmGameSettings } from './gameSettings';
import { getFarmMessages, type FarmMessages } from './i18n';

const REWARDED_AD_GROUP_ID = 'ait.v2.live.6fc77adf3f034cd6';
const INTERSTITIAL_AD_GROUP_ID = '';
const PLOT_COLUMNS = 4;
const PLOT_GAP = 10;
const MAIN_HORIZONTAL_PADDING = 16;
const PROGRESS_ANIMATION_DURATION_MS = 250;
const SHEET_DISMISS_DRAG_DISTANCE = 96;
const SHEET_DISMISS_VELOCITY = 1.1;
const SHEET_DISMISS_TRANSLATE_Y = 520;
const SHEET_ANIMATION_DURATION_MS = 180;
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

function getGrowthProgressRatio(startTime: number, growTime: number, speedMult: number, now = Date.now()) {
  if (growTime <= 0 || speedMult <= 0) {
    return 1;
  }

  const elapsed = Math.max(0, now - startTime) * speedMult;
  return Math.min(Math.max(elapsed / growTime, 0), 1);
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
  | { type: 'settings' }
  | { type: 'growthAd'; plotIndex: number; cropKey: CropKey; remainingMs: number }
  | { type: 'harvestBonus' }
  | { type: 'resetConfirm' }
  | null;

export type FarmGamePersistence = {
  readPersistedGameState: () => Promise<GameState>;
  writePersistedGameState: (gameState: GameState) => Promise<void>;
  removePersistedGameState: () => Promise<void>;
  readPersistedGameSettings?: () => Promise<Partial<FarmGameSettings> | null | undefined>;
  writePersistedGameSettings?: (settings: FarmGameSettings) => Promise<void>;
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
  const lastInterstitialShownAtRef = useRef(0);
  const sessionStartedAtRef = useRef(Date.now());
  const gameStartTrackedRef = useRef(false);
  const firstSeedSelectedRef = useRef(false);
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
  const closeSheet = useCallback(() => {
    setActiveSheet(null);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current != null) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const analyticsContext = useCallback(
    (state = gameState) => getGameAnalyticsContext(state, sessionStartedAtRef.current),
    [gameState]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadSavedGame() {
      const savedState = await persistence.readPersistedGameState();
      if (cancelled) {
        return;
      }
      setGameState(savedState);
      setIsSaveLoaded(true);
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
  }, [activeSheet, analyticsContext]);

  useEffect(() => {
    const id = setInterval(() => setTick((value) => (value + 1) % 1_000_000), 250);
    return () => clearInterval(id);
  }, []);

  const speedMult = useMemo(() => getSpeedMultiplier(gameState.upgrades.speed), [gameState.upgrades.speed]);
  const profitMult = useMemo(() => getProfitMultiplier(gameState.upgrades.profit), [gameState.upgrades.profit]);
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
    () =>
      getFarmProductivityEstimate(gameState, {
        speedMultiplier: speedMult,
        profitMultiplier: profitMult,
        harvestMultiplier: harvestBonusBoost.multiplier,
      }),
    [gameState, harvestBonusBoost.multiplier, profitMult, speedMult]
  );
  const cropEconomyByKey = useMemo(
    () =>
      (Object.keys(CROPS) as CropKey[]).reduce(
        (acc, cropKey) => {
          acc[cropKey] = getCropEconomyEstimate(cropKey, {
            speedMultiplier: speedMult,
            profitMultiplier: profitMult,
            harvestMultiplier: harvestBonusBoost.multiplier,
          });
          return acc;
        },
        {} as Record<CropKey, CropEconomyEstimate>
      ),
    [harvestBonusBoost.multiplier, profitMult, speedMult]
  );

  useEffect(() => {
    let updated = false;
    const now = Date.now();
    const nextPlots = gameState.plots.map((plot) => {
      if (plot.id >= gameState.unlockedPlotCount) {
        return plot;
      }
      if (plot.state !== 1 || plot.cropType == null || plot.startTime == null) {
        return plot;
      }
      const crop = getCrop(plot.cropType);
      const elapsed = (now - plot.startTime) * speedMult;
      if (elapsed >= crop.growTime) {
        updated = true;
        farmAnalytics.trackCropReady(plot.cropType, crop.area, crop.tier, analyticsContext());
        return { ...plot, state: 2 as const };
      }
      return plot;
    });

    if (updated) {
      setGameState((state) => ({ ...state, plots: nextPlots }));
    }
  }, [analyticsContext, gameState.plots, gameState.unlockedPlotCount, speedMult, tick]);

  function openShop() {
    setActiveSheet({ type: 'shop' });
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
    setGameState(createInitialState());
    setSelectedArea(FIRST_AREA.key);
    setSelectedTool('harvest');
    setActiveSheet(null);
    toast(messages.resetDoneToast);
  }

  function plantCrop(index: number, cropKey: CropKey) {
    const crop = getCrop(cropKey);
    if (!isAreaUnlocked(gameState, crop.area)) {
      toast(messages.areaFirstToast);
      return;
    }
    if (gameState.gold < crop.cost) {
      toast(messages.insufficientGoldToast);
      return;
    }

    setGameState((state) => {
      if (state.gold < crop.cost) {
        return state;
      }
      const plot = state.plots[index];
      if (plot == null || plot.id >= state.unlockedPlotCount || plot.state !== 0) {
        return state;
      }
      const next = [...state.plots];
      next[index] = { ...plot, cropType: cropKey, startTime: Date.now(), state: 1 };
      return { ...state, gold: state.gold - crop.cost, plots: next };
    });
    farmAnalytics.trackCropPlanted(cropKey, crop.area, crop.tier, crop.cost, analyticsContext());
  }

  function harvestCrop(index: number) {
    const plot = gameState.plots[index];
    if (plot == null || plot.state !== 2 || plot.cropType == null) {
      return;
    }
    const now = Date.now();
    const crop = getCrop(plot.cropType);
    const currentHarvestBoost = getHarvestBonusBoostStatus(gameState, now);
    const finalPrice = Math.floor(crop.sell * profitMult * currentHarvestBoost.multiplier);
    const isFirstMeaningfulHarvest = gameState.harvestedCropKeys.length === 0;
    const isFirstCropHarvest = !gameState.harvestedCropKeys.includes(plot.cropType);

    setGameState((state) => {
      const next = [...state.plots];
      next[index] = { id: index, cropType: null, startTime: null, state: 0 };
      const harvestedCropKeys = state.harvestedCropKeys.includes(plot.cropType as CropKey)
        ? state.harvestedCropKeys
        : [...state.harvestedCropKeys, plot.cropType as CropKey];
      return { ...state, gold: state.gold + finalPrice, plots: next, harvestedCropKeys };
    });

    farmAnalytics.trackCropHarvested({
      cropKey: plot.cropType,
      areaKey: crop.area,
      cropTier: crop.tier,
      revenue: finalPrice,
      isFirstMeaningfulHarvest,
      isFirstCropHarvest,
      context: analyticsContext(),
    });
    toast(
      currentHarvestBoost.active
        ? messages.harvestedBoostToast(formatMoney(finalPrice, locale), currentHarvestBoost.multiplier)
        : messages.harvestedToast(formatMoney(finalPrice, locale))
    );
    const canShowHarvestBonusNudge =
      rewardedAd.isAdReady &&
      getRewardedAdLimitStatus(gameState, 'harvestBonusAd', now).allowed &&
      getHarvestBonusPromptStatus(gameState, now).allowed &&
      !currentHarvestBoost.active;
    if (canShowHarvestBonusNudge) {
      setGameState((state) => ({ ...state, adUsage: recordHarvestBonusAdPrompt(state, now) }));
      setActiveSheet({ type: 'harvestBonus' });
    }
    Vibration.vibrate(50);
    if (gameSettings.soundEffectsEnabled && audio.isSupported) {
      void audio.playHarvest();
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
        const crop = getCrop(plot.cropType);
        const remainingMs = Math.max(0, crop.growTime - (Date.now() - plot.startTime) * speedMult);

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
    const crop = getCrop(selectedTool);
    return messages.plantHint(
      getLocalizedCropName(selectedTool),
      formatMoney(crop.cost, locale),
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

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={[styles.headerTop, isMobileMarket && styles.mobileHeaderTop]}>
          <View style={[styles.titleGroup, isMobileMarket && styles.mobileTitleGroup]}>
            <Text style={styles.homeIcon}>🏡</Text>
            <View>
              <Text style={styles.title}>{messages.appTitle}</Text>
              <Text style={styles.subtitle}>{messages.appSubtitle}</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <Pressable style={styles.shopButton} onPress={openShop}>
              <Text style={styles.shopButtonText}>{messages.shopButton}</Text>
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
            <Text style={styles.coinIcon}>💰</Text>
            <View style={styles.assetTextGroup}>
              <Text style={styles.label}>{messages.assetLabel}</Text>
              <Text style={styles.money} numberOfLines={1}>
                {formatMoney(gameState.gold, locale)}G
              </Text>
            </View>
          </View>
          <View style={styles.summaryColumn}>
            <Text style={styles.researchBadge}>{messages.researchBadge(researchLevel)}</Text>
            <Text style={styles.productivityText} numberOfLines={1}>
              {messages.productivity(formatHourlyGold(farmProductivity.netProfitPerHour, locale))}
            </Text>
            <View style={styles.statList}>
              <View style={styles.compactStat}>
                <Text style={styles.label}>{messages.profitLabel}</Text>
                <Text style={styles.profitStat}>×{profitMult.toFixed(1)}</Text>
              </View>
              <View style={styles.compactStat}>
                <Text style={styles.label}>{messages.growthLabel}</Text>
                <Text style={styles.speedStat}>×{speedMult.toFixed(1)}</Text>
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
      </View>

      <ScrollView contentContainerStyle={styles.mainContent} style={styles.main}>
        <View style={styles.plotGrid}>
          {gameState.plots.map((plot, index) => (
            <PlotCell
              key={plot.id}
              plot={plot}
              unlocked={index < gameState.unlockedPlotCount}
              speedMult={speedMult}
              tileSize={plotTileSize}
              messages={messages}
              onPress={() => handlePlotClick(index)}
            />
          ))}
        </View>
      </ScrollView>

      <View style={[styles.toolStrip, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.toolHeader}>
          <Text style={styles.toolLabel}>{messages.toolLabel}</Text>
          <Text style={styles.toolHint} numberOfLines={1}>
            {toolHint}
          </Text>
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
            return (
              <ToolButton
                key={key}
                active={selectedTool === key}
                icon={crop.icon}
                name={getLocalizedCropName(key)}
                cost={formatMoney(crop.cost, locale)}
                roi={messages.roi(formatSignedPercent(getCropEconomy(cropEconomyByKey, key).roiPercent, locale))}
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

      <Sheet
        activeSheet={activeSheet}
        description={getSheetDescription(activeSheet, messages, locale, getLocalizedCropName)}
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
            <Text style={styles.settingDesc}>{messages.languageDesc}</Text>

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
    </View>
  );
}

function PlotCell({
  plot,
  unlocked,
  speedMult,
  tileSize,
  messages,
  onPress,
}: {
  plot: GameState['plots'][number];
  unlocked: boolean;
  speedMult: number;
  tileSize: number;
  messages: FarmMessages;
  onPress: () => void;
}) {
  const tileSizeStyle = { width: tileSize, height: tileSize };

  if (!unlocked) {
    return (
      <Pressable style={[styles.plotTile, tileSizeStyle, styles.lockedPlot]} onPress={onPress}>
        <Text style={styles.lockIcon}>🔒</Text>
      </Pressable>
    );
  }

  if (plot.state === 0) {
    return (
      <Pressable style={[styles.plotTile, tileSizeStyle, styles.emptyPlot]} onPress={onPress}>
        <Text style={styles.emptyPlotText}>{messages.emptyPlot}</Text>
      </Pressable>
    );
  }

  const crop = plot.cropType != null ? getCrop(plot.cropType) : null;
  const progressRatio =
    plot.state === 1 && crop != null && plot.startTime != null
      ? getGrowthProgressRatio(plot.startTime, crop.growTime, speedMult)
      : 1;
  const icon = plot.state === 2 ? (crop?.icon ?? '🌱') : progressRatio > 0.5 ? '🌿' : '🌱';

  return (
    <Pressable
      style={[styles.plotTile, tileSizeStyle, plot.state === 2 ? styles.readyPlot : styles.growingPlot]}
      onPress={onPress}
    >
      {plot.state === 2 ? (
        <View style={styles.harvestBadge}>
          <Text style={styles.harvestBadgeText}>{messages.readyBadge}</Text>
        </View>
      ) : null}
      {plot.state === 1 && crop != null && plot.startTime != null ? (
        <GrowthProgressBar growTime={crop.growTime} speedMult={speedMult} startTime={plot.startTime} />
      ) : null}
      <Text style={plot.state === 2 ? styles.readyCropIcon : styles.cropIcon}>{icon}</Text>
    </Pressable>
  );
}

function GrowthProgressBar({
  growTime,
  speedMult,
  startTime,
}: {
  growTime: number;
  speedMult: number;
  startTime: number;
}) {
  const progressScaleRef = useRef<Animated.Value | null>(null);
  if (progressScaleRef.current == null) {
    progressScaleRef.current = new Animated.Value(getGrowthProgressRatio(startTime, growTime, speedMult));
  }
  const progressScale = progressScaleRef.current;
  // Recomputed on every parent re-render (the 250ms game tick), so the bar
  // advances in small steps instead of one animation spanning the whole grow time.
  const targetRatio = getGrowthProgressRatio(startTime, growTime, speedMult);

  useEffect(() => {
    if (targetRatio >= 1) {
      progressScale.stopAnimation();
      progressScale.setValue(1);
      return undefined;
    }

    // Animate only across a single game tick. Driving a native animation over
    // the full remaining grow time made React Native precompute one frame per
    // 60fps step of that duration: legend-tier crops (e.g. 세계수, growTime 5d)
    // generated millions of frames, freezing the JS thread and crashing the
    // app the moment such a crop was planted or its save was reloaded.
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
          <View style={styles.sheetDragArea} {...panResponder.panHandlers}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{title}</Text>
            <Text style={styles.sheetDescription}>{description}</Text>
          </View>
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
  if (activeSheet?.type === 'harvestBonus') {
    return messages.sheetTitleHarvestBonus;
  }
  if (activeSheet?.type === 'settings') {
    return messages.sheetTitleSettings;
  }
  if (activeSheet?.type === 'resetConfirm') {
    return messages.sheetTitleResetConfirm;
  }
  return messages.sheetTitleShop;
}

function getSheetDescription(
  activeSheet: ActiveSheet,
  messages: FarmMessages,
  locale: SupportedLocale,
  getLocalizedCropName: (cropKey: CropKey) => string
) {
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
  onPress,
}: {
  active: boolean;
  icon: string;
  name: string;
  cost?: string;
  roi?: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.toolButton, active && styles.activeToolButton]} onPress={onPress}>
      <Text style={styles.toolIcon}>{icon}</Text>
      <Text style={styles.toolName} numberOfLines={1}>
        {name}
      </Text>
      {cost != null ? <Text style={styles.toolCost}>{cost}</Text> : null}
      {roi != null ? <Text style={styles.toolRoi}>{roi}</Text> : null}
    </Pressable>
  );
}

function AdRewardCard({
  title,
  desc,
  cta,
  disabled,
  onPress,
}: {
  title: string;
  desc: string;
  cta: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      style={[styles.shopCard, styles.adCard, disabled && styles.disabledCard]}
      onPress={onPress}
    >
      <View style={styles.shopTextGroup}>
        <Text style={styles.shopTitle}>{title}</Text>
        <Text style={styles.shopDesc}>{desc}</Text>
      </View>
      <Text style={styles.shopPrice}>{cta}</Text>
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

  return (
    <>
      {lockedAreas.map((area, index) => {
        const isNextArea = index === 0;
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

function ShopCard({
  title,
  desc,
  price,
  disabled,
  priceTone,
  onPress,
}: {
  title: string;
  desc: string;
  price: string;
  disabled?: boolean;
  priceTone?: 'speed' | 'profit';
  onPress: () => void;
}) {
  return (
    <Pressable disabled={disabled} style={[styles.shopCard, disabled && styles.disabledCard]} onPress={onPress}>
      <View style={styles.shopTextGroup}>
        <Text style={styles.shopTitle}>{title}</Text>
        <Text style={styles.shopDesc}>{desc}</Text>
      </View>
      <Text
        style={[
          styles.shopPrice,
          priceTone === 'speed' && styles.speedPrice,
          priceTone === 'profit' && styles.profitPrice,
        ]}
      >
        {price}
      </Text>
    </Pressable>
  );
}

function SettingToggle({
  label,
  desc,
  value,
  disabled,
  onPress,
}: {
  label: string;
  desc: string;
  value: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable disabled={disabled} style={[styles.settingRow, disabled && styles.disabledCard]} onPress={onPress}>
      <View style={styles.settingTextGroup}>
        <Text style={styles.settingTitle}>{label}</Text>
        <Text style={styles.settingDesc}>{desc}</Text>
      </View>
      <View style={[styles.toggleTrack, value && styles.activeToggleTrack]}>
        <View style={[styles.toggleThumb, value && styles.activeToggleThumb]} />
      </View>
    </Pressable>
  );
}

function SheetAction({
  label,
  disabled,
  secondary,
  danger,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      style={[
        styles.sheetAction,
        secondary && styles.secondarySheetAction,
        danger && styles.dangerSheetAction,
        disabled && styles.disabledCard,
      ]}
      onPress={onPress}
    >
      <Text style={[styles.sheetActionText, secondary && styles.secondarySheetActionText]}>{label}</Text>
    </Pressable>
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
  shopButton: {
    minHeight: 34,
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#2f7de1',
  },
  shopButtonText: {
    color: '#ffffff',
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
    paddingTop: 10,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
  },
  sheetDragArea: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d0d5dd',
  },
  sheetTitle: {
    marginTop: 14,
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
  shopCard: {
    minHeight: 72,
    marginBottom: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  adCard: {
    borderColor: '#aad8b1',
    backgroundColor: '#f0fbf0',
  },
  disabledCard: {
    opacity: 0.45,
  },
  shopTextGroup: {
    flex: 1,
    minWidth: 0,
  },
  shopTitle: {
    color: '#253126',
    fontSize: 16,
    fontWeight: '900',
  },
  shopDesc: {
    marginTop: 3,
    color: '#667085',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  shopPrice: {
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    color: '#ffffff',
    backgroundColor: '#2f8747',
    fontSize: 13,
    fontWeight: '900',
  },
  speedPrice: {
    backgroundColor: '#2f7de1',
  },
  profitPrice: {
    backgroundColor: '#bf7a00',
  },
  settingRow: {
    minHeight: 70,
    marginBottom: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  settingTextGroup: {
    flex: 1,
    minWidth: 0,
  },
  settingTitle: {
    color: '#253126',
    fontSize: 16,
    fontWeight: '900',
  },
  settingDesc: {
    marginTop: 3,
    color: '#667085',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 3,
    backgroundColor: '#d0d5dd',
    justifyContent: 'center',
  },
  activeToggleTrack: {
    backgroundColor: '#2f7de1',
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ffffff',
  },
  activeToggleThumb: {
    alignSelf: 'flex-end',
  },
  sheetAction: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#2f7de1',
  },
  secondarySheetAction: {
    backgroundColor: '#edf2f7',
  },
  dangerSheetAction: {
    backgroundColor: '#e5484d',
  },
  sheetActionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  secondarySheetActionText: {
    color: '#344054',
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
});
