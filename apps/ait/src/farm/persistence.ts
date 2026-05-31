import { createInitialState, migrateLoadedState, SAVE_KEY, type GameState } from '../../../../packages/farm-core/src';

import { FARM_GAME_SETTINGS_KEY, normalizeFarmGameSettings, type FarmGameSettings } from './gameSettings';
import type { KeyValueStorage } from './platform/types';

export function createFarmPersistence(storage: KeyValueStorage) {
  return {
    async readPersistedGameState() {
      const base = createInitialState();

      try {
        const raw = await storage.getItem(SAVE_KEY);
        if (raw == null) {
          return base;
        }

        return migrateLoadedState(JSON.parse(raw) as Partial<GameState>, base);
      } catch {
        return base;
      }
    },

    async writePersistedGameState(gameState: GameState) {
      try {
        await storage.setItem(SAVE_KEY, JSON.stringify(gameState));
      } catch {
        // Storage failures must not interrupt gameplay.
      }
    },

    async removePersistedGameState() {
      try {
        await storage.removeItem(SAVE_KEY);
      } catch {
        // Storage failures must not interrupt gameplay.
      }
    },

    async readPersistedGameSettings() {
      try {
        const raw = await storage.getItem(FARM_GAME_SETTINGS_KEY);
        if (raw == null) {
          return normalizeFarmGameSettings(null);
        }

        return normalizeFarmGameSettings(JSON.parse(raw) as Partial<FarmGameSettings>);
      } catch {
        return normalizeFarmGameSettings(null);
      }
    },

    async writePersistedGameSettings(settings: FarmGameSettings) {
      try {
        await storage.setItem(FARM_GAME_SETTINGS_KEY, JSON.stringify(normalizeFarmGameSettings(settings)));
      } catch {
        // Storage failures must not interrupt gameplay.
      }
    },
  };
}
