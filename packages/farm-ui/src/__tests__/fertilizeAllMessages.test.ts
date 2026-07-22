/// <reference types="jest" />

import { deFarmMessages } from '../i18n/messages/de';
import { enFarmMessages } from '../i18n/messages/en-US';
import { esFarmMessages } from '../i18n/messages/es';
import { frFarmMessages } from '../i18n/messages/fr';
import { jaFarmMessages } from '../i18n/messages/ja';
import { koFarmMessages } from '../i18n/messages/ko-KR';
import { zhHansFarmMessages } from '../i18n/messages/zh-Hans';
import { zhHantFarmMessages } from '../i18n/messages/zh-Hant';

// 전체 비료(#359) 신규 i18n 키가 전 로케일(ko-KR·en-US 포함)에 존재하고, 실제로
// count·cost를 반영한 비어있지 않은 문구를 반환함을 로케일별로 직접 검증한다. FarmMessages
// 타입이 키 "존재"를 컴파일 타임에 강제하지만, 이 테스트는 각 키가 실사용 가능한 문구를
// 만든다는 런타임 계약(AC-6)을 못박는다.
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

describe('전체 비료 i18n 키 (#359)', () => {
  const entries = Object.entries(LOCALES);

  test.each(entries)('%s 로케일: 버튼/확인버튼/완료토스트 3키가 count·cost를 반영한다', (locale, messages) => {
    expect(locale.length).toBeGreaterThan(0);

    const button = messages.fertilizeAllButton(5, '12,340');
    expect(typeof button).toBe('string');
    expect(button).toContain('5');
    expect(button).toContain('12,340');

    const confirmButton = messages.fertilizeAllConfirmButton(5, '12,340');
    expect(typeof confirmButton).toBe('string');
    expect(confirmButton).toContain('5');
    expect(confirmButton).toContain('12,340');

    const doneToast = messages.fertilizeAllDoneToast(3, '9,000');
    expect(typeof doneToast).toBe('string');
    expect(doneToast).toContain('3');
    expect(doneToast).toContain('9,000');
  });

  // ko/en이 서로 다른 현지화 문구인지(한쪽을 그대로 복사한 플레이스홀더가 아닌지) 확인.
  test('ko-KR와 en-US는 서로 다른 현지화 문구를 사용한다', () => {
    expect(koFarmMessages.fertilizeAllButton(2, '10')).not.toBe(enFarmMessages.fertilizeAllButton(2, '10'));
    expect(koFarmMessages.fertilizeAllConfirmButton(2, '10')).not.toBe(
      enFarmMessages.fertilizeAllConfirmButton(2, '10')
    );
    expect(koFarmMessages.fertilizeAllDoneToast(2, '10')).not.toBe(
      enFarmMessages.fertilizeAllDoneToast(2, '10')
    );
  });
});
