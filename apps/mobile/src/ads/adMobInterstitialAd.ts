import { useCallback, useEffect, useRef, useState } from 'react';
import mobileAds, { AdEventType, InterstitialAd } from 'react-native-google-mobile-ads';

import { logDevWarning, normalizeAdFailureReason, type RewardedAdShowResult } from '../../../../packages/farm-core/src';
import { getInterstitialAdUnitId } from './config';
import { ensureMobilePlatformSession, mobilePlatformAds } from '../platformEvents';

export const MOBILE_INTERSTITIAL_LOAD_TIMEOUT_MS = 10_000;
export const MOBILE_INTERSTITIAL_SHOW_TIMEOUT_MS = 60_000;
// 로드 실패(오프라인·no-fill·SDK 오류) 뒤 재시도 간격. FarmGame은 전면 컨트롤러의
// reloadAd를 부르지 않으므로, 여기서 다시 시도하지 않으면 첫 로드가 실패한 세션은
// 끝까지 notReady로 굳어 전면광고가 한 번도 뜨지 않는다. 연속 실패는 지수적으로
// 간격을 벌려 오프라인 기기가 로드를 반복하지 않게 한다.
export const MOBILE_INTERSTITIAL_RETRY_BASE_MS = 30_000;
export const MOBILE_INTERSTITIAL_RETRY_MAX_MS = 10 * 60_000;

type InterstitialInstance = {
  token: symbol;
  ad: InterstitialAd;
  unsubscribe: () => void;
};

type PendingShow = {
  token: symbol;
  settled: boolean;
  resolve: (result: RewardedAdShowResult) => void;
  timeoutId: ReturnType<typeof setTimeout> | null;
};

function disposeInstance(instance: InterstitialInstance | null) {
  if (instance == null) {
    return;
  }
  try {
    instance.unsubscribe();
  } catch {
    // SDK 정리 실패가 다음 인스턴스 생성을 막지 않는다.
  }
  try {
    instance.ad.removeAllListeners();
  } catch {
    // 위와 같다.
  }
}

/**
 * 모바일(Google Play / App Store) 전면광고 컨트롤러.
 *
 * 보상형과 달리 보상 지급이 없어 SSV·claim 경로가 필요 없다. 로드해 두었다가
 * 호출부(진행 마일스톤·복귀 지면)가 요청하면 노출하고, 닫히는 즉시 다음 노출을
 * 위해 인스턴스를 회전해 재로드한다. 빈도 제한과 지면 판단은 FarmGame이 소유한다.
 *
 * 광고를 끄는 경로는 두 가지이며 모두 여기서 막는다.
 * - Seorilabs Platform 광고 정책(appUsesAds / adsEnabled)
 * - 전면 ad unit ID 미설정(보상형과 동일하게 ID가 비면 미지원으로 동작)
 */
export function useAdMobInterstitialAd() {
  const [platformPolicyEnabled, setPlatformPolicyEnabled] = useState(__DEV__);
  const adUnitId = platformPolicyEnabled ? getInterstitialAdUnitId() : null;
  const instanceRef = useRef<InterstitialInstance | null>(null);
  const rotateRef = useRef<((expectedToken?: symbol) => void) | null>(null);
  const pendingShowRef = useRef<PendingShow | null>(null);
  const isAdReadyRef = useRef(false);
  const [isAdReady, setIsAdReady] = useState(false);
  const retryAttemptRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateReady = useCallback((ready: boolean) => {
    isAdReadyRef.current = ready;
    setIsAdReady(ready);
  }, []);

  useEffect(() => {
    if (__DEV__) {
      setPlatformPolicyEnabled(true);
      return;
    }
    let cancelled = false;
    void ensureMobilePlatformSession()
      .then((ready) => (ready ? mobilePlatformAds.policy() : Promise.reject(new Error('session unavailable'))))
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
      pendingShow.resolve(result);
      if (options.reload !== false) {
        rotateRef.current?.(token);
      }
    },
    []
  );

  useEffect(() => {
    if (adUnitId == null) {
      updateReady(false);
      instanceRef.current = null;
      return;
    }

    void mobileAds()
      .initialize()
      .catch((error: unknown) => {
        logDevWarning('[ads] initialize failed', error);
      });

    let loadTimeoutId: ReturnType<typeof setTimeout> | null = null;

    // 노출 중이 아니고 아직 준비되지 않았을 때만 한 번 더 로드한다. 이미 예약된
    // 재시도가 있으면 겹쳐 잡지 않는다.
    const scheduleRetry = () => {
      if (retryTimeoutRef.current != null) {
        return;
      }
      const delay = Math.min(
        MOBILE_INTERSTITIAL_RETRY_BASE_MS * 2 ** retryAttemptRef.current,
        MOBILE_INTERSTITIAL_RETRY_MAX_MS
      );
      retryAttemptRef.current += 1;
      retryTimeoutRef.current = setTimeout(() => {
        retryTimeoutRef.current = null;
        if (pendingShowRef.current == null && !isAdReadyRef.current) {
          rotate();
        }
      }, delay);
    };

    const createInstance = (): InterstitialInstance => {
      const token = Symbol('mobile-interstitial-instance');
      const ad = InterstitialAd.createForAdRequest(adUnitId, {
        requestNonPersonalizedAdsOnly: true,
      });
      const instance: InterstitialInstance = { token, ad, unsubscribe: () => undefined };

      instance.unsubscribe = ad.addAdEventsListener(({ type, payload }) => {
        if (instanceRef.current?.token !== token) {
          return;
        }
        if (type === AdEventType.LOADED) {
          if (loadTimeoutId != null) {
            clearTimeout(loadTimeoutId);
            loadTimeoutId = null;
          }
          retryAttemptRef.current = 0;
          updateReady(true);
          return;
        }
        if (type === AdEventType.CLOSED) {
          updateReady(false);
          finishPendingShow(token, { status: 'dismissed' });
          return;
        }
        if (type === AdEventType.ERROR) {
          const reason = normalizeAdFailureReason(payload);
          logDevWarning('[ads] interstitial error', reason);
          updateReady(false);
          const wasShowing = pendingShowRef.current?.token === token;
          // 노출 중 실패는 finishPendingShow가 인스턴스를 회전해 다시 로드한다.
          // 로드 단계 실패는 그 경로를 타지 않으므로 여기서 재시도를 예약한다.
          finishPendingShow(token, { status: 'failed', error: reason });
          if (!wasShowing) {
            scheduleRetry();
          }
        }
      });

      return instance;
    };

    const rotate = (expectedToken?: symbol) => {
      const current = instanceRef.current;
      if (expectedToken != null && current?.token !== expectedToken) {
        return;
      }
      disposeInstance(current);
      updateReady(false);
      const next = createInstance();
      instanceRef.current = next;
      if (loadTimeoutId != null) {
        clearTimeout(loadTimeoutId);
      }
      // 로드가 끝내 오지 않아도 ready가 true로 굳지 않게 한다. 실패는 다음 회전에서
      // 다시 시도되므로 별도 재시도 타이머를 두지 않는다.
      // 로드가 끝내 오지 않는 경우(에러 이벤트조차 없는 경우)도 재시도로 회수한다.
      loadTimeoutId = setTimeout(() => {
        if (instanceRef.current?.token === next.token && !isAdReadyRef.current) {
          updateReady(false);
          scheduleRetry();
        }
      }, MOBILE_INTERSTITIAL_LOAD_TIMEOUT_MS);
      try {
        next.ad.load();
      } catch {
        updateReady(false);
        scheduleRetry();
      }
    };

    rotateRef.current = rotate;
    rotate();

    return () => {
      rotateRef.current = null;
      if (loadTimeoutId != null) {
        clearTimeout(loadTimeoutId);
      }
      if (retryTimeoutRef.current != null) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      retryAttemptRef.current = 0;
      const pendingShow = pendingShowRef.current;
      if (pendingShow != null) {
        finishPendingShow(pendingShow.token, { status: 'dismissed' }, { reload: false });
      }
      const current = instanceRef.current;
      instanceRef.current = null;
      disposeInstance(current);
      isAdReadyRef.current = false;
    };
  }, [adUnitId, finishPendingShow, updateReady]);

  const showAd = useCallback(() => {
    if (adUnitId == null) {
      return Promise.resolve<RewardedAdShowResult>({ status: 'unsupported' });
    }
    if (pendingShowRef.current != null && !pendingShowRef.current.settled) {
      return Promise.resolve<RewardedAdShowResult>({ status: 'notReady' });
    }
    const instance = instanceRef.current;
    if (instance == null || !isAdReadyRef.current) {
      return Promise.resolve<RewardedAdShowResult>({ status: 'notReady' });
    }

    updateReady(false);
    return new Promise<RewardedAdShowResult>((resolve) => {
      const pendingShow: PendingShow = {
        token: instance.token,
        settled: false,
        resolve,
        timeoutId: null,
      };
      pendingShowRef.current = pendingShow;
      pendingShow.timeoutId = setTimeout(() => {
        finishPendingShow(pendingShow.token, { status: 'failed', error: 'show_timeout' });
      }, MOBILE_INTERSTITIAL_SHOW_TIMEOUT_MS);

      void instance.ad.show().catch((error: unknown) => {
        finishPendingShow(pendingShow.token, {
          status: 'failed',
          error: normalizeAdFailureReason(error),
        });
      });
    });
  }, [adUnitId, finishPendingShow, updateReady]);

  const reloadAd = useCallback(() => {
    if (isAdReadyRef.current) {
      return;
    }
    // 예약된 재시도를 기다리지 않고 즉시 다시 시도한다.
    if (retryTimeoutRef.current != null) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    retryAttemptRef.current = 0;
    rotateRef.current?.();
  }, []);

  return { isAdReady, isAdSupported: adUnitId != null, showAd, reloadAd };
}
