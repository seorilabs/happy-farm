/// <reference types="jest" />

import { MAX_PLOTS, SAVE_KEY, createInitialState } from '../../../../../packages/farm-core/src';
import {
  FARM_GAME_SETTINGS_KEY,
  createFarmPersistence,
  LAST_SEEN_KEY,
} from '../../../../../packages/farm-ui/src';

const mockStorage = {
  getItem: jest.fn<Promise<string | null>, [string]>(),
  setItem: jest.fn<Promise<void>, [string, string]>(),
  removeItem: jest.fn<Promise<void>, [string]>(),
};
const {
  readPersistedGameState,
  writePersistedGameState,
  removePersistedGameState,
  readPersistedGameSettings,
  writePersistedGameSettings,
  readLastSeenAt,
} = createFarmPersistence(mockStorage);

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
      writePersistedGameState({ ...createInitialState(), gold: 1, plots: [] })
    ).resolves.toBeUndefined();
    await expect(removePersistedGameState()).resolves.toBeUndefined();
  });

  test('clears the away-timestamp when the farm is reset', async () => {
    mockStorage.removeItem.mockResolvedValue(undefined);

    await removePersistedGameState();

    expect(mockStorage.removeItem).toHaveBeenCalledWith(SAVE_KEY);
    expect(mockStorage.removeItem).toHaveBeenCalledWith(LAST_SEEN_KEY);
  });

  test('reads back a valid away-timestamp and rejects junk', async () => {
    mockStorage.getItem.mockResolvedValueOnce('1748314800000');
    expect(await readLastSeenAt()).toBe(1748314800000);

    mockStorage.getItem.mockResolvedValueOnce('not-a-number');
    expect(await readLastSeenAt()).toBeNull();

    mockStorage.getItem.mockResolvedValueOnce(null);
    expect(await readLastSeenAt()).toBeNull();
  });

  test('returns legacy settings without filling a default locale', async () => {
    mockStorage.getItem.mockResolvedValueOnce(
      JSON.stringify({
        soundEffectsEnabled: false,
        backgroundMusicEnabled: true,
      })
    );

    const settings = await readPersistedGameSettings();

    expect(mockStorage.getItem).toHaveBeenCalledWith(FARM_GAME_SETTINGS_KEY);
    expect(settings).toEqual({
      soundEffectsEnabled: false,
      backgroundMusicEnabled: true,
    });
  });

  test('normalizes settings before writing them', async () => {
    await writePersistedGameSettings({
      locale: 'en-US',
      soundEffectsEnabled: false,
      backgroundMusicEnabled: true,
    });

    expect(mockStorage.setItem).toHaveBeenCalledWith(
      FARM_GAME_SETTINGS_KEY,
      JSON.stringify({
        locale: 'en-US',
        soundEffectsEnabled: false,
        backgroundMusicEnabled: true,
      })
    );
  });
});
