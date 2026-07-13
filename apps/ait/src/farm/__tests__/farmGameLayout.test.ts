/// <reference types="jest" />

import {
  getPlotTileSize,
  MAIN_CONTENT_TOP_PADDING,
  MAIN_HORIZONTAL_PADDING,
  PLOT_COLUMNS,
  PLOT_GAP,
} from '../../../../../packages/farm-ui/src/farmGameLayout';

describe('farm plot layout', () => {
  test('keeps a compact environment gap between the HUD and plots', () => {
    expect(MAIN_CONTENT_TOP_PADDING).toBe(48);
  });

  test.each([320, 360, 390, 393, 402, 430])(
    'fits exactly four plot columns without horizontal overflow at %ipx',
    (windowWidth) => {
      const contentWidth = windowWidth - MAIN_HORIZONTAL_PADDING * 2;
      const tileSize = getPlotTileSize(windowWidth);
      const rowWidth = tileSize * PLOT_COLUMNS + PLOT_GAP * (PLOT_COLUMNS - 1);

      expect(rowWidth).toBeLessThanOrEqual(contentWidth);
      expect(contentWidth - rowWidth).toBeLessThan(PLOT_COLUMNS);
    }
  );
});
