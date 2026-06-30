/// <reference types="jest" />

import {
  COMBO_WINDOW_MS,
  COMBO_GREAT_THRESHOLD,
  COMBO_LEGENDARY_THRESHOLD,
} from '../constants';
import balance from '../balance.json';

describe('combo balance constants', () => {
  test('defaults are unchanged (no regression in combo pacing)', () => {
    expect(COMBO_WINDOW_MS).toBe(1500);
    expect(COMBO_GREAT_THRESHOLD).toBe(5);
    expect(COMBO_LEGENDARY_THRESHOLD).toBe(10);
  });

  test('values are sourced from balance.json', () => {
    expect(COMBO_WINDOW_MS).toBe(balance.combo.windowMs);
    expect(COMBO_GREAT_THRESHOLD).toBe(balance.combo.greatThreshold);
    expect(COMBO_LEGENDARY_THRESHOLD).toBe(balance.combo.legendaryThreshold);
  });

  test('great-before-legendary invariant holds', () => {
    expect(COMBO_GREAT_THRESHOLD).toBeLessThan(COMBO_LEGENDARY_THRESHOLD);
  });
});
