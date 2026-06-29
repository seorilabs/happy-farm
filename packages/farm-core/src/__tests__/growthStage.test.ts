/// <reference types="jest" />

import {
  CROP_GROWTH_STAGE_THRESHOLDS,
  CROP_NEARLY_READY_RATIO,
  getCropGrowthStage,
  isCropNearlyReady,
} from '../growthStage';

describe('getCropGrowthStage', () => {
  test('starts at sprout for a freshly planted crop', () => {
    expect(getCropGrowthStage(0)).toBe('sprout');
    expect(getCropGrowthStage(0.1)).toBe('sprout');
  });

  test('maps each band to the expected stage', () => {
    expect(getCropGrowthStage(0.24)).toBe('sprout');
    expect(getCropGrowthStage(0.4)).toBe('sapling');
    expect(getCropGrowthStage(0.6)).toBe('budding');
    expect(getCropGrowthStage(0.85)).toBe('mature');
    expect(getCropGrowthStage(1)).toBe('mature');
  });

  test('thresholds are inclusive lower bounds', () => {
    expect(getCropGrowthStage(CROP_GROWTH_STAGE_THRESHOLDS.sapling)).toBe('sapling');
    expect(getCropGrowthStage(CROP_GROWTH_STAGE_THRESHOLDS.budding)).toBe('budding');
    expect(getCropGrowthStage(CROP_GROWTH_STAGE_THRESHOLDS.mature)).toBe('mature');
  });

  test('just below each threshold stays in the lower stage', () => {
    expect(getCropGrowthStage(CROP_GROWTH_STAGE_THRESHOLDS.sapling - 0.0001)).toBe('sprout');
    expect(getCropGrowthStage(CROP_GROWTH_STAGE_THRESHOLDS.budding - 0.0001)).toBe('sapling');
    expect(getCropGrowthStage(CROP_GROWTH_STAGE_THRESHOLDS.mature - 0.0001)).toBe('budding');
  });

  test('crosses through all four stages as progress increases', () => {
    const seen = [0, 0.3, 0.6, 0.9].map(getCropGrowthStage);
    expect(seen).toEqual(['sprout', 'sapling', 'budding', 'mature']);
  });

  test('non-finite input degrades to sprout; finite out-of-range clamps by value', () => {
    // NaN/Infinity are treated as "no progress" (earliest stage), not skipped ahead.
    expect(getCropGrowthStage(NaN)).toBe('sprout');
    expect(getCropGrowthStage(Infinity)).toBe('sprout');
    // Finite values outside 0..1 still compare by magnitude.
    expect(getCropGrowthStage(-1)).toBe('sprout');
    expect(getCropGrowthStage(2)).toBe('mature');
  });
});

describe('isCropNearlyReady', () => {
  test('false below the nearly-ready ratio, true at/above it', () => {
    expect(isCropNearlyReady(CROP_NEARLY_READY_RATIO - 0.0001)).toBe(false);
    expect(isCropNearlyReady(CROP_NEARLY_READY_RATIO)).toBe(true);
    expect(isCropNearlyReady(0.95)).toBe(true);
    expect(isCropNearlyReady(1)).toBe(true);
  });

  test('a budding-stage crop is not yet nearly ready', () => {
    expect(isCropNearlyReady(0.6)).toBe(false);
  });

  test('clamps non-finite input to not-ready', () => {
    expect(isCropNearlyReady(NaN)).toBe(false);
  });
});
