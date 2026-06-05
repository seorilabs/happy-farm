import { createRoute } from '@granite-js/react-native';
import React from 'react';
import { appsInTossFarmAnalytics } from '../firebaseWeb';
import FarmGame from '../farm/FarmGame';
import { detectRuntimeLocale } from '../farm/i18n';
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
  return (
    <FarmGame
      analytics={appsInTossFarmAnalytics}
      persistence={appsInTossPersistence}
      preferredLocale={detectRuntimeLocale()}
      useInterstitialAd={useFullScreenAd}
      useRewardedAd={useFullScreenAd}
    />
  );
}
