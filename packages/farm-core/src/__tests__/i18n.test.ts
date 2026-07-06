import {
  CROPS,
  createInitialState,
  formatDuration,
  formatMoney,
  getAreaLabel,
  getAreaUnlockRequirementText,
  getCropLabel,
  getRewardedAdLimitStatus,
  normalizeLocale,
  type CropKey,
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

  test('모든 작물에 ko/en 도감 플레이버 설명이 채워져 있다 (#253)', () => {
    const cropKeys = Object.keys(CROPS) as CropKey[];
    expect(cropKeys.length).toBeGreaterThan(0);
    for (const cropKey of cropKeys) {
      for (const locale of ['ko-KR', 'en-US'] as const) {
        const label = getCropLabel(cropKey, locale);
        // 설명은 비어 있지 않고, 이름과 구별되는 별도 플레이버여야 한다.
        expect(label.description.trim().length).toBeGreaterThan(0);
        expect(label.description).not.toBe(label.name);
      }
    }
  });

  test('도감 설명이 로케일별로 다르게 현지화돼 있다 (#253)', () => {
    expect(getCropLabel('carrot', 'ko-KR').description).not.toBe(
      getCropLabel('carrot', 'en-US').description
    );
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
