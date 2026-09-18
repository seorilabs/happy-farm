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
// AppsInToss 클라이언트에 공개된 범위는 복귀(welcome-back) 지면뿐이다. 진행
// 마일스톤 같은 다른 지면을 켜려면 콘솔에서 해당 지면의 정책·빈도 승인을 먼저
// 받아야 한다. 이 제약은 Remote Config 파라미터 설명에 적혀 있었는데, 원격 설정을
// 걷어내면서 값과 함께 여기로 옮겼다.
const APPS_IN_TOSS_INTERSTITIAL_AD_GROUP_ID = 'ait.v2.live.fc8c280163284428';

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
          // 콘솔에 공개된 지면이 복귀뿐이라 진행 마일스톤은 닫아 둔다. 승인을 받으면
          // 켠다. 모바일(AdMob)에는 이 제약이 없어 두 지면 모두 열려 있다.
          progressionMilestone: false,
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
