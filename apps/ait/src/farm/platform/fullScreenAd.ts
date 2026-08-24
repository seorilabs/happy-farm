import { loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/framework';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import type {
  PlatformAdsPolicy,
  RewardedAdController,
  RewardedAdRequest,
  RewardedAdShowResult,
  TrackGameEvent,
} from '../../../../../packages/farm-core/src';
import {
  normalizeAdFailureFamily,
  normalizeAdFailureReason,
} from '../../../../../packages/farm-core/src';
import { useAppsInTossAdsEnabled } from '../../firebaseWeb/remoteConfig';
import { appsInTossPlatformAds, ensureAppsInTossAdsSession } from '../../platformEvents';

export const FULL_SCREEN_AD_LOAD_TIMEOUT_MS = 10_000;
export const FULL_SCREEN_AD_SHOW_TIMEOUT_MS = 120_000;

type PendingLoad = {
  token: symbol;
  settled: boolean;
  startedAt: number;
  promise: Promise<boolean>;
  resolve: (ready: boolean) => void;
  timeoutId: ReturnType<typeof setTimeout> | null;
  unregister: (() => void) | null;
};

export type FullScreenAdFormat = 'rewarded' | 'interstitial';

export type FullScreenAdOptions = {
  adFormat?: FullScreenAdFormat;
  track?: TrackGameEvent;
};

type PendingShow = {
  token: symbol;
  settled: boolean;
  rewardGranted: boolean;
  resolve: (result: RewardedAdShowResult) => void;
  timeoutId: ReturnType<typeof setTimeout> | null;
  unregister: (() => void) | null;
};

type PlatformAdsBlockReason =
  | 'ads_session_failed'
  | 'app_uses_ads_false'
  | 'ads_disabled';

type PlatformAdsDecision =
  | { allowed: true }
  | {
      allowed: false;
      blockReason: PlatformAdsBlockReason;
      disabledBy: PlatformAdsPolicy['disabledBy'];
    };

type PlatformAdsBlockedDecision = Extract<PlatformAdsDecision, { allowed: false }>;

type PendingPlatformAdsDecision = {
  generation: number;
  promise: Promise<PlatformAdsDecision>;
};

type AdLoadResult =
  | 'loaded'
  | 'sdk_error'
  | 'timeout'
  | 'unsupported'
  | 'session_blocked'
  | 'policy_blocked'
  | 'policy_error';

let platformAdsPolicySessionGeneration = 0;
let cachedPlatformAdsBlockedDecision: PlatformAdsBlockedDecision | null = null;
let pendingPlatformAdsDecision: PendingPlatformAdsDecision | null = null;
let reportedPolicyBlockGeneration: number | null = null;
let observedAppState: AppStateStatus | null = AppState.currentState;

function clearPlatformAdsPolicySessionCache() {
  platformAdsPolicySessionGeneration += 1;
  cachedPlatformAdsBlockedDecision = null;
  pendingPlatformAdsDecision = null;
  reportedPolicyBlockGeneration = null;
}

export function resetFullScreenAdPolicySession() {
  clearPlatformAdsPolicySessionCache();
  observedAppState = AppState.currentState;
}

function observePlatformAdsAppState(nextState: AppStateStatus) {
  const previousState = observedAppState;
  observedAppState = nextState;
  if (nextState === 'active' && previousState != null && previousState !== 'active') {
    clearPlatformAdsPolicySessionCache();
  }
}

function isCacheablePlatformAdsBlock(
  decision: PlatformAdsDecision
): decision is PlatformAdsBlockedDecision {
  return !decision.allowed && decision.blockReason !== 'ads_session_failed';
}

function shouldTrackPlatformAdsBlock(decision: PlatformAdsBlockedDecision) {
  if (decision.blockReason === 'ads_session_failed') {
    return true;
  }
  if (reportedPolicyBlockGeneration === platformAdsPolicySessionGeneration) {
    return false;
  }
  reportedPolicyBlockGeneration = platformAdsPolicySessionGeneration;
  return true;
}

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

function platformRequestId() {
  return `hf-ait-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function queryPlatformAdsDecision(): Promise<PlatformAdsDecision> {
  if (!(await ensureAppsInTossAdsSession())) {
    return { allowed: false, blockReason: 'ads_session_failed', disabledBy: [] };
  }
  const policy = await appsInTossPlatformAds.policy();
  if (!policy.appUsesAds) {
    return {
      allowed: false,
      blockReason: 'app_uses_ads_false',
      disabledBy: policy.disabledBy,
    };
  }
  if (!policy.adsEnabled) {
    return { allowed: false, blockReason: 'ads_disabled', disabledBy: policy.disabledBy };
  }
  return { allowed: true };
}

function platformAdsAllowed(): Promise<PlatformAdsDecision> {
  if (cachedPlatformAdsBlockedDecision != null) {
    return Promise.resolve(cachedPlatformAdsBlockedDecision);
  }

  const generation = platformAdsPolicySessionGeneration;
  if (pendingPlatformAdsDecision?.generation === generation) {
    return pendingPlatformAdsDecision.promise;
  }

  const promise = queryPlatformAdsDecision()
    .then((decision): PlatformAdsDecision | Promise<PlatformAdsDecision> => {
      if (generation !== platformAdsPolicySessionGeneration) {
        return platformAdsAllowed();
      }
      if (isCacheablePlatformAdsBlock(decision)) {
        cachedPlatformAdsBlockedDecision = decision;
      }
      return decision;
    })
    .catch((error: unknown): PlatformAdsDecision | Promise<PlatformAdsDecision> => {
      if (generation !== platformAdsPolicySessionGeneration) {
        return platformAdsAllowed();
      }
      throw error;
    })
    .finally(() => {
      if (pendingPlatformAdsDecision?.generation === generation) {
        pendingPlatformAdsDecision = null;
      }
    });
  pendingPlatformAdsDecision = { generation, promise };
  return promise;
}

export function useFullScreenAd(
  adGroupId?: string,
  { adFormat = 'rewarded', track }: FullScreenAdOptions = {}
): RewardedAdController {
  const normalizedAdGroupId = adGroupId?.trim() ?? '';
  const adsEnabled = useAppsInTossAdsEnabled();
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const isLoadedRef = useRef(false);
  const pendingLoadRef = useRef<PendingLoad | null>(null);
  const pendingShowRef = useRef<PendingShow | null>(null);

  const trackLoadResult = useCallback(
    (
      result: AdLoadResult,
      startedAt: number,
      options: {
        attemptStage?: 'load' | 'show';
        blockedDecision?: PlatformAdsBlockedDecision;
        error?: unknown;
      } = {}
    ) => {
      const params: Record<string, string | number> = {
        ad_format: adFormat,
        result,
        attempt_stage: options.attemptStage ?? 'load',
        client_os: Platform.OS,
        load_latency_ms: Math.max(0, Date.now() - startedAt),
      };
      if (options.blockedDecision != null) {
        params.block_reason = options.blockedDecision.blockReason;
        params.disabled_by = options.blockedDecision.disabledBy.join(',');
      }
      if (options.error != null) {
        params.reason = normalizeAdFailureReason(options.error);
        params.failure_family = normalizeAdFailureFamily(options.error);
      } else if (result === 'timeout') {
        params.reason = 'load_timeout';
        params.failure_family = 'timeout';
      }
      track?.('ad_load_result', params);
    },
    [adFormat, track]
  );

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
    async (timeoutMs = FULL_SCREEN_AD_LOAD_TIMEOUT_MS): Promise<boolean> => {
      if (!adsEnabled || normalizedAdGroupId.length === 0) {
        setIsSupported(false);
        updateLoaded(false);
        const pendingLoad = pendingLoadRef.current;
        if (pendingLoad != null) {
          finishPendingLoad(pendingLoad.token, false);
        }
        return Promise.resolve(false);
      }

      const startedAt = Date.now();
      if (!isFullScreenAdSupported()) {
        setIsSupported(false);
        updateLoaded(false);
        trackLoadResult('unsupported', startedAt);
        const pendingLoad = pendingLoadRef.current;
        if (pendingLoad != null) {
          finishPendingLoad(pendingLoad.token, false);
        }
        return Promise.resolve(false);
      }
      if (isLoadedRef.current) {
        return Promise.resolve(true);
      }
      if (pendingLoadRef.current != null && !pendingLoadRef.current.settled) {
        return pendingLoadRef.current.promise;
      }

      try {
        const decision = await platformAdsAllowed();
        if (!decision.allowed) {
          if (decision.blockReason === 'ads_session_failed') {
            // The SDK is supported and the failed Ads session is retryable. Keep
            // the surface available so upper layers can issue their reload kick.
            setIsSupported(true);
          } else {
            setIsSupported(false);
          }
          updateLoaded(false);
          if (shouldTrackPlatformAdsBlock(decision)) {
            trackLoadResult(
              decision.blockReason === 'ads_session_failed' ? 'session_blocked' : 'policy_blocked',
              startedAt,
              { blockedDecision: decision }
            );
          }
          return false;
        }
      } catch (error) {
        // A policy lookup error is transient, unlike an explicit policy denial.
        // Keep reload kicks available while recording the failed attempt.
        setIsSupported(true);
        updateLoaded(false);
        trackLoadResult('policy_error', startedAt, { error });
        return false;
      }

      setIsSupported(true);
      updateLoaded(false);

      let resolveLoad: (ready: boolean) => void = () => undefined;
      const promise = new Promise<boolean>((resolve) => {
        resolveLoad = resolve;
      });
      const pendingLoad: PendingLoad = {
        token: Symbol('full-screen-ad-load'),
        settled: false,
        startedAt,
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
        trackLoadResult('timeout', pendingLoad.startedAt);
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
              trackLoadResult('loaded', pendingLoad.startedAt);
              finishPendingLoad(pendingLoad.token, true);
            }
          },
          onError: (error: unknown) => {
            if (pendingLoadRef.current?.token !== pendingLoad.token) {
              return;
            }
            updateLoaded(false);
            trackLoadResult('sdk_error', pendingLoad.startedAt, { error });
            finishPendingLoad(pendingLoad.token, false);
          },
        });
        if (pendingLoadRef.current?.token === pendingLoad.token && !pendingLoad.settled) {
          pendingLoad.unregister = unregister;
        } else {
          safeUnregister(unregister);
        }
      } catch (error) {
        updateLoaded(false);
        trackLoadResult('sdk_error', pendingLoad.startedAt, { error });
        finishPendingLoad(pendingLoad.token, false);
      }

      return promise;
    },
    [adsEnabled, finishPendingLoad, normalizedAdGroupId, trackLoadResult, updateLoaded]
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
    const subscription = AppState.addEventListener('change', (nextState) => {
      observePlatformAdsAppState(nextState);
      // 오래 백그라운드에 있던 프리로드는 만료되거나 앱 전환 중 실패할 수 있다.
      // 복귀 시 준비된 광고가 없을 때만 다시 로드해 welcome-back CTA의 준비율을 높인다.
      if (
        nextState === 'active' &&
        !isLoadedRef.current &&
        (pendingLoadRef.current == null || pendingLoadRef.current.settled)
      ) {
        void loadAd();
      }
    });
    return () => {
      subscription?.remove();
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

  const showSdkAd = useCallback(() => {
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

  const showAd = useCallback(async (request?: RewardedAdRequest): Promise<RewardedAdShowResult> => {
    const startedAt = Date.now();
    try {
      const decision = await platformAdsAllowed();
      if (!decision.allowed) {
        if (decision.blockReason !== 'ads_session_failed') {
          setIsSupported(false);
        }
        updateLoaded(false);
        if (shouldTrackPlatformAdsBlock(decision)) {
          trackLoadResult(
            decision.blockReason === 'ads_session_failed' ? 'session_blocked' : 'policy_blocked',
            startedAt,
            { attemptStage: 'show', blockedDecision: decision }
          );
        }
        return { status: 'unsupported' };
      }
      const claim = request == null ? null : await appsInTossPlatformAds.createClaim({
        requestId: platformRequestId(),
        placement: request.placement,
        provider: 'apps_in_toss',
        clientPlatform: 'apps_in_toss',
      });
      const result = await showSdkAd();
      if (result.status !== 'earned' || claim == null) {
        return result;
      }
      const confirmed = await appsInTossPlatformAds.confirm(
        claim.claimId,
        `ait-${claim.claimId}-${Date.now().toString(36)}`
      );
      if (confirmed.state !== 'confirmed' || confirmed.assurance !== 'client_confirmed') {
        return { status: 'failed', error: 'client_confirmation_failed' };
      }
      return { ...result, claimId: claim.claimId };
    } catch (error) {
      updateLoaded(false);
      trackLoadResult('policy_error', startedAt, { attemptStage: 'show', error });
      return { status: 'failed', error: 'platform_ads_unavailable' };
    }
  }, [showSdkAd, trackLoadResult, updateLoaded]);

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

  const acknowledgeReward = useCallback(async (claimId: string) => {
    await appsInTossPlatformAds.ack(claimId);
  }, []);

  return {
    isAdReady: adsEnabled && isSupported && isLoaded,
    isAdSupported: adsEnabled && isSupported,
    showAd,
    reloadAd,
    ensureAdReady,
    acknowledgeReward,
  };
}
