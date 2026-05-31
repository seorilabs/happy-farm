export type FarmGameSettings = {
  soundEffectsEnabled: boolean;
  backgroundMusicEnabled: boolean;
};

export const FARM_GAME_SETTINGS_KEY = 'happy-farm:settings:v1';

export const DEFAULT_FARM_GAME_SETTINGS: FarmGameSettings = {
  soundEffectsEnabled: true,
  backgroundMusicEnabled: false,
};

export function normalizeFarmGameSettings(value: Partial<FarmGameSettings> | null | undefined): FarmGameSettings {
  return {
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
