import { Platform } from 'react-native';
import { TestIds } from 'react-native-google-mobile-ads';

const PRODUCTION_REWARDED_AD_UNIT_IDS = {
  android: 'ca-app-pub-9932778305312246/7956883150',
  ios: 'ca-app-pub-9932778305312246/4017638142',
} as const;

function getProductionRewardedAdUnitId() {
  return Platform.select(PRODUCTION_REWARDED_AD_UNIT_IDS) ?? '';
}

export function getRewardedAdUnitId() {
  if (__DEV__) {
    return TestIds.REWARDED;
  }

  const adUnitId = getProductionRewardedAdUnitId();
  return adUnitId.length > 0 ? adUnitId : null;
}

// 전면광고 ad unit. 보상형과 같은 게시자(pub-9932778305312246)로 발급했다.
// 비어 있으면 getInterstitialAdUnitId가 null을 돌려주고 컨트롤러가 미지원으로
// 동작해 전면 지면이 조용히 비활성된다(보상형과 같은 규칙).
const PRODUCTION_INTERSTITIAL_AD_UNIT_IDS = {
  android: 'ca-app-pub-9932778305312246/2237490915',
  ios: 'ca-app-pub-9932778305312246/6470968134',
} as const;

function getProductionInterstitialAdUnitId() {
  return Platform.select(PRODUCTION_INTERSTITIAL_AD_UNIT_IDS) ?? '';
}

export function getInterstitialAdUnitId() {
  if (__DEV__) {
    return TestIds.INTERSTITIAL;
  }

  const adUnitId = getProductionInterstitialAdUnitId();
  return adUnitId.length > 0 ? adUnitId : null;
}
