import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  createFarmPersistence,
  type FarmCloudSave,
  type FarmGamePersistence,
} from '../../../../packages/farm-ui/src';
import { isFirebaseConfigured } from '../firebase/app';
import { createDefaultMobileCloudSaveBackup } from '../firebase/cloudBackup';

const asyncStorage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

const localFarmPersistence = createFarmPersistence(asyncStorage);
const cloudSaveBackup = createDefaultMobileCloudSaveBackup(asyncStorage);

export const mobileFarmPersistence: FarmGamePersistence = {
  async readPersistedGameState() {
    await cloudSaveBackup.restoreLatestLocalSaveIfMissing();
    const gameState = await localFarmPersistence.readPersistedGameState();
    cloudSaveBackup.scheduleBackup(gameState);
    return gameState;
  },

  async writePersistedGameState(gameState) {
    await localFarmPersistence.writePersistedGameState(gameState);
    cloudSaveBackup.scheduleBackup(gameState);
  },

  async removePersistedGameState() {
    await localFarmPersistence.removePersistedGameState();
    await cloudSaveBackup.deleteBackup();
  },

  readPersistedGameSettings: localFarmPersistence.readPersistedGameSettings,
  writePersistedGameSettings: localFarmPersistence.writePersistedGameSettings,
  readLastSeenAt: localFarmPersistence.readLastSeenAt,
  writeLastSeenAt: localFarmPersistence.writeLastSeenAt,
};

// Manual backup/restore entry point for the settings screen. Shares the same
// instance as the automatic backup so device-id/revision metadata stays in sync.
// When Firebase is not configured, isSupported is false and the section is hidden.
export const mobileCloudSave: FarmCloudSave = {
  isSupported: isFirebaseConfigured(),
  backupNow: (gameState) => cloudSaveBackup.backupNow(gameState),
  restoreFromCloud: () => cloudSaveBackup.restoreFromCloud(),
};
