import AsyncStorage from '@react-native-async-storage/async-storage';

import { createFarmPersistence, type FarmGamePersistence } from '../../../../packages/farm-ui/src';
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
