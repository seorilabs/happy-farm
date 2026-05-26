import { Storage } from '@apps-in-toss/framework';

import { createInitialState, migrateLoadedState, SAVE_KEY } from './constants';
import type { GameState } from './types';

export async function readPersistedGameState() {
  const base = createInitialState();

  try {
    const raw = await Storage.getItem(SAVE_KEY);
    if (raw == null) {
      return base;
    }

    return migrateLoadedState(JSON.parse(raw) as Partial<GameState>, base);
  } catch {
    return base;
  }
}

export async function writePersistedGameState(gameState: GameState) {
  try {
    await Storage.setItem(SAVE_KEY, JSON.stringify(gameState));
  } catch {
    // Storage failures must not interrupt gameplay.
  }
}

export async function removePersistedGameState() {
  try {
    await Storage.removeItem(SAVE_KEY);
  } catch {
    // Storage failures must not interrupt gameplay.
  }
}
