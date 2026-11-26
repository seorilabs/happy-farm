/// <reference types="jest" />

import { shouldDismissSheetDrag } from '../sheetDrag';

describe('시트 손잡이 끌어 닫기 (2회차 #17)', () => {
  test('충분히 끌거나 빠르게 튕기면 닫고, 조금만 끌면 되돌린다', () => {
    expect(shouldDismissSheetDrag({ dy: 120, vy: 0.2, startPageY: 100, releasePageY: 220 })).toBe(true);
    expect(shouldDismissSheetDrag({ dy: 30, vy: 1.5, startPageY: 100, releasePageY: 130 })).toBe(true);
    expect(shouldDismissSheetDrag({ dy: 30, vy: 0.2, startPageY: 100, releasePageY: 130 })).toBe(false);
  });

  test('이동 이벤트가 드물어 dy가 작게 남아도 놓은 위치가 충분히 아래면 닫는다', () => {
    expect(shouldDismissSheetDrag({ dy: 24, vy: 0.4, startPageY: 150, releasePageY: 800 })).toBe(true);
  });

  test('놓은 위치를 모르면 dy와 속도만 본다', () => {
    expect(shouldDismissSheetDrag({ dy: 24, vy: 0.4, startPageY: null, releasePageY: null })).toBe(false);
  });
});
