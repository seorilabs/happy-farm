/// <reference types="jest" />

import { deFarmMessages } from '../i18n/messages/de';
import { enFarmMessages } from '../i18n/messages/en-US';
import { esFarmMessages } from '../i18n/messages/es';
import { frFarmMessages } from '../i18n/messages/fr';
import { jaFarmMessages } from '../i18n/messages/ja';
import { koFarmMessages } from '../i18n/messages/ko-KR';
import { zhHansFarmMessages } from '../i18n/messages/zh-Hans';
import { zhHantFarmMessages } from '../i18n/messages/zh-Hant';

// 소유 동물 스트립(#360) 접근성 라벨 키가 전 로케일(ko-KR·en-US 포함)에 존재하고,
// 수확 준비 수(readyCount)를 반영한 비어있지 않은 문구를 반환함을 로케일별로 직접
// 검증한다. FarmMessages 타입이 키 "존재"를 컴파일 타임에 강제하지만, 이 테스트는 각
// 로케일 키가 실사용 가능한 라벨을 만든다는 런타임 계약(AC-7)을 못박는다.
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

describe('소유 동물 스트립 i18n 키 (#360)', () => {
  test.each(Object.entries(LOCALES))('%s 로케일: animalStripAccessibilityLabel이 readyCount를 반영한다', (locale, messages) => {
    expect(locale.length).toBeGreaterThan(0);
    const label = messages.animalStripAccessibilityLabel(3);
    expect(typeof label).toBe('string');
    expect(label.trim().length).toBeGreaterThan(0);
    expect(label).toContain('3');
  });

  test('ko-KR와 en-US는 서로 다른 현지화 라벨을 사용한다', () => {
    expect(koFarmMessages.animalStripAccessibilityLabel(2)).not.toBe(
      enFarmMessages.animalStripAccessibilityLabel(2)
    );
  });
});
