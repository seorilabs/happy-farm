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

// 말풍선 자리(1회차 #3). 시안처럼 밝힌 칸 옆에 한 줄 안내를 둔다. 레이아웃 흐름 밖(절대 위치)이라 밭을
// 밀어내지 않는다. 양옆 모두 좁으면 손가락 아래에 화면 폭으로 둔다.
export const FTUE_BUBBLE_MIN_HEIGHT = 56;
const FTUE_BUBBLE_GAP = 10;
const FTUE_BUBBLE_MARGIN = 12;
const FTUE_BUBBLE_MIN_WIDTH = 140;
const FTUE_POINTER_ROOM = 48;

export type SpotlightBubbleFrame = {
  side: 'left' | 'right' | 'below';
  left?: number;
  right?: number;
  top: number;
  maxWidth: number;
};

export function getSpotlightBubbleFrame(screen: { width: number; height: number }, hole: Rect): SpotlightBubbleFrame {
  const p = FTUE_SPOTLIGHT_PADDING;
  const rightStart = hole.x + hole.width + p + FTUE_BUBBLE_GAP;
  const leftEnd = hole.x - p - FTUE_BUBBLE_GAP;
  const rightRoom = screen.width - rightStart - FTUE_BUBBLE_MARGIN;
  const leftRoom = leftEnd - FTUE_BUBBLE_MARGIN;
  const top = Math.max(0, hole.y + hole.height / 2 - FTUE_BUBBLE_MIN_HEIGHT / 2);
  if (Math.max(rightRoom, leftRoom) >= FTUE_BUBBLE_MIN_WIDTH) {
    return rightRoom >= leftRoom
      ? { side: 'right', left: rightStart, top, maxWidth: rightRoom }
      : { side: 'left', right: screen.width - leftEnd, top, maxWidth: leftRoom };
  }
  return {
    side: 'below',
    left: FTUE_BUBBLE_MARGIN,
    top: hole.y + hole.height + p + FTUE_POINTER_ROOM,
    maxWidth: screen.width - FTUE_BUBBLE_MARGIN * 2,
  };
}

export function findSpotlightPlotIndex(gameState: GameState): number | null {
  const index = gameState.plots.findIndex(
    (plot) => plot.id < gameState.unlockedPlotCount && plot.state === 2 && plot.cropType != null
  );
  return index >= 0 ? index : null;
}
