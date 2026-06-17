import { Storage } from '@apps-in-toss/framework';

import type { KeyValueStorage } from '../../../../../packages/farm-ui/src';

export const appsInTossStorage: KeyValueStorage = {
  getItem: (key) => Storage.getItem(key),
  setItem: (key, value) => Storage.setItem(key, value),
  removeItem: (key) => Storage.removeItem(key),
};
