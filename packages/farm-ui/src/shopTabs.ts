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
