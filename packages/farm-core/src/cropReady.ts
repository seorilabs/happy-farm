import type { AreaKey, CropKey, GameState } from './types';
import { isPlotGrowthComplete } from './harvest';

/**
 * plot.id → crop_ready summary에 마지막으로 집계한 심기 인스턴스의 startTime.
 * plot.id는 수확 후 재사용되므로, 심기 인스턴스를 startTime으로 구분해 같은 익음이
 * 여러 번 집계되는 것을 막는다. 크기는 plot 개수로 제한된다.
 */
export type CropReadyLogState = Record<number, number | null | undefined>;

export type CropReadySummaryEntry = {
  cropKey: CropKey;
  areaKey: AreaKey;
  cropTier: number;
};

export type CropReadySummaryBucket = CropReadySummaryEntry & {
  readyCount: number;
};

export type CropReadySummaryState = {
  readyCount: number;
  windowStartedAt: number;
  buckets: CropReadySummaryBucket[];
};

export function createCropReadySummaryState(): CropReadySummaryState {
  return { readyCount: 0, windowStartedAt: 0, buckets: [] };
}

/**
 * 새로 익은 심기 인스턴스를 한 rolling window 안에서 crop/area/tier별로 모은다.
 * GA4에는 bucket마다 ready_count 1건을 보내므로 기존 콘텐츠 차원을 잃지 않으면서
 * plot별 이벤트 폭증을 피할 수 있다.
 */
export function accumulateCropReadySummary(
  state: CropReadySummaryState,
  entries: readonly CropReadySummaryEntry[],
  now = Date.now(),
): CropReadySummaryState {
  if (entries.length === 0) {
    return state;
  }

  const buckets = state.buckets.map((bucket) => ({ ...bucket }));
  for (const entry of entries) {
    const existing = buckets.find(
      (bucket) =>
        bucket.cropKey === entry.cropKey &&
        bucket.areaKey === entry.areaKey &&
        bucket.cropTier === entry.cropTier,
    );
    if (existing == null) {
      buckets.push({ ...entry, readyCount: 1 });
    } else {
      existing.readyCount += 1;
    }
  }

  return {
    readyCount: state.readyCount + entries.length,
    windowStartedAt: state.readyCount === 0 ? now : state.windowStartedAt,
    buckets,
  };
}

export function isCropReadySummaryDue(
  state: CropReadySummaryState,
  now: number,
  intervalMs: number,
): boolean {
  return state.readyCount > 0 && now - state.windowStartedAt >= intervalMs;
}

/**
 * 이번 틱에 "새로 익어" crop_ready summary에 1회 집계해야 하는 plot.id 목록을 반환하고,
 * logState를 제자리 갱신한다.
 *
 * 250ms 틱 루프는 setGameState 커밋이 반영되기 전(plot.state가 아직 1)에 다시 돌 수
 * 있어, 같은 익음이 여러 틱 동안 반복 집계되던 문제(#266)가 있었다. 여기서는 심기
 * 인스턴스(startTime)당 한 번만 반환하도록 보장해, 커밋 타이밍과 무관하게 익은
 * 작물당 정확히 1회만 집계되게 한다. 수확 후 재심기하면 startTime이 바뀌므로 다음
 * 익음은 정상적으로 다시 집계된다.
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
    // 동일 심기 인스턴스를 이미 집계했다면 건너뛴다(중복 집계 방지).
    if (logState[plot.id] === plot.startTime) {
      continue;
    }
    logState[plot.id] = plot.startTime;
    readyPlotIds.push(plot.id);
  }
  return readyPlotIds;
}
