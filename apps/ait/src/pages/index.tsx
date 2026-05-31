import { createRoute } from '@granite-js/react-native';
import React from 'react';
import FarmGame from '../farm/FarmGame';
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
    <FarmGame persistence={appsInTossPersistence} useInterstitialAd={useFullScreenAd} useRewardedAd={useFullScreenAd} />
  );
}
