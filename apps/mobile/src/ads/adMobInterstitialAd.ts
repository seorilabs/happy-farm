import { useCallback, useEffect, useRef, useState } from 'react';
import mobileAds, { AdEventType, InterstitialAd } from 'react-native-google-mobile-ads';

import { normalizeAdFailureReason, type RewardedAdShowResult } from '../../../../packages/farm-core/src';
import { getInterstitialAdUnitId } from './config';
import { useMobileAdsEnabled } from './policy';
import { recordNonFatalError } from '../firebase/crashlytics';
import { ensureMobilePlatformSession, mobilePlatformAds } from '../platformEvents';

export const MOBILE_INTERSTITIAL_LOAD_TIMEOUT_MS = 10_000;
export const MOBILE_INTERSTITIAL_SHOW_TIMEOUT_MS = 60_000;

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
 * 광고를 끄는 경로는 세 가지이며 모두 여기서 막는다.
 * - Remote Config `mobile_ads_global_enabled` kill switch
 * - Seorilabs Platform 광고 정책(appUsesAds / adsEnabled)
 * - 전면 ad unit ID 미설정(보상형과 동일하게 ID가 비면 미지원으로 동작)
 */
export function useAdMobInterstitialAd() {
  const adsEnabled = useMobileAdsEnabled();
  const [platformPolicyEnabled, setPlatformPolicyEnabled] = useState(__DEV__);
  const adUnitId = adsEnabled && platformPolicyEnabled ? getInterstitialAdUnitId() : null;
  const instanceRef = useRef<InterstitialInstance | null>(null);
  const rotateRef = useRef<((expectedToken?: symbol) => void) | null>(null);
  const pendingShowRef = useRef<PendingShow | null>(null);
  const isAdReadyRef = useRef(false);
  const [isAdReady, setIsAdReady] = useState(false);

  const updateReady = useCallback((ready: boolean) => {
    isAdReadyRef.current = ready;
    setIsAdReady(ready);
  }, []);

  useEffect(() => {
    if (__DEV__ || !adsEnabled) {
      setPlatformPolicyEnabled(__DEV__ && adsEnabled);
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
  }, [adsEnabled]);

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
        recordNonFatalError(error, 'ads:initialize');
      });

    let loadTimeoutId: ReturnType<typeof setTimeout> | null = null;

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
          recordNonFatalError(new Error(reason), 'ads:interstitial:error');
          updateReady(false);
          finishPendingShow(token, { status: 'failed', error: reason });
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
      loadTimeoutId = setTimeout(() => {
        if (instanceRef.current?.token === next.token && !isAdReadyRef.current) {
          updateReady(false);
        }
      }, MOBILE_INTERSTITIAL_LOAD_TIMEOUT_MS);
      try {
        next.ad.load();
      } catch {
        updateReady(false);
      }
    };

    rotateRef.current = rotate;
    rotate();

    return () => {
      rotateRef.current = null;
      if (loadTimeoutId != null) {
        clearTimeout(loadTimeoutId);
      }
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
    rotateRef.current?.();
  }, []);

  return { isAdReady, isAdSupported: adUnitId != null, showAd, reloadAd };
}
