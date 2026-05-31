import { useEffect, useState } from 'react';

import { RELEASE_INFO } from '../../../../packages/farm-core/src';
import {
  getRemoteBoolean,
  getRemoteNumber,
  initializeMobileRemoteConfig,
} from '../firebase/remoteConfig';

export type MobileAdKind = 'rewarded' | 'interstitial';

function isMobileAdsEnabledByPolicy(kind: MobileAdKind) {
  const buildNumber = RELEASE_INFO.buildNumber;
  const featureEnabled =
    kind === 'rewarded'
      ? getRemoteBoolean('rewarded_ads_enabled')
      : getRemoteBoolean('interstitial_ads_enabled');

  return (
    buildNumber > 0 &&
    getRemoteBoolean('mobile_ads_global_enabled') &&
    featureEnabled &&
    buildNumber <= getRemoteNumber('mobile_ads_enabled_max_build_number')
  );
}

export function useMobileAdsEnabled(kind: MobileAdKind) {
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPolicy() {
      await initializeMobileRemoteConfig();
      if (!cancelled) {
        setIsEnabled(isMobileAdsEnabledByPolicy(kind));
      }
    }

    void loadPolicy();

    return () => {
      cancelled = true;
    };
  }, [kind]);

  return isEnabled;
}
