import { DEFAULT_LOCALE, normalizeLocale, type SupportedLocale } from '../../../farm-core/src';
import { deFarmMessages } from './messages/de';
import { enFarmMessages } from './messages/en-US';
import { esFarmMessages } from './messages/es';
import { frFarmMessages } from './messages/fr';
import { jaFarmMessages } from './messages/ja';
import { koFarmMessages, type FarmMessages } from './messages/ko-KR';
import { zhHansFarmMessages } from './messages/zh-Hans';
import { zhHantFarmMessages } from './messages/zh-Hant';

export type { FarmMessages } from './messages/ko-KR';

export function detectRuntimeLocale(): SupportedLocale {
  try {
    return normalizeLocale(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return DEFAULT_LOCALE;
  }
}

// 전 로케일 FarmGame UI 문구 조립점. 새 로케일은 여기에 한 줄 추가하면 되고,
// FarmMessages 타입(ko 기준)이 각 로케일의 key 커버리지를 컴파일 타임에 강제한다.
const FARM_MESSAGES: Record<SupportedLocale, FarmMessages> = {
  'ko-KR': koFarmMessages,
  'en-US': enFarmMessages,
  ja: jaFarmMessages,
  'zh-Hans': zhHansFarmMessages,
  'zh-Hant': zhHantFarmMessages,
  de: deFarmMessages,
  fr: frFarmMessages,
  es: esFarmMessages,
};

export function getFarmMessages(locale: SupportedLocale = DEFAULT_LOCALE) {
  return FARM_MESSAGES[locale] ?? FARM_MESSAGES[DEFAULT_LOCALE];
}
