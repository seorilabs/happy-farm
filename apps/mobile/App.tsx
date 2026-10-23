import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  FarmGame,
  FarmStartup,
  FarmUpdateGate,
  type FarmUpdateNotice,
} from '../../packages/farm-ui/src';
import { RELEASE_INFO, type SupportedLocale } from '../../packages/farm-core/src';
import { openAdDataPolicy, shouldShowAdInfoSettings } from './src/ads/adDataPolicy';
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
import { detectMobileRuntimeLocale } from './src/locale';
import {
  ensureMobilePlatformSession,
  handleMobilePlatformAppStateChange,
  shutdownMobilePlatformEvents,
  startMobilePlatformEvents,
  mobileUpdateGate,
} from './src/platformEvents';

function updateGateAnalytics(state: FarmUpdateNotice) {
  return { buildNumber: RELEASE_INFO.buildNumber, platform: Platform.OS, gateKind: state.kind, recommendedVersion: state.kind === 'maintenance' ? undefined : state.recommendedVersion };
}

function App() {
  const farmAudio = useMobileFarmAudio();
  const [adPrivacyOptionsRequired, setAdPrivacyOptionsRequired] = useState(false);
  const [isFarmStarted, setIsFarmStarted] = useState(false);
  const [gateLocale, setGateLocale] = useState<SupportedLocale>(detectMobileRuntimeLocale);
  const [gateReady, setGateReady] = useState(false);
  const handleSettingsReady = useCallback((locale: SupportedLocale) => { setGateLocale(locale); setGateReady(true); }, []);

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
      openAdDataPolicy,
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
      <FarmUpdateGate controller={mobileUpdateGate} locale={gateLocale} enabled={gateReady} hosted={isFarmStarted}
        openUrl={(url) => Linking.openURL(url)}
        onShown={(state) => mobileFarmAnalytics.trackUpdateGateShown(updateGateAnalytics(state))}
        onStoreClick={(state) => mobileFarmAnalytics.trackUpdateGateStoreClick(updateGateAnalytics(state))}>
      {(updateGate) => (
      <FarmStartup
        persistence={mobileFarmPersistence}
        preferredLocale={detectMobileRuntimeLocale()}
        art={mobileTitleArt}
        onStart={() => setIsFarmStarted(true)}
        onSettingsReady={handleSettingsReady}
      >
        {(startupSnapshot) => (
          <FarmGame
            startupSnapshot={startupSnapshot}
            updateGate={updateGate}
            onLocaleChange={setGateLocale}
            analytics={mobileFarmAnalytics}
            art={mobileFarmArt}
            audio={farmAudio}
            market="mobile"
            notifications={mobileHarvestNotifications}
            persistence={mobileFarmPersistence}
            privacySettings={shouldShowAdInfoSettings(Platform.OS) ? privacySettings : undefined}
            preferredLocale={detectMobileRuntimeLocale()}
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
      )}
      </FarmUpdateGate>
    </SafeAreaProvider>
  );
}

export default App;
