/// <reference types="jest" />

import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  CROPS,
  FARM_AREAS,
  HARVEST_BONUS_AD_COOLDOWN_MS,
  HARVEST_BONUS_MULTIPLIER,
  MAX_PLOTS,
  createFarmAnalytics,
  createInitialState,
  formatMoney,
  getAreaCropKeys,
  getMasteryThresholds,
  getPrestigeCost,
  type CropKey,
  type GameState,
  type RewardedAdController,
  type RewardedAdShowResult,
} from '../../../../../packages/farm-core/src';

const NOW = Date.parse('2026-05-27T03:00:00.000Z');

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const farmGameModule = jest.requireActual('../FarmGame') as typeof import('../FarmGame');
const FarmGame = farmGameModule.default;
const { GAME_TICK_INTERVAL_MS } = farmGameModule;
const mockPersistence = {
  readPersistedGameState: jest.fn<Promise<GameState>, []>(),
  writePersistedGameState: jest.fn<Promise<void>, [GameState]>(),
  removePersistedGameState: jest.fn<Promise<void>, []>(),
  readPersistedGameSettings: jest.fn(),
  writePersistedGameSettings: jest.fn(),
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

// Rendering the full farm tree is heavy; the first test additionally pays the
// module-loading warmup, which can exceed jest's 5s default on slow CI runners.
jest.setTimeout(15000);

describe('FarmGame UI flow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    mockPersistence.readPersistedGameState.mockReset();
    mockPersistence.writePersistedGameState.mockResolvedValue(undefined);
    mockPersistence.removePersistedGameState.mockResolvedValue(undefined);
    mockPersistence.readPersistedGameSettings.mockReset();
    mockPersistence.writePersistedGameSettings.mockResolvedValue(undefined);
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

    fireEvent.press(screen.getByText(/채소 밭/));
    expect(screen.getByText('채소 밭 열기 조건')).toBeTruthy();
    fireEvent.press(screen.getByText('초보 밭'));

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
  });

  test('renders the shared farm UI in English when the saved locale is en-US', async () => {
    const screen = await renderGame(null, {}, { locale: 'en-US' });

    await waitFor(() => expect(screen.getByText('Happy Farm')).toBeTruthy());
    expect(screen.getByText('Research Lv.1')).toBeTruthy();
    expect(screen.getByText(/About /)).toBeTruthy();
    expect(screen.getAllByText('Empty')).toHaveLength(6);
    expect(screen.getByText('Carrot')).toBeTruthy();

    fireEvent.press(screen.getByText(/Vegetable Field/));
    expect(screen.getByText('Vegetable Field requirements')).toBeTruthy();
    fireEvent.press(screen.getByText('Starter Field'));

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
  });

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
  });

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
  });

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
  });

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
  });

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

    fireEvent.press(screen.getAllByText('GET')[0]!);

    expect(screen.getByText(/숙련도가 브론즈 등급/)).toBeTruthy();

    fireEvent.press(screen.getByLabelText('작물 도감'));

    expect(screen.getByText(`${firstThreshold}/${thresholds[1]}`)).toBeTruthy();
    expect(screen.getByText('🥉')).toBeTruthy();
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
        setBackgroundMusicEnabled: jest.fn(),
      },
    });

    await waitFor(() => expect(screen.getByText(`${formatMoney(lateGame.gold)}G`)).toBeTruthy());

    fireEvent.press(screen.getAllByText('GET')[0]!);

    expect(playHarvest).toHaveBeenCalledTimes(1);
  });

  test('floats a +gold number up from a plot when it is harvested', async () => {
    const screen = await renderGame(createReadyHarvestState());

    await waitFor(() => expect(screen.getAllByText('GET').length).toBeGreaterThan(0));
    // Nothing floats before the first harvest.
    expect(screen.queryByText(/^\+[\d.,KMBT]+G$/)).toBeNull();

    fireEvent.press(screen.getAllByText('GET')[0]!);

    // The harvested gold pops up as its own floating label at the plot, distinct
    // from the persistent gold counter (no leading "+") and the bottom toast.
    const floating = screen.getByText(/^\+[\d.,KMBT]+G$/);
    expect(floating).toBeTruthy();

    // Once the float animation finishes, the label is cleared so it can never
    // replay (e.g. on a later remount) and no stale value lingers.
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    await waitFor(() => expect(screen.queryByText(/^\+[\d.,KMBT]+G$/)).toBeNull());
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
});
