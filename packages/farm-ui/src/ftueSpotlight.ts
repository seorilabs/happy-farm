import type { GameState } from '../../farm-core/src';
import type { Point } from './rewardBurst';

// 첫 수확 스포트라이트(#606 AC-1). GA4에서 신규 사용자 25%가 첫 수확 전에 떠났고, 일부는 밭 대신
// 미션이나 광고 제안을 열었다. 화면을 어둡게 하고 다 자란 칸 하나만 밝혀 밖의 탭을 막는다.
// 마스크 라이브러리 없이 구멍 둘레에 막 네 장을 두르고, 구멍 아래의 실제 칸이 탭을 받는다.
export type Rect = { x: number; y: number; width: number; height: number };

export const FTUE_SPOTLIGHT_PADDING = 6;

export function getPlotCellRect(gridOrigin: Point, index: number, columns: number, tileSize: number, gap: number): Rect {
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: gridOrigin.x + column * (tileSize + gap),
    y: gridOrigin.y + row * (tileSize + gap),
    width: tileSize,
    height: tileSize,
  };
}

// 위, 아래, 왼쪽, 오른쪽 순서. 위아래 막이 화면 폭 전체를 덮고 좌우 막은 구멍 높이만 덮는다.
export function getSpotlightBlockers(screen: { width: number; height: number }, hole: Rect): Rect[] {
  const p = FTUE_SPOTLIGHT_PADDING;
  const top = Math.max(0, hole.y - p);
  const bottom = Math.min(screen.height, hole.y + hole.height + p);
  const left = Math.max(0, hole.x - p);
  const right = Math.min(screen.width, hole.x + hole.width + p);
  return [
    { x: 0, y: 0, width: screen.width, height: top },
    { x: 0, y: bottom, width: screen.width, height: Math.max(0, screen.height - bottom) },
    { x: 0, y: top, width: left, height: bottom - top },
    { x: right, y: top, width: Math.max(0, screen.width - right), height: bottom - top },
  ];
}

export function findSpotlightPlotIndex(gameState: GameState): number | null {
  const index = gameState.plots.findIndex(
    (plot) => plot.id < gameState.unlockedPlotCount && plot.state === 2 && plot.cropType != null
  );
  return index >= 0 ? index : null;
}
