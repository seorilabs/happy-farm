const SHEET_DISMISS_DRAG_DISTANCE = 96;
const SHEET_DISMISS_VELOCITY = 1.1;

// 시트 손잡이를 놓았을 때 닫을지 정한다. PanResponder의 dy는 마지막 이동 이벤트까지만 반영해, 이동
// 이벤트가 드문 빠른 끌기에서는 손가락이 화면 아래까지 갔어도 dy가 작게 남아 시트가 되돌아갔다
// (2회차 #17, 6번 중 2번). 누른 위치와 놓은 위치의 차이도 함께 본다.
export function shouldDismissSheetDrag({
  dy,
  vy,
  startPageY,
  releasePageY,
}: {
  dy: number;
  vy: number;
  startPageY: number | null;
  releasePageY: number | null;
}): boolean {
  const releaseDistance = startPageY != null && releasePageY != null ? releasePageY - startPageY : 0;
  return Math.max(dy, releaseDistance) > SHEET_DISMISS_DRAG_DISTANCE || vy > SHEET_DISMISS_VELOCITY;
}
