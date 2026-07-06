import type { GameState } from './types';
import { isPlotGrowthComplete } from './harvest';

/**
 * plot.id → 마지막으로 crop_ready를 로깅한 심기 인스턴스의 startTime.
 * plot.id는 수확 후 재사용되므로, 심기 인스턴스를 startTime으로 구분해 같은 익음이
 * 여러 번 로깅되는 것을 막는다. 크기는 plot 개수로 제한된다.
 */
export type CropReadyLogState = Record<number, number | null | undefined>;

/**
 * 이번 틱에 "새로 익어" crop_ready 이벤트를 1회 로깅해야 하는 plot.id 목록을 반환하고,
 * logState를 제자리 갱신한다.
 *
 * 250ms 틱 루프는 setGameState 커밋이 반영되기 전(plot.state가 아직 1)에 다시 돌 수
 * 있어, 같은 익음이 여러 틱 동안 반복 로깅되던 문제(#266)가 있었다. 여기서는 심기
 * 인스턴스(startTime)당 한 번만 반환하도록 보장해, 커밋 타이밍과 무관하게 익은
 * 작물당 정확히 1회만 로깅되게 한다. 수확 후 재심기하면 startTime이 바뀌므로 다음
 * 익음은 정상적으로 다시 로깅된다.
 */
export function collectNewlyReadyPlotIds(
  gameState: GameState,
  logState: CropReadyLogState,
  now = Date.now(),
): number[] {
  const readyPlotIds: number[] = [];
  for (const plot of gameState.plots) {
    if (plot.id >= gameState.unlockedPlotCount) {
      continue;
    }
    if (plot.cropType == null || !isPlotGrowthComplete(gameState, plot, now)) {
      continue;
    }
    // 동일 심기 인스턴스를 이미 로깅했다면 건너뛴다(중복 로깅 방지).
    if (logState[plot.id] === plot.startTime) {
      continue;
    }
    logState[plot.id] = plot.startTime;
    readyPlotIds.push(plot.id);
  }
  return readyPlotIds;
}
