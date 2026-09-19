import mobileAds, {
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
  type AdsConsentInfo,
} from 'react-native-google-mobile-ads';

import { logDevWarning } from '../../../../packages/farm-core/src';

let consentPromise: Promise<AdsConsentInfo | null> | null = null;
let initializationPromise: Promise<boolean> | null = null;

async function currentConsentInfoAfterFailure(error: unknown) {
  logDevWarning('[ads] consent update failed', error);
  try {
    return await AdsConsent.getConsentInfo();
  } catch (readError) {
    logDevWarning('[ads] consent state read failed', readError);
    return null;
  }
}

export function requestAdMobConsent() {
  if (consentPromise == null) {
    // UMP requires a fresh status update on every app launch. Rewarded and
    // interstitial controllers share this promise so only one form can open.
    consentPromise = AdsConsent.gatherConsent().catch(currentConsentInfoAfterFailure);
  }
  return consentPromise;
}

export async function ensureAdMobReady() {
  if (initializationPromise != null) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const consentInfo = await requestAdMobConsent();
    if (consentInfo?.canRequestAds !== true) {
      return false;
    }
    try {
      await mobileAds().initialize();
      return true;
    } catch (error) {
      logDevWarning('[ads] initialize failed', error);
      return false;
    }
  })();

  return initializationPromise;
}

export async function isAdMobPrivacyOptionsRequired() {
  const consentInfo = await requestAdMobConsent();
  return (
    consentInfo?.privacyOptionsRequirementStatus ===
    AdsConsentPrivacyOptionsRequirementStatus.REQUIRED
  );
}

export async function showAdMobPrivacyOptions() {
  const consentInfo = await requestAdMobConsent();
  if (
    consentInfo?.privacyOptionsRequirementStatus !==
    AdsConsentPrivacyOptionsRequirementStatus.REQUIRED
  ) {
    return false;
  }
  const updatedInfo = await AdsConsent.showPrivacyOptionsForm();
  consentPromise = Promise.resolve(updatedInfo);
  return true;
}

export function resetAdMobConsentStateForTests() {
  consentPromise = null;
  initializationPromise = null;
}
