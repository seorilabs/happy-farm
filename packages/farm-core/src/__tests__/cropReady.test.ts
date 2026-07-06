/// <reference types="jest" />

import { createInitialState } from '../constants';
import { collectNewlyReadyPlotIds, type CropReadyLogState } from '../cropReady';
import type { CropKey, GameState, PlotState } from '../types';

const STARTER_CROP: CropKey = 'carrot';
// startTime 대비 충분히 미래라 성장 완료(ratio>=1)로 판정되는 기준 시각.
const NOW = 10_000_000;

// 지정 plot을 "성숙했지만 아직 수확 전(state 1)" 상태로 만든다.
// state 1 + 오래전 startTime 이면 isPlotGrowthComplete가 true가 된다.
function withGrownPlot(
  state: GameState,
  id: number,
  startTime = 0,
  cropKey: CropKey = STARTER_CROP,
): GameState {
  const plots = state.plots.map((plot) =>
    plot.id === id ? { ...plot, cropType: cropKey, startTime, state: 1 as PlotState } : plot,
  );
  return { ...state, plots };
}

function withPlotState(state: GameState, id: number, plotState: PlotState): GameState {
  const plots = state.plots.map((plot) => (plot.id === id ? { ...plot, state: plotState } : plot));
  return { ...state, plots };
}

describe('collectNewlyReadyPlotIds', () => {
  test('새로 익은 plot을 1회 반환하고, 같은 심기 인스턴스는 다시 반환하지 않는다', () => {
    const state = withGrownPlot(createInitialState(), 0, 0);
    const logState: CropReadyLogState = {};

    // 1차 호출: 익은 plot 0을 반환하고 로깅 상태를 기록한다.
    expect(collectNewlyReadyPlotIds(state, logState, NOW)).toEqual([0]);
    expect(logState[0]).toBe(0);

    // 같은 상태로 다시 호출해도(틱 반복) 중복 반환하지 않는다 — #266 회귀 방지.
    expect(collectNewlyReadyPlotIds(state, logState, NOW)).toEqual([]);
  });

  test('로깅 후 plot이 state 2(수확 대기)로 커밋되어도 다시 반환하지 않는다', () => {
    let state = withGrownPlot(createInitialState(), 0, 0);
    const logState: CropReadyLogState = {};

    expect(collectNewlyReadyPlotIds(state, logState, NOW)).toEqual([0]);

    // 틱 루프가 state를 2로 커밋한 뒤: isPlotGrowthComplete가 false라 반환되지 않는다.
    state = withPlotState(state, 0, 2);
    expect(collectNewlyReadyPlotIds(state, logState, NOW)).toEqual([]);
  });

  test('여러 plot이 동시에 익으면 모두 반환하고, 재호출 시 빈 배열', () => {
    let state = createInitialState();
    state = withGrownPlot(state, 0, 0);
    state = withGrownPlot(state, 1, 0);
    const logState: CropReadyLogState = {};

    expect(collectNewlyReadyPlotIds(state, logState, NOW).sort()).toEqual([0, 1]);
    expect(collectNewlyReadyPlotIds(state, logState, NOW)).toEqual([]);
  });

  test('수확 후 재심기(startTime 변경)한 plot은 다시 익을 때 1회 반환한다', () => {
    const logState: CropReadyLogState = {};

    const first = withGrownPlot(createInitialState(), 0, 0);
    expect(collectNewlyReadyPlotIds(first, logState, NOW)).toEqual([0]);

    // 같은 plot.id지만 새로 심어(startTime 다름) 다시 성숙 → 새 익음이므로 1회 반환.
    const replanted = withGrownPlot(createInitialState(), 0, 100);
    expect(collectNewlyReadyPlotIds(replanted, logState, NOW)).toEqual([0]);
    expect(logState[0]).toBe(100);
  });

  test('아직 다 자라지 않은 plot(ratio<1)은 반환하지 않는다', () => {
    // startTime을 now와 같게 두면 경과 시간 0 → ratio 0.
    const state = withGrownPlot(createInitialState(), 0, NOW);
    const logState: CropReadyLogState = {};

    expect(collectNewlyReadyPlotIds(state, logState, NOW)).toEqual([]);
    expect(logState[0]).toBeUndefined();
  });

  test('잠긴 plot(id >= unlockedPlotCount)은 익어도 반환하지 않는다', () => {
    const base = createInitialState();
    const lockedId = base.unlockedPlotCount; // 아직 해금되지 않은 첫 plot
    // 해당 plot이 존재할 때만 의미가 있으므로 방어적으로 확인.
    if (base.plots.some((plot) => plot.id === lockedId)) {
      const state = withGrownPlot(base, lockedId, 0);
      const logState: CropReadyLogState = {};
      expect(collectNewlyReadyPlotIds(state, logState, NOW)).toEqual([]);
    }
  });
});
