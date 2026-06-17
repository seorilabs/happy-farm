import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FarmGame, detectRuntimeLocale } from '../../packages/farm-ui/src';
import { useAdMobRewardedAd } from './src/ads/adMobRewardedAd';
import { useMobileFarmAudio } from './src/audio/farmAudio';
import {
  initializeMobileFirebaseServices,
  mobileFarmAnalytics,
} from './src/firebase';
import { mobileFarmPersistence } from './src/storage/farmPersistence';

function App() {
  const farmAudio = useMobileFarmAudio();

  useEffect(() => {
    void initializeMobileFirebaseServices();
  }, []);

  return (
    <SafeAreaProvider>
      <FarmGame
        analytics={mobileFarmAnalytics}
        audio={farmAudio}
        market="mobile"
        persistence={mobileFarmPersistence}
        preferredLocale={detectRuntimeLocale()}
        useRewardedAd={useAdMobRewardedAd}
      />
    </SafeAreaProvider>
  );
}

export default App;
