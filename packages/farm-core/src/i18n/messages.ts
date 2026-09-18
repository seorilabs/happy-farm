import { DEFAULT_LOCALE, type SupportedLocale } from './locales';

const KO_CORE_MESSAGES = {
  harvestedCropRequirement: (current: number, required: number) => `수확 작물 ${current}/${required}종`,
  researchLevelRequired: (level: number) => `연구 Lv.${level} 필요`,
  researchNodeRequired: (nodeName: string) => `${nodeName} 해금 필요`,
  adDailyLimitReached: '오늘 이용 가능한 횟수를 모두 사용했어요.',
  rewardedGoldCooldown: (duration: string) => `${duration} 후 다시 받을 수 있어요.`,
  adCooldown: (duration: string) => `${duration} 후 다시 사용할 수 있어요.`,
  harvestBonusPromptCooldown: (duration: string) => `${duration} 후 다시 제안돼요.`,
};

type CoreMessages = typeof KO_CORE_MESSAGES;

const EN_CORE_MESSAGES: CoreMessages = {
  harvestedCropRequirement: (current, required) => `${current}/${required} crops harvested`,
  researchLevelRequired: (level) => `Research Lv.${level} required`,
  researchNodeRequired: (nodeName) => `Requires ${nodeName}`,
  adDailyLimitReached: 'You have used all available attempts for today.',
  rewardedGoldCooldown: (duration) => `Try again in ${duration}.`,
  adCooldown: (duration) => `Available again in ${duration}.`,
  harvestBonusPromptCooldown: (duration) => `Offered again in ${duration}.`,
};

const JA_CORE_MESSAGES: CoreMessages = {
  harvestedCropRequirement: (current, required) => `作物 ${current}/${required}種を収穫`,
  researchLevelRequired: (level) => `研究 Lv.${level} が必要`,
  researchNodeRequired: (nodeName) => `${nodeName}の解放が必要`,
  adDailyLimitReached: '本日の利用回数をすべて使い切りました。',
  rewardedGoldCooldown: (duration) => `${duration}後にまた受け取れます。`,
  adCooldown: (duration) => `${duration}後にまた使えます。`,
  harvestBonusPromptCooldown: (duration) => `${duration}後にまた提案されます。`,
};

const ZH_HANS_CORE_MESSAGES: CoreMessages = {
  harvestedCropRequirement: (current, required) => `已收获作物 ${current}/${required} 种`,
  researchLevelRequired: (level) => `需要研究 Lv.${level}`,
  researchNodeRequired: (nodeName) => `需要解锁「${nodeName}」`,
  adDailyLimitReached: '今天的可用次数已全部用完。',
  rewardedGoldCooldown: (duration) => `${duration}后可再次领取。`,
  adCooldown: (duration) => `${duration}后可再次使用。`,
  harvestBonusPromptCooldown: (duration) => `${duration}后会再次提示。`,
};

const ZH_HANT_CORE_MESSAGES: CoreMessages = {
  harvestedCropRequirement: (current, required) => `已收成作物 ${current}/${required} 種`,
  researchLevelRequired: (level) => `需要研究 Lv.${level}`,
  researchNodeRequired: (nodeName) => `需要解鎖「${nodeName}」`,
  adDailyLimitReached: '今日的可用次數已全部用完。',
  rewardedGoldCooldown: (duration) => `${duration}後可再次領取。`,
  adCooldown: (duration) => `${duration}後可再次使用。`,
  harvestBonusPromptCooldown: (duration) => `${duration}後會再次提示。`,
};

const DE_CORE_MESSAGES: CoreMessages = {
  harvestedCropRequirement: (current, required) => `${current}/${required} Feldfrüchte geerntet`,
  researchLevelRequired: (level) => `Forschung Lv.${level} erforderlich`,
  researchNodeRequired: (nodeName) => `Erfordert „${nodeName}“`,
  adDailyLimitReached: 'Du hast heute alle verfügbaren Versuche aufgebraucht.',
  rewardedGoldCooldown: (duration) => `In ${duration} erneut verfügbar.`,
  adCooldown: (duration) => `In ${duration} wieder verfügbar.`,
  harvestBonusPromptCooldown: (duration) => `Wird in ${duration} erneut angeboten.`,
};

const FR_CORE_MESSAGES: CoreMessages = {
  harvestedCropRequirement: (current, required) => `${current}/${required} cultures récoltées`,
  researchLevelRequired: (level) => `Recherche niv. ${level} requise`,
  researchNodeRequired: (nodeName) => `Nécessite « ${nodeName} »`,
  adDailyLimitReached: 'Vous avez utilisé toutes les tentatives disponibles aujourd’hui.',
  rewardedGoldCooldown: (duration) => `Réessayez dans ${duration}.`,
  adCooldown: (duration) => `De nouveau disponible dans ${duration}.`,
  harvestBonusPromptCooldown: (duration) => `Proposé à nouveau dans ${duration}.`,
};

const ES_CORE_MESSAGES: CoreMessages = {
  harvestedCropRequirement: (current, required) => `${current}/${required} cultivos cosechados`,
  researchLevelRequired: (level) => `Se requiere Investigación Nv. ${level}`,
  researchNodeRequired: (nodeName) => `Requiere «${nodeName}»`,
  adDailyLimitReached: 'Has usado todos los intentos disponibles de hoy.',
  rewardedGoldCooldown: (duration) => `Vuelve a intentarlo en ${duration}.`,
  adCooldown: (duration) => `Disponible de nuevo en ${duration}.`,
  harvestBonusPromptCooldown: (duration) => `Se ofrecerá de nuevo en ${duration}.`,
};

const CORE_MESSAGES: Record<SupportedLocale, CoreMessages> = {
  'ko-KR': KO_CORE_MESSAGES,
  'en-US': EN_CORE_MESSAGES,
  ja: JA_CORE_MESSAGES,
  'zh-Hans': ZH_HANS_CORE_MESSAGES,
  'zh-Hant': ZH_HANT_CORE_MESSAGES,
  de: DE_CORE_MESSAGES,
  fr: FR_CORE_MESSAGES,
  es: ES_CORE_MESSAGES,
};

export function getCoreMessages(locale: SupportedLocale = DEFAULT_LOCALE) {
  return CORE_MESSAGES[locale] ?? CORE_MESSAGES[DEFAULT_LOCALE];
}
