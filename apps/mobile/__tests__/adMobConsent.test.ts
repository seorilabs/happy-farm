/**
 * @format
 */

import { Platform, Settings } from 'react-native';
import mobileAds, { AdsConsent } from 'react-native-google-mobile-ads';
import {
  ensureAdMobReady,
  isAdMobPrivacyOptionsRequired,
  resetAdMobConsentStateForTests,
  showAdMobPrivacyOptions,
} from '../src/ads/adMobConsent';

jest.mock('react-native/Libraries/Settings/Settings', () => ({
  __esModule: true,
  default: { get: jest.fn(), set: jest.fn() },
}));

jest.mock('react-native-google-mobile-ads', () => {
  const initialize = jest.fn(() => Promise.resolve());
  return {
    __esModule: true,
    default: jest.fn(() => ({ initialize })),
    AdsConsent: {
      gatherConsent: jest.fn(() =>
        Promise.resolve({ canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' })
      ),
      getConsentInfo: jest.fn(() =>
        Promise.resolve({ canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' })
      ),
      requestInfoUpdate: jest.fn(() =>
        Promise.resolve({ canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' })
      ),
      loadAndShowConsentFormIfRequired: jest.fn(() => Promise.resolve()),
      showForm: jest.fn(() => Promise.resolve()),
      showPrivacyOptionsForm: jest.fn(() =>
        Promise.resolve({ canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' })
      ),
    },
    AdsConsentPrivacyOptionsRequirementStatus: {
      NOT_REQUIRED: 'NOT_REQUIRED',
      REQUIRED: 'REQUIRED',
      UNKNOWN: 'UNKNOWN',
    },
  };
});

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

const umpCalls = () => [
  AdsConsent.gatherConsent,
  AdsConsent.getConsentInfo,
  AdsConsent.requestInfoUpdate,
  AdsConsent.loadAndShowConsentFormIfRequired,
  AdsConsent.showForm,
  AdsConsent.showPrivacyOptionsForm,
].reduce((total, fn) => total + (fn as jest.Mock).mock.calls.length, 0);

const initializeMock = () => (mobileAds as unknown as jest.Mock)().initialize as jest.Mock;

function useStoredSettings(stored: Record<string, unknown>) {
  (Settings.get as jest.Mock).mockImplementation((key: string) => stored[key]);
}

beforeEach(() => {
  jest.clearAllMocks();
  resetAdMobConsentStateForTests();
  useStoredSettings({});
});

describe('iOS', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'ios');
  });

  test('AC-1 initializes ads without asking Google UMP for consent', async () => {
    await expect(ensureAdMobReady()).resolves.toBe(true);

    expect(umpCalls()).toBe(0);
    expect(initializeMock()).toHaveBeenCalledTimes(1);
  });

  test('AC-2 never offers or opens the ad privacy options form', async () => {
    await expect(isAdMobPrivacyOptionsRequired()).resolves.toBe(false);
    await expect(showAdMobPrivacyOptions()).resolves.toBe(false);

    expect(umpCalls()).toBe(0);
  });

  test('AC-3 removes every stored IAB TCF consent record before initializing ads', async () => {
    useStoredSettings(Object.fromEntries(IAB_TCF_KEYS.map((key) => [key, 'stale'])));
    let removedBeforeInitialize = false;
    (mobileAds as unknown as jest.Mock).mockImplementationOnce(() => ({
      initialize: jest.fn(() => {
        removedBeforeInitialize = (Settings.set as jest.Mock).mock.calls.length === 1;
        return Promise.resolve();
      }),
    }));

    await expect(ensureAdMobReady()).resolves.toBe(true);
    await ensureAdMobReady();

    expect(removedBeforeInitialize).toBe(true);
    expect(Settings.set).toHaveBeenCalledTimes(1);
    expect(Settings.set).toHaveBeenCalledWith(
      Object.fromEntries(IAB_TCF_KEYS.map((key) => [key, null]))
    );
  });

  test('AC-3 leaves settings untouched when no consent record is stored', async () => {
    useStoredSettings({ unrelatedKey: 'kept' });

    await expect(ensureAdMobReady()).resolves.toBe(true);

    expect(Settings.set).not.toHaveBeenCalled();
  });

  test('AC-3 still initializes ads when removing the consent record fails', async () => {
    useStoredSettings({ IABTCF_TCString: 'stale' });
    (Settings.set as jest.Mock).mockImplementationOnce(() => {
      throw new Error('settings unavailable');
    });

    await expect(ensureAdMobReady()).resolves.toBe(true);

    expect(initializeMock()).toHaveBeenCalledTimes(1);
  });
});

describe('Android', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
  });

  test('AC-4 waits for Google UMP consent before initializing ads', async () => {
    await expect(ensureAdMobReady()).resolves.toBe(true);

    expect(AdsConsent.gatherConsent).toHaveBeenCalledTimes(1);
    expect(initializeMock()).toHaveBeenCalledTimes(1);
    expect(Settings.set).not.toHaveBeenCalled();
  });

  test('AC-4 keeps ads off when UMP does not allow ad requests', async () => {
    (AdsConsent.gatherConsent as jest.Mock).mockResolvedValueOnce({
      canRequestAds: false,
      privacyOptionsRequirementStatus: 'REQUIRED',
    });

    await expect(ensureAdMobReady()).resolves.toBe(false);

    expect(mobileAds).not.toHaveBeenCalled();
  });

  test('AC-4 offers and opens the ad privacy options form when UMP requires it', async () => {
    await expect(isAdMobPrivacyOptionsRequired()).resolves.toBe(true);
    await expect(showAdMobPrivacyOptions()).resolves.toBe(true);

    expect(AdsConsent.showPrivacyOptionsForm).toHaveBeenCalledTimes(1);
  });
});
