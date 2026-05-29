import { useCallback, useEffect, useRef, useState } from 'react';
import mobileAds, { AdEventType, RewardedAd, RewardedAdEventType } from 'react-native-google-mobile-ads';

import type { RewardedAdReward, RewardedAdShowResult } from '../../../../packages/farm-core/src';
import { getRewardedAdUnitId } from './config';

type PendingShow = {
  settled: boolean;
  resolve: (result: RewardedAdShowResult) => void;
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

function normalizeError(payload: unknown) {
  if (payload instanceof Error) {
    return payload.message;
  }
  return typeof payload === 'string' ? payload : undefined;
}

export function useAdMobRewardedAd() {
  const adUnitId = getRewardedAdUnitId();
  const adRef = useRef<RewardedAd | null>(null);
  const pendingShowRef = useRef<PendingShow | null>(null);
  const [isAdReady, setIsAdReady] = useState(false);
  const [isAdSupported, setIsAdSupported] = useState(adUnitId != null);

  const finishPendingShow = useCallback((result: RewardedAdShowResult) => {
    const pendingShow = pendingShowRef.current;
    if (pendingShow == null || pendingShow.settled) {
      return;
    }

    pendingShow.settled = true;
    pendingShow.resolve(result);
    pendingShowRef.current = null;
  }, []);

  const loadAd = useCallback(() => {
    if (adRef.current == null) {
      return;
    }
    setIsAdReady(false);
    adRef.current.load();
  }, []);

  useEffect(() => {
    setIsAdSupported(adUnitId != null);

    if (adUnitId == null) {
      setIsAdReady(false);
      adRef.current = null;
      return;
    }

    void mobileAds().initialize();

    const rewardedAd = RewardedAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: true,
    });
    adRef.current = rewardedAd;

    const unsubscribe = rewardedAd.addAdEventsListener(({ type, payload }) => {
      if (type === RewardedAdEventType.LOADED) {
        setIsAdReady(true);
        return;
      }

      if (type === RewardedAdEventType.EARNED_REWARD) {
        finishPendingShow({ status: 'earned', reward: normalizeReward(payload) });
        return;
      }

      if (type === AdEventType.CLOSED) {
        setIsAdReady(false);
        finishPendingShow({ status: 'dismissed' });
        rewardedAd.load();
        return;
      }

      if (type === AdEventType.ERROR) {
        setIsAdReady(false);
        finishPendingShow({ status: 'failed', error: normalizeError(payload) });
      }
    });

    rewardedAd.load();

    return () => {
      unsubscribe();
      rewardedAd.removeAllListeners();
      if (adRef.current === rewardedAd) {
        adRef.current = null;
      }
    };
  }, [adUnitId, finishPendingShow]);

  const showAd = useCallback(() => {
    if (adUnitId == null) {
      return Promise.resolve<RewardedAdShowResult>({ status: 'unsupported' });
    }

    const rewardedAd = adRef.current;
    if (rewardedAd == null || !isAdReady) {
      return Promise.resolve<RewardedAdShowResult>({ status: 'notReady' });
    }

    return new Promise<RewardedAdShowResult>((resolve) => {
      pendingShowRef.current = { settled: false, resolve };
      setIsAdReady(false);

      void rewardedAd.show().catch((error: unknown) => {
        finishPendingShow({ status: 'failed', error: normalizeError(error) });
        loadAd();
      });
    });
  }, [adUnitId, finishPendingShow, isAdReady, loadAd]);

  return { isAdReady, isAdSupported, showAd };
}
