/// <reference types="jest" />

import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';

import { CROPS, FARM_AREAS, MAX_PLOTS, createInitialState, formatMoney } from '../constants';
import type { CropKey, GameState } from '../types';

const NOW = Date.parse('2026-05-27T03:00:00.000Z');

jest.mock('@apps-in-toss/framework', () => ({
  Storage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  loadFullScreenAd: Object.assign(jest.fn(() => jest.fn()), {
    isSupported: jest.fn(() => false),
  }),
  showFullScreenAd: Object.assign(jest.fn(() => jest.fn()), {
    isSupported: jest.fn(() => false),
  }),
}));

jest.mock('@toss/tds-react-native', () => ({
  useToast: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const FarmGame = jest.requireActual('../FarmGame').default as typeof import('../FarmGame').default;
const frameworkMock = jest.requireMock('@apps-in-toss/framework') as {
  Storage: {
    getItem: jest.Mock<Promise<string | null>, [string]>;
    setItem: jest.Mock<Promise<void>, [string, string]>;
    removeItem: jest.Mock<Promise<void>, [string]>;
  };
  loadFullScreenAd: jest.Mock & { isSupported: jest.Mock<boolean, []> };
  showFullScreenAd: jest.Mock & { isSupported: jest.Mock<boolean, []> };
};
const tdsMock = jest.requireMock('@toss/tds-react-native') as {
  useToast: jest.Mock;
};
const mockStorage = frameworkMock.Storage;
const mockLoadFullScreenAd = frameworkMock.loadFullScreenAd;
const mockShowFullScreenAd = frameworkMock.showFullScreenAd;
const mockToastOpen = jest.fn();

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

async function renderGame(savedState: GameState | null) {
  mockStorage.getItem.mockResolvedValueOnce(savedState == null ? null : JSON.stringify(savedState));

  const view = render(<FarmGame />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  return view;
}

describe('FarmGame UI flow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    mockStorage.getItem.mockReset();
    mockStorage.setItem.mockResolvedValue(undefined);
    mockStorage.removeItem.mockResolvedValue(undefined);
    mockLoadFullScreenAd.mockClear();
    mockLoadFullScreenAd.isSupported.mockReturnValue(false);
    mockShowFullScreenAd.mockClear();
    mockShowFullScreenAd.isSupported.mockReturnValue(false);
    tdsMock.useToast.mockReturnValue({ open: mockToastOpen });
    mockToastOpen.mockClear();
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  test('renders initial farm and supports a plant-grow-harvest loop', async () => {
    const screen = await renderGame(null);

    await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
    expect(screen.getByText('50G')).toBeTruthy();
    expect(screen.getAllByText('빈 밭')).toHaveLength(6);
    expect(screen.getByText('당근')).toBeTruthy();

    fireEvent.press(screen.getByText('당근'));
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
    expect(screen.getByText('모든 구역 해금 완료')).toBeTruthy();
    expect(screen.getByText('현재 24칸 · 작물을 심을 공간을 1칸 늘려요')).toBeTruthy();
  });
});
