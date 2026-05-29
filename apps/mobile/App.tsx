import React from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import FarmGame from '../ait/src/farm/FarmGame';
import { useAdMobRewardedAd } from './src/ads/adMobRewardedAd';
import { mobileFarmPersistence } from './src/storage/farmPersistence';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <FarmGame persistence={mobileFarmPersistence} useRewardedAd={useAdMobRewardedAd} />
    </SafeAreaProvider>
  );
}

export default App;
