/// <reference types="jest" />

import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  CROPS,
  FARM_AREAS,
  HARVEST_BONUS_AD_COOLDOWN_MS,
  HARVEST_BONUS_MULTIPLIER,
  MAX_PLOTS,
  createInitialState,
  formatMoney,
  type CropKey,
  type GameState,
  type RewardedAdController,
  type RewardedAdShowResult,
} from '../../../../../packages/farm-core/src';

const NOW = Date.parse('2026-05-27T03:00:00.000Z');

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const FarmGame = jest.requireActual('../FarmGame').default as typeof import('../FarmGame').default;
const mockPersistence = {
  readPersistedGameState: jest.fn<Promise<GameState>, []>(),
  writePersistedGameState: jest.fn<Promise<void>, [GameState]>(),
  removePersistedGameState: jest.fn<Promise<void>, []>(),
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

function createShopReadyState(): GameState {
  const base = createInitialState();

  return {
    ...base,
    gold: 10_000,
    harvestedCropKeys: getCropKeys().slice(0, 5),
  };
}

async function renderGame(savedState: GameState | null, props: Partial<React.ComponentProps<typeof FarmGame>> = {}) {
  mockPersistence.readPersistedGameState.mockResolvedValueOnce(savedState ?? createInitialState());

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

describe('FarmGame UI flow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    mockPersistence.readPersistedGameState.mockReset();
    mockPersistence.writePersistedGameState.mockResolvedValue(undefined);
    mockPersistence.removePersistedGameState.mockResolvedValue(undefined);
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

    await act(async () => {
      fireEvent.press(screen.getByText('받기'));
      await Promise.resolve();
    });

    expect(rewardedAd.showAd).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('농장 관리소')).toBeNull();
    expect(screen.getByText(`${formatMoney(50 + 100)}G`)).toBeTruthy();

    fireEvent.press(screen.getByText('당근'));
    expect(screen.getByText('당근 심기 · 10G · 투자효율 +40%')).toBeTruthy();
  });

  test('closes the shop sheet after a free plot ad reward', async () => {
    const rewardedAd = createReadyRewardedAd();
    const screen = await renderGame(null, { useRewardedAd: () => rewardedAd });

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    fireEvent.press(screen.getByText('🏪 상점'));
    expect(screen.getByText('농장 관리소')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('열기'));
      await Promise.resolve();
    });

    expect(rewardedAd.showAd).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('농장 관리소')).toBeNull();

    fireEvent.press(screen.getByText('🏪 상점'));
    expect(screen.getByText('현재 7칸 · 작물을 심을 공간을 1칸 늘려요')).toBeTruthy();
  });

  test('closes the current sheet when a rewarded ad is dismissed without reward', async () => {
    const rewardedAd = createRewardedAd({ status: 'dismissed' });
    const screen = await renderGame(null, { useRewardedAd: () => rewardedAd });

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    fireEvent.press(screen.getByText('🏪 상점'));

    await act(async () => {
      fireEvent.press(screen.getByText('받기'));
      await Promise.resolve();
    });

    expect(rewardedAd.showAd).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('농장 관리소')).toBeNull();
    expect(screen.getByText('50G')).toBeTruthy();

    fireEvent.press(screen.getByText('당근'));
    expect(screen.getByText('당근 심기 · 10G · 투자효율 +40%')).toBeTruthy();
  });

  test('closes the growth ad sheet after completing crop growth', async () => {
    const rewardedAd = createReadyRewardedAd();
    const screen = await renderGame(createGrowingCropState(), { useRewardedAd: () => rewardedAd });

    await waitFor(() => expect(screen.getByText('100G')).toBeTruthy());

    fireEvent.press(screen.getByText('당근'));
    fireEvent.press(screen.getByText('🌱'));

    expect(screen.getByText('즉시 성장')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('광고 보고 바로 성장시키기'));
      await Promise.resolve();
    });

    expect(rewardedAd.showAd).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('즉시 성장')).toBeNull();
    expect(screen.getByText('GET')).toBeTruthy();
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

    await act(async () => {
      fireEvent.press(screen.getByText(harvestBonusCta));
      await Promise.resolve();
    });

    expect(screen.queryByText('수확 보너스')).toBeNull();
    expect(screen.getByText('부스트')).toBeTruthy();
    expect(screen.getByText(`×${HARVEST_BONUS_MULTIPLIER.toFixed(1)}`)).toBeTruthy();

    fireEvent.press(screen.getAllByText('GET')[0]!);

    expect(screen.getByText(`${formatMoney(readyHarvestState.gold + carrotRevenue * 3)}G`)).toBeTruthy();
  });
});
