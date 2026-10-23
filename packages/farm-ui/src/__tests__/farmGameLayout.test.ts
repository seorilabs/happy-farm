import { getPlotTileSize } from '../farmGameLayout';

test('#575 큰 글자는 밭 카드도 넓히고 좁은 화면 안에 둔다', () => {
  expect(getPlotTileSize(320, 1)).toBe(64);
  expect(getPlotTileSize(320, 2)).toBe(139);
  expect(getPlotTileSize(390, 2)).toBe(174);
});
