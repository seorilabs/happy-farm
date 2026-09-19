import { createRoute } from '@granite-js/react-native';
import React, { useMemo } from 'react';
import { FarmGame, detectRuntimeLocale, type FarmGameAdGroupIds } from '../../../../packages/farm-ui/src';
import { appsInTossFarmAnalytics } from '../firebaseWeb';
import { trackAppsInTossAnalyticsEvent } from '../firebaseWeb/analytics';
import { appsInTossFarmArt } from '../farm/platform/appsInTossArt';
import { useAppsInTossFarmAudio } from '../farm/platform/appsInTossAudio';
import { useFullScreenAd } from '../farm/platform/fullScreenAd';
import { useAppsInTossScreenAwake } from '../farm/platform/screenAwake';
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
// 전면 광고 그룹. 보상형과 같은 공개 식별자라 코드에 둔다.
//
// 복귀(welcome-back)·진행 마일스톤·일괄 수확 세 지면이 이 그룹 하나를 공유한다.
// 지면별 빈도는 FarmGame 쪽 백오프가 정하고, 세 지면이 같은 타임라인을 쓰므로
// 수확과 해금이 연달아 일어나도 광고가 붙어서 뜨지 않는다.
const APPS_IN_TOSS_INTERSTITIAL_AD_GROUP_ID = 'ait.v2.live.521b503408b94852';

function useAppsInTossRewardedAd(adGroupId?: string) {
  return useFullScreenAd(adGroupId, {
    adFormat: 'rewarded',
    track: trackAppsInTossAnalyticsEvent,
  });
}

function useAppsInTossInterstitialAd(adGroupId?: string) {
  return useFullScreenAd(adGroupId, {
    adFormat: 'interstitial',
    track: trackAppsInTossAnalyticsEvent,
  });
}

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
  useAppsInTossScreenAwake();
  const adGroupIds = useMemo<FarmGameAdGroupIds>(
    () => ({
      rewarded: APPS_IN_TOSS_REWARDED_AD_GROUP_ID,
      interstitial: APPS_IN_TOSS_INTERSTITIAL_AD_GROUP_ID,
    }),
    []
  );

  return (
    <>
      <FarmGame
        analytics={appsInTossFarmAnalytics}
        adGroupIds={adGroupIds}
        art={appsInTossFarmArt}
        audio={audio}
        interstitialPlacements={{
          returnWelcomeBack: true,
          progressionMilestone: true,
          harvestBatch: true,
        }}
        persistence={appsInTossPersistence}
        preferredLocale={detectRuntimeLocale()}
        useInterstitialAd={useAppsInTossInterstitialAd}
        useRewardedAd={useAppsInTossRewardedAd}
      />
      {audioElement}
    </>
  );
}
