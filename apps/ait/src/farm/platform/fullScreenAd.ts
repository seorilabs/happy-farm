import { loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/framework';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { RewardedAdController, RewardedAdShowResult } from '../../../../../packages/farm-core/src';
import { useAppsInTossAdsEnabled } from '../../firebaseWeb/remoteConfig';

type PendingShow = {
  settled: boolean;
  rewardGranted: boolean;
  resolve: (result: RewardedAdShowResult) => void;
};

function safeUnregister(unregister: (() => void) | null) {
  try {
    unregister?.();
  } catch {
    // External SDK cleanup must not prevent the waiting showAd Promise from settling.
  }
}

function isFullScreenAdSupported() {
  try {
    return loadFullScreenAd.isSupported() && showFullScreenAd.isSupported();
  } catch {
    return false;
  }
}

export function useFullScreenAd(adGroupId?: string): RewardedAdController {
  const normalizedAdGroupId = adGroupId?.trim() ?? '';
  const adsEnabled = useAppsInTossAdsEnabled();
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const unregisterLoadRef = useRef<(() => void) | null>(null);
  const unregisterShowRef = useRef<(() => void) | null>(null);
  const pendingShowRef = useRef<PendingShow | null>(null);

  const loadAd = useCallback(() => {
    safeUnregister(unregisterLoadRef.current);
    unregisterLoadRef.current = null;
    setIsLoaded(false);

    if (!adsEnabled || normalizedAdGroupId.length === 0 || !isFullScreenAdSupported()) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);

    try {
      unregisterLoadRef.current = loadFullScreenAd({
        options: { adGroupId: normalizedAdGroupId },
        onEvent: (event) => {
          if (event.type === 'loaded') {
            setIsLoaded(true);
          }
        },
        onError: () => {
          setIsLoaded(false);
        },
      });
    } catch {
      setIsLoaded(false);
      setIsSupported(false);
    }
  }, [normalizedAdGroupId, adsEnabled]);

  const finishPendingShow = useCallback(
    (result: RewardedAdShowResult, options: { reload?: boolean } = {}) => {
      const pendingShow = pendingShowRef.current;
      if (pendingShow == null || pendingShow.settled) {
        return;
      }

      pendingShow.settled = true;
      pendingShowRef.current = null;
      safeUnregister(unregisterShowRef.current);
      unregisterShowRef.current = null;
      pendingShow.resolve(result);
      if (options.reload !== false) {
        try {
          loadAd();
        } catch {
          setIsLoaded(false);
        }
      }
    },
    [loadAd]
  );

  useEffect(() => {
    loadAd();
    return () => {
      finishPendingShow({ status: 'dismissed' }, { reload: false });
      safeUnregister(unregisterLoadRef.current);
      unregisterLoadRef.current = null;
      safeUnregister(unregisterShowRef.current);
      unregisterShowRef.current = null;
    };
  }, [finishPendingShow, loadAd]);

  const showAd = useCallback(
    () => {
      const supported = adsEnabled && normalizedAdGroupId.length > 0 && isFullScreenAdSupported();
      if (!supported || !isLoaded) {
        return Promise.resolve<RewardedAdShowResult>({ status: supported ? 'notReady' : 'unsupported' });
      }
      if (pendingShowRef.current != null && !pendingShowRef.current.settled) {
        return Promise.resolve<RewardedAdShowResult>({ status: 'notReady' });
      }

      setIsLoaded(false);

      return new Promise<RewardedAdShowResult>((resolve) => {
        pendingShowRef.current = { settled: false, rewardGranted: false, resolve };

        try {
          unregisterShowRef.current = showFullScreenAd({
            options: { adGroupId: normalizedAdGroupId },
            onEvent: (event) => {
              const pendingShow = pendingShowRef.current;
              if (event.type === 'userEarnedReward' && pendingShow != null && !pendingShow.rewardGranted) {
                pendingShow.rewardGranted = true;
              }
              if (event.type === 'dismissed') {
                finishPendingShow(pendingShow?.rewardGranted ? { status: 'earned' } : { status: 'dismissed' });
              }
              if (event.type === 'failedToShow') {
                finishPendingShow({ status: 'failed' });
              }
            },
            onError: () => {
              finishPendingShow({ status: 'failed' });
            },
          });
        } catch {
          finishPendingShow({ status: 'failed' });
        }
      });
    },
    [normalizedAdGroupId, adsEnabled, finishPendingShow, isLoaded]
  );

  return { isAdReady: adsEnabled && isSupported && isLoaded, isAdSupported: adsEnabled && isSupported, showAd };
}
