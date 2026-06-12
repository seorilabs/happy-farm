import { createRoute } from '@granite-js/react-native';
import React from 'react';
import { appsInTossFarmAnalytics } from '../firebaseWeb';
import FarmGame from '../farm/FarmGame';
import { detectRuntimeLocale } from '../farm/i18n';
import { useAppsInTossFarmAudio } from '../farm/platform/appsInTossAudio';
import { useFullScreenAd } from '../farm/platform/fullScreenAd';
import {
  readPersistedGameSettings,
  readPersistedGameState,
  removePersistedGameState,
  writePersistedGameSettings,
  writePersistedGameState,
} from '../farm/storage';

export const Route = createRoute('/', {
  component: Page,
});

const appsInTossPersistence = {
  readPersistedGameState,
  writePersistedGameState,
  removePersistedGameState,
  readPersistedGameSettings,
  writePersistedGameSettings,
};

function Page() {
  const { audio, audioElement } = useAppsInTossFarmAudio();

  return (
    <>
      <FarmGame
        analytics={appsInTossFarmAnalytics}
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
