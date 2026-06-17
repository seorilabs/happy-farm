import { DEFAULT_LOCALE, type SupportedLocale } from './locales';

const KO_DAILY_BONUS_MESSAGES = {
  dailyBonusTitle: '오늘의 출석 보너스',
  dailyBonusMessage: (gold: number) => `+${gold}G를 받았어요!`,
  dailyBonusStreak: (streak: number) => `연속 ${streak}일 출석 🔥`,
};

type DailyBonusMessages = typeof KO_DAILY_BONUS_MESSAGES;

const EN_DAILY_BONUS_MESSAGES: DailyBonusMessages = {
  dailyBonusTitle: 'Daily Login Bonus',
  dailyBonusMessage: (gold: number) => `+${gold}G earned!`,
  dailyBonusStreak: (streak: number) => `${streak}-day streak 🔥`,
};

const DAILY_BONUS_MESSAGES: Record<SupportedLocale, DailyBonusMessages> = {
  'ko-KR': KO_DAILY_BONUS_MESSAGES,
  'en-US': EN_DAILY_BONUS_MESSAGES,
};

export function getDailyBonusMessages(locale: SupportedLocale = DEFAULT_LOCALE): DailyBonusMessages {
  return DAILY_BONUS_MESSAGES[locale] ?? DAILY_BONUS_MESSAGES[DEFAULT_LOCALE];
}
