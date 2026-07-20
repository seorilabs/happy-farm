/// <reference types="jest" />

import { SUPPORTED_LOCALES } from '../../../farm-core/src';
import { getFarmMessages } from '../i18n';
import { getVisibleShopTabs, resolveActiveShopTab, SHOP_TAB_KEYS } from '../shopTabs';

// #372: 상점 시트 탭 정리의 순수 로직 회귀 테스트.

describe('getVisibleShopTabs (#372)', () => {
  it('광고 지원 환경에서는 4개 탭(확장/업그레이드/꾸미기/보상)을 모두 노출한다', () => {
    expect(getVisibleShopTabs({ adSupported: true })).toEqual(['expand', 'upgrade', 'decorate', 'rewards']);
  });

  it('광고 미지원 환경에서는 보상 탭을 감춘다', () => {
    expect(getVisibleShopTabs({ adSupported: false })).toEqual(['expand', 'upgrade', 'decorate']);
  });

  it('영구 진행 탭 3개는 광고 지원 여부와 무관하게 항상 노출된다', () => {
    for (const adSupported of [true, false]) {
      const visible = getVisibleShopTabs({ adSupported });
      expect(visible).toEqual(expect.arrayContaining(['expand', 'upgrade', 'decorate']));
    }
  });

  it('노출 순서는 SHOP_TAB_KEYS 정의 순서를 따른다', () => {
    expect(getVisibleShopTabs({ adSupported: true })).toEqual([...SHOP_TAB_KEYS]);
  });
});

describe('resolveActiveShopTab (#372)', () => {
  it('요청한 탭이 보이면 그대로 유지한다', () => {
    expect(resolveActiveShopTab('upgrade', { adSupported: true })).toBe('upgrade');
    expect(resolveActiveShopTab('rewards', { adSupported: true })).toBe('rewards');
  });

  it('광고 미지원에서 rewards가 선택돼 있으면 첫 번째 보이는 탭으로 폴백한다', () => {
    expect(resolveActiveShopTab('rewards', { adSupported: false })).toBe('expand');
  });

  it('보이는 탭 요청은 광고 미지원에서도 유지된다', () => {
    expect(resolveActiveShopTab('decorate', { adSupported: false })).toBe('decorate');
  });
});

describe('상점 탭 라벨 i18n 커버리지 (#372, AC-5)', () => {
  it('8개 로케일 전부에 4개 탭 라벨이 비어있지 않은 문자열로 존재한다', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const messages = getFarmMessages(locale);
      for (const label of [
        messages.shopTabExpand,
        messages.shopTabUpgrade,
        messages.shopTabDecorate,
        messages.shopTabRewards,
      ]) {
        expect(typeof label).toBe('string');
        expect(label.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
