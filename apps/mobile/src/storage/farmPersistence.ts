import AsyncStorage from '@react-native-async-storage/async-storage';

import { createFarmPersistence, type FarmGamePersistence } from '../../../../packages/farm-ui/src';

const asyncStorage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

// 저장은 로컬 하나다. Firebase에서 쓰는 기능은 GA4뿐이라 클라우드 백업 경로가 없다.
export const mobileFarmPersistence: FarmGamePersistence = createFarmPersistence(asyncStorage);
