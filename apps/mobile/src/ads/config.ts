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
