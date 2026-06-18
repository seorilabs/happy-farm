/// <reference types="jest" />

import { CROPS } from '../constants';
import {
  CROP_OF_THE_DAY_MULTIPLIER,
  getCropOfTheDayStatus,
} from '../cropOfTheDay';

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_START = Date.parse('2026-06-13T00:00:00.000Z');

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
