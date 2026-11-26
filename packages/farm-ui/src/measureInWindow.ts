// 화면 좌표 측정(#606). Jest의 RN View 목에는 measureInWindow가 없어서, 테스트가 이 모듈만 바꿔
// 측정값을 넣을 수 있게 한 곳으로 모은다. 측정할 수 없는 노드면 false를 돌려준다.
export type WindowMeasureCallback = (x: number, y: number, width: number, height: number) => void;

export function measureNodeInWindow(node: unknown, callback: WindowMeasureCallback): boolean {
  const target = node as { measureInWindow?: (cb: WindowMeasureCallback) => void } | null;
  if (target == null || typeof target.measureInWindow !== 'function') {
    return false;
  }
  target.measureInWindow(callback);
  return true;
}
