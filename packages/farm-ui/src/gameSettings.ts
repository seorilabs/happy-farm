import { DEFAULT_LOCALE, normalizeLocale, type SupportedLocale } from '../../farm-core/src';

export type FarmGameSettings = {
  locale: SupportedLocale;
  soundEffectsEnabled: boolean;
  backgroundMusicEnabled: boolean;
  // 심기·수확·보상 수령 등 촉각 피드백(진동) 토글. 기본 on이라 기존 동작을 유지.
  hapticsEnabled: boolean;
  harvestNotificationsEnabled: boolean;
  // 복귀 유도 리마인더(데일리 보너스 쿨다운 만료·오늘의 작물 갱신). 수확 알림과 별개 토글이라 충돌 없음.
  comebackRemindersEnabled: boolean;
};

export const FARM_GAME_SETTINGS_KEY = 'happy-farm:settings:v1';

export const DEFAULT_FARM_GAME_SETTINGS: FarmGameSettings = {
  locale: DEFAULT_LOCALE,
  soundEffectsEnabled: true,
  // 배경음악 기본 off 유지: 브라우저/Granite(AIT)는 사용자 제스처 없는 오디오
  // 자동재생을 차단하고, 갑작스러운 BGM은 첫 진입 인상을 해칠 수 있어 옵트인이 안전.
  backgroundMusicEnabled: false,
  hapticsEnabled: true,
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
    hapticsEnabled:
      typeof value?.hapticsEnabled === 'boolean'
        ? value.hapticsEnabled
        : DEFAULT_FARM_GAME_SETTINGS.hapticsEnabled,
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
