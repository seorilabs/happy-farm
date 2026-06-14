/// <reference types="jest" />

import React from 'react';
import { Vibration } from 'react-native';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import {
  ACHIEVEMENT_TRACKS,
  COLLECTION_AREA_REWARDS,
  CROPS,
  DEFAULT_LOCALE,
  FARM_AREAS,
  HARVEST_BONUS_AD_COOLDOWN_MS,
  HARVEST_BONUS_BOOST_DURATION_MS,
  HARVEST_BONUS_MULTIPLIER,
  MAX_PLOTS,
  REWARDED_GOLD_MAX_USES_PER_WINDOW,
  REWARDED_GOLD_WINDOW_MS,
  PRESTIGE_STARS_BASE,
  REGION_ARCHETYPES,
  createFarmAnalytics,
  createInitialState,
  formatMoney,
  getAreaCropKeys,
  getMasteryThresholds,
  getPrestigeCost,
  getRegionArchetypeLabel,
  type AreaKey,
  type CropKey,
  type GameState,
  type RewardedAdController,
  type RewardedAdShowResult,
} from '../../../../../packages/farm-core/src';
import { getFarmMessages } from '../i18n';

const NOW = Date.parse('2026-05-27T03:00:00.000Z');

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const farmGameModule = jest.requireActual('../FarmGame') as typeof import('../FarmGame');
const FarmGame = farmGameModule.default;
const {
  GAME_TICK_INTERVAL_MS,
  MASTERY_RANK_UP_CELEBRATION_DURATION_MS,
  PRESTIGE_GRADUATION_CELEBRATION_DURATION_MS,
  COMBO_GREAT_THRESHOLD,
  COMBO_LEGENDARY_THRESHOLD,
} = farmGameModule;
const { __setGoldPulseTestHook } = jest.requireActual<
  typeof import('../farmGoldPulse')
>('../farmGoldPulse');
const mockPersistence = {
  readPersistedGameState: jest.fn<Promise<GameState>, []>(),
  writePersistedGameState: jest.fn<Promise<void>, [GameState]>(),
  removePersistedGameState: jest.fn<Promise<void>, []>(),
  readPersistedGameSettings: jest.fn(),
  writePersistedGameSettings: jest.fn(),
  readLastSeenAt: jest.fn<Promise<number | null>, []>(),
  writeLastSeenAt: jest.fn<Promise<void>, [number]>(),
};

function getCropKeys() {
  return Object.keys(CROPS) as CropKey[];
}

function createLateGameState(): GameState {
  const base = createInitialState();
  const keys = getCropKeys();
  const firstCropKey = keys[0];
  if (firstCropKey == null) {
    throw new Error('FarmGame tests require at least one crop.');
  }

  return {
    ...base,
    gold: 9.876e20,
    unlockedPlotCount: MAX_PLOTS,
    unlockedAreas: FARM_AREAS.map((area) => area.key),
    harvestedCropKeys: keys,
    upgrades: { speed: 42, profit: 42 },
    plots: base.plots.map((plot, index) => ({
      ...plot,
      cropType: keys[index % keys.length] ?? firstCropKey,
      startTime: NOW - 10_000,
      state: 2,
    })),
  };
}

function createReadyHarvestState(): GameState {
  const base = createInitialState();

  return {
    ...base,
    plots: base.plots.map((plot, index) =>
      index < 2
        ? {
            ...plot,
            cropType: 'carrot',
            startTime: NOW - 10_000,
            state: 2 as const,
          }
        : plot
    ),
  };
}

function createGrowingCropState(): GameState {
  const base = createInitialState();

  return {
    ...base,
    gold: 100,
    plots: base.plots.map((plot, index) =>
      index === 0
        ? {
            ...plot,
            cropType: 'wheat',
            startTime: NOW,
            state: 1 as const,
          }
        : plot
    ),
  };
}

function createGrowingLongCropState(cropKey: CropKey): GameState {
  const base = createInitialState();

  return {
    ...base,
    unlockedAreas: FARM_AREAS.map((area) => area.key),
    upgrades: { speed: 42, profit: 42 },
    plots: base.plots.map((plot, index) =>
      index === 0
        ? {
            ...plot,
            cropType: cropKey,
            startTime: NOW,
            state: 1 as const,
          }
        : plot
    ),
  };
}

function createShopReadyState(): GameState {
  const base = createInitialState();

  return {
    ...base,
    gold: 10_000,
    harvestedCropKeys: getCropKeys().slice(0, 5),
  };
}

function createActiveBoostState(now = NOW): GameState {
  const base = createInitialState();
  return {
    ...base,
    adUsage: {
      ...base.adUsage,
      harvestBonusAd: {
        ...base.adUsage.harvestBonusAd,
        boostEndsAt: now + HARVEST_BONUS_BOOST_DURATION_MS,
      },
    },
  };
}

async function renderGame(
  savedState: GameState | null,
  props: Partial<React.ComponentProps<typeof FarmGame>> = {},
  savedSettings: unknown = null
) {
  mockPersistence.readPersistedGameState.mockResolvedValueOnce(savedState ?? createInitialState());
  mockPersistence.readPersistedGameSettings.mockResolvedValueOnce(savedSettings);

  const view = render(<FarmGame persistence={mockPersistence} {...props} />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  return view;
}

function createRewardedAd(result: RewardedAdShowResult): RewardedAdController {
  return {
    isAdReady: true,
    isAdSupported: true,
    showAd: jest.fn(async () => result),
  };
}

function createReadyRewardedAd() {
  return createRewardedAd({ status: 'earned' });
}

function createThrowingRewardedAd(error = new Error('sdk dynamic failure message')): RewardedAdController {
  return {
    isAdReady: true,
    isAdSupported: true,
    showAd: jest.fn(async () => {
      throw error;
    }),
  };
}

// CI runners are typically 3-5× slower than local; 30 s gives enough headroom
// for the heaviest tests (first-run module warmup, rewarded ad flows) without
// letting a genuinely hung test pass unnoticed.
jest.setTimeout(30000);

describe('FarmGame UI flow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    mockPersistence.readPersistedGameState.mockReset();
    mockPersistence.writePersistedGameState.mockResolvedValue(undefined);
    mockPersistence.removePersistedGameState.mockResolvedValue(undefined);
    mockPersistence.readPersistedGameSettings.mockReset();
    mockPersistence.writePersistedGameSettings.mockResolvedValue(undefined);
    mockPersistence.readLastSeenAt.mockReset();
    mockPersistence.readLastSeenAt.mockResolvedValue(null);
    mockPersistence.writeLastSeenAt.mockReset();
    mockPersistence.writeLastSeenAt.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  test('renders initial farm and supports a plant-grow-harvest loop', async () => {
    const screen = await renderGame(null);

    await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
    expect(screen.getByText('50G')).toBeTruthy();
    expect(screen.getByText('연구 Lv.1')).toBeTruthy();
    expect(screen.getByText(/생산성 약 /)).toBeTruthy();
    expect(screen.queryByText('새 구역 조건')).toBeNull();
    expect(screen.getAllByText('빈 밭')).toHaveLength(6);
    expect(screen.getByText('당근')).toBeTruthy();
    expect(screen.getByText('효율 +40%')).toBeTruthy();

    // Use the stable testID added to each area tab so text duplication with the
    // next-goal bar in the header cannot cause a selector collision.
    fireEvent.press(screen.getByTestId('area-tab-vegetable_field'));
    expect(screen.getByText('채소 밭 열기 조건')).toBeTruthy();
    fireEvent.press(screen.getByTestId('area-tab-starter_field'));

    fireEvent.press(screen.getByText('당근'));
    expect(screen.getByText('당근 심기 · 10G · 투자효율 +40%')).toBeTruthy();

    const firstEmptyPlot = screen.getAllByText('빈 밭')[0];
    expect(firstEmptyPlot).toBeDefined();
    fireEvent.press(firstEmptyPlot!);

    expect(screen.getByText('40G')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(2500);
    });

    await waitFor(() => expect(screen.getByText('GET')).toBeTruthy());

    fireEvent.press(screen.getByText('GET'));

    expect(screen.getByText('54G')).toBeTruthy();
    expect(screen.getAllByText('빈 밭')).toHaveLength(6);
    // Harvesting spawns a floating "+gold" burst at the tapped plot (gained 14G).
    expect(screen.getByText('+14')).toBeTruthy();
  });

  test('pops a sprout and buzzes when a seed is planted on an empty plot', async () => {
    const vibrateSpy = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
    try {
      const screen = await renderGame(null);

      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
      expect(screen.getAllByText('빈 밭')).toHaveLength(6);
      // No sprout exists before the first plant.
      expect(screen.queryByText('🌱')).toBeNull();

      fireEvent.press(screen.getByText('초보 밭'));
      fireEvent.press(screen.getByText('당근'));
      fireEvent.press(screen.getAllByText('빈 밭')[0]!);

      // The freshly planted plot now shows the growing sprout, and planting
      // fires a light haptic so the action feels tactile.
      expect(screen.getByText('🌱')).toBeTruthy();
      expect(screen.getAllByText('빈 밭')).toHaveLength(5);
      expect(vibrateSpy).toHaveBeenCalled();
    } finally {
      vibrateSpy.mockRestore();
    }
  });

  test('keeps rapid harvest state updates from overwriting each other', async () => {
    const screen = await renderGame(createReadyHarvestState());

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    const readyPlots = screen.getAllByText('GET');
    await act(async () => {
      fireEvent.press(readyPlots[0]!);
      fireEvent.press(readyPlots[1]!);
    });

    await waitFor(() => expect(screen.getByText('78G')).toBeTruthy());
    expect(screen.getAllByText('빈 밭')).toHaveLength(6);
  });

  test('renders the shared farm UI in English when the saved locale is en-US', async () => {
    const screen = await renderGame(null, {}, { locale: 'en-US' });

    await waitFor(() => expect(screen.getByText('Happy Farm')).toBeTruthy());
    expect(screen.getByText('Research Lv.1')).toBeTruthy();
    expect(screen.getByText(/About /)).toBeTruthy();
    expect(screen.getAllByText('Empty')).toHaveLength(6);
    expect(screen.getByText('Carrot')).toBeTruthy();

    // Use the stable testID on each area tab to avoid colliding with the
    // next-goal bar in the header that also shows the area name.
    fireEvent.press(screen.getByTestId('area-tab-vegetable_field'));
    expect(screen.getByText('Vegetable Field requirements')).toBeTruthy();
    fireEvent.press(screen.getByTestId('area-tab-starter_field'));

    fireEvent.press(screen.getByText('Carrot'));
    expect(screen.getByText('Plant Carrot · 10G · ROI +40%')).toBeTruthy();
  });

  test('uses the preferred locale when no saved locale exists', async () => {
    const screen = await renderGame(null, { preferredLocale: 'en-US' }, null);

    await waitFor(() => expect(screen.getByText('Happy Farm')).toBeTruthy());
    expect(screen.getByText('Research Lv.1')).toBeTruthy();
  });

  test('uses the preferred locale when legacy settings do not include a locale', async () => {
    const screen = await renderGame(null, { preferredLocale: 'en-US' }, { soundEffectsEnabled: false });

    await waitFor(() => expect(screen.getByText('Happy Farm')).toBeTruthy());
    expect(screen.getByText('Research Lv.1')).toBeTruthy();
  });

  test('renders a late-game save without overflowing critical one-line UI text', async () => {
    const lateGame = createLateGameState();
    const screen = await renderGame(lateGame);
    const lateMoney = `${formatMoney(lateGame.gold)}G`;

    await waitFor(() => expect(screen.getByText(lateMoney)).toBeTruthy());

    expect(screen.getByText(lateMoney).props.numberOfLines).toBe(1);
    expect(screen.getAllByText('GET')).toHaveLength(MAX_PLOTS);
    expect(screen.getByText('전설 구역')).toBeTruthy();

    fireEvent.press(screen.getByText('전설 구역'));

    expect(screen.getByText('세계수')).toBeTruthy();
  });

  test('keeps the shop usable when every plot and area is unlocked', async () => {
    const lateGame = createLateGameState();
    const screen = await renderGame(lateGame);

    await waitFor(() => expect(screen.getByText(`${formatMoney(lateGame.gold)}G`)).toBeTruthy());

    fireEvent.press(screen.getByText('🏪 상점'));

    expect(screen.getByText('농장 관리소')).toBeTruthy();
    expect(screen.getByText('모든 구역 열기 완료')).toBeTruthy();
    expect(screen.getByText('현재 24칸 · 작물을 심을 공간을 1칸 늘려요')).toBeTruthy();
    expect(screen.getByText('현재 연구 Lv.42 · 성장속도 Lv.42 / 수익률 Lv.42')).toBeTruthy();
  });

  test('anchors sheet drag gestures to the visible handle hit target', async () => {
    const screen = await renderGame(null);

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    fireEvent.press(screen.getByText('🏪 상점'));

    const dragHandle = screen.getByTestId('sheet-drag-handle');
    expect(dragHandle.props.style).toEqual(
      expect.objectContaining({
        height: 36,
        justifyContent: 'flex-start',
        paddingTop: 10,
      })
    );
    expect(typeof dragHandle.props.onStartShouldSetResponder).toBe('function');
    expect(typeof dragHandle.props.onMoveShouldSetResponder).toBe('function');
  });

  test('supports core shop management purchases', async () => {
    const shopReadyState = createShopReadyState();
    const screen = await renderGame(shopReadyState);

    await waitFor(() => expect(screen.getByText(`${formatMoney(shopReadyState.gold)}G`)).toBeTruthy());

    fireEvent.press(screen.getByText('🏪 상점'));

    fireEvent.press(screen.getByText('밭 개간하기'));
    expect(screen.getByText('현재 7칸 · 작물을 심을 공간을 1칸 늘려요')).toBeTruthy();

    fireEvent.press(screen.getByText('🧪 고속 성장 비료'));
    expect(screen.getByText('현재 연구 Lv.1 · 성장속도 Lv.2 / 수익률 Lv.1')).toBeTruthy();

    fireEvent.press(screen.getByText('🚛 판로 개척'));
    expect(screen.getByText('현재 연구 Lv.2 · 성장속도 Lv.2 / 수익률 Lv.2')).toBeTruthy();

    fireEvent.press(screen.getByText('채소 밭 열기'));
    expect(screen.queryByText('채소 밭 열기')).toBeNull();
  });

  test('shows a badge on the shop nav button when a rewarded ad is ready to claim', async () => {
    const rewardedAd = createReadyRewardedAd();
    const screen = await renderGame(null, { useRewardedAd: () => rewardedAd });

    await waitFor(() => expect(screen.getByTestId('shop-nav-button')).toBeTruthy());
    expect(within(screen.getByTestId('shop-nav-button')).getByText('1')).toBeTruthy();
  });

  test('shows no badge on the shop nav button when ads are not supported', async () => {
    // Default useRewardedAd is useUnsupportedAd (isAdSupported: false, isAdReady: false)
    const screen = await renderGame(null);

    await waitFor(() => expect(screen.getByTestId('shop-nav-button')).toBeTruthy());
    expect(within(screen.getByTestId('shop-nav-button')).queryByText('1')).toBeNull();
  });

  test('hides the shop badge when the rewarded ad rate limit is exhausted', async () => {
    // Fill the sliding window to trigger the cooldown (REWARDED_GOLD_MAX_USES_PER_WINDOW uses).
    // rewardedGoldLimit gates the shop's gold reward and free-plot reward. Exhausting the
    // window should suppress the badge.
    const base = createInitialState();
    const exhaustedState: GameState = {
      ...base,
      adUsage: {
        ...base.adUsage,
        rewardedGoldTimestamps: Array.from({ length: REWARDED_GOLD_MAX_USES_PER_WINDOW }, (_, i) => NOW - i * 10),
      },
    };
    const rewardedAd = createReadyRewardedAd();
    const screen = await renderGame(exhaustedState, { useRewardedAd: () => rewardedAd });

    await waitFor(() => expect(screen.getByTestId('shop-nav-button')).toBeTruthy());
    expect(within(screen.getByTestId('shop-nav-button')).queryByText('1')).toBeNull();
  });

  test('REWARDED_GOLD_WINDOW_MS is a whole number of minutes so the description divides without rounding', () => {
    expect(REWARDED_GOLD_WINDOW_MS % 60000).toBe(0);
  });

  test('shows the correct window duration and max uses in the rewarded gold ad description', async () => {
    const messages = getFarmMessages(DEFAULT_LOCALE);
    const rewardedAd = createReadyRewardedAd();
    const screen = await renderGame(null, { useRewardedAd: () => rewardedAd });

    await waitFor(() => expect(screen.getByText('🏪 상점')).toBeTruthy());
    fireEvent.press(screen.getByText('🏪 상점'));

    // Use direct division — the invariant test above guarantees no remainder.
    const expectedDesc = messages.rewardedGoldReadyDesc(
      REWARDED_GOLD_WINDOW_MS / 60000,
      REWARDED_GOLD_MAX_USES_PER_WINDOW
    );
    expect(screen.getByText(expectedDesc)).toBeTruthy();
  });

  test('closes the shop sheet after a rewarded gold ad so the farm remains tappable', async () => {
    const rewardedAd = createReadyRewardedAd();
    const screen = await renderGame(null, { useRewardedAd: () => rewardedAd });

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    fireEvent.press(screen.getByText('🏪 상점'));
    expect(screen.getByText('농장 관리소')).toBeTruthy();

    fireEvent.press(screen.getByText('받기'));

    await waitFor(() => expect(rewardedAd.showAd).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('농장 관리소')).toBeNull());
    await waitFor(() => expect(screen.getByText(`${formatMoney(50 + 100)}G`)).toBeTruthy());

    fireEvent.press(screen.getByText('당근'));
    expect(screen.getByText('당근 심기 · 10G · 투자효율 +40%')).toBeTruthy();
  }, 30_000);

  test('closes the shop sheet after a free plot ad reward', async () => {
    const rewardedAd = createReadyRewardedAd();
    const screen = await renderGame(null, { useRewardedAd: () => rewardedAd });

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    fireEvent.press(screen.getByText('🏪 상점'));
    expect(screen.getByText('농장 관리소')).toBeTruthy();

    fireEvent.press(screen.getByText('열기'));

    await waitFor(() => expect(rewardedAd.showAd).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('농장 관리소')).toBeNull());

    fireEvent.press(screen.getByText('🏪 상점'));
    expect(screen.getByText('현재 7칸 · 작물을 심을 공간을 1칸 늘려요')).toBeTruthy();
  }, 30_000);

  test('closes the current sheet when a rewarded ad is dismissed without reward', async () => {
    const rewardedAd = createRewardedAd({ status: 'dismissed' });
    const screen = await renderGame(null, { useRewardedAd: () => rewardedAd });

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    fireEvent.press(screen.getByText('🏪 상점'));

    fireEvent.press(screen.getByText('받기'));

    await waitFor(() => expect(rewardedAd.showAd).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('농장 관리소')).toBeNull());
    expect(screen.getByText('50G')).toBeTruthy();

    fireEvent.press(screen.getByText('당근'));
    expect(screen.getByText('당근 심기 · 10G · 투자효율 +40%')).toBeTruthy();
  }, 30_000);

  test('normalizes thrown rewarded ad failures and closes the active sheet', async () => {
    const rewardedAd = createThrowingRewardedAd(new Error('sdk request failed with dynamic token 123'));
    const track = jest.fn();
    const screen = await renderGame(null, {
      analytics: createFarmAnalytics(track),
      useRewardedAd: () => rewardedAd,
    });

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    fireEvent.press(screen.getByText('🏪 상점'));
    fireEvent.press(screen.getByText('받기'));

    await waitFor(() => expect(rewardedAd.showAd).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('농장 관리소')).toBeNull());

    expect(track).toHaveBeenCalledWith(
      'ad_reward_failed',
      expect.objectContaining({
        ad_type: 'rewardedGold',
        reason: 'show_ad_threw',
      })
    );
    expect(screen.getByText('50G')).toBeTruthy();
  }, 30_000);

  test('closes the growth ad sheet after completing crop growth', async () => {
    const rewardedAd = createReadyRewardedAd();
    const screen = await renderGame(createGrowingCropState(), { useRewardedAd: () => rewardedAd });

    await waitFor(() => expect(screen.getByText('100G')).toBeTruthy());

    fireEvent.press(screen.getByText('당근'));
    fireEvent.press(screen.getByText('🌱'));

    expect(screen.getByText('즉시 성장')).toBeTruthy();

    fireEvent.press(screen.getByText('광고 보고 바로 성장시키기'));

    await waitFor(() => expect(rewardedAd.showAd).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('즉시 성장')).toBeNull());
    await waitFor(() => expect(screen.getByText('GET')).toBeTruthy());
  }, 30_000);

  test('never drives the growth bar with a full-grow-time animation (legend crops crashed iOS)', async () => {
    // Regression: GrowthProgressBar used to run a single Animated.timing spanning
    // the entire remaining grow time. React Native precomputes one frame per 60fps
    // step of an animation's duration, so a freshly planted 세계수 (growTime 5 days)
    // produced ~7.4M frames, froze the JS thread and crashed the app on iOS the
    // moment the crop was planted or its save was reloaded. The bar must instead
    // step forward each game tick, keeping every animation short.
    const reactNative = jest.requireActual('react-native') as typeof import('react-native');
    const { Animated, Easing } = reactNative;
    const timingSpy = jest.spyOn(Animated, 'timing');

    try {
      await renderGame(createGrowingLongCropState('world_tree'));

      // Only inspect the growth bar's own timings (linear easing toward a [0,1]
      // ratio). Other animations like sheet transitions are intentionally ignored
      // so this stays specific to the fix and won't break if they change.
      const growthBarDurations = timingSpy.mock.calls
        .map((call) => call[1])
        .filter((config) => config?.easing === Easing.linear && Number(config?.toValue) <= 1)
        .map((config) => config?.duration ?? 0);

      expect(growthBarDurations.length).toBeGreaterThan(0);
      // 세계수 spanned ~1.23e8 ms before the fix; now every animation is tick-sized.
      expect(Math.max(...growthBarDurations)).toBeLessThanOrEqual(GAME_TICK_INTERVAL_MS);
    } finally {
      timingSpy.mockRestore();
    }
  });

  test('announces mastery rank-ups and shows mastery progress in the collection', async () => {
    const thresholds = getMasteryThresholds('carrot');
    const firstThreshold = thresholds[0]!;
    const base = createReadyHarvestState();
    const state: GameState = {
      ...base,
      harvestedCropKeys: ['carrot'],
      harvestCounts: { carrot: firstThreshold - 1 },
    };
    const screen = await renderGame(state);

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    fireEvent.press(within(screen.getByTestId('plot-cell-0')).getByText('GET'));

    expect(screen.getByText('숙련도 달성!')).toBeTruthy();
    expect(screen.getByText(/브론즈/)).toBeTruthy();

    fireEvent.press(screen.getByLabelText('작물 도감'));

    expect(screen.getByText(`${firstThreshold}/${thresholds[1]}`)).toBeTruthy();
    // Scope to the collection sheet so the seed-picker badge (which also shows
    // 🥉 for mastered crops) doesn't mask a regression in the collection view.
    expect(within(screen.getByTestId('collection-sheet')).getByText('🥉')).toBeTruthy();
  });

  test('mastery rank-up overlay auto-dismisses after the celebration duration', async () => {
    const thresholds = getMasteryThresholds('carrot');
    const firstThreshold = thresholds[0]!;
    const state: GameState = {
      ...createReadyHarvestState(),
      harvestedCropKeys: ['carrot'],
      harvestCounts: { carrot: firstThreshold - 1 },
    };
    const screen = await renderGame(state);

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());
    fireEvent.press(within(screen.getByTestId('plot-cell-0')).getByText('GET'));

    expect(screen.getByText('숙련도 달성!')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(MASTERY_RANK_UP_CELEBRATION_DURATION_MS);
    });

    expect(screen.queryByText('숙련도 달성!')).toBeNull();
  });

  test('mastery rank-up overlay dismisses immediately on backdrop tap', async () => {
    const thresholds = getMasteryThresholds('carrot');
    const firstThreshold = thresholds[0]!;
    const state: GameState = {
      ...createReadyHarvestState(),
      harvestedCropKeys: ['carrot'],
      harvestCounts: { carrot: firstThreshold - 1 },
    };
    const screen = await renderGame(state);

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());
    fireEvent.press(within(screen.getByTestId('plot-cell-0')).getByText('GET'));

    expect(screen.getByText('숙련도 달성!')).toBeTruthy();

    fireEvent.press(screen.getByTestId('mastery-rank-up-overlay'));

    expect(screen.queryByText('숙련도 달성!')).toBeNull();
  });

  test('consecutive rank-ups replace the overlay notice and reset the auto-dismiss timer', async () => {
    const thresholds = getMasteryThresholds('carrot');
    const firstThreshold = thresholds[0]!;
    const wheatThresholds = getMasteryThresholds('wheat');
    const wheatFirstThreshold = wheatThresholds[0]!;
    const base = createInitialState();
    // Plot 0 = carrot (rank-up on next harvest), plot 1 = wheat (rank-up on next harvest)
    const state: GameState = {
      ...base,
      plots: [
        { ...base.plots[0]!, cropType: 'carrot', startTime: NOW - 10_000, state: 2 },
        { ...base.plots[1]!, cropType: 'wheat', startTime: NOW - 10_000, state: 2 },
        ...base.plots.slice(2),
      ],
      unlockedAreas: base.unlockedAreas,
      harvestedCropKeys: ['carrot', 'wheat'],
      harvestCounts: {
        carrot: firstThreshold - 1,
        wheat: wheatFirstThreshold - 1,
      },
    };
    const screen = await renderGame(state);

    await waitFor(() => expect(screen.getAllByText('GET').length).toBeGreaterThanOrEqual(2));

    // First rank-up: explicitly press plot 0 (carrot) — overlay shows carrot's name
    fireEvent.press(within(screen.getByTestId('plot-cell-0')).getByText('GET'));
    const cardAfterFirst = screen.getByTestId('mastery-rank-up-card');
    expect(within(cardAfterFirst).getByText('당근')).toBeTruthy();
    expect(within(cardAfterFirst).getByText(/브론즈/)).toBeTruthy();

    // Advance partway through the first timer — overlay still showing
    await act(async () => {
      jest.advanceTimersByTime(MASTERY_RANK_UP_CELEBRATION_DURATION_MS - 500);
    });
    expect(screen.getByText('숙련도 달성!')).toBeTruthy();

    // Second rank-up: target plot-cell-1 (wheat) directly, independent of DOM order.
    fireEvent.press(within(screen.getByTestId('plot-cell-1')).getByText('GET'));
    const cardAfterSecond = screen.getByTestId('mastery-rank-up-card');
    expect(within(cardAfterSecond).getByText('밀')).toBeTruthy();
    expect(within(cardAfterSecond).getByText(/브론즈/)).toBeTruthy();

    // Old timer would have expired by now but the reset timer is still running
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(screen.getByText('숙련도 달성!')).toBeTruthy();

    // Full duration from the second rank-up elapses — overlay gone
    await act(async () => {
      jest.advanceTimersByTime(MASTERY_RANK_UP_CELEBRATION_DURATION_MS);
    });
    expect(screen.queryByText('숙련도 달성!')).toBeNull();
  });

  test('collects every ripe plot in one tap via the Harvest All shortcut', async () => {
    const screen = await renderGame(createReadyHarvestState());

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    // Two ripe carrots surface the batch shortcut in place of the tool hint.
    expect(screen.getByText('🧺 모두 수확 2')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('🧺 모두 수확 2'));

    // Both plots collected at once: +14G each, with a single batch toast.
    await waitFor(() => expect(screen.getByText('78G')).toBeTruthy());
    expect(screen.getByText(/한 번에 수확했어요/)).toBeTruthy();
    // No ripe plots remain, so neither the GET badge nor the shortcut shows.
    expect(screen.queryByText('GET')).toBeNull();
    expect(screen.queryByText(/모두 수확/)).toBeNull();
  });

  test('auto-harvests and replants through the game tick when automation is unlocked', async () => {
    const base = createReadyHarvestState();
    const state: GameState = {
      ...base,
      research: { ...base.research, unlockedNodes: ['auto_harvest', 'auto_replant'] },
      automationSettings: { autoHarvestEnabled: true, autoReplantEnabled: true, donationModeEnabled: false },
    };
    const carrot = CROPS.carrot!;
    // Two ready carrots are harvested and replanted by the automation tick.
    const expectedGold = state.gold + carrot.sell * 2 - carrot.cost * 2;
    const screen = await renderGame(state);

    await act(async () => {
      jest.advanceTimersByTime(GAME_TICK_INTERVAL_MS + 50);
    });

    await waitFor(() => expect(screen.getByText(`${formatMoney(expectedGold)}G`)).toBeTruthy());
    expect(screen.queryByText('GET')).toBeNull();
  });

  test('pioneers a new region, resets the farm layer, and starts a chain farm', async () => {
    const base = createInitialState();
    const legendCrops = getAreaCropKeys('legend_field');
    const state: GameState = {
      ...base,
      gold: getPrestigeCost(0),
      harvestedCropKeys: [...legendCrops],
      harvestCounts: Object.fromEntries(legendCrops.map((cropKey) => [cropKey, 2])),
    };
    const screen = await renderGame(state);

    await waitFor(() => expect(screen.getByText('★ 0')).toBeTruthy());

    fireEvent.press(screen.getByText('🗺️ 개척'));
    expect(screen.getByText(/1호 농장/)).toBeTruthy();

    fireEvent.press(screen.getByText(/개척 준비하기/));
    expect(screen.getByText('지역 선택')).toBeTruthy();

    fireEvent.press(screen.getByText(/설원/));
    fireEvent.press(screen.getByText(/개척하고 ★3 받기/));

    await waitFor(() => expect(screen.getByText('★ 3')).toBeTruthy());
    expect(screen.getByText('50G')).toBeTruthy();

    fireEvent.press(screen.getByText('🗺️ 개척'));
    // The graduated farm is now part of the chain; the active farm is #2.
    expect(screen.getByText(/2호 농장/)).toBeTruthy();
    expect(screen.getByText(/1호 농장 · 평원/)).toBeTruthy();
  });

  const prestigeMessages = getFarmMessages();
  let tundra!: (typeof REGION_ARCHETYPES)[number];
  let tundraName!: string;

  beforeAll(() => {
    const found = REGION_ARCHETYPES.find((a) => a.key === 'tundra');
    expect(found).toBeDefined();
    if (found == null) throw new Error('tundra archetype missing from REGION_ARCHETYPES');
    tundra = found;
    tundraName = getRegionArchetypeLabel(found.key, DEFAULT_LOCALE).name;
  });

  function createPrestigeReadyState(): GameState {
    const base = createInitialState();
    const legendCrops = getAreaCropKeys('legend_field');
    return {
      ...base,
      gold: getPrestigeCost(0),
      harvestedCropKeys: [...legendCrops],
      harvestCounts: Object.fromEntries(legendCrops.map((cropKey) => [cropKey, 2])),
    };
  }

  async function triggerPrestige(screen: ReturnType<typeof render>) {
    await waitFor(() => expect(screen.getByTestId('prestige-stars-chip')).toBeTruthy());
    fireEvent.press(screen.getByLabelText(prestigeMessages.mapButtonAccessibilityLabel));
    fireEvent.press(screen.getByText(prestigeMessages.prestigeAction(PRESTIGE_STARS_BASE)));
    fireEvent.press(screen.getByText(`${tundra.icon} ${tundraName}`));
    fireEvent.press(screen.getByText(prestigeMessages.prestigeConfirmAction(PRESTIGE_STARS_BASE)));
  }

  test('shows prestige graduation overlay on region pioneer', async () => {
    const screen = await renderGame(createPrestigeReadyState());

    await triggerPrestige(screen);

    const card = await waitFor(() => screen.getByTestId('prestige-graduation-card'));
    expect(within(card).getByText(prestigeMessages.prestigeGraduationTitle)).toBeTruthy();
    expect(within(card).getByText(tundra.icon)).toBeTruthy();
    expect(within(card).getByText(tundraName)).toBeTruthy();
    expect(within(card).getByText(prestigeMessages.prestigeGraduationStarsLabel(PRESTIGE_STARS_BASE))).toBeTruthy();
  });

  test('prestige graduation overlay auto-dismisses after the celebration duration', async () => {
    const screen = await renderGame(createPrestigeReadyState());

    await triggerPrestige(screen);
    await waitFor(() => expect(screen.getByTestId('prestige-graduation-overlay')).toBeTruthy());

    await act(async () => {
      jest.advanceTimersByTime(PRESTIGE_GRADUATION_CELEBRATION_DURATION_MS);
    });

    await waitFor(() => expect(screen.queryByTestId('prestige-graduation-overlay')).toBeNull());
  });

  test('prestige graduation overlay dismisses immediately on backdrop tap', async () => {
    const screen = await renderGame(createPrestigeReadyState());

    await triggerPrestige(screen);
    await waitFor(() => expect(screen.getByTestId('prestige-graduation-overlay')).toBeTruthy());

    fireEvent.press(screen.getByTestId('prestige-graduation-overlay'));

    await waitFor(() => expect(screen.queryByTestId('prestige-graduation-overlay')).toBeNull());
  });

  test('keeps reset behind the settings sheet', async () => {
    const screen = await renderGame(null);

    await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

    expect(screen.queryByText('농장 기록 초기화')).toBeNull();

    fireEvent.press(screen.getByLabelText('설정'));

    expect(screen.getByText('설정')).toBeTruthy();
    expect(screen.getByText('농장 기록 초기화')).toBeTruthy();

    fireEvent.press(screen.getByText('농장 기록 초기화'));

    expect(screen.getByText('새로 시작하기')).toBeTruthy();
  });

  test('plays the harvest sound when audio is supported', async () => {
    const lateGame = createLateGameState();
    const playHarvest = jest.fn();
    const screen = await renderGame(lateGame, {
      audio: {
        isSupported: true,
        playHarvest,
        playComboMilestone: jest.fn(),
        setBackgroundMusicEnabled: jest.fn(),
      },
    });

    await waitFor(() => expect(screen.getByText(`${formatMoney(lateGame.gold)}G`)).toBeTruthy());

    fireEvent.press(screen.getAllByText('GET')[0]!);

    expect(playHarvest).toHaveBeenCalledTimes(1);
  });

  describe('collection reward claim side-effects', () => {
    // Constants derived from balance data — safe to compute once at describe scope.
    const claimMessages = getFarmMessages();
    const firstArea = FARM_AREAS[0];
    if (firstArea == null) throw new Error('Test requires at least one area in FARM_AREAS');
    const firstAreaKey = firstArea.key;
    const firstAreaReward = COLLECTION_AREA_REWARDS[firstAreaKey];
    if (firstAreaReward == null) throw new Error(`No collection reward defined for area ${firstAreaKey}`);
    const claimButtonLabel = claimMessages.collectionClaimAction(
      formatMoney(firstAreaReward, DEFAULT_LOCALE)
    );

    // createLateGameState() discovers all crops, making all area collection rewards
    // claimable. A fresh instance is created per test to prevent state bleed if
    // renderGame or the component ever mutates the input object.
    let lateGame: GameState;
    let onGoldPulse: jest.Mock;
    let vibrateSpy: jest.SpyInstance;
    beforeEach(() => {
      lateGame = createLateGameState();
      onGoldPulse = jest.fn();
      __setGoldPulseTestHook(onGoldPulse);
      vibrateSpy = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
    });
    afterEach(() => {
      __setGoldPulseTestHook(undefined);
      vibrateSpy.mockRestore();
    });

    async function renderAndClaim(playHarvest: jest.Mock, savedSettings: unknown) {
      const screen = await renderGame(
        lateGame,
        {
          audio: {
            isSupported: true,
            playHarvest,
            playComboMilestone: jest.fn(),
            setBackgroundMusicEnabled: jest.fn(),
          },
        },
        savedSettings
      );
      await waitFor(() => expect(screen.getByText(`${formatMoney(lateGame.gold)}G`)).toBeTruthy());
      fireEvent.press(screen.getByLabelText(claimMessages.collectionButtonAccessibilityLabel));
      await waitFor(() => expect(screen.getByText(claimButtonLabel)).toBeTruthy());
      vibrateSpy.mockClear(); // reset count so only the claim press is counted
      fireEvent.press(screen.getByText(claimButtonLabel));
      return screen;
    }

    test('plays harvest sound, pulses gold, and vibrates when sound effects are enabled', async () => {
      const playHarvest = jest.fn();
      const screen = await renderAndClaim(playHarvest, { soundEffectsEnabled: true });
      await waitFor(() => expect(playHarvest).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(onGoldPulse).toHaveBeenCalledTimes(1));
      await waitFor(() => {
        expect(vibrateSpy).toHaveBeenCalledTimes(1);
        expect(vibrateSpy).toHaveBeenLastCalledWith(50);
      });
      await waitFor(() => expect(screen.getByText(claimMessages.collectionClaimedLabel)).toBeTruthy());
    });

    test('pulses gold and vibrates but skips harvest sound when sound effects are disabled', async () => {
      const playHarvest = jest.fn();
      const screen = await renderAndClaim(playHarvest, { soundEffectsEnabled: false });
      await waitFor(() => expect(screen.getByText(claimMessages.collectionClaimedLabel)).toBeTruthy());
      await waitFor(() => expect(onGoldPulse).toHaveBeenCalledTimes(1));
      await waitFor(() => {
        expect(vibrateSpy).toHaveBeenCalledTimes(1);
        expect(vibrateSpy).toHaveBeenLastCalledWith(50);
      });
      expect(playHarvest).not.toHaveBeenCalled();
    });

    test('pulses gold but skips harvest sound when audio is unsupported', async () => {
      const playHarvest = jest.fn();
      const screen = await renderGame(
        lateGame,
        {
          audio: {
            isSupported: false,
            playHarvest,
            playComboMilestone: jest.fn(),
            setBackgroundMusicEnabled: jest.fn(),
          },
        },
        { soundEffectsEnabled: true }
      );
      await waitFor(() => expect(screen.getByText(`${formatMoney(lateGame.gold)}G`)).toBeTruthy());
      fireEvent.press(screen.getByLabelText(claimMessages.collectionButtonAccessibilityLabel));
      await waitFor(() => expect(screen.getByText(claimButtonLabel)).toBeTruthy());
      fireEvent.press(screen.getByText(claimButtonLabel));
      await waitFor(() => expect(screen.getByText(claimMessages.collectionClaimedLabel)).toBeTruthy());
      await waitFor(() => expect(onGoldPulse).toHaveBeenCalledTimes(1));
      expect(playHarvest).not.toHaveBeenCalled();
    });

    test('claim flow completes when playHarvest throws synchronously', async () => {
      const playHarvest = jest.fn(() => { throw new Error('audio error'); });
      const screen = await renderAndClaim(playHarvest, { soundEffectsEnabled: true });
      await waitFor(() => expect(screen.getByText(claimMessages.collectionClaimedLabel)).toBeTruthy());
      await waitFor(() => expect(onGoldPulse).toHaveBeenCalledTimes(1));
    });

    test('claim flow completes when playHarvest returns a rejected Promise', async () => {
      const playHarvest = jest.fn(() => Promise.reject(new Error('audio error')));
      const screen = await renderAndClaim(playHarvest, { soundEffectsEnabled: true });
      await waitFor(() => expect(screen.getByText(claimMessages.collectionClaimedLabel)).toBeTruthy());
      await waitFor(() => expect(onGoldPulse).toHaveBeenCalledTimes(1));
    });
  });

  describe('achievement claim side-effects', () => {
    function getHarvestTrack() {
      const track = ACHIEVEMENT_TRACKS.find((t) => t.key === 'harvest_total');
      if (track == null) throw new Error('harvest_total achievement track must exist');
      return track;
    }

    function createAchievementClaimableState(): GameState {
      const base = createInitialState();
      const track = getHarvestTrack();
      return {
        ...base,
        lifetimeStats: { ...base.lifetimeStats, totalHarvests: track.base },
      };
    }

    let vibrateSpy: jest.SpyInstance;
    beforeEach(() => {
      vibrateSpy = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
    });
    afterEach(() => {
      vibrateSpy.mockRestore();
    });

    async function renderAndClaimAchievement(
      playHarvest: jest.Mock,
      savedSettings: unknown
    ) {
      const claimMessages = getFarmMessages();
      const track = getHarvestTrack();
      const claimLabel = claimMessages.achievementClaimAction(track.starsPerTier);
      const screen = await renderGame(
        createAchievementClaimableState(),
        {
          audio: {
            isSupported: true,
            playHarvest,
            playComboMilestone: jest.fn(),
            setBackgroundMusicEnabled: jest.fn(),
          },
        },
        savedSettings
      );
      fireEvent.press(
        screen.getByLabelText(claimMessages.achievementsButtonAccessibilityLabel)
      );
      await waitFor(() => expect(screen.getByText(claimLabel)).toBeTruthy());
      vibrateSpy.mockClear(); // reset count so only the claim press is counted
      fireEvent.press(screen.getByText(claimLabel));
      return screen;
    }

    test('plays harvest sound and vibrates when an achievement tier is claimed', async () => {
      const playHarvest = jest.fn();
      await renderAndClaimAchievement(playHarvest, { soundEffectsEnabled: true });
      await waitFor(() => expect(playHarvest).toHaveBeenCalledTimes(1));
      await waitFor(() => {
        expect(vibrateSpy).toHaveBeenCalledTimes(1);
        expect(vibrateSpy).toHaveBeenLastCalledWith(50);
      });
    });

    test('vibrates but skips harvest sound when sound effects are disabled', async () => {
      const playHarvest = jest.fn();
      const claimMessages = getFarmMessages();
      const screen = await renderAndClaimAchievement(playHarvest, {
        soundEffectsEnabled: false,
      });
      await waitFor(() =>
        expect(screen.getByText(claimMessages.achievementClaimedToast(getHarvestTrack().starsPerTier))).toBeTruthy()
      );
      await waitFor(() => {
        expect(vibrateSpy).toHaveBeenCalledTimes(1);
        expect(vibrateSpy).toHaveBeenLastCalledWith(50);
      });
      expect(playHarvest).not.toHaveBeenCalled();
    });
  });

  test('fires combo great milestone audio when combo crosses the great tier threshold', async () => {
    const lateGame = createLateGameState();
    const playComboMilestone = jest.fn();
    const screen = await renderGame(lateGame, {
      audio: {
        isSupported: true,
        playHarvest: jest.fn(),
        playComboMilestone,
        setBackgroundMusicEnabled: jest.fn(),
      },
    });

    await waitFor(() =>
      expect(screen.getAllByText('GET').length).toBeGreaterThanOrEqual(COMBO_GREAT_THRESHOLD)
    );

    for (let i = 0; i < COMBO_GREAT_THRESHOLD; i++) {
      fireEvent.press(screen.getAllByText('GET')[0]!);
    }

    await waitFor(() => {
      expect(playComboMilestone).toHaveBeenCalledWith('great');
      expect(playComboMilestone).toHaveBeenCalledTimes(1);
    });
  });

  test('fires combo legendary milestone audio when combo crosses the legendary tier threshold', async () => {
    const lateGame = createLateGameState();
    const playComboMilestone = jest.fn();
    const screen = await renderGame(lateGame, {
      audio: {
        isSupported: true,
        playHarvest: jest.fn(),
        playComboMilestone,
        setBackgroundMusicEnabled: jest.fn(),
      },
    });

    await waitFor(() =>
      expect(screen.getAllByText('GET').length).toBeGreaterThanOrEqual(COMBO_LEGENDARY_THRESHOLD)
    );

    for (let i = 0; i < COMBO_LEGENDARY_THRESHOLD; i++) {
      fireEvent.press(screen.getAllByText('GET')[0]!);
    }

    await waitFor(() => {
      expect(playComboMilestone).toHaveBeenNthCalledWith(1, 'great');
      expect(playComboMilestone).toHaveBeenNthCalledWith(2, 'legendary');
      expect(playComboMilestone).toHaveBeenCalledTimes(2);
    });
  });

  test('batch harvest fires only legendary when combo jumps past great in one action', async () => {
    // Intentional design: a single harvestAll action that pushes combo past both
    // thresholds at once triggers only the highest milestone reached, not great+legendary.
    const lateGame = createLateGameState();
    const playComboMilestone = jest.fn();
    const harvestAllLabel = getFarmMessages().harvestAllButton(MAX_PLOTS);
    const screen = await renderGame(lateGame, {
      audio: {
        isSupported: true,
        playHarvest: jest.fn(),
        playComboMilestone,
        setBackgroundMusicEnabled: jest.fn(),
      },
    });

    await waitFor(() => expect(screen.getByText(harvestAllLabel)).toBeTruthy());
    fireEvent.press(screen.getByText(harvestAllLabel));

    await waitFor(() => {
      expect(playComboMilestone).toHaveBeenCalledWith('legendary');
      expect(playComboMilestone).not.toHaveBeenCalledWith('great');
      expect(playComboMilestone).toHaveBeenCalledTimes(1);
    });
  });

  test('spaces out harvest bonus nudges by time after the player declines one', async () => {
    const lateGame = createLateGameState();
    const rewardedAd = createReadyRewardedAd();
    const harvestBonusCta = `광고 보고 30분 동안 수확 ${HARVEST_BONUS_MULTIPLIER}배`;
    const screen = await renderGame(lateGame, { useRewardedAd: () => rewardedAd });

    await waitFor(() => expect(screen.getByText(`${formatMoney(lateGame.gold)}G`)).toBeTruthy());

    fireEvent.press(screen.getAllByText('GET')[0]!);

    expect(screen.getByText(harvestBonusCta)).toBeTruthy();

    fireEvent.press(screen.getByText('괜찮아요'));

    expect(screen.queryByText(harvestBonusCta)).toBeNull();

    fireEvent.press(screen.getAllByText('GET')[0]!);

    expect(screen.queryByText(harvestBonusCta)).toBeNull();

    jest.setSystemTime(NOW + HARVEST_BONUS_AD_COOLDOWN_MS + 1);

    fireEvent.press(screen.getAllByText('GET')[0]!);

    expect(screen.getByText(harvestBonusCta)).toBeTruthy();
  });

  test('turns the harvest bonus ad into a 30 minute reward boost', async () => {
    const readyHarvestState = createReadyHarvestState();
    const rewardedAd = createReadyRewardedAd();
    const harvestBonusCta = `광고 보고 30분 동안 수확 ${HARVEST_BONUS_MULTIPLIER}배`;
    const carrot = CROPS.carrot;
    if (carrot == null) {
      throw new Error('FarmGame tests require carrot balance data.');
    }
    const carrotRevenue = carrot.sell;
    const screen = await renderGame(readyHarvestState, { useRewardedAd: () => rewardedAd });

    await waitFor(() => expect(screen.getByText(`${formatMoney(readyHarvestState.gold)}G`)).toBeTruthy());

    fireEvent.press(screen.getAllByText('GET')[0]!);

    expect(screen.getByText(`${formatMoney(readyHarvestState.gold + carrotRevenue)}G`)).toBeTruthy();
    expect(screen.getByText(harvestBonusCta)).toBeTruthy();

    fireEvent.press(screen.getByText(harvestBonusCta));

    await waitFor(() => expect(rewardedAd.showAd).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('수확 보너스')).toBeNull());
    await waitFor(() => expect(screen.getByText('부스트')).toBeTruthy());
    expect(screen.getByText(`×${HARVEST_BONUS_MULTIPLIER.toFixed(1)}`)).toBeTruthy();

    fireEvent.press(screen.getAllByText('GET')[0]!);

    expect(screen.getByText(`${formatMoney(readyHarvestState.gold + carrotRevenue * 3)}G`)).toBeTruthy();
  });

  test('shows boost multiplier and remaining time in the header when boost is active', async () => {
    const messages = getFarmMessages(DEFAULT_LOCALE);
    const screen = await renderGame(createActiveBoostState(NOW), { preferredLocale: DEFAULT_LOCALE });

    await waitFor(() => expect(screen.getByText(messages.boostLabel)).toBeTruthy());
    expect(screen.getByText(`×${HARVEST_BONUS_MULTIPLIER.toFixed(1)}`)).toBeTruthy();
    // Assert the remaining-time element has a non-zero time value.
    // boostEndsAt = NOW + HARVEST_BONUS_BOOST_DURATION_MS and Date.now() = NOW
    // (beforeEach freezes the clock), so safeBoostRemainingMs = BOOST_DURATION > 0.
    // The regex /^[1-9]/ ensures the displayed string starts with a non-zero digit
    // (e.g. "30분"), catching any regression where the display collapses to "0초".
    // toHaveTextContent is registered globally via jest.setup.ts.
    const remaining = screen.getByTestId('boost-remaining');
    expect(remaining).toBeTruthy();
    expect(remaining).toHaveTextContent(/^[1-9]/);
  });

  test('greets a returning player with an offline progress recap', async () => {
    mockPersistence.readLastSeenAt.mockResolvedValueOnce(NOW - 2 * 60 * 60 * 1000);
    const screen = await renderGame(createReadyHarvestState());

    await waitFor(() => expect(screen.getByText('다시 오셨네요!')).toBeTruthy());
    expect(screen.getByText('수확을 기다리는 작물')).toBeTruthy();
    expect(screen.getByText('2칸')).toBeTruthy();
    // The recap is marked as seen immediately so a quick reload won't replay it.
    expect(mockPersistence.writeLastSeenAt).toHaveBeenCalled();

    fireEvent.press(screen.getByText('농장으로 가기'));
    await waitFor(() => expect(screen.queryByText('다시 오셨네요!')).toBeNull());
  });

  test('does not show the recap after only a brief absence', async () => {
    mockPersistence.readLastSeenAt.mockResolvedValueOnce(NOW - 30_000);
    const screen = await renderGame(createReadyHarvestState());

    await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
    expect(screen.queryByText('다시 오셨네요!')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Unit tests for getNextAreaGoal – pure function, no RN rendering needed.
// ---------------------------------------------------------------------------
describe('getNextAreaGoal', () => {
  const { getNextAreaGoal } = farmGameModule;

  // Helpers for building targeted game states.
  const withGold = (state: GameState, gold: number): GameState => ({ ...state, gold });
  const withHarvested = (state: GameState, keys: readonly CropKey[]): GameState => ({
    ...state,
    harvestedCropKeys: [...keys],
  });
  const withUpgrades = (state: GameState, level: number): GameState => ({
    ...state,
    upgrades: { speed: level, profit: level },
  });
  const withUnlocked = (state: GameState, areaKeys: readonly AreaKey[]): GameState => ({
    ...state,
    unlockedAreas: [...areaKeys],
  });

  // getNextAreaGoal uses FARM_AREAS.find() and relies on sequential (non-gated)
  // areas being ordered by ascending unlock cost so find() returns the correct
  // next milestone. This test locks in that invariant so a reordering in
  // balance.json is caught before it silently breaks the goal logic.
  test('sequential areas in FARM_AREAS are ordered by ascending unlock cost', () => {
    const sequential = FARM_AREAS.filter((a) => a.unlock.gate == null);
    for (let i = 1; i < sequential.length; i++) {
      expect(sequential[i]!.unlock.cost).toBeGreaterThanOrEqual(sequential[i - 1]!.unlock.cost);
    }
  });

  // Four distinct crop keys that satisfy the vegetable_field harvest requirement (4).
  const FOUR_CROPS = ['carrot', 'wheat', 'potato', 'onion'] as const satisfies readonly CropKey[];

  test('returns null when all sequential areas are unlocked, even if gated areas remain locked', () => {
    // Unlock every area that has no gate. Gated areas (e.g. hybrid_greenhouse with
    // gate='breeding_lab') must be excluded from the sequential scan so they never
    // become the returned goal — verified here by leaving them locked.
    const sequentialAreaKeys = FARM_AREAS.filter((a) => a.unlock.gate == null).map((a) => a.key);
    const hasGatedArea = FARM_AREAS.some((a) => a.unlock.gate != null);
    expect(hasGatedArea).toBe(true); // guard: test only makes sense when gated areas exist
    const state = withUnlocked(createInitialState(), sequentialAreaKeys);
    expect(getNextAreaGoal(state)).toBeNull();
  });

  test('returns harvest kind when harvest ratio is the worst bottleneck', () => {
    // Initial state: gold=50 (ratio≈0.17 vs 300 needed), harvested=0 (ratio=0 vs 4 needed).
    // Harvest ratio (0) < gold ratio (~0.17) → harvest is the bottleneck.
    const state = createInitialState();
    const result = getNextAreaGoal(state);
    expect(result).toMatchObject({ kind: 'harvest', areaKey: 'vegetable_field', current: 0, total: 4 });
  });

  test('returns gold kind when harvest is met but gold is the bottleneck', () => {
    // harvest=4/4 (ok), gold=100/300 (not ok), upgrade=1/1 (ok) → gold.
    const state = withHarvested(withGold(createInitialState(), 100), [...FOUR_CROPS]);
    const result = getNextAreaGoal(state);
    expect(result).toMatchObject({ kind: 'gold', areaKey: 'vegetable_field', current: 100, total: 300 });
  });

  test('returns upgrade kind when both gold and harvest are met but upgrade level is too low', () => {
    // fruit_field needs upgradeLevel 3. We unlock vegetable_field and set gold/harvest
    // to satisfy fruit_field's gold (15000) and harvest (10) requirements but keep
    // the upgrade level at 1 (min of speed/profit).
    const tenCrops = ['carrot','wheat','potato','onion','corn','tomato','pepper','mushroom','rice','strawberry'] as const satisfies readonly CropKey[];
    const state = withUpgrades(
      withHarvested(
        withGold(
          withUnlocked(createInitialState(), ['starter_field', 'vegetable_field']),
          20_000
        ),
        tenCrops
      ),
      1 // minUpgradeLevel=1 < 3 required
    );
    const result = getNextAreaGoal(state);
    expect(result).toMatchObject({ kind: 'upgrade', areaKey: 'fruit_field', current: 1, total: 3 });
  });

  test('returns ready kind when every requirement for the next area is met', () => {
    // vegetable_field: 300G, 4 crops, Lv.1 – all satisfied.
    const state = withHarvested(withGold(createInitialState(), 300), [...FOUR_CROPS]);
    const result = getNextAreaGoal(state);
    expect(result).toMatchObject({ kind: 'ready', areaKey: 'vegetable_field' });
  });

  test('gold wins the tie when goldRatio equals harvestRatio', () => {
    // gold=150 → ratio 0.5 (150/300); harvested=2 → ratio 0.5 (2/4).
    // When ratios are equal the gold branch fires first because its condition
    // uses <=, giving gold priority over harvest in ties.
    const state = withHarvested(withGold(createInitialState(), 150), ['carrot', 'wheat']);
    const result = getNextAreaGoal(state);
    expect(result).toMatchObject({ kind: 'gold', areaKey: 'vegetable_field' });
  });

  test('boundary: reaching the exact gold threshold switches to ready', () => {
    const state = withHarvested(withGold(createInitialState(), 300), [...FOUR_CROPS]);
    expect(getNextAreaGoal(state)).toMatchObject({ kind: 'ready' });
  });

  test('boundary: one gold short of the threshold stays as gold', () => {
    const state = withHarvested(withGold(createInitialState(), 299), [...FOUR_CROPS]);
    const result = getNextAreaGoal(state);
    expect(result).toMatchObject({ kind: 'gold', current: 299, total: 300 });
  });

  test('upgrade bottleneck is detected even when requiredUpgradeLevel is 1', () => {
    // Prior bug: upgradeRatio used `> 1` guard so level-1 requirements always got
    // ratio=1 (treated as "satisfied"). With the fix (`> 0`) a current level of 0
    // now correctly computes ratio=0 and surfaces the upgrade bottleneck.
    // This state is hypothetical (initial saves start at Lv.1) but validates the
    // formula is safe across all non-negative upgrade levels.
    const state = {
      ...withHarvested(withGold(createInitialState(), 100), [...FOUR_CROPS]),
      upgrades: { speed: 0, profit: 0 }, // getMinUpgradeLevel → 0
    };
    // vegetable_field needs Lv.1; current is 0 → upgradeOk=false, upgradeRatio=0.
    // gold: 100/300≈0.33. harvest: 4/4=1 (ok). upgrade: 0/1=0.
    // upgrade ratio (0) < gold ratio (0.33) → kind=upgrade.
    const result = getNextAreaGoal(state);
    expect(result).toMatchObject({ kind: 'upgrade', areaKey: 'vegetable_field', current: 0, total: 1 });
  });
});

// ---------------------------------------------------------------------------
// UI tests for NextGoalBar component
// ---------------------------------------------------------------------------
describe('NextGoalBar', () => {
  test('shows the ready state bar and opens the shop when tapped', async () => {
    // vegetable_field requirements: 300G + 4 crop types + Lv.1 upgrade (already met at start).
    const readyAreaState: GameState = {
      ...createInitialState(),
      gold: 300,
      harvestedCropKeys: ['carrot', 'wheat', 'potato', 'onion'] satisfies CropKey[],
    };
    const screen = await renderGame(readyAreaState);

    // The ready bar should appear once the game loads.
    await waitFor(() =>
      expect(screen.getByText('🔓 채소 밭 해금 준비 완료! 상점에서 열기')).toBeTruthy()
    );

    // Shop must be closed before the tap (guard against false positive).
    expect(screen.queryByText('농장 관리소')).toBeNull();

    // Press the Pressable directly via testID so we validate the onPress wiring,
    // not just that a Text node exists inside the component.
    fireEvent.press(screen.getByTestId('next-goal-bar'));

    expect(screen.getByText('농장 관리소')).toBeTruthy();
  });

  test('harvest-kind bar opens the shop when tapped', async () => {
    // Initial state: gold=50, no crops harvested → harvest is the bottleneck.
    const screen = await renderGame(null);

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    expect(screen.queryByText('농장 관리소')).toBeNull();
    fireEvent.press(screen.getByTestId('next-goal-bar'));
    expect(screen.getByText('농장 관리소')).toBeTruthy();
  });

  test('gold-kind bar opens the shop when tapped', async () => {
    // harvest=4/4 (ok), gold=100/300 (not ok) → gold kind.
    const goldState: GameState = {
      ...createInitialState(),
      gold: 100,
      harvestedCropKeys: ['carrot', 'wheat', 'potato', 'onion'] satisfies CropKey[],
    };
    const screen = await renderGame(goldState);

    await waitFor(() => expect(screen.getByText('100G')).toBeTruthy());

    expect(screen.queryByText('농장 관리소')).toBeNull();
    fireEvent.press(screen.getByTestId('next-goal-bar'));
    expect(screen.getByText('농장 관리소')).toBeTruthy();
  });

  test('upgrade-kind bar opens the shop when tapped', async () => {
    // gold=300/300 (ok), harvest=4/4 (ok), upgrade=0/1 (not ok) → upgrade kind.
    const upgradeState: GameState = {
      ...createInitialState(),
      gold: 300,
      harvestedCropKeys: ['carrot', 'wheat', 'potato', 'onion'] satisfies CropKey[],
      upgrades: { speed: 0, profit: 0 },
    };
    const screen = await renderGame(upgradeState);

    await waitFor(() => expect(screen.getByText('300G')).toBeTruthy());

    expect(screen.queryByText('농장 관리소')).toBeNull();
    fireEvent.press(screen.getByTestId('next-goal-bar'));
    expect(screen.getByText('농장 관리소')).toBeTruthy();
  });
});
