/// <reference types="jest" />

import { SEED_SORT_MODES, nextSeedSortMode, sortCropKeysForStrip } from '../seedSort';
import type { SeedSortMode } from '../seedSort';
import { CROPS } from '../constants';
import type { CropKey } from '../types';

// A handful of starter/vegetable crops with known, distinct growTimes.
const KEYS: CropKey[] = ['carrot', 'wheat', 'potato', 'onion'];

describe('nextSeedSortMode', () => {
  test('cycles default → profit → growth → default', () => {
    expect(nextSeedSortMode('default')).toBe('profit');
    expect(nextSeedSortMode('profit')).toBe('growth');
    expect(nextSeedSortMode('growth')).toBe('default');
  });

  test('cycling through the mode list returns to the start', () => {
    let mode: SeedSortMode = 'default';
    for (let i = 0; i < SEED_SORT_MODES.length; i++) {
      mode = nextSeedSortMode(mode);
    }
    expect(mode).toBe('default');
  });
});

describe('sortCropKeysForStrip', () => {
  const profitOf = (map: Partial<Record<CropKey, number>>) => (key: CropKey) => map[key] ?? 0;

  test("'default' preserves the given order and returns a new array", () => {
    const result = sortCropKeysForStrip(KEYS, 'default', () => 0);
    expect(result).toEqual(KEYS);
    expect(result).not.toBe(KEYS);
  });

  test("'profit' sorts by netProfitPerHour descending", () => {
    const profit = profitOf({ carrot: 10, wheat: 40, potato: 5, onion: 25 });
    expect(sortCropKeysForStrip(KEYS, 'profit', profit)).toEqual(['wheat', 'onion', 'carrot', 'potato']);
  });

  test("'profit' breaks ties by original (catalog) order", () => {
    const profit = profitOf({ carrot: 10, wheat: 10, potato: 10, onion: 10 });
    // All equal → stable, so the input order is preserved.
    expect(sortCropKeysForStrip(KEYS, 'profit', profit)).toEqual(KEYS);
  });

  test("'profit' treats non-finite profit as 0 (sorts to the bottom)", () => {
    const profit = (key: CropKey) => (key === 'wheat' ? Number.NaN : key === 'carrot' ? 5 : -1);
    // wheat→0, carrot→5, potato/onion→-1. Desc: carrot(5), wheat(0), potato(-1), onion(-1).
    expect(sortCropKeysForStrip(KEYS, 'profit', profit)).toEqual(['carrot', 'wheat', 'potato', 'onion']);
  });

  test("'growth' sorts by base growTime ascending using real crop data", () => {
    const result = sortCropKeysForStrip(KEYS, 'growth', () => 0);
    const growTimes = result.map((key) => CROPS[key]!.growTime);
    // Ascending and matches sorting the input by growTime.
    const expected = [...KEYS].sort((a, b) => CROPS[a]!.growTime - CROPS[b]!.growTime);
    expect(result).toEqual(expected);
    for (let i = 1; i < growTimes.length; i++) {
      expect(growTimes[i]!).toBeGreaterThanOrEqual(growTimes[i - 1]!);
    }
  });

  test('does not mutate the input array', () => {
    const input = [...KEYS];
    sortCropKeysForStrip(input, 'profit', profitOf({ carrot: 1, wheat: 99 }));
    expect(input).toEqual(KEYS);
  });

  test('handles an empty list', () => {
    expect(sortCropKeysForStrip([], 'profit', () => 0)).toEqual([]);
    expect(sortCropKeysForStrip([], 'growth', () => 0)).toEqual([]);
  });
});
