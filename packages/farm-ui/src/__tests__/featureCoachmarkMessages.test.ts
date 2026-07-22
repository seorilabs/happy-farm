/// <reference types="jest" />

import { FEATURE_COACHMARK_KEYS } from '../../../farm-core/src';
import { deFarmMessages } from '../i18n/messages/de';
import { enFarmMessages } from '../i18n/messages/en-US';
import { esFarmMessages } from '../i18n/messages/es';
import { frFarmMessages } from '../i18n/messages/fr';
import { jaFarmMessages } from '../i18n/messages/ja';
import { koFarmMessages } from '../i18n/messages/ko-KR';
import { zhHansFarmMessages } from '../i18n/messages/zh-Hans';
import { zhHantFarmMessages } from '../i18n/messages/zh-Hant';

// 딥 기능 발견성 코치마크(#367) i18n 키가 전 로케일(ko-KR·en-US 포함)에 존재하고,
// 비어있지 않은 실사용 문구를 담고 있음을 로케일별로 직접 검증한다(AC-4). FarmMessages
// 타입이 키 "존재"를 컴파일 타임에 강제하지만, 이 테스트는 값이 실제로 채워졌다는
// 런타임 계약과 `pnpm check:i18n`이 요구하는 카탈로그 완결성을 못박는다.
const LOCALES = {
  'ko-KR': koFarmMessages,
  'en-US': enFarmMessages,
  ja: jaFarmMessages,
  'zh-Hans': zhHansFarmMessages,
  'zh-Hant': zhHantFarmMessages,
  de: deFarmMessages,
  fr: frFarmMessages,
  es: esFarmMessages,
} as const;

// 코치마크가 실제로 사용하는 공용 키 + 기능별 title/desc 키(FarmGame의 getFeatureCoachmarkText,
// FeatureCoachmarkOverlay와 동일한 키 집합).
const SHARED_KEYS = ['featureCoachmarkEyebrow', 'featureCoachmarkOpen', 'featureCoachmarkDismiss'] as const;
const PER_FEATURE_KEYS = FEATURE_COACHMARK_KEYS.flatMap((key) => {
  const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
  return [`featureCoachmark${capitalized}Title`, `featureCoachmark${capitalized}Desc`] as const;
});
const ALL_KEYS = [...SHARED_KEYS, ...PER_FEATURE_KEYS];

describe('딥 기능 코치마크 i18n 키 (#367)', () => {
  const entries = Object.entries(LOCALES);

  test.each(entries)('%s 로케일: 코치마크 공용·기능별 문구가 모두 비어있지 않다', (locale, messages) => {
    expect(locale.length).toBeGreaterThan(0);
    for (const key of ALL_KEYS) {
      const value = (messages as Record<string, unknown>)[key];
      expect(typeof value).toBe('string');
      expect((value as string).trim().length).toBeGreaterThan(0);
    }
  });

  // ko/en이 서로 다른 현지화 문구인지(한쪽을 그대로 복사한 플레이스홀더가 아닌지) 확인.
  test('ko-KR와 en-US는 서로 다른 현지화 문구를 사용한다', () => {
    for (const key of ALL_KEYS) {
      const ko = (koFarmMessages as Record<string, unknown>)[key];
      const en = (enFarmMessages as Record<string, unknown>)[key];
      expect(ko).not.toBe(en);
    }
  });
});
