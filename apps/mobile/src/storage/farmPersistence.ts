import AsyncStorage from '@react-native-async-storage/async-storage';

import { createFarmPersistence } from '../../../ait/src/farm/persistence';

const asyncStorage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

export const mobileFarmPersistence = createFarmPersistence(asyncStorage);
