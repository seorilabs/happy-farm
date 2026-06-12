import { useEffect, useState } from 'react';

import { getRemoteBoolean, initializeMobileRemoteConfig } from '../firebase/remoteConfig';

function isMobileAdsEnabledByPolicy() {
  return getRemoteBoolean('mobile_ads_global_enabled');
}

export function useMobileAdsEnabled() {
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPolicy() {
      await initializeMobileRemoteConfig();
      if (!cancelled) {
        setIsEnabled(isMobileAdsEnabledByPolicy());
      }
    }

    void loadPolicy();

    return () => {
      cancelled = true;
    };
  }, []);

  return isEnabled;
}
