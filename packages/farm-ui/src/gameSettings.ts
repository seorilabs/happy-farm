import { DEFAULT_LOCALE, normalizeLocale, type SupportedLocale } from '../../farm-core/src';

export type FarmGameSettings = {
  locale: SupportedLocale;
  soundEffectsEnabled: boolean;
  backgroundMusicEnabled: boolean;
  harvestNotificationsEnabled: boolean;
  // 복귀 유도 리마인더(데일리 보너스 쿨다운 만료·오늘의 작물 갱신). 수확 알림과 별개 토글이라 충돌 없음.
  comebackRemindersEnabled: boolean;
};

export const FARM_GAME_SETTINGS_KEY = 'happy-farm:settings:v1';

export const DEFAULT_FARM_GAME_SETTINGS: FarmGameSettings = {
  locale: DEFAULT_LOCALE,
  soundEffectsEnabled: true,
  backgroundMusicEnabled: false,
  harvestNotificationsEnabled: false,
  comebackRemindersEnabled: false,
};

export function normalizeFarmGameSettings(
  value: Partial<FarmGameSettings> | null | undefined,
  defaultLocale: SupportedLocale = DEFAULT_LOCALE
): FarmGameSettings {
  return {
    locale: value?.locale == null ? defaultLocale : normalizeLocale(value.locale),
    soundEffectsEnabled:
      typeof value?.soundEffectsEnabled === 'boolean'
        ? value.soundEffectsEnabled
        : DEFAULT_FARM_GAME_SETTINGS.soundEffectsEnabled,
    backgroundMusicEnabled:
      typeof value?.backgroundMusicEnabled === 'boolean'
        ? value.backgroundMusicEnabled
        : DEFAULT_FARM_GAME_SETTINGS.backgroundMusicEnabled,
    harvestNotificationsEnabled:
      typeof value?.harvestNotificationsEnabled === 'boolean'
        ? value.harvestNotificationsEnabled
        : DEFAULT_FARM_GAME_SETTINGS.harvestNotificationsEnabled,
    comebackRemindersEnabled:
      typeof value?.comebackRemindersEnabled === 'boolean'
        ? value.comebackRemindersEnabled
        : DEFAULT_FARM_GAME_SETTINGS.comebackRemindersEnabled,
  };
}
