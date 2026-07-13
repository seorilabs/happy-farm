import { setScreenAwakeMode } from '@apps-in-toss/framework';
import { useVisibility } from '@granite-js/react-native';
import { useEffect } from 'react';

import { logDevWarning } from '../../../../../packages/farm-core/src';

function updateScreenAwakeMode(enabled: boolean) {
  void setScreenAwakeMode({ enabled }).catch((error: unknown) => {
    logDevWarning(`Failed to ${enabled ? 'enable' : 'disable'} AppsInToss screen awake mode.`, error);
  });
}

/**
 * Keeps the display awake only while the Happy Farm mini-app is foregrounded.
 * AppsInToss owns the host Activity, so its bridge must be used instead of a
 * React Native native module or Android window flag.
 */
export function useAppsInTossScreenAwake() {
  const isVisible = useVisibility();

  useEffect(() => {
    updateScreenAwakeMode(isVisible);
  }, [isVisible]);

  useEffect(() => {
    return () => {
      updateScreenAwakeMode(false);
    };
  }, []);
}
