import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { AdEventType, RewardedAd, RewardedAdEventType } from 'react-native-google-mobile-ads';

import {
  logDevWarning,
  normalizeAdFailureReason,
  sanitizeAdSdkCode,
  type RewardedAdRequest,
  type RewardedAdReward,
  type RewardedAdShowResult,
} from '../../../../packages/farm-core/src';
import { getRewardedAdUnitId } from './config';
import { ensureAdMobReady } from './adMobConsent';
import { ensureMobilePlatformSession, mobilePlatformAds } from '../platformEvents';
import { showPlatformAdMobReward, type PlatformAdMobAdapter } from './platformRewardedAd';

export const MOBILE_REWARDED_AD_LOAD_TIMEOUT_MS = 10_000;
// Bounds only the wait for the ad to open. Once it is on screen only the player ends it:
// settling earlier let the game close the sheet under the ad, which left an empty sheet
// that swallowed every touch (E2E E7, 2026-10-14).
export const MOBILE_REWARDED_AD_SHOW_TIMEOUT_MS = 120_000;
export const ANDROID_REWARDED_AD_CLOSE_GRACE_MS = 500;

function sdkFailure(error: unknown): RewardedAdShowResult {
  if (Platform.OS !== 'android') return { status: 'failed', error: normalizeAdFailureReason(error) };
  const sdkCode = sanitizeAdSdkCode(typeof error === 'object' && error != null && 'code' in error ? error.code : undefined);
  return { status: 'failed', error: sdkCode ?? 'sdk_error', ...(sdkCode == null ? {} : { sdkCode }) };
}

function requestId() {
  return `hf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createPlatformAdMobAdapter(adUnitId: string): PlatformAdMobAdapter {
  let current: RewardedAd | null = null;
  let loaded = false;
  let cancel = () => {};
  let disposed = false;

  return {
    dispose() { disposed = true; cancel(); current = null; loaded = false; },
    async load(ssv) {
      if (!(await ensureAdMobReady()) || disposed) {
        return false;
      }
      const ad = RewardedAd.createForAdRequest(adUnitId, {
        requestNonPersonalizedAdsOnly: true,
        serverSideVerificationOptions: { customData: ssv.customData, userId: ssv.userId },
      });
      current = ad;
      loaded = false;
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
          cancel = () => {};
          loaded = ready;
          if (!ready) current = null;
          resolve(ready);
        }
        cancel = () => finish(false);
        try { ad.load(); } catch { finish(false); }
      });
    },
    async show() {
      const ad = current;
      if (ad == null || !loaded) return { status: 'notReady' };
      loaded = false;
      return new Promise<RewardedAdShowResult>((resolve) => {
        let settled = false;
        let reward: RewardedAdReward | undefined;
        let earned = false;
        let closedAt: number | null = null;
        let closeTimer: ReturnType<typeof setTimeout> | undefined;
        const startedAt = Date.now();
        const timeout = setTimeout(() => finish({ status: 'failed', error: 'show_timeout' }), MOBILE_REWARDED_AD_SHOW_TIMEOUT_MS);
        const unsubscribe = ad.addAdEventsListener(({ type, payload }) => {
          if (type === AdEventType.OPENED) clearTimeout(timeout);
          if (settled) return;
          if (type === RewardedAdEventType.EARNED_REWARD) {
            if (Platform.OS === 'android' && closedAt != null && Date.now() - closedAt >= ANDROID_REWARDED_AD_CLOSE_GRACE_MS) {
              finish({ status: 'dismissed' });
              return;
            }
            reward = normalizeReward(payload);
            earned = Platform.OS === 'android' || reward != null;
            if (closedAt != null) finish({ status: 'earned', reward });
          }
          if (type === AdEventType.CLOSED && closedAt == null) {
            closedAt = Date.now();
            clearTimeout(timeout);
            if (earned || Platform.OS !== 'android') finish(earned ? { status: 'earned', reward } : { status: 'dismissed' });
            else closeTimer = setTimeout(() => finish({ status: 'dismissed' }), ANDROID_REWARDED_AD_CLOSE_GRACE_MS);
          }
          if (type === AdEventType.ERROR) finish(sdkFailure(payload));
        });
        function finish(result: RewardedAdShowResult) {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          clearTimeout(closeTimer);
          unsubscribe();
          current = null;
          cancel = () => {};
          resolve(Platform.OS === 'android' && closedAt != null ? { ...result, durationMs: Math.max(0, closedAt - startedAt) } : result);
        }
        cancel = () => finish({ status: 'dismissed' });
        try {
          void ad.show().catch((error: unknown) => finish(sdkFailure(error)));
        } catch (error) { finish(sdkFailure(error)); }
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
  startedAt: number;
  closedAt: number | null;
  closeTimer: ReturnType<typeof setTimeout> | null;
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
  const productionInFlightRef = useRef(false);
  const productionAdapterRef = useRef<PlatformAdMobAdapter | null>(null);
  const productionGenerationRef = useRef<symbol | null>(null);
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
      if (pendingShow.closeTimer != null) clearTimeout(pendingShow.closeTimer);
      pendingShow.resolve(Platform.OS === 'android' && pendingShow.closedAt != null
        ? { ...result, durationMs: Math.max(0, pendingShow.closedAt - pendingShow.startedAt) }
        : result);
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
      // 사용자 요청 전에 익명 preload하지 않는다. CTA는 요청 가능 여부를 표시하고
      // claim 준비부터 SDK 종료까지 비활성화한다. 실제 load 후에만 show한다.
      setIsAdSupported(true);
      updateReady(true);
      const generation = Symbol('production-ad');
      productionGenerationRef.current = generation;
      return () => {
        productionGenerationRef.current = null;
        productionAdapterRef.current?.dispose();
        productionAdapterRef.current = null;
        isAdReadyRef.current = false;
      };
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

        if (type === AdEventType.OPENED) {
          const pendingShow = pendingShowRef.current;
          if (pendingShow?.instanceToken === token && pendingShow.timeoutId != null) {
            clearTimeout(pendingShow.timeoutId);
            pendingShow.timeoutId = null;
          }
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
            if (Platform.OS === 'android' && pendingShow.closedAt != null && Date.now() - pendingShow.closedAt >= ANDROID_REWARDED_AD_CLOSE_GRACE_MS) {
              finishPendingShow(token, { status: 'dismissed' });
              return;
            }
            pendingShow.rewardEarned = true;
            pendingShow.reward = normalizeReward(payload);
            if (pendingShow.closedAt != null) finishPendingShow(token, { status: 'earned', reward: pendingShow.reward });
          }
          return;
        }

        if (type === AdEventType.CLOSED) {
          updateReady(false);
          const pendingShow = pendingShowRef.current;
          if (pendingShow?.instanceToken === token && pendingShow.closedAt == null) {
            pendingShow.closedAt = Date.now();
            if (pendingShow.timeoutId != null) clearTimeout(pendingShow.timeoutId);
            if (pendingShow.rewardEarned || Platform.OS !== 'android') {
              finishPendingShow(token, pendingShow.rewardEarned ? { status: 'earned', reward: pendingShow.reward } : { status: 'dismissed' });
            } else {
              pendingShow.closeTimer = setTimeout(() => finishPendingShow(token, { status: 'dismissed' }), ANDROID_REWARDED_AD_CLOSE_GRACE_MS);
            }
          }
          return;
        }

        if (type === AdEventType.ERROR) {
          const failure = sdkFailure(payload);
          logDevWarning('[ads] rewarded error', failure.status === 'failed' ? failure.error : 'sdk_error');
          updateReady(false);
          finishPendingLoad(token, false);
          finishPendingShow(token, failure);
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
      if (productionInFlightRef.current) return Promise.resolve<RewardedAdShowResult>({ status: 'notReady' });
      const generation = productionGenerationRef.current;
      if (generation == null) return Promise.resolve<RewardedAdShowResult>({ status: 'notReady' });
      productionInFlightRef.current = true;
      updateReady(false);
      const adapter = createPlatformAdMobAdapter(adUnitId);
      productionAdapterRef.current = adapter;
      return showPlatformAdMobReward(request, {
        ensureSession: ensureMobilePlatformSession,
        ads: mobilePlatformAds,
        adapter,
        clientPlatform: Platform.OS === 'ios' ? 'ios' : 'android',
        requestId,
        isActive: () => productionGenerationRef.current === generation,
      }).finally(() => {
        if (productionAdapterRef.current === adapter) productionAdapterRef.current = null;
        productionInFlightRef.current = false;
        if (productionGenerationRef.current === generation) updateReady(true);
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
        startedAt: Date.now(),
        closedAt: null,
        closeTimer: null,
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

      try {
        void adInstance.ad.show().catch((error: unknown) => {
          finishPendingShow(pendingShow.instanceToken, sdkFailure(error));
        });
      } catch (error) {
        finishPendingShow(pendingShow.instanceToken, sdkFailure(error));
      }
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
