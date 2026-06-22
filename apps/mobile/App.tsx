import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FarmGame, detectRuntimeLocale } from '../../packages/farm-ui/src';
import { useAdMobRewardedAd } from './src/ads/adMobRewardedAd';
import { useMobileFarmAudio } from './src/audio/farmAudio';
import {
  initializeMobileFirebaseServices,
  mobileFarmAnalytics,
} from './src/firebase';
import {
  mobileHarvestNotifications,
  registerHarvestNotificationOpenTracking,
} from './src/notifications/harvestNotifications';
import { mobileFarmPersistence } from './src/storage/farmPersistence';

function App() {
  const farmAudio = useMobileFarmAudio();

  useEffect(() => {
    void initializeMobileFirebaseServices();
  }, []);

  // 수확 알림 탭으로 복귀한 경우를 계측한다(알림 동작 자체는 변경 없음).
  useEffect(() => {
    return registerHarvestNotificationOpenTracking(() => {
      mobileFarmAnalytics.trackNotificationOpened({ kind: 'harvest' });
    });
  }, []);

  return (
    <SafeAreaProvider>
      <FarmGame
        analytics={mobileFarmAnalytics}
        audio={farmAudio}
        market="mobile"
        notifications={mobileHarvestNotifications}
        persistence={mobileFarmPersistence}
        preferredLocale={detectRuntimeLocale()}
        useRewardedAd={useAdMobRewardedAd}
      />
    </SafeAreaProvider>
  );
}

export default App;
