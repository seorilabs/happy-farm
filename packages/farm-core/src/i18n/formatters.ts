import { DEFAULT_LOCALE, type SupportedLocale } from './locales';

const KOREAN_MONEY_UNITS = [
  { value: 1e24, suffix: '자' },
  { value: 1e20, suffix: '해' },
  { value: 1e16, suffix: '경' },
  { value: 1e12, suffix: '조' },
  { value: 1e8, suffix: '억' },
  { value: 1e4, suffix: '만' },
] as const;

const ENGLISH_MONEY_UNITS = [
  { value: 1e24, suffix: 'Sp' },
  { value: 1e21, suffix: 'Sx' },
  { value: 1e18, suffix: 'Qi' },
  { value: 1e15, suffix: 'Qa' },
  { value: 1e12, suffix: 'T' },
  { value: 1e9, suffix: 'B' },
  { value: 1e6, suffix: 'M' },
  { value: 1e3, suffix: 'K' },
] as const;

function formatCompactAmount(amount: number, unit: { value: number; suffix: string }) {
  const scaled = amount / unit.value;
  const fractionDigits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
  return `${scaled.toFixed(fractionDigits).replace(/\.0+$|(\.\d*[1-9])0+$/, '$1')}${unit.suffix}`;
}

export function formatMoney(amount: number, locale: SupportedLocale = DEFAULT_LOCALE) {
  if (!Number.isFinite(amount)) return '0';

  const absAmount = Math.abs(amount);
  const units = locale === 'en-US' ? ENGLISH_MONEY_UNITS : KOREAN_MONEY_UNITS;

  for (const unit of units) {
    if (absAmount >= unit.value) {
      return formatCompactAmount(amount, unit);
    }
  }

  return Math.floor(amount).toLocaleString(locale);
}

export function formatDuration(ms: number, locale: SupportedLocale = DEFAULT_LOCALE) {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds < 60) {
    return locale === 'en-US' ? `${seconds}s` : `${seconds}초`;
  }

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return locale === 'en-US' ? `${minutes}m` : `${minutes}분`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (locale === 'en-US') {
    return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
  }
  return remainingMinutes === 0 ? `${hours}시간` : `${hours}시간 ${remainingMinutes}분`;
}

export function formatRemainingTime(ms: number, locale: SupportedLocale = DEFAULT_LOCALE) {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) {
    return locale === 'en-US' ? `${seconds}s` : `${seconds}초`;
  }
  const minutes = Math.ceil(seconds / 60);
  return locale === 'en-US' ? `${minutes}m` : `${minutes}분`;
}

export function formatSignedPercent(value: number, locale: SupportedLocale = DEFAULT_LOCALE) {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? '+' : ''}${rounded.toLocaleString(locale)}%`;
}

export function formatHourlyGold(value: number, locale: SupportedLocale = DEFAULT_LOCALE) {
  const amount = formatMoney(Math.max(0, value), locale);
  return locale === 'en-US' ? `${amount}G/hr` : `${amount}G/시간`;
}
