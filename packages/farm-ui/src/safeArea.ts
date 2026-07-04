// 하단 시스템 UI(내비게이션/제스처 바·백버튼) 겹침 방지를 위한 하단 safe-area
// 인셋 보정(#236).
//
// 배경: AppsInToss(Granite) 호스트에서는 표준 `useSafeAreaInsets()`의 bottom 값이
// 실제 시스템 하단 UI를 반영하지 못하고 0으로 수렴하는 경우가 있다(정확한 인셋은
// 프레임워크의 `safeAreaInsetsChange` 이벤트로 별도 전달된다). 이 경우 하단 툴
// 스트립/시트/토스트가 시스템 백버튼·제스처 바와 겹쳐 가시성이 떨어진다.
//
// 대응: 플랫폼이 보고한 값과 최소 확보 인셋(`MIN_BOTTOM_SAFE_INSET`) 중 큰 값을
// 사용한다. 모바일처럼 실제 인셋(예: 제스처 바 34)이 더 크게 측정되면 그대로
// 유지되므로, AIT/모바일 공통으로 하단 여백이 일관되게 확보된다.
export const MIN_BOTTOM_SAFE_INSET = 24;

/**
 * 하단 콘텐츠가 시스템 하단 UI와 겹치지 않도록 실제로 확보할 하단 인셋을 계산한다.
 * 플랫폼이 인셋을 보고하지 못하는(0/음수/NaN) 경우 최소값으로 폴백한다.
 */
export function resolveBottomSafeInset(rawBottomInset: number): number {
  if (!Number.isFinite(rawBottomInset) || rawBottomInset <= 0) {
    return MIN_BOTTOM_SAFE_INSET;
  }
  return Math.max(rawBottomInset, MIN_BOTTOM_SAFE_INSET);
}
