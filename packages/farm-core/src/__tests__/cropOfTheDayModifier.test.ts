/// <reference types="jest" />

import { CROPS, createInitialState, isAreaUnlocked } from '../constants';
import { CROP_OF_THE_DAY_MULTIPLIER, getCropOfTheDayStatus } from '../cropOfTheDay';
import { getCropModifiers, getGlobalModifiers } from '../modifiers';
import { getResetDayStart } from '../resetBoundary';
import { isCropPlantable, isHybridCrop } from '../research';
import { getWeeklyEventMultiplier } from '../weeklyEvent';
import type { CropKey, GameState } from '../types';

// #377: '오늘의 작물' 칩(UI)은 getCropOfTheDayStatus(now, gameState)로 심을 수 있는
// 작물 풀에서 추첨하는데, 경제 모디파이어는 gameState 없이 호출해 전체 47작물 풀에서
// 추첨했다 → UI가 광고하는 작물과 실제 ×2 배수를 받는 작물이 어긋났다.

const MULT = CROP_OF_THE_DAY_MULTIPLIER;

// profitMultiplier를 전역 배수로 나눈 순수 crop별 배수 인자. 신규 상태에서는
// mastery=1이므로, 주간이벤트가 없는 날에는 이 값이 곧 cotd 인자(=MULT 또는 1)다.
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
    const displayed = getCropOfTheDayStatus(now, state).cropKey; // UI 표시(심기 가능 풀)
    const fullPool = getCropOfTheDayStatus(now).cropKey; // gameState 없이 = 전체 풀
    if (displayed === fullPool) continue;
    if (isPlantable(state, fullPool)) continue;
    const quiet =
      getWeeklyEventMultiplier(displayed, now, state.unlockedAreas) === 1 &&
      getWeeklyEventMultiplier(fullPool, now, state.unlockedAreas) === 1;
    if (!quiet) continue;
    return { now, displayed, fullPool };
  }
  throw new Error('테스트 전제: 전체 풀과 심기 가능 풀이 갈리는 조용한 날을 찾지 못함');
}

describe('오늘의 작물 배수는 UI 표시 작물에 적용된다 (#377)', () => {
  it('AC-1: getCropModifiers가 getCropOfTheDayStatus에 gameState를 전달한다', () => {
    const state = createInitialState();
    const { now, displayed, fullPool } = findDivergentQuietDay(state);

    // getCropModifiers가 실제로 cotd 배수를 적용하는 작물을 전체 풀에서 역산한다
    // (조용한 날이라 배수(MULT)를 받는 작물은 그날의 오늘의 작물 하나뿐).
    const bonusTargets = (Object.keys(CROPS) as CropKey[]).filter(
      (key) => Math.abs(cotdProfitFactor(state, key, now) - MULT) < 1e-6
    );

    // 배수 대상은 정확히 gameState를 전달한 풀의 오늘의 작물(displayed)과 일치하고,
    expect(bonusTargets).toEqual([displayed]);
    expect(getCropOfTheDayStatus(now, state).cropKey).toBe(displayed);
    // gameState를 전달하지 않았다면 배수를 받았을 전체 풀 픽(fullPool)과는 다르다
    // → getCropModifiers가 getCropOfTheDayStatus에 gameState를 전달했다는 직접 증거.
    expect(displayed).not.toBe(fullPool);
    expect(cotdProfitFactor(state, fullPool, now)).toBeCloseTo(1, 5);
  });

  it('AC-2: UI가 표시하는 오늘의 작물과 실제 ×2 배수를 받는 작물이 동일하다', () => {
    const state = createInitialState();
    const { now } = findDivergentQuietDay(state);
    const uiCrop = getCropOfTheDayStatus(now, state).cropKey; // 칩이 보여주는 작물
    // 칩이 보여주는 그 작물에 실제로 cotd 배수가 곱해진다.
    expect(cotdProfitFactor(state, uiCrop, now)).toBeCloseTo(MULT, 5);
  });

  it('AC-3: 미해금/미교배(하이브리드) 작물은 오늘의 작물 배수 대상이 되지 않는다', () => {
    const state = createInitialState();
    // 오늘의 작물은 어떤 날에도 항상 심을 수 있는 작물이다(미해금/미교배 미선정).
    for (let day = 0; day < 120; day += 1) {
      const now = getResetDayStart(day) + 3_600_000;
      expect(isPlantable(state, getCropOfTheDayStatus(now, state).cropKey)).toBe(true);
    }
    // 미교배 하이브리드 작물은 어떤 날에도 배수(MULT)를 받지 않는다.
    const hybridKey = (Object.keys(CROPS) as CropKey[]).find((key) => isHybridCrop(key))!;
    expect(isCropPlantable(state, hybridKey)).toBe(false);
    for (let day = 0; day < 120; day += 1) {
      const now = getResetDayStart(day) + 3_600_000;
      expect(cotdProfitFactor(state, hybridKey, now)).toBeCloseTo(1, 5);
    }
  });

  it('AC-4: 심을 수 있는 작물 0종(손상 세이브) 폴백에서도 UI/모디파이어가 같은 작물을 가리킨다', () => {
    // unlockedAreas를 비워 심기 가능 작물 0종을 만든다 → cropOfTheDay는 starter로 폴백.
    const corrupt: GameState = { ...createInitialState(), unlockedAreas: [] };
    const { now } = findDivergentQuietDay(createInitialState());
    const displayed = getCropOfTheDayStatus(now, corrupt).cropKey;
    // 폴백 경로에서도 UI 표시 작물에 배수가 실제로 적용된다(같은 작물을 가리킴).
    expect(cotdProfitFactor(corrupt, displayed, now)).toBeCloseTo(MULT, 5);
  });

  it('AC-5: 기존 cropOfTheDay 계약이 유지된다(반환 작물 유효·배수·결정론·해금 제한·하위호환)', () => {
    const now = getResetDayStart(10) + 3_600_000;
    const all = getCropOfTheDayStatus(now);
    // 반환 작물이 유효한 CropKey이고 배수는 데이터 기반 상수다.
    expect(Object.prototype.hasOwnProperty.call(CROPS, all.cropKey)).toBe(true);
    expect(all.multiplier).toBe(MULT);
    // 결정론: 동일 timestamp는 동일 작물.
    expect(getCropOfTheDayStatus(now).cropKey).toBe(all.cropKey);
    // gameState 전달 시 심을 수 있는 작물만 추첨(미해금 미반환).
    const state = createInitialState();
    expect(isPlantable(state, getCropOfTheDayStatus(now, state).cropKey)).toBe(true);
    // gameState 미전달 시 전체 풀 폴백(하위호환): 심기 가능 풀과 갈릴 수 있다.
    const { displayed, fullPool } = findDivergentQuietDay(state);
    expect(fullPool).not.toBe(displayed);
  });

  it('AC-6: cotd 상태의 UI 계약(shape)이 gameState 유무와 무관하게 동일하다(신규 UI 필드 없음)', () => {
    // 순수 로직 수정이라 UI가 소비하는 데이터 계약이 바뀌지 않는다: 필드 구성이
    // 동일하므로 새 HUD 상시 요소를 유발할 신규 필드/프롭이 없다. 오늘의 작물 칩이
    // 읽는 값(cropKey/multiplier/window)의 shape가 gameState 유무와 무관하게 동일.
    const now = getResetDayStart(10) + 3_600_000;
    const withState = getCropOfTheDayStatus(now, createInitialState());
    const withoutState = getCropOfTheDayStatus(now);
    expect(Object.keys(withState).sort()).toEqual(Object.keys(withoutState).sort());
    expect(withState.multiplier).toBe(withoutState.multiplier);
    expect(typeof withState.cropKey).toBe('string');
    expect(typeof withState.windowStartAt).toBe('number');
    expect(typeof withState.windowEndAt).toBe('number');
  });
});
