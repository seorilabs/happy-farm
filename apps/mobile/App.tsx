import React, { useEffect } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import FarmGame from '../ait/src/farm/FarmGame';
import { useAdMobRewardedAd } from './src/ads/adMobRewardedAd';
import { useMobileFarmAudio } from './src/audio/farmAudio';
import {
  initializeMobileFirebaseServices,
  mobileFarmAnalytics,
} from './src/firebase';
import { mobileFarmPersistence } from './src/storage/farmPersistence';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const farmAudio = useMobileFarmAudio();

  useEffect(() => {
    void initializeMobileFirebaseServices();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <FarmGame
        analytics={mobileFarmAnalytics}
        audio={farmAudio}
        market="mobile"
        persistence={mobileFarmPersistence}
        useRewardedAd={useAdMobRewardedAd}
      />
    </SafeAreaProvider>
  );
}

export default App;
