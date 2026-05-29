import { createRoute } from '@granite-js/react-native';
import React from 'react';
import FarmGame from '../farm/FarmGame';
import { useFullScreenAd } from '../farm/platform/fullScreenAd';
import { readPersistedGameState, removePersistedGameState, writePersistedGameState } from '../farm/storage';

export const Route = createRoute('/', {
  component: Page,
});

const appsInTossPersistence = {
  readPersistedGameState,
  writePersistedGameState,
  removePersistedGameState,
};

function Page() {
  return (
    <FarmGame
      persistence={appsInTossPersistence}
      useInterstitialAd={useFullScreenAd}
      useRewardedAd={useFullScreenAd}
    />
  );
}
