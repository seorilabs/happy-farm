/// <reference types="jest" />

import {
  getShopTabBadge,
  getVisibleShopTabs,
  resolveActiveShopTab,
  SHOP_SECTION_KEYS,
  SHOP_TAB_KEYS,
  SHOP_TAB_SECTIONS,
  shouldRenderShopTabBar,
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

describe('shouldRenderShopTabBar — AC-4 (탭 바는 상점 시트 내부에만 거주)', () => {
  it('상점 시트가 활성일 때만 탭 바를 렌더한다', () => {
    expect(shouldRenderShopTabBar('shop')).toBe(true);
  });

  it('시트가 없을 때(=상시 HUD만 보이는 기본 화면)는 탭 바를 렌더하지 않는다', () => {
    // null/undefined = 열린 시트 없음 → 탭 바가 상시 HUD/navRow에 얹히지 않음.
    expect(shouldRenderShopTabBar(null)).toBe(false);
    expect(shouldRenderShopTabBar(undefined)).toBe(false);
  });

  it('상점이 아닌 다른 시트에서도 탭 바를 렌더하지 않는다', () => {
    expect(shouldRenderShopTabBar('missions')).toBe(false);
    expect(shouldRenderShopTabBar('more')).toBe(false);
    expect(shouldRenderShopTabBar('collection')).toBe(false);
  });
});

describe('상점 탭 라벨 i18n 커버리지 (#372, AC-5)', () => {
  it('ko-KR catalog에 4개 탭 라벨이 정의돼 있다', () => {
    expect(koFarmMessages.shopTabExpand).toBe('확장');
    expect(koFarmMessages.shopTabUpgrade).toBe('업그레이드');
    expect(koFarmMessages.shopTabDecorate).toBe('꾸미기');
    expect(koFarmMessages.shopTabRewards).toBe('보상');
  });

  it('en-US catalog에 4개 탭 라벨이 정의돼 있다', () => {
    expect(enFarmMessages.shopTabExpand).toBe('Expand');
    expect(enFarmMessages.shopTabUpgrade).toBe('Upgrade');
    expect(enFarmMessages.shopTabDecorate).toBe('Decorate');
    expect(enFarmMessages.shopTabRewards).toBe('Rewards');
  });

  it('나머지 6개 로케일(ja/zh-Hans/zh-Hant/de/fr/es)에도 4개 탭 라벨이 비어있지 않게 존재한다', () => {
    const otherCatalogs = [jaFarmMessages, zhHansFarmMessages, zhHantFarmMessages, deFarmMessages, frFarmMessages, esFarmMessages];
    expect(otherCatalogs).toHaveLength(6);
    for (const catalog of otherCatalogs) {
      expect(catalog.shopTabExpand.trim().length).toBeGreaterThan(0);
      expect(catalog.shopTabUpgrade.trim().length).toBeGreaterThan(0);
      expect(catalog.shopTabDecorate.trim().length).toBeGreaterThan(0);
      expect(catalog.shopTabRewards.trim().length).toBeGreaterThan(0);
    }
  });
});
