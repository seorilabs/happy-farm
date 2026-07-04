import { MIN_BOTTOM_SAFE_INSET, resolveBottomSafeInset } from '../safeArea';

// #236: AIT(Granite) 호스트가 하단 시스템 UI 인셋을 0으로 보고하면 하단 콘텐츠가
// 시스템 백버튼/제스처 바와 겹친다. 실제 확보할 하단 인셋을 계산하는 순수 함수의
// 회귀 방지.
describe('resolveBottomSafeInset (#236)', () => {
  it('호스트가 인셋을 보고하지 못하면(0) 최소 확보 인셋으로 폴백한다', () => {
    expect(resolveBottomSafeInset(0)).toBe(MIN_BOTTOM_SAFE_INSET);
  });

  it('음수/NaN 등 비정상 값도 최소 확보 인셋으로 폴백한다', () => {
    expect(resolveBottomSafeInset(-8)).toBe(MIN_BOTTOM_SAFE_INSET);
    expect(resolveBottomSafeInset(Number.NaN)).toBe(MIN_BOTTOM_SAFE_INSET);
  });

  it('최소값보다 작은 실측 인셋은 최소값으로 끌어올린다', () => {
    expect(resolveBottomSafeInset(MIN_BOTTOM_SAFE_INSET - 1)).toBe(MIN_BOTTOM_SAFE_INSET);
  });

  it('실측 인셋이 더 크면(예: 제스처 바 34) 그대로 유지한다', () => {
    expect(resolveBottomSafeInset(34)).toBe(34);
    expect(resolveBottomSafeInset(48)).toBe(48);
  });

  it('최소 확보 인셋은 시스템 백버튼/제스처 바를 덮을 만큼 양수다', () => {
    expect(MIN_BOTTOM_SAFE_INSET).toBeGreaterThan(0);
  });
});
