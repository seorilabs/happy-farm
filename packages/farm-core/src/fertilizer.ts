import balance from './balance.json';
import type { GameState, Plot } from './types';
import { CROPS, getCropEconomyEstimate } from './constants';
import { getCropModifiers } from './modifiers';
import { getPlotRemainingWallClockMs } from './harvest';

// 골드 소비 비료(즉시 성장 촉진). 성장 중인 밭에 골드를 지불해 남은 성장을 즉시
// 완료하는 능동 진행 가속 + 잉여 골드 싱크(#227). 광고 성장 스킵과 달리 골드로
// 진행을 가속하는 유일한 능동 수단이며, "순 진행 이득이 없는 순수 편의/골드 싱크"가
// 되도록 가격을 책정한다(아래 getFertilizerCost 주석 참조).

// 시간 → 시간당 순이익 환산에 쓰는 상수. constants.ts의 동명 상수를 export하지
// 않으므로(순환/최소 변경) 여기서 동일 값을 로컬로 둔다.
const MS_PER_HOUR = 60 * 60 * 1000;

// 계수는 balance.json에 데이터로 두고 하드코딩하지 않는다. 로드 시 검증해
// 잘못된 값(≤1 배율 등)이 순 진행 이득을 만들지 못하게 빠르게 실패시킨다.
export const FERTILIZER_COST_MULTIPLIER = balance.fertilizer.costMultiplier;
export const FERTILIZER_MIN_COST = balance.fertilizer.minCost;
if (!Number.isFinite(FERTILIZER_COST_MULTIPLIER) || FERTILIZER_COST_MULTIPLIER <= 1) {
  throw new Error(
    `Invalid fertilizer.costMultiplier: ${FERTILIZER_COST_MULTIPLIER} (must be a finite number > 1)`
  );
}
if (!Number.isFinite(FERTILIZER_MIN_COST) || FERTILIZER_MIN_COST < 1) {
  throw new Error(`Invalid fertilizer.minCost: ${FERTILIZER_MIN_COST} (must be a finite number >= 1)`);
}

// 성장 중 플롯에 비료를 줄 때의 골드 비용을 결정적으로 반환한다.
//
// 가격 정책(밸런스 안전): 비용은 "단축되는 시간(남은 성장 시간) 동안 그 작물이
// 벌어들일 net 골드 가치" 이상으로 책정한다. 남은 성장 시간을 wall-clock으로 재고,
// 작물 경제(getCropEconomyEstimate)의 netProfitPerHour와 곱해 시간 가치를 구한 뒤
// costMultiplier(>1)를 곱하고 올림한다. 최소 FERTILIZER_MIN_COST 골드를 보장한다.
// costMultiplier>1 + 올림 덕분에 비용 > 시간 가치가 항상 성립하므로, 비료로
// 얻는 순 진행 이득이 없다(가속의 대가로 잉여 골드만 태우는 순수 편의/골드 싱크).
//
// 성장 중(state===1)이 아니거나 남은 성장이 없으면 0을 반환한다(대상 아님).
export function getFertilizerCost(gameState: GameState, plot: Plot, now = Date.now()): number {
  if (plot.state !== 1 || plot.cropType == null || plot.startTime == null) {
    return 0;
  }
  if (CROPS[plot.cropType] == null) {
    return 0;
  }
  const remainingWallClockMs = getPlotRemainingWallClockMs(gameState, plot, now);
  if (remainingWallClockMs <= 0) {
    return 0;
  }
  const modifiers = getCropModifiers(gameState, plot.cropType, now);
  const economy = getCropEconomyEstimate(plot.cropType, {
    speedMultiplier: modifiers.speedMultiplier,
    profitMultiplier: modifiers.profitMultiplier,
    harvestMultiplier: modifiers.harvestMultiplier,
    costMultiplier: modifiers.cropCostMultiplier,
  });
  const timeValueGold = Math.max(0, economy.netProfitPerHour) * (remainingWallClockMs / MS_PER_HOUR);
  const cost = Math.ceil(timeValueGold * FERTILIZER_COST_MULTIPLIER);
  return Math.max(FERTILIZER_MIN_COST, cost);
}

export type FertilizerResult = {
  state: GameState;
  // True only when gold was spent and the plot's growth was completed.
  applied: boolean;
  // The gold cost that was (or would be) charged. 0 when the plot isn't a valid
  // fertilizer target; > 0 with applied=false means the player couldn't afford it.
  cost: number;
};

// 성장 중 플롯에 비료를 적용한다(순수 함수). 골드가 충분하면 골드를 차감하고 남은
// 성장을 즉시 완료(state=2)한 새 상태를 반환한다. 성장 중이 아니거나(빈/완료 플롯),
// 남은 성장이 없거나, 골드가 부족하면 상태 불변으로 거절한다(no-op). plotId는 플롯의
// id 필드로 조회한다(성장 스킵 광고가 인덱스를 쓰는 것과 달리 인수조건이 plotId).
export function applyFertilizer(gameState: GameState, plotId: number, now = Date.now()): FertilizerResult {
  const plotIndex = gameState.plots.findIndex((candidate) => candidate.id === plotId);
  const plot = plotIndex >= 0 ? gameState.plots[plotIndex] : undefined;
  if (plot == null || plot.state !== 1 || plot.cropType == null || plot.startTime == null) {
    return { state: gameState, applied: false, cost: 0 };
  }

  const cost = getFertilizerCost(gameState, plot, now);
  if (cost <= 0) {
    // 남은 성장이 없어 가속할 것이 없는 경우(사실상 완료 직전).
    return { state: gameState, applied: false, cost: 0 };
  }
  if (gameState.gold < cost) {
    return { state: gameState, applied: false, cost };
  }

  const nextPlots = [...gameState.plots];
  nextPlots[plotIndex] = { ...plot, state: 2 };
  return {
    state: { ...gameState, gold: gameState.gold - cost, plots: nextPlots },
    applied: true,
    cost,
  };
}

export type FertilizeAllPreview = {
  // 성장 중이면서 비료 대상(cost>0)인 밭 수(예산 무관).
  growingCount: number;
  // 현재 골드로 실제 적용될 밭 수. 원본 밭 배열 순서로 결정적으로 순회하며, 남은
  // 골드가 그 밭 비용을 감당하지 못하면 건너뛰고 다음 밭을 계속 시도한다(부분 적용).
  affordableCount: number;
  // affordableCount개 밭에 실제 청구될 총 골드(적용 대상 밭 비용의 합).
  totalCost: number;
};

// 일괄 비료의 미리보기(순수). 상태를 만들지 않고 UI 노출 게이트/버튼 라벨용
// 집계(적용 가능 수·총 비용)만 결정적으로 계산한다. applyFertilizerToAllGrowing과
// "동일한 밭 순회·동일한 예산 그리디"를 공유하므로 두 함수의 수/비용은 항상 일치한다
// (fertilizer.test.ts가 이 일치를 못박는다).
export function previewFertilizeAll(gameState: GameState, now: number = Date.now()): FertilizeAllPreview {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  let growingCount = 0;
  let affordableCount = 0;
  let totalCost = 0;
  let remainingGold = gameState.gold;
  for (const plot of gameState.plots) {
    if (plot.state !== 1) {
      continue;
    }
    const cost = getFertilizerCost(gameState, plot, safeNow);
    if (cost <= 0) {
      continue;
    }
    growingCount += 1;
    if (remainingGold >= cost) {
      remainingGold -= cost;
      totalCost += cost;
      affordableCount += 1;
    }
  }
  return { growingCount, affordableCount, totalCost };
}

export type FertilizeAllResult = {
  state: GameState;
  // 실제 비료가 적용되어 성장이 완료된 밭의 id들(원본 순서).
  appliedPlotIds: number[];
  appliedCount: number;
  // 적용된 밭에서 차감된 골드의 합. 각 밭 비용은 개별 getFertilizerCost와 동일하다.
  totalCost: number;
};

// 성장 중인 모든 밭에 비료를 일괄 적용한다(순수·결정적). 원본 밭 배열 순서로 단일-밭
// 전이(applyFertilizer)를 순차 적용해 각 밭의 완료 불변식·가격 정책을 그대로 보존하면서
// 배치 UI 피드백용 요약을 한 번에 돌려준다(collectAllReadyProduce와 동일한 시퀀싱 패턴).
// 골드 한도 내에서만 적용하고 예산을 넘는 밭은 미적용으로 남긴다(부분 적용). 적용할 밭이
// 없거나(성장 중 0) 아무 밭도 감당하지 못하면 원본 상태 참조를 그대로 반환한다(no-op).
export function applyFertilizerToAllGrowing(
  gameState: GameState,
  now: number = Date.now()
): FertilizeAllResult {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  let state = gameState;
  const appliedPlotIds: number[] = [];
  let totalCost = 0;

  for (const plot of gameState.plots) {
    // 원본 스냅샷 순서로 순회한다. 각 밭 비용은 다른 밭의 완료와 무관하므로(밭별 남은
    // 성장·글로벌 모디파이어에만 의존) 순서로 총액이 달라지지 않는다.
    if (plot.state !== 1) {
      continue;
    }
    const result = applyFertilizer(state, plot.id, safeNow);
    if (!result.applied) {
      // 골드 부족(cost>0)·대상 아님(cost 0) 모두 미적용으로 남기고 다음 밭을 시도한다.
      continue;
    }
    totalCost += result.cost;
    state = result.state;
    appliedPlotIds.push(plot.id);
  }

  return {
    state,
    appliedPlotIds,
    appliedCount: appliedPlotIds.length,
    totalCost,
  };
}
