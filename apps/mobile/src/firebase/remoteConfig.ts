import {
  fetchAndActivate,
  getBoolean,
  getNumber,
  getRemoteConfig,
  getString,
  setConfigSettings,
  setDefaults,
} from '@react-native-firebase/remote-config';

import { applyAdLimitsOverrides, parseAdLimitsOverrides } from '../../../../packages/farm-core/src';
import { isFirebaseConfigured } from './app';
import { recordNonFatalError } from './crashlytics';

export const MOBILE_REMOTE_CONFIG_DEFAULTS = {
  analytics_collection_enabled: true,
  crashlytics_collection_enabled: true,
  mobile_ads_global_enabled: true,
  cloud_save_backup_enabled: false,
  minimum_supported_version_code: 1,
  force_update_url: '',
  remote_balance_enabled: false,
  // 광고 빈도·cap 오버라이드(JSON 오브젝트 문자열). 빈 문자열/무효 시 farm-core 기본값 폴백.
  ad_limits_overrides: '',
} as const;

export type MobileRemoteConfigKey = keyof typeof MOBILE_REMOTE_CONFIG_DEFAULTS;

const CONFIG_FETCH_TIMEOUT_MS = 10_000;
const DEV_MINIMUM_FETCH_INTERVAL_MS = 5 * 60 * 1000;
const RELEASE_MINIMUM_FETCH_INTERVAL_MS = 15 * 60 * 1000;

function isDevBuild() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

export async function initializeMobileRemoteConfig() {
  if (!isFirebaseConfigured()) {
    return { status: 'skipped' as const, activated: false };
  }

  try {
    const remoteConfig = getRemoteConfig();

    await setConfigSettings(remoteConfig, {
      fetchTimeMillis: CONFIG_FETCH_TIMEOUT_MS,
      minimumFetchIntervalMillis: isDevBuild() ? DEV_MINIMUM_FETCH_INTERVAL_MS : RELEASE_MINIMUM_FETCH_INTERVAL_MS,
    });
    await setDefaults(remoteConfig, MOBILE_REMOTE_CONFIG_DEFAULTS);

    const activated = await fetchAndActivate(remoteConfig);
    // 광고 빈도·cap 원격 오버라이드를 farm-core에 적용(무효/미설정 시 기본값 폴백).
    applyAdLimitsOverrides(parseAdLimitsOverrides(getRemoteString('ad_limits_overrides')));
    return { status: 'ready' as const, activated };
  } catch (error) {
    recordNonFatalError(error, 'remote_config:init');
    return { status: 'error' as const, activated: false };
  }
}

export function getRemoteBoolean(key: MobileRemoteConfigKey) {
  if (!isFirebaseConfigured()) {
    return Boolean(MOBILE_REMOTE_CONFIG_DEFAULTS[key]);
  }

  try {
    return getBoolean(getRemoteConfig(), key);
  } catch (error) {
    recordNonFatalError(error, `remote_config:boolean:${key}`);
    return Boolean(MOBILE_REMOTE_CONFIG_DEFAULTS[key]);
  }
}

export function getRemoteNumber(key: MobileRemoteConfigKey) {
  if (!isFirebaseConfigured()) {
    return Number(MOBILE_REMOTE_CONFIG_DEFAULTS[key]);
  }

  try {
    return getNumber(getRemoteConfig(), key);
  } catch (error) {
    recordNonFatalError(error, `remote_config:number:${key}`);
    return Number(MOBILE_REMOTE_CONFIG_DEFAULTS[key]);
  }
}

export function getRemoteString(key: MobileRemoteConfigKey) {
  if (!isFirebaseConfigured()) {
    return String(MOBILE_REMOTE_CONFIG_DEFAULTS[key]);
  }

  try {
    return getString(getRemoteConfig(), key);
  } catch (error) {
    recordNonFatalError(error, `remote_config:string:${key}`);
    return String(MOBILE_REMOTE_CONFIG_DEFAULTS[key]);
  }
}
