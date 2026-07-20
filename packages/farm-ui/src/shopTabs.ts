// #372: 상점 시트를 성격이 다른 5개 섹션의 단일 스크롤에서 탭 4개로 정리한다.
// 탭 구성/가시성/선택 폴백은 순수 로직으로 분리해 헤드리스 테스트로 고정하고,
// FarmGame의 렌더는 이 결과에 따라 기존 섹션 블록을 탭별로 재배치하기만 한다.

export type ShopTabKey = 'expand' | 'upgrade' | 'decorate' | 'rewards';

// 탭 표시 순서: 영구 진행(확장→업그레이드→꾸미기) 다음에 소모성 보상(광고).
export const SHOP_TAB_KEYS: readonly ShopTabKey[] = ['expand', 'upgrade', 'decorate', 'rewards'];

// 보상(광고) 탭은 광고가 지원되는 환경에서만 노출한다. 미지원(AIT 등 무필/미지원)
// 이면 빈 탭이 정체를 만들지 않도록 아예 감춘다.
export function getVisibleShopTabs(opts: { adSupported: boolean }): ShopTabKey[] {
  return SHOP_TAB_KEYS.filter((key) => key !== 'rewards' || opts.adSupported);
}

// 요청한 탭이 현재 보이지 않으면(예: 광고 미지원인데 rewards 선택 상태) 첫 번째
// 보이는 탭으로 폴백해, 아무것도 렌더되지 않는 빈 상점 상태를 막는다.
export function resolveActiveShopTab(requested: ShopTabKey, opts: { adSupported: boolean }): ShopTabKey {
  const visible = getVisibleShopTabs(opts);
  return visible.includes(requested) ? requested : visible[0]!;
}

// 정리 전 상점의 5개 원래 섹션. 탭으로 재배치해도 하나도 빠지지 않고 모두
// 접근 가능해야 한다(회귀 방지).
export type ShopSectionKey = 'plots' | 'areaUnlock' | 'research' | 'decoration' | 'adRewards';
export const SHOP_SECTION_KEYS: readonly ShopSectionKey[] = [
  'plots',
  'areaUnlock',
  'research',
  'decoration',
  'adRewards',
];

// 각 탭이 담는 원래 섹션. FarmGame 렌더는 이 매핑과 일치하게 섹션을 배치하고,
// 테스트는 5개 섹션이 정확히 한 탭씩에 중복·누락 없이 들어감을 고정한다.
export const SHOP_TAB_SECTIONS: Record<ShopTabKey, readonly ShopSectionKey[]> = {
  expand: ['plots', 'areaUnlock'],
  upgrade: ['research'],
  decorate: ['decoration'],
  rewards: ['adRewards'],
};

// 탭이 섹션을 한 뎁스 뒤로 숨긴 대신, 기존 상점 배지 신호(수령 가능 광고 보상·
// 구매 가능 업그레이드)를 해당 탭의 배지로 보존한다. 배지 신호가 없는 탭은 0.
export function getShopTabBadge(
  tab: ShopTabKey,
  counts: { upgradeReadyCount: number; rewardReadyCount: number }
): number {
  if (tab === 'upgrade') {
    return counts.upgradeReadyCount;
  }
  if (tab === 'rewards') {
    return counts.rewardReadyCount;
  }
  return 0;
}
