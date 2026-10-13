import { Platform, Settings, TurboModuleRegistry, type TurboModule } from 'react-native';
import mobileAds, {
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
  type AdsConsentInfo,
} from 'react-native-google-mobile-ads';

import { logDevWarning } from '../../../../packages/farm-core/src';

// iOS does not track users, so it never shows Google's consent form. App Review
// rejected 1.12.0 under 5.1.2(i) because the form's cookie wording reads as
// tracking without ATT. EEA, UK and Swiss requests go out without a TC string
// and Google serves limited ads.
const usesConsentForm = () => Platform.OS !== 'ios';

// IAB TCF v2 in-app keys. The spec makes the publisher clear them when a CMP is
// removed, otherwise the ads SDK keeps reading consent the user can no longer change.
const IAB_TCF_KEYS = [
  'IABTCF_CmpSdkID',
  'IABTCF_CmpSdkVersion',
  'IABTCF_PolicyVersion',
  'IABTCF_gdprApplies',
  'IABTCF_PublisherCC',
  'IABTCF_PurposeOneTreatment',
  'IABTCF_UseNonStandardTexts',
  'IABTCF_TCString',
  'IABTCF_VendorConsents',
  'IABTCF_VendorLegitimateInterests',
  'IABTCF_DisclosedVendors',
  'IABTCF_PurposeConsents',
  'IABTCF_PurposeLegitimateInterests',
  'IABTCF_SpecialFeaturesOptIns',
  ...Array.from({ length: 11 }, (_, index) => `IABTCF_PublisherRestrictions${index + 1}`),
  'IABTCF_PublisherConsent',
  'IABTCF_PublisherLegitimateInterests',
  'IABTCF_PublisherCustomPurposesConsents',
  'IABTCF_PublisherCustomPurposesLegitimateInterests',
  'IABTCF_AddtlConsent',
];

interface SettingsManagerModule extends TurboModule {
  deleteValues: (keys: Array<string>) => void;
}

function clearStoredConsentRecord() {
  try {
    const storedKeys = IAB_TCF_KEYS.filter((key) => Settings.get(key) != null);
    if (storedKeys.length > 0) {
      // Settings.set({ key: null }) cannot remove keys on the New Architecture: the
      // TurboModule bridge drops null values before they reach NSUserDefaults.
      TurboModuleRegistry.getEnforcing<SettingsManagerModule>('SettingsManager').deleteValues(storedKeys);
    }
  } catch (error) {
    logDevWarning('[ads] consent record cleanup failed', error);
  }
}

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
    consentPromise = usesConsentForm()
      ? AdsConsent.gatherConsent().catch(currentConsentInfoAfterFailure)
      : Promise.resolve(null);
  }
  return consentPromise;
}

export async function ensureAdMobReady() {
  if (initializationPromise != null) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    if (usesConsentForm()) {
      const consentInfo = await requestAdMobConsent();
      if (consentInfo?.canRequestAds !== true) {
        return false;
      }
    } else {
      clearStoredConsentRecord();
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
