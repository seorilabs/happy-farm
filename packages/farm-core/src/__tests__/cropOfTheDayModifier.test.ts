/// <reference types="jest" />

import { CROPS, createInitialState, isAreaUnlocked } from '../constants';
import { CROP_OF_THE_DAY_MULTIPLIER, getCropOfTheDayStatus } from '../cropOfTheDay';
import { getCropModifiers, getGlobalModifiers } from '../modifiers';
import { getResetDayStart } from '../resetBoundary';
import { isCropPlantable } from '../research';
import { getWeeklyEventMultiplier } from '../weeklyEvent';
import type { CropKey, GameState } from '../types';

// #377: '오늘의 작물' 칩(UI)은 getCropOfTheDayStatus(now, gameState)로 심을 수 있는
// 작물 풀에서 추첨하는데, 경제 모디파이어는 gameState 없이 호출해 전체 47작물 풀에서
// 추첨했다 → UI가 광고하는 작물과 실제 ×2 배수를 받는 작물이 어긋났다. 여기서는
// "칩에 표시되는 작물 == 실제 profitMultiplier에 cotd 배수가 곱해지는 작물"을 고정한다.

// profitMultiplier를 전역 배수로 나눈 순수 crop별 배수 인자. 신규 상태에서는
// mastery=1이므로, 아래 헬퍼로 고른 주간이벤트 없는 날에는 이 값이 곧 cotd 인자다.
function cotdProfitFactor(state: GameState, cropKey: CropKey, now: number): number {
  return getCropModifiers(state, cropKey, now).profitMultiplier / getGlobalModifiers(state, now).profitMultiplier;
}

function isPlantable(state: GameState, cropKey: CropKey): boolean {
  return isAreaUnlocked(state, CROPS[cropKey]!.area) && isCropPlantable(state, cropKey);
}

// 전체 풀 추첨과 심을 수 있는 풀 추첨이 갈리고(=버그가 실제로 문제되는 날),
// 주간 이벤트가 없어 배수 인자가 cotd만으로 결정되는 날을 찾는다.
function findDivergentQuietDay(state: GameState): { now: number; displayed: CropKey; fullPool: CropKey } {
  for (let day = 0; day < 500; day += 1) {
    const now = getResetDayStart(day) + 3_600_000; // 윈도우 시작 1시간 후
    const displayed = getCropOfTheDayStatus(now, state).cropKey;
    const fullPool = getCropOfTheDayStatus(now).cropKey; // gameState 없이 = 전체 풀
    if (displayed === fullPool) continue; // 갈리지 않는 날은 버그가 드러나지 않음
    if (isPlantable(state, fullPool)) continue; // 전체 풀 픽이 심을 수 있으면 대비가 약함
    const quiet =
      getWeeklyEventMultiplier(displayed, now, state.unlockedAreas) === 1 &&
      getWeeklyEventMultiplier(fullPool, now, state.unlockedAreas) === 1;
    if (!quiet) continue;
    return { now, displayed, fullPool };
  }
  throw new Error('테스트 전제: 전체 풀과 심기 가능 풀이 갈리는 조용한 날을 찾지 못함');
}

describe('오늘의 작물 배수는 UI 표시 작물에 적용된다 (#377)', () => {
  it('AC-1/2: getCropModifiers가 gameState를 넘겨 UI 표시(심기 가능 풀) 작물에 ×배수를 적용한다', () => {
    const state = createInitialState();
    const { now, displayed, fullPool } = findDivergentQuietDay(state);

    // UI가 보여주는 작물엔 cotd 배수가 적용되고,
    expect(cotdProfitFactor(state, displayed, now)).toBeCloseTo(CROP_OF_THE_DAY_MULTIPLIER, 5);
    // 전체 풀에서만 뽑히던(심을 수 없는) 작물엔 적용되지 않는다(버그 회귀 방지).
    expect(cotdProfitFactor(state, fullPool, now)).toBeCloseTo(1, 5);
  });

  it('AC-3: 오늘의 작물은 항상 심을 수 있는 작물이며, 미해금/미교배 작물엔 배수가 적용되지 않는다', () => {
    const state = createInitialState();
    for (let day = 0; day < 120; day += 1) {
      const now = getResetDayStart(day) + 3_600_000;
      const displayed = getCropOfTheDayStatus(now, state).cropKey;
      expect(isPlantable(state, displayed)).toBe(true);
    }

    // 미해금/미교배 작물(하이브리드 포함)은 어떤 날에도 배수 대상이 아니다.
    const { now, fullPool } = findDivergentQuietDay(state);
    expect(isPlantable(state, fullPool)).toBe(false);
    expect(cotdProfitFactor(state, fullPool, now)).toBeCloseTo(1, 5);
  });

  it('AC-4: 심을 수 있는 작물 0종(손상 세이브) 폴백에서도 UI/모디파이어가 같은 작물을 가리킨다', () => {
    // unlockedAreas를 비워 심기 가능 작물 0종을 만든다 → cropOfTheDay는 starter로 폴백.
    const corrupt: GameState = { ...createInitialState(), unlockedAreas: [] };
    const { now } = findDivergentQuietDay(createInitialState());

    const displayed = getCropOfTheDayStatus(now, corrupt).cropKey;
    // 폴백 경로에서도 UI 표시 작물에 배수가 실제로 적용된다(같은 작물을 가리킴).
    expect(cotdProfitFactor(corrupt, displayed, now)).toBeCloseTo(CROP_OF_THE_DAY_MULTIPLIER, 5);
  });
});
