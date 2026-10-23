import { createRoute } from '@granite-js/react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { Linking } from 'react-native';
import { FarmGame, FarmStartup, FarmUpdateGate, detectRuntimeLocale, type FarmGameAdGroupIds, type FarmUpdateNotice } from '../../../../packages/farm-ui/src';
import { RELEASE_INFO, type SupportedLocale } from '../../../../packages/farm-core/src';
import { appsInTossUpdateGate } from '../platformEvents';
import { appsInTossFarmAnalytics } from '../firebaseWeb';
import { trackAppsInTossAnalyticsEvent } from '../firebaseWeb/analytics';
import { appsInTossFarmArt } from '../farm/platform/appsInTossArt';
import { appsInTossTitleArt } from '../farm/platform/titleArt.generated';
import { useAppsInTossFarmAudio } from '../farm/platform/appsInTossAudio';
import { useFullScreenAd } from '../farm/platform/fullScreenAd';
import { useAppsInTossScreenAwake } from '../farm/platform/screenAwake';
import {
  readLastSeenAt,
  readPersistedGameSettings,
  readPersistedGameState,
  removePersistedGameState,
  writeLastSeenAt,
  writePersistedGameSettings,
  writePersistedGameState,
} from '../farm/storage';

const APPS_IN_TOSS_REWARDED_AD_GROUP_ID = 'ait.v2.live.6fc77adf3f034cd6';
// 전면 광고 그룹. 보상형과 같은 공개 식별자라 코드에 둔다.
//
// 복귀(welcome-back)·진행 마일스톤·일괄 수확 세 지면이 이 그룹 하나를 공유한다.
// 지면별 빈도는 FarmGame 쪽 백오프가 정하고, 세 지면이 같은 타임라인을 쓰므로
// 수확과 해금이 연달아 일어나도 광고가 붙어서 뜨지 않는다.
const APPS_IN_TOSS_INTERSTITIAL_AD_GROUP_ID = 'ait.v2.live.521b503408b94852';

function useAppsInTossRewardedAd(adGroupId?: string) {
  return useFullScreenAd(adGroupId, {
    adFormat: 'rewarded',
    track: trackAppsInTossAnalyticsEvent,
  });
}

function useAppsInTossInterstitialAd(adGroupId?: string) {
  return useFullScreenAd(adGroupId, {
    adFormat: 'interstitial',
    track: trackAppsInTossAnalyticsEvent,
  });
}

export const Route = createRoute('/', {
  component: Page,
});

const appsInTossPersistence = {
  readPersistedGameState,
  writePersistedGameState,
  removePersistedGameState,
  readPersistedGameSettings,
  writePersistedGameSettings,
  readLastSeenAt,
  writeLastSeenAt,
};

function updateGateAnalytics(state: FarmUpdateNotice) {
  return { buildNumber: RELEASE_INFO.buildNumber, platform: 'ait', gateKind: state.kind, recommendedVersion: state.kind === 'maintenance' ? undefined : state.recommendedVersion };
}

function Page() {
  const { audio, audioElement } = useAppsInTossFarmAudio();
  useAppsInTossScreenAwake();
  const [isFarmStarted, setIsFarmStarted] = useState(false);
  const [gateLocale, setGateLocale] = useState<SupportedLocale>(detectRuntimeLocale);
  const [gateReady, setGateReady] = useState(false);
  const handleSettingsReady = useCallback((locale: SupportedLocale) => { setGateLocale(locale); setGateReady(true); }, []);
  const adGroupIds = useMemo<FarmGameAdGroupIds>(
    () => ({
      rewarded: APPS_IN_TOSS_REWARDED_AD_GROUP_ID,
      interstitial: APPS_IN_TOSS_INTERSTITIAL_AD_GROUP_ID,
    }),
    []
  );

  return (
    <>
      <FarmUpdateGate controller={appsInTossUpdateGate} locale={gateLocale} enabled={gateReady} hosted={isFarmStarted}
        openUrl={(url) => Linking.openURL(url)}
        onShown={(state) => appsInTossFarmAnalytics.trackUpdateGateShown(updateGateAnalytics(state))}
        onStoreClick={(state) => appsInTossFarmAnalytics.trackUpdateGateStoreClick(updateGateAnalytics(state))}>
      {(updateGate) => (
      <FarmStartup persistence={appsInTossPersistence} preferredLocale={detectRuntimeLocale()} art={appsInTossTitleArt} onSettingsReady={handleSettingsReady} onStart={() => setIsFarmStarted(true)}>
        {(startupSnapshot) => (
          <FarmGame
            startupSnapshot={startupSnapshot}
            updateGate={updateGate}
            onLocaleChange={setGateLocale}
            analytics={appsInTossFarmAnalytics}
            adGroupIds={adGroupIds}
            art={appsInTossFarmArt}
            audio={audio}
            interstitialPlacements={{
              returnWelcomeBack: true,
              progressionMilestone: true,
              harvestBatch: true,
            }}
            persistence={appsInTossPersistence}
            preferredLocale={detectRuntimeLocale()}
            useInterstitialAd={useAppsInTossInterstitialAd}
            useRewardedAd={useAppsInTossRewardedAd}
          />
        )}
      </FarmStartup>
      )}
      </FarmUpdateGate>
      {audioElement}
    </>
  );
}
