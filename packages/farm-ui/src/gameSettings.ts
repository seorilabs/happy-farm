import { DEFAULT_LOCALE, normalizeLocale, type SupportedLocale } from '../../farm-core/src';

export type FarmGameSettings = {
  locale: SupportedLocale;
  soundEffectsEnabled: boolean;
  backgroundMusicEnabled: boolean;
};

export const FARM_GAME_SETTINGS_KEY = 'happy-farm:settings:v1';

export const DEFAULT_FARM_GAME_SETTINGS: FarmGameSettings = {
  locale: DEFAULT_LOCALE,
  soundEffectsEnabled: true,
  backgroundMusicEnabled: false,
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
  };
}
