/// <reference types="jest" />

import {
  getShopTabBadge,
  getVisibleShopTabs,
  resolveActiveShopTab,
  SHOP_SECTION_KEYS,
  SHOP_TAB_KEYS,
  SHOP_TAB_SECTIONS,
  type ShopTabKey,
} from '../shopTabs';
import { deFarmMessages } from '../i18n/messages/de';
import { enFarmMessages } from '../i18n/messages/en-US';
import { esFarmMessages } from '../i18n/messages/es';
import { frFarmMessages } from '../i18n/messages/fr';
import { jaFarmMessages } from '../i18n/messages/ja';
import { koFarmMessages } from '../i18n/messages/ko-KR';
import { zhHansFarmMessages } from '../i18n/messages/zh-Hans';
import { zhHantFarmMessages } from '../i18n/messages/zh-Hant';

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

describe('SHOP_TAB_SECTIONS — AC-2 (5개 섹션이 회귀 없이 탭에 배치)', () => {
  it('원래 5개 섹션이 정확히 한 탭씩에 중복·누락 없이 배치된다', () => {
    const placed = SHOP_TAB_KEYS.flatMap((tab) => SHOP_TAB_SECTIONS[tab]);
    // 누락 없음(모든 섹션이 어느 탭엔가 있다) + 중복 없음(한 탭에만).
    expect([...placed].sort()).toEqual([...SHOP_SECTION_KEYS].sort());
    expect(placed.length).toBe(SHOP_SECTION_KEYS.length);
    expect(new Set(placed).size).toBe(SHOP_SECTION_KEYS.length);
  });

  it('모든 탭은 최소 1개 섹션을 렌더한다(빈 탭 없음)', () => {
    for (const tab of SHOP_TAB_KEYS) {
      expect(SHOP_TAB_SECTIONS[tab].length).toBeGreaterThan(0);
    }
  });

  it('부지·지역 해금은 확장 탭, 연구는 업그레이드, 데코는 꾸미기, 광고는 보상 탭에 있다', () => {
    expect(SHOP_TAB_SECTIONS.expand).toEqual(['plots', 'areaUnlock']);
    expect(SHOP_TAB_SECTIONS.upgrade).toEqual(['research']);
    expect(SHOP_TAB_SECTIONS.decorate).toEqual(['decoration']);
    expect(SHOP_TAB_SECTIONS.rewards).toEqual(['adRewards']);
  });
});

describe('getShopTabBadge — AC-3 (탭 배지 보존)', () => {
  it('보상 탭은 수령 가능 광고 배지를, 업그레이드 탭은 구매 가능 업그레이드 배지를 보존한다', () => {
    const counts = { upgradeReadyCount: 2, rewardReadyCount: 1 };
    expect(getShopTabBadge('rewards', counts)).toBe(1);
    expect(getShopTabBadge('upgrade', counts)).toBe(2);
  });

  it('배지 신호가 없는 탭(확장/꾸미기)은 항상 0을 반환한다', () => {
    const counts = { upgradeReadyCount: 5, rewardReadyCount: 5 };
    expect(getShopTabBadge('expand', counts)).toBe(0);
    expect(getShopTabBadge('decorate', counts)).toBe(0);
  });

  it('신호가 0이면 모든 탭 배지가 0이다', () => {
    const counts = { upgradeReadyCount: 0, rewardReadyCount: 0 };
    for (const tab of SHOP_TAB_KEYS) {
      expect(getShopTabBadge(tab, counts)).toBe(0);
    }
  });
});

describe('상점 탭 라벨 i18n 커버리지 (#372, AC-5)', () => {
  // 8개 로케일 catalog를 직접 참조해 4개 탭 라벨이 모두 존재함을 고정한다.
  const catalogs: Record<string, Record<string, unknown>> = {
    'ko-KR': koFarmMessages,
    'en-US': enFarmMessages,
    ja: jaFarmMessages,
    'zh-Hans': zhHansFarmMessages,
    'zh-Hant': zhHantFarmMessages,
    de: deFarmMessages,
    fr: frFarmMessages,
    es: esFarmMessages,
  };
  const labelKeys: Array<keyof ShopTabLabelKeys> = [
    'shopTabExpand',
    'shopTabUpgrade',
    'shopTabDecorate',
    'shopTabRewards',
  ];
  type ShopTabLabelKeys = {
    shopTabExpand: string;
    shopTabUpgrade: string;
    shopTabDecorate: string;
    shopTabRewards: string;
  };

  it('8개 로케일 전부에 4개 탭 라벨이 비어있지 않은 문자열로 존재한다', () => {
    expect(Object.keys(catalogs)).toHaveLength(8);
    for (const [locale, catalog] of Object.entries(catalogs)) {
      for (const key of labelKeys) {
        const value = catalog[key];
        expect(typeof value).toBe('string');
        expect((value as string).trim().length).toBeGreaterThan(0);
      }
      expect(locale).toBeTruthy();
    }
  });

  // exhaustiveness 가드: SHOP_TAB_KEYS와 라벨 키가 1:1로 대응하는지.
  it('탭 키마다 대응하는 라벨 키가 존재한다', () => {
    const expected: Record<ShopTabKey, keyof ShopTabLabelKeys> = {
      expand: 'shopTabExpand',
      upgrade: 'shopTabUpgrade',
      decorate: 'shopTabDecorate',
      rewards: 'shopTabRewards',
    };
    for (const tab of SHOP_TAB_KEYS) {
      expect(typeof koFarmMessages[expected[tab]]).toBe('string');
    }
  });
});
