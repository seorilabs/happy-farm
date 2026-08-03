import type { AreaKey, CropKey } from './types';

export type AutoHarvestSummaryEntry = {
  cropKey: CropKey;
  areaKey: AreaKey;
  cropTier: number;
  goldGained: number;
  researchPointsGained: number;
  replanted: boolean;
};

export type AutoHarvestSummaryBucket = {
  cropKey: CropKey;
  areaKey: AreaKey;
  cropTier: number;
  harvestedCount: number;
  replantedCount: number;
  totalGold: number;
  totalResearchPoints: number;
};

export type AutoHarvestSummaryState = {
  harvestedCount: number;
  windowStartedAt: number;
  buckets: AutoHarvestSummaryBucket[];
};

export function createAutoHarvestSummaryState(): AutoHarvestSummaryState {
  return { harvestedCount: 0, windowStartedAt: 0, buckets: [] };
}

/**
 * 자동수확 결과를 rolling window 안에서 crop/area/tier별로 집계한다.
 * GA4에는 bucket당 summary 1건만 보내므로 자동화 처리량과 네트워크 요청량이 분리된다.
 */
export function accumulateAutoHarvestSummary(
  state: AutoHarvestSummaryState,
  entries: readonly AutoHarvestSummaryEntry[],
  now = Date.now(),
): AutoHarvestSummaryState {
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
      buckets.push({
        cropKey: entry.cropKey,
        areaKey: entry.areaKey,
        cropTier: entry.cropTier,
        harvestedCount: 1,
        replantedCount: entry.replanted ? 1 : 0,
        totalGold: entry.goldGained,
        totalResearchPoints: entry.researchPointsGained,
      });
    } else {
      existing.harvestedCount += 1;
      existing.replantedCount += entry.replanted ? 1 : 0;
      existing.totalGold += entry.goldGained;
      existing.totalResearchPoints += entry.researchPointsGained;
    }
  }

  return {
    harvestedCount: state.harvestedCount + entries.length,
    windowStartedAt: state.harvestedCount === 0 ? now : state.windowStartedAt,
    buckets,
  };
}

export function isAutoHarvestSummaryDue(
  state: AutoHarvestSummaryState,
  now: number,
  intervalMs: number,
): boolean {
  return state.harvestedCount > 0 && now - state.windowStartedAt >= intervalMs;
}
