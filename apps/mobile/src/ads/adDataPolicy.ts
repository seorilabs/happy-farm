import { Linking } from 'react-native';

import { logDevWarning, type SupportedLocale } from '../../../../packages/farm-core/src';

// Google's own page on how it uses data from partner apps. The app links here,
// not to the Seorilabs site, because that site shows its own analytics consent prompt.
const POLICY_URL = 'https://policies.google.com/technologies/partner-sites';

const GOOGLE_LANGUAGE: Record<SupportedLocale, string> = {
  'ko-KR': 'ko',
  'en-US': 'en',
  ja: 'ja',
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
  de: 'de',
  fr: 'fr',
  es: 'es',
};

// The iOS settings carry no ad data section: the owner decided Google's data-use wording
// must not appear in the iPhone app (2026-10-14). Android keeps it next to the UMP options.
export function shouldShowAdInfoSettings(os: string) {
  return os === 'android';
}

export function getAdDataPolicyUrl(locale: SupportedLocale) {
  return `${POLICY_URL}?hl=${GOOGLE_LANGUAGE[locale]}`;
}

export async function openAdDataPolicy(locale: SupportedLocale) {
  try {
    await Linking.openURL(getAdDataPolicyUrl(locale));
  } catch (error) {
    logDevWarning('[ads] ad data policy link failed', error);
  }
}
