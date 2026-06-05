import { DEFAULT_LOCALE, type SupportedLocale } from './locales';

const KO_CORE_MESSAGES = {
  harvestedCropRequirement: (current: number, required: number) => `수확 작물 ${current}/${required}종`,
  researchLevelRequired: (level: number) => `연구 Lv.${level} 필요`,
  adDailyLimitReached: '오늘 이용 가능한 횟수를 모두 사용했어요.',
  rewardedGoldCooldown: (duration: string) => `${duration} 후 다시 받을 수 있어요.`,
  adCooldown: (duration: string) => `${duration} 후 다시 사용할 수 있어요.`,
  harvestBonusPromptCooldown: (duration: string) => `${duration} 후 다시 제안돼요.`,
};

type CoreMessages = typeof KO_CORE_MESSAGES;

const EN_CORE_MESSAGES: CoreMessages = {
  harvestedCropRequirement: (current, required) => `${current}/${required} crops harvested`,
  researchLevelRequired: (level) => `Research Lv.${level} required`,
  adDailyLimitReached: 'You have used all available attempts for today.',
  rewardedGoldCooldown: (duration) => `Try again in ${duration}.`,
  adCooldown: (duration) => `Available again in ${duration}.`,
  harvestBonusPromptCooldown: (duration) => `Offered again in ${duration}.`,
};

const CORE_MESSAGES: Record<SupportedLocale, CoreMessages> = {
  'ko-KR': KO_CORE_MESSAGES,
  'en-US': EN_CORE_MESSAGES,
};

export function getCoreMessages(locale: SupportedLocale = DEFAULT_LOCALE) {
  return CORE_MESSAGES[locale] ?? CORE_MESSAGES[DEFAULT_LOCALE];
}
