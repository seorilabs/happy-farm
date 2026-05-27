import { Storage } from '@apps-in-toss/framework';

import type { KeyValueStorage } from './types';

export const appsInTossStorage: KeyValueStorage = {
  getItem: (key) => Storage.getItem(key),
  setItem: (key, value) => Storage.setItem(key, value),
  removeItem: (key) => Storage.removeItem(key),
};
