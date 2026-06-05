import {
  createInitialState,
  formatDuration,
  formatMoney,
  getAreaLabel,
  getAreaUnlockRequirementText,
  getCropLabel,
  getRewardedAdLimitStatus,
  normalizeLocale,
} from '../index';

describe('farm-core i18n', () => {
  test('normalizes supported locales', () => {
    expect(normalizeLocale('en')).toBe('en-US');
    expect(normalizeLocale('en-GB')).toBe('en-US');
    expect(normalizeLocale('ko-KR')).toBe('ko-KR');
    expect(normalizeLocale('fr-FR')).toBe('ko-KR');
  });

  test('formats money and duration by locale', () => {
    expect(formatMoney(15_000, 'ko-KR')).toBe('1.5만');
    expect(formatMoney(15_000, 'en-US')).toBe('15K');
    expect(formatDuration(90_000, 'ko-KR')).toBe('2분');
    expect(formatDuration(90_000, 'en-US')).toBe('2m');
  });

  test('returns localized crop and area labels', () => {
    expect(getCropLabel('carrot', 'ko-KR').name).toBe('당근');
    expect(getCropLabel('carrot', 'en-US').name).toBe('Carrot');
    expect(getAreaLabel('fruit_field', 'ko-KR').name).toBe('풍요 밭');
    expect(getAreaLabel('fruit_field', 'en-US').name).toBe('Bloom Field');
  });

  test('localizes generated requirement and ad limit messages', () => {
    const state = createInitialState();

    expect(getAreaUnlockRequirementText(state, 'vegetable_field', 'en-US')).toContain('0/4 crops harvested');

    const blockedState = {
      ...state,
      adUsage: {
        ...state.adUsage,
        rewardedGoldDailyCount: 4,
      },
    };
    expect(getRewardedAdLimitStatus(blockedState, 'rewardedGold', Date.now(), 'en-US').reason).toBe(
      'You have used all available attempts for today.'
    );
  });
});
