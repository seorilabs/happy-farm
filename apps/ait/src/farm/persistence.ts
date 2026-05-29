import { createInitialState, migrateLoadedState, SAVE_KEY, type GameState } from '../../../../packages/farm-core/src';

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
  };
}
