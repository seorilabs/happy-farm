import { createInitialState, migrateLoadedState, SAVE_KEY, type GameState } from '../../farm-core/src';

import { FARM_GAME_SETTINGS_KEY, normalizeFarmGameSettings, type FarmGameSettings } from './gameSettings';

export type KeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

// Wall-clock timestamp (ms) of the player's last active moment, used to greet
// returning players with an offline-progress summary. Stored separately from
// the save blob so it can be refreshed cheaply (heartbeat / app background)
// without rewriting the whole game state.
export const LAST_SEEN_KEY = `${SAVE_KEY}.lastSeen`;

export function createFarmPersistence(storage: KeyValueStorage) {
  return {
    async readPersistedGameState() {
      const base = createInitialState();

      try {
        const raw = await storage.getItem(SAVE_KEY);
        if (raw == null) {
          return base;
        }

        // Keep a one-time snapshot of the raw save before migration touches
        // it, so a migration bug never destroys the only copy.
        try {
          const backupKey = `${SAVE_KEY}.backup`;
          if ((await storage.getItem(backupKey)) == null) {
            await storage.setItem(backupKey, raw);
          }
        } catch {
          // Backup failures must not block loading.
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
        // Clear the away-timestamp too, so a farm reset can never surface a
        // stale offline recap built from the previous save's session.
        await storage.removeItem(LAST_SEEN_KEY);
      } catch {
        // Storage failures must not interrupt gameplay.
      }
    },

    async readPersistedGameSettings() {
      try {
        const raw = await storage.getItem(FARM_GAME_SETTINGS_KEY);
        if (raw == null) {
          return null;
        }

        const parsed = JSON.parse(raw) as unknown;
        if (typeof parsed !== 'object' || parsed == null) {
          return null;
        }

        return parsed as Partial<FarmGameSettings>;
      } catch {
        return null;
      }
    },

    async writePersistedGameSettings(settings: FarmGameSettings) {
      try {
        await storage.setItem(FARM_GAME_SETTINGS_KEY, JSON.stringify(normalizeFarmGameSettings(settings)));
      } catch {
        // Storage failures must not interrupt gameplay.
      }
    },

    async readLastSeenAt(): Promise<number | null> {
      try {
        const raw = await storage.getItem(LAST_SEEN_KEY);
        if (raw == null) {
          return null;
        }
        const value = Number(raw);
        return Number.isFinite(value) && value > 0 ? value : null;
      } catch {
        return null;
      }
    },

    async writeLastSeenAt(timestamp: number) {
      try {
        await storage.setItem(LAST_SEEN_KEY, String(timestamp));
      } catch {
        // Storage failures must not interrupt gameplay.
      }
    },
  };
}
