/// <reference types="jest" />

import { MAX_PLOTS, SAVE_KEY } from '../constants';

jest.mock('@apps-in-toss/framework', () => ({
  Storage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const { readPersistedGameState, removePersistedGameState, writePersistedGameState } = jest.requireActual(
  '../storage'
) as typeof import('../storage');
const frameworkMock = jest.requireMock('@apps-in-toss/framework') as {
  Storage: {
    getItem: jest.Mock<Promise<string | null>, [string]>;
    setItem: jest.Mock<Promise<void>, [string, string]>;
    removeItem: jest.Mock<Promise<void>, [string]>;
  };
};
const mockStorage = frameworkMock.Storage;

describe('farm storage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-05-27T03:00:00.000Z'));
    mockStorage.getItem.mockReset();
    mockStorage.setItem.mockReset();
    mockStorage.removeItem.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('returns a safe initial state when storage is empty or invalid', async () => {
    mockStorage.getItem.mockResolvedValueOnce(null);
    const emptyState = await readPersistedGameState();

    expect(mockStorage.getItem).toHaveBeenCalledWith(SAVE_KEY);
    expect(emptyState.gold).toBe(50);
    expect(emptyState.plots).toHaveLength(MAX_PLOTS);

    mockStorage.getItem.mockResolvedValueOnce('{bad json');
    const invalidState = await readPersistedGameState();

    expect(invalidState.gold).toBe(50);
    expect(invalidState.plots).toHaveLength(MAX_PLOTS);
  });

  test('migrates persisted state before returning it to the UI', async () => {
    mockStorage.getItem.mockResolvedValueOnce(
      JSON.stringify({
        gold: 1234,
        unlockedPlotCount: MAX_PLOTS + 1,
        unlockedAreas: ['starter_field', 'ghost_area'],
        harvestedCropKeys: ['carrot', 'ghost_crop'],
        plots: [{ id: 999, cropType: 'carrot', startTime: 1000, state: 1 }],
      })
    );

    const state = await readPersistedGameState();

    expect(state.gold).toBe(1234);
    expect(state.unlockedPlotCount).toBe(MAX_PLOTS);
    expect(state.unlockedAreas).toEqual(['starter_field']);
    expect(state.harvestedCropKeys).toEqual(['carrot']);
    expect(state.plots[0]).toEqual({ id: 0, cropType: 'carrot', startTime: 1000, state: 1 });
    expect(state.plots[MAX_PLOTS - 1]).toEqual({
      id: MAX_PLOTS - 1,
      cropType: null,
      startTime: null,
      state: 0,
    });
  });

  test('write and remove failures do not interrupt gameplay', async () => {
    mockStorage.setItem.mockRejectedValueOnce(new Error('quota'));
    mockStorage.removeItem.mockRejectedValueOnce(new Error('unavailable'));

    await expect(
      writePersistedGameState({
        gold: 1,
        unlockedPlotCount: 6,
        unlockedAreas: ['starter_field'],
        harvestedCropKeys: [],
        adUsage: {
          dailyKey: '2026-05-27',
          rewardedGoldTimestamps: [],
          rewardedGoldDailyCount: 0,
          growthAd: { lastUsedAt: null, dailyCount: 0 },
          harvestBonusAd: { lastUsedAt: null, dailyCount: 0 },
        },
        upgrades: { speed: 1, profit: 1 },
        plots: [],
      })
    ).resolves.toBeUndefined();
    await expect(removePersistedGameState()).resolves.toBeUndefined();
  });
});
