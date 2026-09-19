import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { AdEventType, RewardedAd, RewardedAdEventType } from 'react-native-google-mobile-ads';

import {
  logDevWarning,
  normalizeAdFailureReason,
  type RewardedAdRequest,
  type RewardedAdReward,
  type RewardedAdShowResult,
} from '../../../../packages/farm-core/src';
import { getRewardedAdUnitId } from './config';
import { ensureAdMobReady } from './adMobConsent';
import { ensureMobilePlatformSession, mobilePlatformAds } from '../platformEvents';
import { showPlatformAdMobReward, type PlatformAdMobAdapter } from './platformRewardedAd';

export const MOBILE_REWARDED_AD_LOAD_TIMEOUT_MS = 10_000;
export const MOBILE_REWARDED_AD_SHOW_TIMEOUT_MS = 120_000;

function requestId() {
  return `hf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function createPlatformAdMobAdapter(adUnitId: string): PlatformAdMobAdapter {
  let current: RewardedAd | null = null;

  return {
    async load(ssv) {
      if (!(await ensureAdMobReady())) {
        return false;
      }
      const ad = RewardedAd.createForAdRequest(adUnitId, {
        requestNonPersonalizedAdsOnly: true,
        serverSideVerificationOptions: { customData: ssv.customData, userId: ssv.userId },
      });
      current = ad;
      return new Promise<boolean>((resolve) => {
        let settled = false;
        const timeout = setTimeout(() => finish(false), MOBILE_REWARDED_AD_LOAD_TIMEOUT_MS);
        const unsubscribe = ad.addAdEventsListener(({ type }) => {
          if (type === RewardedAdEventType.LOADED) finish(true);
          if (type === AdEventType.ERROR) finish(false);
        });
        function finish(ready: boolean) {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          unsubscribe();
          resolve(ready);
        }
        ad.load();
      });
    },
    async show() {
      const ad = current;
      if (ad == null) return { status: 'notReady' };
      return new Promise<RewardedAdShowResult>((resolve) => {
        let settled = false;
        let reward: RewardedAdReward | undefined;
        const timeout = setTimeout(() => finish({ status: 'failed', error: 'show_timeout' }), MOBILE_REWARDED_AD_SHOW_TIMEOUT_MS);
        const unsubscribe = ad.addAdEventsListener(({ type, payload }) => {
          if (type === RewardedAdEventType.EARNED_REWARD) reward = normalizeReward(payload);
          if (type === AdEventType.CLOSED) finish(reward == null ? { status: 'dismissed' } : { status: 'earned', reward });
          if (type === AdEventType.ERROR) finish({ status: 'failed', error: normalizeAdFailureReason(payload) });
        });
        function finish(result: RewardedAdShowResult) {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          unsubscribe();
          current = null;
          resolve(result);
        }
        void ad.show().catch((error: unknown) => finish({ status: 'failed', error: normalizeAdFailureReason(error) }));
      });
    },
  };
}

type PendingLoad = {
  instanceToken: symbol;
  settled: boolean;
  promise: Promise<boolean>;
  resolve: (ready: boolean) => void;
  timeoutId: ReturnType<typeof setTimeout> | null;
};

type PendingShow = {
  instanceToken: symbol;
  settled: boolean;
  rewardEarned: boolean;
  reward?: RewardedAdReward;
  resolve: (result: RewardedAdShowResult) => void;
  timeoutId: ReturnType<typeof setTimeout> | null;
};

type RewardedAdInstance = {
  token: symbol;
  ad: RewardedAd;
  unsubscribe: () => void;
};

function normalizeReward(payload: unknown): RewardedAdReward | undefined {
  if (typeof payload !== 'object' || payload == null) {
    return undefined;
  }

  const reward = payload as Partial<RewardedAdReward>;
  if (typeof reward.type !== 'string' || typeof reward.amount !== 'number') {
    return undefined;
  }

  return { type: reward.type, amount: reward.amount };
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

function disposeRewardedAdInstance(instance: RewardedAdInstance | null) {
  if (instance == null) {
    return;
  }
  try {
    instance.unsubscribe();
  } catch {
    // SDK cleanup must not prevent the next ad instance from being created.
  }
  try {
    instance.ad.removeAllListeners();
  } catch {
    // See above.
  }
}

export function useAdMobRewardedAd() {
  const [platformPolicyEnabled, setPlatformPolicyEnabled] = useState(__DEV__);
  const adUnitId = platformPolicyEnabled ? getRewardedAdUnitId() : null;
  const adInstanceRef = useRef<RewardedAdInstance | null>(null);
  const rotateAdInstanceRef = useRef<((expectedToken?: symbol) => void) | null>(null);
  const pendingLoadRef = useRef<PendingLoad | null>(null);
  const pendingShowRef = useRef<PendingShow | null>(null);
  const isAdReadyRef = useRef(false);
  const [isAdReady, setIsAdReady] = useState(false);
  const [isAdSupported, setIsAdSupported] = useState(adUnitId != null);

  useEffect(() => {
    if (__DEV__) {
      setPlatformPolicyEnabled(true);
      return;
    }
    let cancelled = false;
    void ensureMobilePlatformSession()
      .then((ready) => ready ? mobilePlatformAds.policy() : Promise.reject(new Error('session unavailable')))
      .then((policy) => {
        if (!cancelled) setPlatformPolicyEnabled(policy.appUsesAds && policy.adsEnabled);
      })
      .catch(() => {
        if (!cancelled) setPlatformPolicyEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateReady = useCallback((ready: boolean) => {
    isAdReadyRef.current = ready;
    setIsAdReady(ready);
  }, []);

  const finishPendingLoad = useCallback((instanceToken: symbol, ready: boolean) => {
    const pendingLoad = pendingLoadRef.current;
    if (
      pendingLoad == null ||
      pendingLoad.instanceToken !== instanceToken ||
      pendingLoad.settled
    ) {
      return;
    }

    pendingLoad.settled = true;
    if (pendingLoad.timeoutId != null) {
      clearTimeout(pendingLoad.timeoutId);
    }
    pendingLoadRef.current = null;
    pendingLoad.resolve(ready);
  }, []);

  const loadAd = useCallback(
    (timeoutMs = MOBILE_REWARDED_AD_LOAD_TIMEOUT_MS): Promise<boolean> => {
      const adInstance = adInstanceRef.current;
      if (adInstance == null) {
        updateReady(false);
        const pendingLoad = pendingLoadRef.current;
        if (pendingLoad != null) {
          finishPendingLoad(pendingLoad.instanceToken, false);
        }
        return Promise.resolve(false);
      }
      if (isAdReadyRef.current) {
        return Promise.resolve(true);
      }
      if (pendingLoadRef.current != null && !pendingLoadRef.current.settled) {
        return pendingLoadRef.current.promise;
      }

      updateReady(false);
      let resolveLoad: (ready: boolean) => void = () => undefined;
      const promise = new Promise<boolean>((resolve) => {
        resolveLoad = resolve;
      });
      const pendingLoad: PendingLoad = {
        instanceToken: adInstance.token,
        settled: false,
        promise,
        resolve: resolveLoad,
        timeoutId: null,
      };
      pendingLoadRef.current = pendingLoad;
      pendingLoad.timeoutId = setTimeout(() => {
        if (pendingLoadRef.current !== pendingLoad) {
          return;
        }
        updateReady(false);
        finishPendingLoad(pendingLoad.instanceToken, false);
      }, normalizeTimeoutMs(timeoutMs, MOBILE_REWARDED_AD_LOAD_TIMEOUT_MS));

      try {
        adInstance.ad.load();
      } catch {
        updateReady(false);
        finishPendingLoad(pendingLoad.instanceToken, false);
      }
      return promise;
    },
    [finishPendingLoad, updateReady]
  );

  const finishPendingShow = useCallback(
    (
      instanceToken: symbol,
      result: RewardedAdShowResult,
      options: { reload?: boolean } = {}
    ) => {
      const pendingShow = pendingShowRef.current;
      if (
        pendingShow == null ||
        pendingShow.instanceToken !== instanceToken ||
        pendingShow.settled
      ) {
        return;
      }

      pendingShow.settled = true;
      if (pendingShow.timeoutId != null) {
        clearTimeout(pendingShow.timeoutId);
      }
      pendingShow.resolve(result);
      pendingShowRef.current = null;
      if (options.reload !== false) {
        rotateAdInstanceRef.current?.(instanceToken);
        void loadAd();
      }
    },
    [loadAd]
  );

  useEffect(() => {
    setIsAdSupported(adUnitId != null);

    if (adUnitId == null) {
      updateReady(false);
      const pendingLoad = pendingLoadRef.current;
      if (pendingLoad != null) {
        finishPendingLoad(pendingLoad.instanceToken, false);
      }
      adInstanceRef.current = null;
      return;
    }

    if (!__DEV__) {
      // Production AdMob은 placement별 claim을 SSV custom data에 넣어야 하므로
      // 사용자 요청 전에 익명 preload하지 않는다. 정책 통과는 준비 상태지만
      // 실제 load와 노출 직전 정책은 showAd에서 다시 확인한다.
      setIsAdSupported(true);
      updateReady(true);
      return () => updateReady(false);
    }

    let cancelled = false;

    const createAdInstance = () => {
      const token = Symbol('mobile-rewarded-ad-instance');
      const rewardedAd = RewardedAd.createForAdRequest(adUnitId, {
        requestNonPersonalizedAdsOnly: true,
      });
      const instance: RewardedAdInstance = {
        token,
        ad: rewardedAd,
        unsubscribe: () => undefined,
      };

      instance.unsubscribe = rewardedAd.addAdEventsListener(({ type, payload }) => {
        if (adInstanceRef.current?.token !== token) {
          return;
        }

        if (type === RewardedAdEventType.LOADED) {
          updateReady(true);
          finishPendingLoad(token, true);
          return;
        }

        if (type === RewardedAdEventType.EARNED_REWARD) {
          // iOS can emit the reward before the full-screen ad is dismissed.
          // Resolve after CLOSED when possible, but preserve earned on terminal timeout/unmount.
          const pendingShow = pendingShowRef.current;
          if (
            pendingShow != null &&
            pendingShow.instanceToken === token &&
            !pendingShow.settled
          ) {
            pendingShow.rewardEarned = true;
            pendingShow.reward = normalizeReward(payload);
          }
          return;
        }

        if (type === AdEventType.CLOSED) {
          updateReady(false);
          const pendingShow = pendingShowRef.current;
          if (pendingShow?.instanceToken === token) {
            finishPendingShow(
              token,
              pendingShow.rewardEarned
                ? { status: 'earned', reward: pendingShow.reward }
                : { status: 'dismissed' }
            );
          }
          return;
        }

        if (type === AdEventType.ERROR) {
          const reason = normalizeAdFailureReason(payload);
          logDevWarning('[ads] rewarded error', reason);
          updateReady(false);
          finishPendingLoad(token, false);
          finishPendingShow(token, { status: 'failed', error: reason });
        }
      });

      return instance;
    };

    const rotateAdInstance = (expectedToken?: symbol) => {
      const current = adInstanceRef.current;
      if (expectedToken != null && current?.token !== expectedToken) {
        return;
      }
      disposeRewardedAdInstance(current);
      adInstanceRef.current = createAdInstance();
      updateReady(false);
    };

    void ensureAdMobReady().then((ready) => {
      if (!ready || cancelled) {
        updateReady(false);
        return;
      }
      rotateAdInstanceRef.current = rotateAdInstance;
      rotateAdInstance();
      void loadAd();
    });

    return () => {
      cancelled = true;
      rotateAdInstanceRef.current = null;
      const pendingShow = pendingShowRef.current;
      if (pendingShow != null) {
        finishPendingShow(
          pendingShow.instanceToken,
          pendingShow.rewardEarned
            ? { status: 'earned', reward: pendingShow.reward }
            : { status: 'dismissed' },
          { reload: false }
        );
      }
      const pendingLoad = pendingLoadRef.current;
      if (pendingLoad != null) {
        finishPendingLoad(pendingLoad.instanceToken, false);
      }
      const current = adInstanceRef.current;
      adInstanceRef.current = null;
      disposeRewardedAdInstance(current);
      isAdReadyRef.current = false;
    };
  }, [adUnitId, finishPendingLoad, finishPendingShow, loadAd, updateReady]);

  const showAd = useCallback((request?: RewardedAdRequest) => {
    if (adUnitId == null) {
      return Promise.resolve<RewardedAdShowResult>({ status: 'unsupported' });
    }
    if (!__DEV__) {
      if (request == null) {
        return Promise.resolve<RewardedAdShowResult>({ status: 'unsupported' });
      }
      return showPlatformAdMobReward(request, {
        ensureSession: ensureMobilePlatformSession,
        ads: mobilePlatformAds,
        adapter: createPlatformAdMobAdapter(adUnitId),
        clientPlatform: Platform.OS === 'ios' ? 'ios' : 'android',
        requestId,
      });
    }
    if (pendingShowRef.current != null && !pendingShowRef.current.settled) {
      return Promise.resolve<RewardedAdShowResult>({ status: 'notReady' });
    }

    const adInstance = adInstanceRef.current;
    if (adInstance == null || !isAdReadyRef.current) {
      return Promise.resolve<RewardedAdShowResult>({ status: 'notReady' });
    }

    updateReady(false);
    return new Promise<RewardedAdShowResult>((resolve) => {
      const pendingShow: PendingShow = {
        instanceToken: adInstance.token,
        settled: false,
        rewardEarned: false,
        resolve,
        timeoutId: null,
      };
      pendingShowRef.current = pendingShow;
      pendingShow.timeoutId = setTimeout(() => {
        finishPendingShow(
          pendingShow.instanceToken,
          pendingShow.rewardEarned
            ? { status: 'earned', reward: pendingShow.reward }
            : { status: 'failed', error: 'show_timeout' }
        );
      }, MOBILE_REWARDED_AD_SHOW_TIMEOUT_MS);

      void adInstance.ad.show().catch((error: unknown) => {
        finishPendingShow(pendingShow.instanceToken, {
          status: 'failed',
          error: normalizeAdFailureReason(error),
        });
      });
    });
  }, [adUnitId, finishPendingShow, updateReady]);

  const ensureAdReady = useCallback(
    (timeoutMs?: number) => {
      if (isAdReadyRef.current) {
        return Promise.resolve(true);
      }
      return waitForLoadWithTimeout(
        loadAd(),
        normalizeTimeoutMs(timeoutMs, MOBILE_REWARDED_AD_LOAD_TIMEOUT_MS)
      );
    },
    [loadAd]
  );

  const reloadAd = useCallback(async () => {
    if (!__DEV__) return;
    await loadAd();
  }, [loadAd]);

  const acknowledgeReward = useCallback(async (claimId: string) => {
    await mobilePlatformAds.ack(claimId);
  }, []);

  return { isAdReady, isAdSupported, showAd, reloadAd, ensureAdReady, acknowledgeReward };
}
