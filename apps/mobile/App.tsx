import React, { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  FarmGame,
  FarmStartup,
  detectRuntimeLocale,
} from '../../packages/farm-ui/src';
import { useAdMobInterstitialAd } from './src/ads/adMobInterstitialAd';
import { useAdMobRewardedAd } from './src/ads/adMobRewardedAd';
import {
  isAdMobPrivacyOptionsRequired,
  showAdMobPrivacyOptions,
} from './src/ads/adMobConsent';
import { mobileFarmArt } from './src/art/farmArt';
import { mobileTitleArt } from './src/art/titleArt';
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
import {
  ensureMobilePlatformSession,
  handleMobilePlatformAppStateChange,
  shutdownMobilePlatformEvents,
  startMobilePlatformEvents,
} from './src/platformEvents';

function App() {
  const farmAudio = useMobileFarmAudio();
  const [adPrivacyOptionsRequired, setAdPrivacyOptionsRequired] = useState(false);
  const [isFarmStarted, setIsFarmStarted] = useState(false);

  useEffect(() => {
    if (!isFarmStarted) return;
    let cancelled = false;
    void isAdMobPrivacyOptionsRequired().then((required) => {
      if (!cancelled) setAdPrivacyOptionsRequired(required);
    });
    return () => {
      cancelled = true;
    };
  }, [isFarmStarted]);

  const privacySettings = useMemo(
    () => ({
      isSupported: adPrivacyOptionsRequired,
      openAdPrivacyOptions: async () => {
        await showAdMobPrivacyOptions();
        setAdPrivacyOptionsRequired(await isAdMobPrivacyOptionsRequired());
      },
    }),
    [adPrivacyOptionsRequired]
  );

  useEffect(() => {
    void initializeMobileFirebaseServices();
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

  // 알림 탭으로 복귀한 경우를 계측한다(알림 동작 자체는 변경 없음). 수확 알림과 복귀
  // 리마인더를 kind 로 구분하고, 백그라운드에서 탭된 항목도 큐에서 이어받는다(#476).
  useEffect(() => {
    return registerHarvestNotificationOpenTracking((kind) => {
      mobileFarmAnalytics.trackNotificationOpened({ kind });
    });
  }, []);

  return (
    <SafeAreaProvider>
      <FarmStartup
        persistence={mobileFarmPersistence}
        preferredLocale={detectRuntimeLocale()}
        art={mobileTitleArt}
        onStart={() => setIsFarmStarted(true)}
      >
        {(startupSnapshot) => (
          <FarmGame
            startupSnapshot={startupSnapshot}
            analytics={mobileFarmAnalytics}
            art={mobileFarmArt}
            audio={farmAudio}
            market="mobile"
            notifications={mobileHarvestNotifications}
            persistence={mobileFarmPersistence}
            privacySettings={privacySettings}
            preferredLocale={detectRuntimeLocale()}
            // 세 지면 모두 연다. 프로덕션 전면 ad unit 이 아직 비어 있어
            // getInterstitialAdUnitId 가 null 을 돌려주는 동안에는 컨트롤러가
            // 미지원으로 동작해 아무것도 뜨지 않는다. 중앙 원장에 단위가 등록되고
            // config 에 값을 채우면 이 배선 그대로 노출이 시작된다.
            interstitialPlacements={{
              returnWelcomeBack: true,
              progressionMilestone: true,
              harvestBatch: true,
            }}
            useInterstitialAd={useAdMobInterstitialAd}
            useRewardedAd={useAdMobRewardedAd}
          />
        )}
      </FarmStartup>
    </SafeAreaProvider>
  );
}

export default App;
