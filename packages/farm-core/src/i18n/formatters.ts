import { DEFAULT_LOCALE, type SupportedLocale } from './locales';

type MoneyUnit = { value: number; suffix: string };

// 한국어 만/억/조 단위(1만 단위 체계).
const KOREAN_MONEY_UNITS: readonly MoneyUnit[] = [
  { value: 1e24, suffix: '자' },
  { value: 1e20, suffix: '해' },
  { value: 1e16, suffix: '경' },
  { value: 1e12, suffix: '조' },
  { value: 1e8, suffix: '억' },
  { value: 1e4, suffix: '만' },
];

// 일본어 万/億/兆/京 단위(1만 단위 체계).
const JAPANESE_MONEY_UNITS: readonly MoneyUnit[] = [
  { value: 1e24, suffix: '𥝱' },
  { value: 1e20, suffix: '垓' },
  { value: 1e16, suffix: '京' },
  { value: 1e12, suffix: '兆' },
  { value: 1e8, suffix: '億' },
  { value: 1e4, suffix: '万' },
];

// 중국어 간체 万/亿/兆/京 단위(1만 단위 체계).
const CHINESE_SIMPLIFIED_MONEY_UNITS: readonly MoneyUnit[] = [
  { value: 1e24, suffix: '秭' },
  { value: 1e20, suffix: '垓' },
  { value: 1e16, suffix: '京' },
  { value: 1e12, suffix: '兆' },
  { value: 1e8, suffix: '亿' },
  { value: 1e4, suffix: '万' },
];

// 중국어 번체 萬/億/兆/京 단위(1만 단위 체계).
const CHINESE_TRADITIONAL_MONEY_UNITS: readonly MoneyUnit[] = [
  { value: 1e24, suffix: '秭' },
  { value: 1e20, suffix: '垓' },
  { value: 1e16, suffix: '京' },
  { value: 1e12, suffix: '兆' },
  { value: 1e8, suffix: '億' },
  { value: 1e4, suffix: '萬' },
];

// 영어 및 유럽어(독일어/프랑스어/스페인어)에서 방치형 게임 관용 축약 단위.
const COMPACT_MONEY_UNITS: readonly MoneyUnit[] = [
  { value: 1e24, suffix: 'Sp' },
  { value: 1e21, suffix: 'Sx' },
  { value: 1e18, suffix: 'Qi' },
  { value: 1e15, suffix: 'Qa' },
  { value: 1e12, suffix: 'T' },
  { value: 1e9, suffix: 'B' },
  { value: 1e6, suffix: 'M' },
  { value: 1e3, suffix: 'K' },
];

const MONEY_UNITS: Record<SupportedLocale, readonly MoneyUnit[]> = {
  'ko-KR': KOREAN_MONEY_UNITS,
  'en-US': COMPACT_MONEY_UNITS,
  ja: JAPANESE_MONEY_UNITS,
  'zh-Hans': CHINESE_SIMPLIFIED_MONEY_UNITS,
  'zh-Hant': CHINESE_TRADITIONAL_MONEY_UNITS,
  de: COMPACT_MONEY_UNITS,
  fr: COMPACT_MONEY_UNITS,
  es: COMPACT_MONEY_UNITS,
};

type DurationLabels = {
  seconds: (value: number) => string;
  minutes: (value: number) => string;
  hours: (hours: number, minutes: number) => string;
  hourlyGoldSuffix: string;
};

const DURATION_LABELS: Record<SupportedLocale, DurationLabels> = {
  'ko-KR': {
    seconds: (value) => `${value}초`,
    minutes: (value) => `${value}분`,
    hours: (hours, minutes) => (minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`),
    hourlyGoldSuffix: 'G/시간',
  },
  'en-US': {
    seconds: (value) => `${value}s`,
    minutes: (value) => `${value}m`,
    hours: (hours, minutes) => (minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`),
    hourlyGoldSuffix: 'G/hr',
  },
  ja: {
    seconds: (value) => `${value}秒`,
    minutes: (value) => `${value}分`,
    hours: (hours, minutes) => (minutes === 0 ? `${hours}時間` : `${hours}時間${minutes}分`),
    hourlyGoldSuffix: 'G/時間',
  },
  'zh-Hans': {
    seconds: (value) => `${value}秒`,
    minutes: (value) => `${value}分`,
    hours: (hours, minutes) => (minutes === 0 ? `${hours}小时` : `${hours}小时${minutes}分`),
    hourlyGoldSuffix: 'G/小时',
  },
  'zh-Hant': {
    seconds: (value) => `${value}秒`,
    minutes: (value) => `${value}分`,
    hours: (hours, minutes) => (minutes === 0 ? `${hours}小時` : `${hours}小時${minutes}分`),
    hourlyGoldSuffix: 'G/小時',
  },
  de: {
    seconds: (value) => `${value}s`,
    minutes: (value) => `${value}min`,
    hours: (hours, minutes) => (minutes === 0 ? `${hours}h` : `${hours}h ${minutes}min`),
    hourlyGoldSuffix: 'G/Std',
  },
  fr: {
    seconds: (value) => `${value}s`,
    minutes: (value) => `${value}min`,
    hours: (hours, minutes) => (minutes === 0 ? `${hours}h` : `${hours}h ${minutes}min`),
    hourlyGoldSuffix: 'G/h',
  },
  es: {
    seconds: (value) => `${value}s`,
    minutes: (value) => `${value}min`,
    hours: (hours, minutes) => (minutes === 0 ? `${hours}h` : `${hours}h ${minutes}min`),
    hourlyGoldSuffix: 'G/h',
  },
};

function durationLabels(locale: SupportedLocale): DurationLabels {
  return DURATION_LABELS[locale] ?? DURATION_LABELS[DEFAULT_LOCALE];
}

function formatCompactAmount(amount: number, unit: MoneyUnit) {
  const scaled = amount / unit.value;
  const fractionDigits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
  return `${scaled.toFixed(fractionDigits).replace(/\.0+$|(\.\d*[1-9])0+$/, '$1')}${unit.suffix}`;
}

export function formatMoney(amount: number, locale: SupportedLocale = DEFAULT_LOCALE) {
  if (!Number.isFinite(amount)) return '0';

  const absAmount = Math.abs(amount);
  const units = MONEY_UNITS[locale] ?? MONEY_UNITS[DEFAULT_LOCALE];

  for (const unit of units) {
    if (absAmount >= unit.value) {
      return formatCompactAmount(amount, unit);
    }
  }

  return Math.floor(amount).toLocaleString(locale);
}

export function formatDuration(ms: number, locale: SupportedLocale = DEFAULT_LOCALE) {
  const labels = durationLabels(locale);
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds < 60) {
    return labels.seconds(seconds);
  }

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return labels.minutes(minutes);
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return labels.hours(hours, remainingMinutes);
}

export function formatRemainingTime(ms: number, locale: SupportedLocale = DEFAULT_LOCALE) {
  const labels = durationLabels(locale);
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) {
    return labels.seconds(seconds);
  }
  const minutes = Math.ceil(seconds / 60);
  return labels.minutes(minutes);
}

export function formatSignedPercent(value: number, locale: SupportedLocale = DEFAULT_LOCALE) {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? '+' : ''}${rounded.toLocaleString(locale)}%`;
}

export function formatHourlyGold(value: number, locale: SupportedLocale = DEFAULT_LOCALE) {
  const amount = formatMoney(Math.max(0, value), locale);
  return `${amount}${durationLabels(locale).hourlyGoldSuffix}`;
}
