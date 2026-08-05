import { loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/framework';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { RewardedAdController, RewardedAdShowResult } from '../../../../../packages/farm-core/src';
import { normalizeAdFailureReason } from '../../../../../packages/farm-core/src';
import { useAppsInTossAdsEnabled } from '../../firebaseWeb/remoteConfig';

export const FULL_SCREEN_AD_LOAD_TIMEOUT_MS = 10_000;
export const FULL_SCREEN_AD_SHOW_TIMEOUT_MS = 120_000;

type PendingLoad = {
  token: symbol;
  settled: boolean;
  promise: Promise<boolean>;
  resolve: (ready: boolean) => void;
  timeoutId: ReturnType<typeof setTimeout> | null;
  unregister: (() => void) | null;
};

type PendingShow = {
  token: symbol;
  settled: boolean;
  rewardGranted: boolean;
  resolve: (result: RewardedAdShowResult) => void;
  timeoutId: ReturnType<typeof setTimeout> | null;
  unregister: (() => void) | null;
};

function safeUnregister(unregister: (() => void) | null) {
  try {
    unregister?.();
  } catch {
    // External SDK cleanup must not prevent a pending load/show Promise from settling.
  }
}

function isFullScreenAdSupported() {
  try {
    return loadFullScreenAd.isSupported() && showFullScreenAd.isSupported();
  } catch {
    return false;
  }
}

function normalizeTimeoutMs(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value!)) : fallback;
}

function waitForLoadWithTimeout(promise: Promise<boolean>, timeoutMs: number) {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, timeoutMs);

    void promise.then((ready) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      resolve(ready);
    });
  });
}

export function useFullScreenAd(adGroupId?: string): RewardedAdController {
  const normalizedAdGroupId = adGroupId?.trim() ?? '';
  const adsEnabled = useAppsInTossAdsEnabled();
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const isLoadedRef = useRef(false);
  const pendingLoadRef = useRef<PendingLoad | null>(null);
  const pendingShowRef = useRef<PendingShow | null>(null);

  const updateLoaded = useCallback((loaded: boolean) => {
    isLoadedRef.current = loaded;
    setIsLoaded(loaded);
  }, []);

  const finishPendingLoad = useCallback((token: symbol, ready: boolean) => {
    const pendingLoad = pendingLoadRef.current;
    if (pendingLoad == null || pendingLoad.token !== token || pendingLoad.settled) {
      return;
    }

    pendingLoad.settled = true;
    if (pendingLoad.timeoutId != null) {
      clearTimeout(pendingLoad.timeoutId);
    }
    pendingLoadRef.current = null;
    safeUnregister(pendingLoad.unregister);
    pendingLoad.unregister = null;
    pendingLoad.resolve(ready);
  }, []);

  const loadAd = useCallback(
    (timeoutMs = FULL_SCREEN_AD_LOAD_TIMEOUT_MS): Promise<boolean> => {
      if (!adsEnabled || normalizedAdGroupId.length === 0 || !isFullScreenAdSupported()) {
        setIsSupported(false);
        updateLoaded(false);
        const pendingLoad = pendingLoadRef.current;
        if (pendingLoad != null) {
          finishPendingLoad(pendingLoad.token, false);
        }
        return Promise.resolve(false);
      }

      setIsSupported(true);
      if (isLoadedRef.current) {
        return Promise.resolve(true);
      }
      if (pendingLoadRef.current != null && !pendingLoadRef.current.settled) {
        return pendingLoadRef.current.promise;
      }

      updateLoaded(false);

      let resolveLoad: (ready: boolean) => void = () => undefined;
      const promise = new Promise<boolean>((resolve) => {
        resolveLoad = resolve;
      });
      const pendingLoad: PendingLoad = {
        token: Symbol('full-screen-ad-load'),
        settled: false,
        promise,
        resolve: resolveLoad,
        timeoutId: null,
        unregister: null,
      };
      pendingLoadRef.current = pendingLoad;
      pendingLoad.timeoutId = setTimeout(() => {
        if (pendingLoadRef.current?.token !== pendingLoad.token) {
          return;
        }
        updateLoaded(false);
        finishPendingLoad(pendingLoad.token, false);
      }, normalizeTimeoutMs(timeoutMs, FULL_SCREEN_AD_LOAD_TIMEOUT_MS));

      try {
        const unregister = loadFullScreenAd({
          options: { adGroupId: normalizedAdGroupId },
          onEvent: (event) => {
            if (pendingLoadRef.current?.token !== pendingLoad.token) {
              return;
            }
            if (event.type === 'loaded') {
              updateLoaded(true);
              finishPendingLoad(pendingLoad.token, true);
            }
          },
          onError: () => {
            if (pendingLoadRef.current?.token !== pendingLoad.token) {
              return;
            }
            updateLoaded(false);
            finishPendingLoad(pendingLoad.token, false);
          },
        });
        if (pendingLoadRef.current?.token === pendingLoad.token && !pendingLoad.settled) {
          pendingLoad.unregister = unregister;
        } else {
          safeUnregister(unregister);
        }
      } catch {
        updateLoaded(false);
        finishPendingLoad(pendingLoad.token, false);
      }

      return promise;
    },
    [adsEnabled, finishPendingLoad, normalizedAdGroupId, updateLoaded]
  );

  const finishPendingShow = useCallback(
    (token: symbol, result: RewardedAdShowResult, options: { reload?: boolean } = {}) => {
      const pendingShow = pendingShowRef.current;
      if (pendingShow == null || pendingShow.token !== token || pendingShow.settled) {
        return;
      }

      pendingShow.settled = true;
      if (pendingShow.timeoutId != null) {
        clearTimeout(pendingShow.timeoutId);
      }
      pendingShowRef.current = null;
      safeUnregister(pendingShow.unregister);
      pendingShow.unregister = null;
      pendingShow.resolve(result);
      if (options.reload !== false) {
        void loadAd();
      }
    },
    [loadAd]
  );

  useEffect(() => {
    void loadAd();
    return () => {
      const pendingShow = pendingShowRef.current;
      if (pendingShow != null) {
        finishPendingShow(
          pendingShow.token,
          pendingShow.rewardGranted ? { status: 'earned' } : { status: 'dismissed' },
          { reload: false }
        );
      }
      const pendingLoad = pendingLoadRef.current;
      if (pendingLoad != null) {
        finishPendingLoad(pendingLoad.token, false);
      }
      isLoadedRef.current = false;
    };
  }, [finishPendingLoad, finishPendingShow, loadAd]);

  const showAd = useCallback(() => {
    const supported = adsEnabled && normalizedAdGroupId.length > 0 && isFullScreenAdSupported();
    if (!supported) {
      return Promise.resolve<RewardedAdShowResult>({ status: 'unsupported' });
    }
    if (pendingShowRef.current != null && !pendingShowRef.current.settled) {
      return Promise.resolve<RewardedAdShowResult>({ status: 'notReady' });
    }
    if (!isLoadedRef.current) {
      return Promise.resolve<RewardedAdShowResult>({ status: 'notReady' });
    }

    updateLoaded(false);

    return new Promise<RewardedAdShowResult>((resolve) => {
      const pendingShow: PendingShow = {
        token: Symbol('full-screen-ad-show'),
        settled: false,
        rewardGranted: false,
        resolve,
        timeoutId: null,
        unregister: null,
      };
      pendingShowRef.current = pendingShow;
      pendingShow.timeoutId = setTimeout(() => {
        finishPendingShow(
          pendingShow.token,
          pendingShow.rewardGranted
            ? { status: 'earned' }
            : { status: 'failed', error: 'show_timeout' }
        );
      }, FULL_SCREEN_AD_SHOW_TIMEOUT_MS);

      try {
        const unregister = showFullScreenAd({
          options: { adGroupId: normalizedAdGroupId },
          onEvent: (event) => {
            if (pendingShowRef.current?.token !== pendingShow.token || pendingShow.settled) {
              return;
            }
            if (event.type === 'userEarnedReward' && !pendingShow.rewardGranted) {
              pendingShow.rewardGranted = true;
            }
            if (event.type === 'dismissed') {
              finishPendingShow(
                pendingShow.token,
                pendingShow.rewardGranted ? { status: 'earned' } : { status: 'dismissed' }
              );
            }
            if (event.type === 'failedToShow') {
              // AppsInToss failedToShow event has no code/message payload. onError carries
              // details when available; this event therefore uses the shared final fallback.
              finishPendingShow(pendingShow.token, {
                status: 'failed',
                error: normalizeAdFailureReason(event),
              });
            }
          },
          onError: (error: unknown) => {
            finishPendingShow(pendingShow.token, {
              status: 'failed',
              error: normalizeAdFailureReason(error),
            });
          },
        });
        if (pendingShowRef.current?.token === pendingShow.token && !pendingShow.settled) {
          pendingShow.unregister = unregister;
        } else {
          safeUnregister(unregister);
        }
      } catch (error) {
        finishPendingShow(pendingShow.token, {
          status: 'failed',
          error: normalizeAdFailureReason(error),
        });
      }
    });
  }, [adsEnabled, finishPendingShow, normalizedAdGroupId, updateLoaded]);

  const ensureAdReady = useCallback(
    (timeoutMs?: number) => {
      if (isLoadedRef.current) {
        return Promise.resolve(true);
      }
      return waitForLoadWithTimeout(
        loadAd(),
        normalizeTimeoutMs(timeoutMs, FULL_SCREEN_AD_LOAD_TIMEOUT_MS)
      );
    },
    [loadAd]
  );

  const reloadAd = useCallback(async () => {
    await loadAd();
  }, [loadAd]);

  return {
    isAdReady: adsEnabled && isSupported && isLoaded,
    isAdSupported: adsEnabled && isSupported,
    showAd,
    reloadAd,
    ensureAdReady,
  };
}
