import { loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/framework';
import { useCallback, useEffect, useRef, useState } from 'react';

function isFullScreenAdSupported() {
  try {
    return loadFullScreenAd.isSupported() && showFullScreenAd.isSupported();
  } catch {
    return false;
  }
}

export function useFullScreenAd(adGroupId: string) {
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
    (onReward?: () => void) => {
      if (adGroupId.length === 0 || !isFullScreenAdSupported() || !isLoaded) {
        return Promise.resolve(false);
      }

      setIsLoaded(false);

      return new Promise<boolean>((resolve) => {
        let settled = false;
        let rewardGranted = false;

        const finish = (ok: boolean) => {
          if (settled) {
            return;
          }
          settled = true;
          unregisterShowRef.current?.();
          unregisterShowRef.current = null;
          loadAd();
          resolve(ok);
        };

        try {
          unregisterShowRef.current = showFullScreenAd({
            options: { adGroupId },
            onEvent: (event) => {
              if (event.type === 'userEarnedReward' && !rewardGranted) {
                rewardGranted = true;
                onReward?.();
              }
              if (event.type === 'dismissed') {
                finish(onReward == null ? true : rewardGranted);
              }
              if (event.type === 'failedToShow') {
                finish(false);
              }
            },
            onError: () => {
              finish(false);
            },
          });
        } catch {
          finish(false);
        }
      });
    },
    [adGroupId, isLoaded, loadAd]
  );

  return { isAdReady: isSupported && isLoaded, isAdSupported: isSupported, showAd };
}
