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
  HARVEST_BONUS_MULTIPLIER,
  HARVEST_BONUS_NUDGE_DECLINE_SKIP_HARVESTS,
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
  formatMoney,
  getAreaUnlockRequirementText,
  getGameAnalyticsContext,
  getPlotCost,
  getProfitMultiplier,
  getRewardedAdLimitStatus,
  getSpeedMultiplier,
  getUpgradeCost,
  isAreaUnlocked,
  recordRewardedAdUsage,
} from '../../../../packages/farm-core/src';

import { DEFAULT_FARM_GAME_SETTINGS, normalizeFarmGameSettings, type FarmGameSettings } from './gameSettings';

const REWARDED_AD_GROUP_ID = '';
const INTERSTITIAL_AD_GROUP_ID = '';
const RESET_CONFIRM_TEXT = '초기화';
const PLOT_COLUMNS = 4;
const PLOT_GAP = 10;
const MAIN_HORIZONTAL_PADDING = 16;
const MIN_PROGRESS_ANIMATION_DURATION_MS = 80;
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

function getRemainingGrowthDuration(startTime: number, growTime: number, speedMult: number, now = Date.now()) {
  if (growTime <= 0 || speedMult <= 0) {
    return 0;
  }

  const elapsed = Math.max(0, now - startTime) * speedMult;
  return Math.max(0, (growTime - elapsed) / speedMult);
}

const FIRST_AREA = getFirstArea();

type ActiveSheet =
  | { type: 'shop' }
  | { type: 'settings' }
  | { type: 'growthAd'; plotIndex: number; cropName: string; remainingMs: number }
  | { type: 'harvestBonus'; amount: number }
  | { type: 'resetConfirm' }
  | null;

export type FarmGamePersistence = {
  readPersistedGameState: () => Promise<GameState>;
  writePersistedGameState: (gameState: GameState) => Promise<void>;
  removePersistedGameState: () => Promise<void>;
  readPersistedGameSettings?: () => Promise<FarmGameSettings>;
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
  readPersistedGameSettings: async () => DEFAULT_FARM_GAME_SETTINGS,
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
  const harvestBonusHarvestCountRef = useRef(0);
  const harvestBonusNudgeAvailableAtHarvestRef = useRef(1);
  const sessionStartedAtRef = useRef(Date.now());
  const gameStartTrackedRef = useRef(false);
  const firstSeedSelectedRef = useRef(false);
  const rewardedAd = useRewardedAd(REWARDED_AD_GROUP_ID);
  const interstitialAd = useInterstitialAd(INTERSTITIAL_AD_GROUP_ID);
  const farmAnalytics = analytics;
  const isMobileMarket = market === 'mobile';

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
  const deferHarvestBonusNudge = useCallback(() => {
    harvestBonusNudgeAvailableAtHarvestRef.current =
      harvestBonusHarvestCountRef.current + HARVEST_BONUS_NUDGE_DECLINE_SKIP_HARVESTS + 1;
  }, []);

  const dismissHarvestBonusNudge = useCallback(() => {
    deferHarvestBonusNudge();
    setActiveSheet(null);
  }, [deferHarvestBonusNudge]);

  const closeSheet = useCallback(() => {
    if (activeSheet?.type === 'harvestBonus') {
      dismissHarvestBonusNudge();
      return;
    }
    setActiveSheet(null);
  }, [activeSheet, dismissHarvestBonusNudge]);

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
      setGameSettings(normalizeFarmGameSettings(savedSettings));
      setIsSettingsLoaded(true);
    }

    void loadSavedSettings();

    return () => {
      cancelled = true;
    };
  }, [persistence]);

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
    toast('농장 기록을 불러왔어요.');
  }, [analyticsContext, isSaveLoaded, toast]);

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
  const selectedAreaMeta = FARM_AREAS.find((area) => area.key === selectedArea) ?? FIRST_AREA;
  const selectedAreaUnlocked = isAreaUnlocked(gameState, selectedArea);
  const rewardedGoldLimit = useMemo(() => getRewardedAdLimitStatus(gameState, 'rewardedGold'), [gameState, tick]);
  const growthAdLimit = useMemo(() => getRewardedAdLimitStatus(gameState, 'growthAd'), [gameState, tick]);
  const harvestBonusAdLimit = useMemo(() => getRewardedAdLimitStatus(gameState, 'harvestBonusAd'), [gameState, tick]);

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
      toast('아직 열리지 않은 구역의 작물이에요.');
      return;
    }

    const isFirstSeedSelection = !firstSeedSelectedRef.current;
    firstSeedSelectedRef.current = true;
    farmAnalytics.trackSeedSelected(cropKey, crop.area, isFirstSeedSelection, analyticsContext());
    setSelectedArea(crop.area);
    setSelectedTool(cropKey);
  }

  async function showRewardedAd(type: RewardedAdType, rewardValue: number, onReward: () => void) {
    const limit = getRewardedAdLimitStatus(gameState, type);
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
      toast(
        rewardedAd.isAdSupported
          ? '광고를 준비하는 중이에요. 잠시 후 다시 시도해 주세요.'
          : '현재 환경에서는 광고를 사용할 수 없어요.'
      );
      return false;
    }

    farmAnalytics.trackAdRewardClick(type, analyticsContext());
    const result = await rewardedAd.showAd();

    if (result.status === 'earned') {
      const rewardedAt = Date.now();
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

    farmAnalytics.trackAdRewardFailed(type, getAdFailureReason(result), analyticsContext());
    toast(result.status === 'dismissed' ? '광고 보상이 완료되지 않았어요.' : '광고를 표시하지 못했어요.');

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
      toast(`${formatMoney(amount)}G를 받았어요.`);
    });
  }

  async function rewardFreePlotFromAd() {
    if (gameState.unlockedPlotCount >= MAX_PLOTS) {
      toast('이미 모든 밭을 열었어요.');
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
      toast('광고 보상으로 밭을 1칸 열었어요.');
    });
  }

  async function confirmReset() {
    if (resetConfirmText !== RESET_CONFIRM_TEXT) {
      toast(`계속하려면 '${RESET_CONFIRM_TEXT}'를 입력해 주세요.`);
      return;
    }
    await persistence.removePersistedGameState();
    setGameState(createInitialState());
    setSelectedArea(FIRST_AREA.key);
    setSelectedTool('harvest');
    setActiveSheet(null);
    toast('농장을 새로 시작했어요.');
  }

  function plantCrop(index: number, cropKey: CropKey) {
    const crop = getCrop(cropKey);
    if (!isAreaUnlocked(gameState, crop.area)) {
      toast('구역을 먼저 해금해 주세요.');
      return;
    }
    if (gameState.gold < crop.cost) {
      toast('자금이 부족해요.');
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
    const crop = getCrop(plot.cropType);
    const finalPrice = Math.floor(crop.sell * profitMult);
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
    toast(`+${formatMoney(finalPrice)}G 수확했어요.`);
    harvestBonusHarvestCountRef.current += 1;
    const canShowHarvestBonusNudge =
      harvestBonusHarvestCountRef.current >= harvestBonusNudgeAvailableAtHarvestRef.current;
    if (rewardedAd.isAdReady && harvestBonusAdLimit.allowed && canShowHarvestBonusNudge) {
      setActiveSheet({ type: 'harvestBonus', amount: finalPrice });
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
              cropName: crop.name,
              remainingMs,
            });
          } else {
            farmAnalytics.trackAdLimitBlocked('growthAd', growthAdLimit.reason, analyticsContext());
            toast(growthAdLimit.reason);
          }
        } else {
          toast('아직 자라는 중이에요.');
        }
      }
      return;
    }

    if (plot.state === 0) {
      toast('아래에서 씨앗을 선택해 주세요.');
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
      toast('작물이 바로 자랐어요.');
    });
  }

  async function doubleHarvestWithAd(amount: number) {
    const bonus = amount * (HARVEST_BONUS_MULTIPLIER - 1);
    await showRewardedAd('harvestBonusAd', bonus, () => {
      setGameState((state) => ({ ...state, gold: state.gold + bonus }));
      setActiveSheet(null);
      toast(`보너스 ${formatMoney(bonus)}G를 받았어요.`);
    });
  }

  const toolHint = useMemo(() => {
    if (!selectedAreaUnlocked) {
      return `${selectedAreaMeta.name} 해금 필요 · ${getAreaUnlockRequirementText(gameState, selectedArea)}`;
    }
    if (selectedTool === 'harvest') {
      return '밭을 눌러 수확할 수 있어요.';
    }
    const crop = getCrop(selectedTool);
    return `${crop.name} 심기 · ${formatMoney(crop.cost)}G`;
  }, [gameState, selectedArea, selectedAreaMeta.name, selectedAreaUnlocked, selectedTool]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={[styles.headerTop, isMobileMarket && styles.mobileHeaderTop]}>
          <View style={[styles.titleGroup, isMobileMarket && styles.mobileTitleGroup]}>
            <Text style={styles.homeIcon}>🏡</Text>
            <View>
              <Text style={styles.title}>행복 농장</Text>
              <Text style={styles.subtitle}>Tycoon</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <Pressable style={styles.shopButton} onPress={openShop}>
              <Text style={styles.shopButtonText}>🏪 상점</Text>
            </Pressable>
            <Pressable accessibilityLabel="설정" hitSlop={8} style={styles.settingsButton} onPress={openSettings}>
              <Text style={styles.settingsButtonText}>⚙</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.statsPanel}>
          <View style={styles.assetRow}>
            <Text style={styles.coinIcon}>💰</Text>
            <View style={styles.assetTextGroup}>
              <Text style={styles.label}>보유 자산</Text>
              <Text style={styles.money} numberOfLines={1}>
                {formatMoney(gameState.gold)}G
              </Text>
            </View>
          </View>
          <View style={styles.statList}>
            <View>
              <Text style={styles.label}>수익률</Text>
              <Text style={styles.profitStat}>×{profitMult.toFixed(1)}</Text>
            </View>
            <View>
              <Text style={styles.label}>성장속도</Text>
              <Text style={styles.speedStat}>×{speedMult.toFixed(1)}</Text>
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
              onPress={() => handlePlotClick(index)}
            />
          ))}
        </View>
      </ScrollView>

      <View style={[styles.toolStrip, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.toolHeader}>
          <Text style={styles.toolLabel}>도구 선택</Text>
          <Text style={styles.toolHint} numberOfLines={1}>
            {toolHint}
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.areaTabs}>
          {FARM_AREAS.map((area) => {
            const unlocked = isAreaUnlocked(gameState, area.key);
            const active = selectedArea === area.key;
            return (
              <Pressable
                key={area.key}
                style={[styles.areaTab, !unlocked && styles.lockedAreaTab, active && styles.activeAreaTab]}
                onPress={() => selectArea(area.key)}
              >
                <Text style={[styles.areaTabName, active && styles.activeAreaTabName]}>
                  {!unlocked ? '🔒 ' : ''}
                  {area.name}
                </Text>
                <Text style={styles.areaTabCount}>{areaCropCounts[area.key]}종</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolScroll}>
          <ToolButton
            active={selectedTool === 'harvest'}
            icon="🖐️"
            name="수확"
            onPress={() => setSelectedTool('harvest')}
          />
          {visibleCropKeys.map((key) => {
            const crop = getCrop(key);
            return (
              <ToolButton
                key={key}
                active={selectedTool === key}
                icon={crop.icon}
                name={crop.name}
                cost={formatMoney(crop.cost)}
                onPress={() => selectCrop(key)}
              />
            );
          })}
          {!selectedAreaUnlocked ? (
            <Pressable style={styles.lockedNotice} onPress={openShop}>
              <Text style={styles.lockedNoticeTitle}>{selectedAreaMeta.name} 해금 필요</Text>
              <Text style={styles.lockedNoticeDesc} numberOfLines={2}>
                {getAreaUnlockRequirementText(gameState, selectedArea)}
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

      <Sheet activeSheet={activeSheet} onClose={closeSheet}>
        {activeSheet?.type === 'shop' ? (
          <View>
            <Text style={styles.sheetSectionTitle}>광고 보상</Text>
            <AdRewardCard
              title={`광고 보고 ${formatMoney(REWARDED_GOLD_AMOUNT)}G 받기`}
              desc={rewardedGoldLimit.allowed ? '10분에 최대 3회 받을 수 있어요.' : rewardedGoldLimit.reason}
              cta={rewardedAd.isAdReady && rewardedGoldLimit.allowed ? '받기' : '대기'}
              disabled={!rewardedAd.isAdReady || !rewardedGoldLimit.allowed}
              onPress={() => void rewardGoldFromAd()}
            />
            <AdRewardCard
              title="광고 보고 밭 1칸 열기"
              desc={rewardedGoldLimit.allowed ? '개간 비용 없이 작물을 심을 공간을 늘려요.' : rewardedGoldLimit.reason}
              cta={rewardedAd.isAdReady && rewardedGoldLimit.allowed ? '열기' : '대기'}
              disabled={!rewardedAd.isAdReady || !rewardedGoldLimit.allowed || gameState.unlockedPlotCount >= MAX_PLOTS}
              onPress={() => void rewardFreePlotFromAd()}
            />

            <Text style={styles.sheetSectionTitle}>영토 확장</Text>
            <ShopPlotRow
              gameState={gameState}
              setGameState={setGameState}
              getAnalyticsContext={analyticsContext}
              analytics={farmAnalytics}
              onDone={toast}
              onMilestone={() => void maybeShowMilestoneAd()}
            />

            <Text style={styles.sheetSectionTitle}>구역 해금</Text>
            <ShopAreaUnlockRows
              gameState={gameState}
              setGameState={setGameState}
              getAnalyticsContext={analyticsContext}
              analytics={farmAnalytics}
              onDone={toast}
              onMilestone={() => void maybeShowMilestoneAd()}
            />

            <Text style={styles.sheetSectionTitle}>농업 연구소</Text>
            <ShopUpgradeRow
              kind="speed"
              gameState={gameState}
              setGameState={setGameState}
              getAnalyticsContext={analyticsContext}
              analytics={farmAnalytics}
              onDone={toast}
              onMilestone={() => void maybeShowMilestoneAd()}
            />
            <ShopUpgradeRow
              kind="profit"
              gameState={gameState}
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
            <Text style={styles.sheetSectionTitle}>사운드</Text>
            <SettingToggle
              label="효과음"
              desc={
                audio.isSupported
                  ? '수확할 때 골드 획득음을 재생해요.'
                  : '현재 환경에서는 사운드 재생을 지원하지 않아요.'
              }
              value={gameSettings.soundEffectsEnabled && audio.isSupported}
              disabled={!audio.isSupported}
              onPress={() => updateGameSettings({ soundEffectsEnabled: !gameSettings.soundEffectsEnabled })}
            />
            <SettingToggle
              label="배경음악"
              desc={audio.isSupported ? '농장 배경 루프를 재생해요.' : '현재 환경에서는 사운드 재생을 지원하지 않아요.'}
              value={gameSettings.backgroundMusicEnabled && audio.isSupported}
              disabled={!audio.isSupported}
              onPress={() => updateGameSettings({ backgroundMusicEnabled: !gameSettings.backgroundMusicEnabled })}
            />

            <Text style={styles.sheetSectionTitle}>게임 데이터</Text>
            <SheetAction label="농장 기록 초기화" danger onPress={openResetConfirm} />
          </View>
        ) : null}

        {activeSheet?.type === 'growthAd' ? (
          <View>
            <SheetAction
              label={growthAdLimit.allowed ? '광고 보고 바로 성장시키기' : growthAdLimit.reason}
              disabled={!rewardedAd.isAdReady || !growthAdLimit.allowed}
              onPress={() => void completeGrowthWithAd(activeSheet.plotIndex)}
            />
            <SheetAction label="그냥 기다릴게요" secondary onPress={() => setActiveSheet(null)} />
          </View>
        ) : null}

        {activeSheet?.type === 'harvestBonus' ? (
          <View>
            <SheetAction
              label={
                harvestBonusAdLimit.allowed
                  ? `광고 보고 이번 수확 ${HARVEST_BONUS_MULTIPLIER}배 받기`
                  : harvestBonusAdLimit.reason
              }
              disabled={!rewardedAd.isAdReady || !harvestBonusAdLimit.allowed}
              onPress={() => void doubleHarvestWithAd(activeSheet.amount)}
            />
            <SheetAction label="괜찮아요" secondary onPress={dismissHarvestBonusNudge} />
          </View>
        ) : null}

        {activeSheet?.type === 'resetConfirm' ? (
          <View>
            <Text style={styles.resetWarning}>
              새로 시작하면 현재 골드, 밭, 업그레이드, 심은 작물 기록이 이 기기 저장소에서 삭제돼요.
            </Text>
            <TextInput
              accessibilityLabel="초기화 확인 문구"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={`${RESET_CONFIRM_TEXT} 입력`}
              style={styles.resetInput}
              value={resetConfirmText}
              onChangeText={setResetConfirmText}
            />
            <SheetAction
              label="농장 기록 삭제하고 새로 시작"
              danger
              disabled={resetConfirmText !== RESET_CONFIRM_TEXT}
              onPress={() => void confirmReset()}
            />
            <SheetAction label="계속 이어서 할게요" secondary onPress={() => setActiveSheet(null)} />
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
  onPress,
}: {
  plot: GameState['plots'][number];
  unlocked: boolean;
  speedMult: number;
  tileSize: number;
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
        <Text style={styles.emptyPlotText}>빈 밭</Text>
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
          <Text style={styles.harvestBadgeText}>GET</Text>
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

  useEffect(() => {
    const currentRatio = getGrowthProgressRatio(startTime, growTime, speedMult);
    const remainingDuration = getRemainingGrowthDuration(startTime, growTime, speedMult);

    progressScale.stopAnimation();
    progressScale.setValue(currentRatio);

    if (currentRatio >= 1 || remainingDuration <= 0) {
      progressScale.setValue(1);
      return undefined;
    }

    Animated.timing(progressScale, {
      toValue: 1,
      duration: Math.max(MIN_PROGRESS_ANIMATION_DURATION_MS, remainingDuration),
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();

    return () => {
      progressScale.stopAnimation();
    };
  }, [growTime, progressScale, speedMult, startTime]);

  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, { transform: [{ scaleX: progressScale }] }]} />
    </View>
  );
}

function Sheet({
  activeSheet,
  children,
  onClose,
}: {
  activeSheet: ActiveSheet;
  children: React.ReactNode;
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
            <Text style={styles.sheetTitle}>{getSheetTitle(activeSheet)}</Text>
            <Text style={styles.sheetDescription}>{getSheetDescription(activeSheet)}</Text>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function getSheetTitle(activeSheet: ActiveSheet) {
  if (activeSheet?.type === 'growthAd') {
    return '즉시 성장';
  }
  if (activeSheet?.type === 'harvestBonus') {
    return '수확 보너스';
  }
  if (activeSheet?.type === 'settings') {
    return '설정';
  }
  if (activeSheet?.type === 'resetConfirm') {
    return '새로 시작하기';
  }
  return '농장 관리소';
}

function getSheetDescription(activeSheet: ActiveSheet) {
  if (activeSheet?.type === 'growthAd') {
    return `${activeSheet.cropName}이(가) 다 자랄 때까지 약 ${formatRemainingTime(activeSheet.remainingMs)} 남았어요.`;
  }
  if (activeSheet?.type === 'harvestBonus') {
    return `광고를 보면 이번 수확 보상을 ${HARVEST_BONUS_MULTIPLIER}배로 받을 수 있어요.`;
  }
  if (activeSheet?.type === 'settings') {
    return '사운드와 농장 기록을 관리해요.';
  }
  if (activeSheet?.type === 'resetConfirm') {
    return `정말 초기화하려면 '${RESET_CONFIRM_TEXT}'를 입력해야 해요.`;
  }
  return '광고 보상과 업그레이드로 농장을 빠르게 키워보세요.';
}

function formatRemainingTime(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) {
    return `${seconds}초`;
  }
  return `${Math.ceil(seconds / 60)}분`;
}

function ToolButton({
  active,
  icon,
  name,
  cost,
  onPress,
}: {
  active: boolean;
  icon: string;
  name: string;
  cost?: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.toolButton, active && styles.activeToolButton]} onPress={onPress}>
      <Text style={styles.toolIcon}>{icon}</Text>
      <Text style={styles.toolName} numberOfLines={1}>
        {name}
      </Text>
      {cost != null ? <Text style={styles.toolCost}>{cost}</Text> : null}
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
  setGameState,
  getAnalyticsContext,
  analytics,
  onDone,
  onMilestone,
}: {
  gameState: GameState;
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
      title="밭 개간하기"
      desc={`현재 ${gameState.unlockedPlotCount}칸 · 작물을 심을 공간을 1칸 늘려요`}
      price={isMax ? '완료' : `${formatMoney(cost)}G`}
      disabled={isMax || !canBuy}
      onPress={() => {
        if (isMax) {
          onDone('더 이상 확장할 수 없어요.');
          return;
        }
        if (gameState.gold < cost) {
          onDone('자금이 부족해요.');
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
        onDone('밭을 넓혔어요.');
        onMilestone();
      }}
    />
  );
}

function ShopAreaUnlockRows({
  gameState,
  setGameState,
  getAnalyticsContext,
  analytics,
  onDone,
  onMilestone,
}: {
  gameState: GameState;
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
        title="모든 구역 해금 완료"
        desc="이제 모든 작물을 선택할 수 있어요."
        price="완료"
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
        const requirementText = getAreaUnlockRequirementText(gameState, area.key);

        return (
          <ShopCard
            key={area.key}
            title={`${area.name} 열기`}
            desc={`${area.target} · ${requirementText}`}
            price={`${formatMoney(area.unlock.cost)}G`}
            disabled={!canBuy}
            onPress={() => {
              analytics.trackAreaUnlockClicked(area.key, getAnalyticsContext(gameState));
              if (!isNextArea) {
                onDone('앞 구역부터 차례대로 열어 주세요.');
                return;
              }
              if (!canUnlockArea(gameState, area.key)) {
                onDone('아직 구역 해금 조건이 부족해요.');
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
              onDone(`${area.name}을(를) 열었어요.`);
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
  setGameState,
  getAnalyticsContext,
  analytics,
  onDone,
  onMilestone,
}: {
  kind: 'speed' | 'profit';
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  getAnalyticsContext: GetAnalyticsContext;
  analytics: FarmAnalytics;
  onDone: (msg: string) => void;
  onMilestone: () => void;
}) {
  const level = gameState.upgrades[kind];
  const cost = getUpgradeCost(kind, level);
  const title = kind === 'speed' ? '🧪 고속 성장 비료' : '🚛 판로 개척';
  const desc = kind === 'speed' ? '작물 성장 속도 +10%' : '판매 수익 +10%';
  const disabled = gameState.gold < cost;

  return (
    <ShopCard
      title={title}
      desc={`${desc} · Lv. ${level}`}
      price={`${formatMoney(cost)}G`}
      priceTone={kind}
      disabled={disabled}
      onPress={() => {
        if (disabled) {
          onDone('자금이 부족해요.');
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
        onDone('연구를 완료했어요.');
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
    paddingBottom: 12,
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
    marginTop: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#f1d98a',
    borderRadius: 8,
    backgroundColor: '#fff8d8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  assetRow: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  coinIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    backgroundColor: '#f6c343',
    textAlign: 'center',
    lineHeight: 34,
    fontSize: 18,
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
    fontSize: 21,
    fontWeight: '900',
  },
  statList: {
    flexDirection: 'row',
    gap: 14,
  },
  profitStat: {
    marginTop: 2,
    color: '#247241',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
  },
  speedStat: {
    marginTop: 2,
    color: '#2f7de1',
    fontSize: 14,
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
    width: 68,
    height: 76,
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
