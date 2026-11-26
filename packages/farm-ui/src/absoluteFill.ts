// 절대 위치 채우기(#606). RN 0.85(mobile)의 StyleSheet에는 absoluteFillObject가 없어 펼치면 아무것도
// 들어가지 않는다(Granite RN 0.84인 앱인토스와 jest에는 있다). 두 런타임에서 같게 동작하도록 직접 둔다.
export const ABSOLUTE_FILL = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;
