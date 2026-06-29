/// <reference types="jest" />

import { CROPS, createInitialState, isAreaUnlocked } from '../constants';
import { isCropPlantable } from '../research';
import type { CropKey, GameState } from '../types';
import {
  CROP_OF_THE_DAY_MULTIPLIER,
  getCropOfTheDayStatus,
} from '../cropOfTheDay';

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_START = Date.parse('2026-06-13T00:00:00.000Z');

// 신규 세이브(starter_field만 해금)에서 즉시 심을 수 있는 작물 5종.
const STARTER_CROP_KEYS: CropKey[] = ['carrot', 'wheat', 'potato', 'onion', 'sweet_potato'];

function isPlantableNow(state: GameState, cropKey: CropKey): boolean {
  return isAreaUnlocked(state, CROPS[cropKey]!.area) && isCropPlantable(state, cropKey);
}

// 모든 구역과 교배 레시피를 푼 상태 — 추첨 풀이 전체 작물로 넓어진다.
function fullyUnlockedState(): GameState {
  const base = createInitialState();
  return {
    ...base,
    unlockedAreas: [...new Set((Object.keys(CROPS) as CropKey[]).map((key) => CROPS[key]!.area))],
    research: {
      ...base.research,
      unlockedBreeds: (Object.keys(CROPS) as CropKey[]).filter((key) => isHybrid(key)),
    },
  };
}

function isHybrid(cropKey: CropKey): boolean {
  // hybrid_greenhouse 구역 작물만 교배 게이트가 걸린다.
  return CROPS[cropKey]!.area === 'hybrid_greenhouse';
}

describe('getCropOfTheDayStatus', () => {
  test('returns a known crop key', () => {
    const { cropKey } = getCropOfTheDayStatus(DAY_START);
    expect(Object.keys(CROPS)).toContain(cropKey);
  });

  test('multiplier field equals CROP_OF_THE_DAY_MULTIPLIER', () => {
    const { multiplier } = getCropOfTheDayStatus(DAY_START);
    expect(multiplier).toBe(CROP_OF_THE_DAY_MULTIPLIER);
  });

  test('CROP_OF_THE_DAY_MULTIPLIER is 2', () => {
    expect(CROP_OF_THE_DAY_MULTIPLIER).toBe(2);
  });

  test('windowStartAt is UTC midnight for the given day', () => {
    const { windowStartAt } = getCropOfTheDayStatus(DAY_START + 6 * 3600_000);
    expect(windowStartAt).toBe(DAY_START);
  });

  test('windowEndAt is exactly 24h after windowStartAt', () => {
    const { windowStartAt, windowEndAt } = getCropOfTheDayStatus(DAY_START);
    expect(windowEndAt - windowStartAt).toBe(DAY_MS);
  });

  test('same crop all day (morning, noon, late evening)', () => {
    const morning = getCropOfTheDayStatus(DAY_START + 3600_000);
    const noon = getCropOfTheDayStatus(DAY_START + 12 * 3600_000);
    const evening = getCropOfTheDayStatus(DAY_START + 23 * 3600_000 + 59 * 60_000);
    expect(noon.cropKey).toBe(morning.cropKey);
    expect(evening.cropKey).toBe(morning.cropKey);
  });

  test('deterministic: same timestamp always returns the same crop', () => {
    const ts = DAY_START + 7_777_777;
    const a = getCropOfTheDayStatus(ts);
    const b = getCropOfTheDayStatus(ts);
    expect(b.cropKey).toBe(a.cropKey);
    expect(b.windowStartAt).toBe(a.windowStartAt);
    expect(b.windowEndAt).toBe(a.windowEndAt);
  });

  test('windowStartAt changes at day boundary', () => {
    const endOfDay = getCropOfTheDayStatus(DAY_START + DAY_MS - 1);
    const startOfNextDay = getCropOfTheDayStatus(DAY_START + DAY_MS);
    expect(endOfDay.windowStartAt).toBe(DAY_START);
    expect(startOfNextDay.windowStartAt).toBe(DAY_START + DAY_MS);
  });

  test('windowEndAt for today equals windowStartAt of tomorrow', () => {
    const today = getCropOfTheDayStatus(DAY_START + 3600_000);
    const tomorrow = getCropOfTheDayStatus(DAY_START + DAY_MS);
    expect(today.windowEndAt).toBe(tomorrow.windowStartAt);
  });

  test('next day returns a valid crop key', () => {
    const { cropKey } = getCropOfTheDayStatus(DAY_START + DAY_MS);
    expect(Object.keys(CROPS)).toContain(cropKey);
  });

  test('result is stable across many consecutive days', () => {
    for (let d = 0; d < 30; d += 1) {
      const { cropKey } = getCropOfTheDayStatus(DAY_START + d * DAY_MS);
      expect(Object.keys(CROPS)).toContain(cropKey);
    }
  });

  test('NaN now falls back to current day without throwing', () => {
    expect(() => getCropOfTheDayStatus(NaN)).not.toThrow();
    const { cropKey } = getCropOfTheDayStatus(NaN);
    expect(Object.keys(CROPS)).toContain(cropKey);
  });

  test('Infinity now falls back to current day without throwing', () => {
    expect(() => getCropOfTheDayStatus(Infinity)).not.toThrow();
    const { cropKey } = getCropOfTheDayStatus(Infinity);
    expect(Object.keys(CROPS)).toContain(cropKey);
  });
});

describe('getCropOfTheDayStatus with game state (해금 작물만 추첨)', () => {
  test('starter만 해금된 신규 상태에서는 항상 starter 5종 중 하나만 반환', () => {
    const state = createInitialState();
    for (let d = 0; d < 60; d += 1) {
      const { cropKey } = getCropOfTheDayStatus(DAY_START + d * DAY_MS, state);
      expect(STARTER_CROP_KEYS).toContain(cropKey);
    }
  });

  test('반환 작물은 언제나 현재 심을 수 있는 작물이다(미해금 작물 미반환)', () => {
    const state = createInitialState();
    for (let d = 0; d < 60; d += 1) {
      const { cropKey } = getCropOfTheDayStatus(DAY_START + d * DAY_MS, state);
      expect(isPlantableNow(state, cropKey)).toBe(true);
    }
  });

  test('동일 now + 동일 해금 상태에서 결과가 결정적으로 동일', () => {
    const state = createInitialState();
    const ts = DAY_START + 7_777_777;
    const a = getCropOfTheDayStatus(ts, state);
    const b = getCropOfTheDayStatus(ts, state);
    expect(b.cropKey).toBe(a.cropKey);
    expect(b.windowStartAt).toBe(a.windowStartAt);
    expect(b.windowEndAt).toBe(a.windowEndAt);
  });

  test('해금 상태가 넓어지면 더 많은 작물이 추첨 풀에 들어온다', () => {
    const full = fullyUnlockedState();
    const drawn = new Set<CropKey>();
    for (let d = 0; d < 200; d += 1) {
      drawn.add(getCropOfTheDayStatus(DAY_START + d * DAY_MS, full).cropKey);
    }
    // 전구역 해금 시 starter 외 작물이 한 번이라도 추첨된다.
    const nonStarter = [...drawn].some((key) => !STARTER_CROP_KEYS.includes(key));
    expect(nonStarter).toBe(true);
    // 그래도 모든 추첨 결과는 심을 수 있는 작물이어야 한다.
    for (const key of drawn) {
      expect(isPlantableNow(full, key)).toBe(true);
    }
  });

  test('hybrid_greenhouse 구역만 해금하고 교배 미해금이면 hybrid 작물은 추첨되지 않는다', () => {
    const base = createInitialState();
    const state: GameState = {
      ...base,
      unlockedAreas: [...new Set([...base.unlockedAreas, 'hybrid_greenhouse' as const])],
      // unlockedBreeds는 비워 둠 → hybrid 작물은 isCropPlantable false
    };
    for (let d = 0; d < 120; d += 1) {
      const { cropKey } = getCropOfTheDayStatus(DAY_START + d * DAY_MS, state);
      expect(isHybrid(cropKey)).toBe(false);
      expect(isPlantableNow(state, cropKey)).toBe(true);
    }
  });

  test('gameState 미전달 시 전체 작물 풀로 폴백(하위호환)', () => {
    const { cropKey } = getCropOfTheDayStatus(DAY_START);
    expect(Object.keys(CROPS)).toContain(cropKey);
  });
});
