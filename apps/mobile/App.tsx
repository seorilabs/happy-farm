import React, { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FarmGame, detectRuntimeLocale } from '../../packages/farm-ui/src';
import { useAdMobRewardedAd } from './src/ads/adMobRewardedAd';
import { mobileFarmArt } from './src/art/farmArt';
import { useMobileFarmAudio } from './src/audio/farmAudio';
import { ForceUpdateGate } from './src/components/ForceUpdateGate';
import { useAdFreePurchase } from './src/iap/useAdFreePurchase';
import {
  initializeMobileFirebaseServices,
  mobileFarmAnalytics,
} from './src/firebase';
import {
  mobileHarvestNotifications,
  registerHarvestNotificationOpenTracking,
} from './src/notifications/harvestNotifications';
import { mobileCloudSave, mobileFarmPersistence } from './src/storage/farmPersistence';
import {
  ensureMobilePlatformSession,
  handleMobilePlatformAppStateChange,
  shutdownMobilePlatformEvents,
  startMobilePlatformEvents,
} from './src/platformEvents';

function App() {
  const farmAudio = useMobileFarmAudio();
  const adFreePurchase = useAdFreePurchase();
  // #428: Remote Config fetchAndActivate 완료 신호. 완료 후에만 강제 업데이트 게이트를
  // 평가해 활성화된 최소지원버전을 반영한다(실패해도 finally로 켜서, 기본값 폴백 →
  // 게이트 미발동을 보장).
  const [remoteConfigReady, setRemoteConfigReady] = useState(false);

  useEffect(() => {
    void initializeMobileFirebaseServices().finally(() => setRemoteConfigReady(true));
  }, []);

  useEffect(() => {
    void ensureMobilePlatformSession();
    startMobilePlatformEvents();
    const subscription = AppState.addEventListener('change', (nextState) => {
      handleMobilePlatformAppStateChange(nextState);
    });
    return () => {
      subscription.remove();
      void shutdownMobilePlatformEvents();
    };
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
        adFreePurchase={adFreePurchase}
        analytics={mobileFarmAnalytics}
        art={mobileFarmArt}
        audio={farmAudio}
        cloudSave={mobileCloudSave}
        market="mobile"
        notifications={mobileHarvestNotifications}
        persistence={mobileFarmPersistence}
        preferredLocale={detectRuntimeLocale()}
        useRewardedAd={useAdMobRewardedAd}
      />
      <ForceUpdateGate remoteConfigReady={remoteConfigReady} />
    </SafeAreaProvider>
  );
}

export default App;
