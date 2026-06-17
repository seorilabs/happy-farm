import { createRoute } from '@granite-js/react-native';
import React from 'react';
import { FarmGame, detectRuntimeLocale, type FarmGameAdGroupIds } from '../../../../packages/farm-ui/src';
import { appsInTossFarmAnalytics } from '../firebaseWeb';
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

const APPS_IN_TOSS_AD_GROUP_IDS = {
  rewarded: 'ait.v2.live.6fc77adf3f034cd6',
} satisfies FarmGameAdGroupIds;

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

  return (
    <>
      <FarmGame
        analytics={appsInTossFarmAnalytics}
        adGroupIds={APPS_IN_TOSS_AD_GROUP_IDS}
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
