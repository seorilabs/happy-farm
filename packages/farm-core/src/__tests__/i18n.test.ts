import {
  CROPS,
  SUPPORTED_LOCALES,
  createInitialState,
  formatDuration,
  formatMoney,
  getAreaLabel,
  getAreaUnlockRequirementText,
  getCropLabel,
  getCropLabels,
  getRewardedAdLimitStatus,
  normalizeLocale,
  type CropKey,
} from '../index';

describe('farm-core i18n', () => {
  test('normalizes supported locales', () => {
    expect(normalizeLocale('en')).toBe('en-US');
    expect(normalizeLocale('en-GB')).toBe('en-US');
    expect(normalizeLocale('ko-KR')).toBe('ko-KR');
    expect(normalizeLocale('ja')).toBe('ja');
    expect(normalizeLocale('ja-JP')).toBe('ja');
    expect(normalizeLocale('de-DE')).toBe('de');
    expect(normalizeLocale('fr-FR')).toBe('fr');
    expect(normalizeLocale('es-419')).toBe('es');
    // 중국어는 스크립트/지역으로 간체·번체를 가른다.
    expect(normalizeLocale('zh-Hans')).toBe('zh-Hans');
    expect(normalizeLocale('zh-CN')).toBe('zh-Hans');
    expect(normalizeLocale('zh-Hant')).toBe('zh-Hant');
    expect(normalizeLocale('zh-TW')).toBe('zh-Hant');
    expect(normalizeLocale('zh-HK')).toBe('zh-Hant');
    // 미지원 언어는 영어(FALLBACK_LOCALE)로 폴백한다.
    expect(normalizeLocale('it-IT')).toBe('en-US');
    expect(normalizeLocale(null)).toBe('en-US');
  });

  test('formats money and duration by locale', () => {
    expect(formatMoney(15_000, 'ko-KR')).toBe('1.5만');
    expect(formatMoney(15_000, 'en-US')).toBe('15K');
    expect(formatMoney(15_000, 'ja')).toBe('1.5万');
    expect(formatMoney(150_000_000, 'zh-Hans')).toBe('1.5亿');
    expect(formatMoney(150_000_000, 'zh-Hant')).toBe('1.5億');
    expect(formatMoney(15_000, 'de')).toBe('15K');
    expect(formatDuration(90_000, 'ko-KR')).toBe('2분');
    expect(formatDuration(90_000, 'en-US')).toBe('2m');
    expect(formatDuration(90_000, 'ja')).toBe('2分');
    expect(formatDuration(90_000, 'fr')).toBe('2min');
    // 모든 지원 로케일에서 포맷터가 비어 있지 않은 문자열을 반환한다.
    for (const locale of SUPPORTED_LOCALES) {
      expect(formatMoney(1_234_567, locale).length).toBeGreaterThan(0);
      expect(formatDuration(3_723_000, locale).length).toBeGreaterThan(0);
    }
  });

  test('returns localized crop and area labels', () => {
    expect(getCropLabel('carrot', 'ko-KR').name).toBe('당근');
    expect(getCropLabel('carrot', 'en-US').name).toBe('Carrot');
    expect(getAreaLabel('fruit_field', 'ko-KR').name).toBe('풍요 밭');
    expect(getAreaLabel('fruit_field', 'en-US').name).toBe('Bloom Field');
  });

  test('모든 작물에 전 로케일 도감 플레이버 설명이 채워져 있다 (#253)', () => {
    const cropKeys = Object.keys(CROPS) as CropKey[];
    // 인수조건이 약속한 정확한 작물 수(47종)를 단언해, 향후 작물 추가 시 이 테스트가
    // 반드시 함께 갱신되도록 강제한다(신규 종 설명 누락 침묵 통과 방지).
    expect(cropKeys.length).toBe(47);
    for (const cropKey of cropKeys) {
      for (const locale of SUPPORTED_LOCALES) {
        const label = getCropLabel(cropKey, locale);
        // 설명은 비어 있지 않고, 이름과 구별되는 별도 플레이버여야 한다.
        expect(label.description.trim().length).toBeGreaterThan(0);
        expect(label.description).not.toBe(label.name);
        expect(label.name.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test('작물 라벨 키 집합이 CROPS와 전 로케일에서 양방향으로 일치한다 (#253)', () => {
    const cropKeys = new Set(Object.keys(CROPS));
    for (const locale of SUPPORTED_LOCALES) {
      const labelKeys = new Set(Object.keys(getCropLabels(locale)));
      // CROPS ⊆ labels: 모든 작물이 라벨을 가진다(누락 종 없음).
      for (const cropKey of cropKeys) {
        expect(labelKeys.has(cropKey)).toBe(true);
      }
      // labels ⊆ CROPS: 잉여(고아) 라벨 키가 없다.
      for (const labelKey of labelKeys) {
        expect(cropKeys.has(labelKey)).toBe(true);
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
