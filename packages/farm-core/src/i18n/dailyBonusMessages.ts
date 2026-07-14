import { DEFAULT_LOCALE, type SupportedLocale } from './locales';

const KO_DAILY_BONUS_MESSAGES = {
  dailyBonusTitle: '오늘의 출석 보너스',
  dailyBonusMessage: (gold: number) => `+${gold}G를 받았어요!`,
  dailyBonusStreak: (streak: number) => `연속 ${streak}일 출석 🔥`,
};

type DailyBonusMessages = typeof KO_DAILY_BONUS_MESSAGES;

const EN_DAILY_BONUS_MESSAGES: DailyBonusMessages = {
  dailyBonusTitle: 'Daily Login Bonus',
  dailyBonusMessage: (gold) => `+${gold}G earned!`,
  dailyBonusStreak: (streak) => `${streak}-day streak 🔥`,
};

const JA_DAILY_BONUS_MESSAGES: DailyBonusMessages = {
  dailyBonusTitle: '本日のログインボーナス',
  dailyBonusMessage: (gold) => `+${gold}Gを受け取りました！`,
  dailyBonusStreak: (streak) => `${streak}日連続ログイン 🔥`,
};

const ZH_HANS_DAILY_BONUS_MESSAGES: DailyBonusMessages = {
  dailyBonusTitle: '今日签到奖励',
  dailyBonusMessage: (gold) => `已获得 +${gold}G！`,
  dailyBonusStreak: (streak) => `连续签到 ${streak} 天 🔥`,
};

const ZH_HANT_DAILY_BONUS_MESSAGES: DailyBonusMessages = {
  dailyBonusTitle: '今日簽到獎勵',
  dailyBonusMessage: (gold) => `已獲得 +${gold}G！`,
  dailyBonusStreak: (streak) => `連續簽到 ${streak} 天 🔥`,
};

const DE_DAILY_BONUS_MESSAGES: DailyBonusMessages = {
  dailyBonusTitle: 'Täglicher Login-Bonus',
  dailyBonusMessage: (gold) => `+${gold}G erhalten!`,
  dailyBonusStreak: (streak) => `${streak} Tage in Folge 🔥`,
};

const FR_DAILY_BONUS_MESSAGES: DailyBonusMessages = {
  dailyBonusTitle: 'Bonus de connexion quotidien',
  dailyBonusMessage: (gold) => `+${gold}G reçus !`,
  dailyBonusStreak: (streak) => `Série de ${streak} jours 🔥`,
};

const ES_DAILY_BONUS_MESSAGES: DailyBonusMessages = {
  dailyBonusTitle: 'Bono de inicio de sesión diario',
  dailyBonusMessage: (gold) => `¡+${gold}G obtenidos!`,
  dailyBonusStreak: (streak) => `Racha de ${streak} días 🔥`,
};

const DAILY_BONUS_MESSAGES: Record<SupportedLocale, DailyBonusMessages> = {
  'ko-KR': KO_DAILY_BONUS_MESSAGES,
  'en-US': EN_DAILY_BONUS_MESSAGES,
  ja: JA_DAILY_BONUS_MESSAGES,
  'zh-Hans': ZH_HANS_DAILY_BONUS_MESSAGES,
  'zh-Hant': ZH_HANT_DAILY_BONUS_MESSAGES,
  de: DE_DAILY_BONUS_MESSAGES,
  fr: FR_DAILY_BONUS_MESSAGES,
  es: ES_DAILY_BONUS_MESSAGES,
};

export function getDailyBonusMessages(locale: SupportedLocale = DEFAULT_LOCALE): DailyBonusMessages {
  return DAILY_BONUS_MESSAGES[locale] ?? DAILY_BONUS_MESSAGES[DEFAULT_LOCALE];
}
