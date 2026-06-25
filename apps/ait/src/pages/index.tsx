import { createRoute } from '@granite-js/react-native';
import React, { useMemo } from 'react';
import { FarmGame, detectRuntimeLocale, type FarmGameAdGroupIds } from '../../../../packages/farm-ui/src';
import { appsInTossFarmAnalytics } from '../firebaseWeb';
import { useAppsInTossInterstitialAdGroupId } from '../firebaseWeb/remoteConfig';
import { useAppsInTossFarmAudio } from '../farm/platform/appsInTossAudio';
import { useFullScreenAd } from '../farm/platform/fullScreenAd';
import {
  readLastSeenAt,
  readPersistedGameSettings,
  readPersistedGameState,
  removePersistedGameState,
  writeLastSeenAt,
  writePersistedGameSettings,
  writePersistedGameState,
} from '../farm/storage';

const APPS_IN_TOSS_REWARDED_AD_GROUP_ID = 'ait.v2.live.6fc77adf3f034cd6';

export const Route = createRoute('/', {
  component: Page,
});

const appsInTossPersistence = {
  readPersistedGameState,
  writePersistedGameState,
  removePersistedGameState,
  readPersistedGameSettings,
  writePersistedGameSettings,
  readLastSeenAt,
  writeLastSeenAt,
};

function Page() {
  const { audio, audioElement } = useAppsInTossFarmAudio();
  const interstitialAdGroupId = useAppsInTossInterstitialAdGroupId();
  // 전면/복귀 지면은 원격값으로 ID를 주입한다. 미설정(빈 문자열)이면 interstitial을
  // 비워 fullScreenAd가 미지원으로 동작하게 한다(빈도 제한·온보딩 미노출·placement
  // 분석은 FarmGame 내부에서 그대로 유지).
  const adGroupIds = useMemo<FarmGameAdGroupIds>(
    () => ({
      rewarded: APPS_IN_TOSS_REWARDED_AD_GROUP_ID,
      interstitial: interstitialAdGroupId.length > 0 ? interstitialAdGroupId : undefined,
    }),
    [interstitialAdGroupId]
  );

  return (
    <>
      <FarmGame
        analytics={appsInTossFarmAnalytics}
        adGroupIds={adGroupIds}
        audio={audio}
        persistence={appsInTossPersistence}
        preferredLocale={detectRuntimeLocale()}
        useInterstitialAd={useFullScreenAd}
        useRewardedAd={useFullScreenAd}
      />
      {audioElement}
    </>
  );
}
