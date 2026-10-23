import { I18nManager, Platform, Settings } from 'react-native';

import { DEFAULT_LOCALE, normalizeLocale, type SupportedLocale } from '../../../packages/farm-core/src';

/** OS의 첫 언어를 읽는다. 저장된 사용자 선택의 우선순위는 FarmStartup이 처리한다. */
export function detectMobileRuntimeLocale(): SupportedLocale {
  try {
    let locale: unknown;
    if (Platform.OS === 'ios') {
      const languages: unknown = Settings.get('AppleLanguages');
      locale = (Array.isArray(languages)
        ? languages.find((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : undefined) ?? Settings.get('AppleLocale');
    } else if (Platform.OS === 'android') {
      locale = I18nManager.getConstants().localeIdentifier;
    }
    return normalizeLocale(typeof locale === 'string' ? locale : undefined);
  } catch {
    return DEFAULT_LOCALE;
  }
}
