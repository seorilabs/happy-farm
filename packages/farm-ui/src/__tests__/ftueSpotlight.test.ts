/// <reference types="jest" />

import { createInitialState, type GameState } from '../../../farm-core/src';
import {
  FTUE_SPOTLIGHT_PADDING,
  findSpotlightPlotIndex,
  getPlotCellRect,
  getSpotlightBlockers,
} from '../ftueSpotlight';

describe('ftueSpotlight (#606 AC-1)', () => {
  test('격자 원점과 칸 번호로 칸의 화면 위치를 구한다', () => {
    expect(getPlotCellRect({ x: 16, y: 300 }, 0, 4, 80, 10)).toEqual({ x: 16, y: 300, width: 80, height: 80 });
    expect(getPlotCellRect({ x: 16, y: 300 }, 5, 4, 80, 10)).toEqual({ x: 106, y: 390, width: 80, height: 80 });
  });

  test('구멍을 둘러싼 네 장의 막이 화면을 빈틈없이 덮고 구멍만 남긴다', () => {
    const screen = { width: 400, height: 800 };
    const hole = { x: 100, y: 300, width: 80, height: 80 };
    const blockers = getSpotlightBlockers(screen, hole);
    const p = FTUE_SPOTLIGHT_PADDING;
    expect(blockers).toEqual([
      { x: 0, y: 0, width: 400, height: 300 - p },
      { x: 0, y: 380 + p, width: 400, height: 800 - 380 - p },
      { x: 0, y: 300 - p, width: 100 - p, height: 80 + p * 2 },
      { x: 180 + p, y: 300 - p, width: 400 - 180 - p, height: 80 + p * 2 },
    ]);
    const area = blockers.reduce((sum, rect) => sum + rect.width * rect.height, 0);
    expect(area).toBe(400 * 800 - (80 + p * 2) * (80 + p * 2));
  });

  test('구멍이 화면 가장자리에 붙어도 막 크기가 음수가 되지 않는다', () => {
    const blockers = getSpotlightBlockers({ width: 400, height: 800 }, { x: 0, y: 0, width: 80, height: 80 });
    for (const rect of blockers) {
      expect(rect.width).toBeGreaterThanOrEqual(0);
      expect(rect.height).toBeGreaterThanOrEqual(0);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
    }
  });

  test('다 자란 첫 칸을 밝히고, 없으면 밝히지 않는다', () => {
    const fresh = createInitialState();
    const ready: GameState = {
      ...fresh,
      plots: fresh.plots.map((plot, index) =>
        index === 1 ? { ...plot, state: 2, cropType: 'carrot', startTime: 0 } : { ...plot, state: 0, cropType: null }
      ),
    };
    expect(findSpotlightPlotIndex(ready)).toBe(1);
    const empty: GameState = { ...fresh, plots: fresh.plots.map((plot) => ({ ...plot, state: 0, cropType: null })) };
    expect(findSpotlightPlotIndex(empty)).toBeNull();
  });
});
