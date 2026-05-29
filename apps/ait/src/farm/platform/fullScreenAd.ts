import { loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/framework';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { RewardedAdController, RewardedAdShowResult } from '../../../../../packages/farm-core/src';

function isFullScreenAdSupported() {
  try {
    return loadFullScreenAd.isSupported() && showFullScreenAd.isSupported();
  } catch {
    return false;
  }
}

export function useFullScreenAd(adGroupId: string): RewardedAdController {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const unregisterLoadRef = useRef<(() => void) | null>(null);
  const unregisterShowRef = useRef<(() => void) | null>(null);

  const loadAd = useCallback(() => {
    unregisterLoadRef.current?.();
    unregisterLoadRef.current = null;
    setIsLoaded(false);

    if (adGroupId.length === 0 || !isFullScreenAdSupported()) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);

    try {
      unregisterLoadRef.current = loadFullScreenAd({
        options: { adGroupId },
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
  }, [adGroupId]);

  useEffect(() => {
    loadAd();
    return () => {
      unregisterLoadRef.current?.();
      unregisterShowRef.current?.();
    };
  }, [loadAd]);

  const showAd = useCallback(
    () => {
      const supported = adGroupId.length > 0 && isFullScreenAdSupported();
      if (!supported || !isLoaded) {
        return Promise.resolve<RewardedAdShowResult>({ status: supported ? 'notReady' : 'unsupported' });
      }

      setIsLoaded(false);

      return new Promise<RewardedAdShowResult>((resolve) => {
        let settled = false;
        let rewardGranted = false;

        const finish = (result: RewardedAdShowResult) => {
          if (settled) {
            return;
          }
          settled = true;
          unregisterShowRef.current?.();
          unregisterShowRef.current = null;
          loadAd();
          resolve(result);
        };

        try {
          unregisterShowRef.current = showFullScreenAd({
            options: { adGroupId },
            onEvent: (event) => {
              if (event.type === 'userEarnedReward' && !rewardGranted) {
                rewardGranted = true;
              }
              if (event.type === 'dismissed') {
                finish(rewardGranted ? { status: 'earned' } : { status: 'dismissed' });
              }
              if (event.type === 'failedToShow') {
                finish({ status: 'failed' });
              }
            },
            onError: () => {
              finish({ status: 'failed' });
            },
          });
        } catch {
          finish({ status: 'failed' });
        }
      });
    },
    [adGroupId, isLoaded, loadAd]
  );

  return { isAdReady: isSupported && isLoaded, isAdSupported: isSupported, showAd };
}
