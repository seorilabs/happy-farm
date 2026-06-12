export const SUPPORTED_LOCALES = ['ko-KR', 'en-US'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'ko-KR';

export function normalizeLocale(value: string | null | undefined): SupportedLocale {
  if (value === 'en-US' || value?.toLowerCase().startsWith('en')) {
    return 'en-US';
  }
  return DEFAULT_LOCALE;
}
