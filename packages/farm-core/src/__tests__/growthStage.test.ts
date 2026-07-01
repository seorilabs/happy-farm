/// <reference types="jest" />

import {
  CROP_GROWTH_STAGE_THRESHOLDS,
  CROP_NEARLY_READY_RATIO,
  assertGrowthStageThresholdsValid,
  getCropGrowthStage,
  isCropNearlyReady,
} from '../growthStage';
import balance from '../balance.json';

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

describe('data-driven thresholds (balance.json)', () => {
  test('exported constants read from balance.json (no code drift, values unchanged)', () => {
    expect(CROP_GROWTH_STAGE_THRESHOLDS).toEqual(balance.growthStage.thresholds);
    expect(CROP_NEARLY_READY_RATIO).toBe(balance.growthStage.nearlyReadyRatio);
    // Pin the shipped values so a balance edit is a deliberate, reviewed change.
    expect(CROP_GROWTH_STAGE_THRESHOLDS).toEqual({ sapling: 0.25, budding: 0.55, mature: 0.8 });
    expect(CROP_NEARLY_READY_RATIO).toBe(0.9);
  });

  test('the shipped thresholds satisfy the ordering invariant', () => {
    expect(() => assertGrowthStageThresholdsValid(CROP_GROWTH_STAGE_THRESHOLDS)).not.toThrow();
  });
});

describe('assertGrowthStageThresholdsValid (load-time invariant)', () => {
  test('accepts strictly increasing thresholds', () => {
    expect(() => assertGrowthStageThresholdsValid({ sapling: 0.1, budding: 0.5, mature: 0.9 })).not.toThrow();
  });

  test('rejects out-of-order thresholds with a clear message', () => {
    expect(() => assertGrowthStageThresholdsValid({ sapling: 0.5, budding: 0.25, mature: 0.8 })).toThrow(
      /sapling < budding < mature/
    );
    // Equal boundaries are not strictly increasing → rejected.
    expect(() => assertGrowthStageThresholdsValid({ sapling: 0.25, budding: 0.25, mature: 0.8 })).toThrow();
  });

  test('rejects non-finite thresholds', () => {
    expect(() => assertGrowthStageThresholdsValid({ sapling: NaN, budding: 0.5, mature: 0.9 })).toThrow(
      /finite/
    );
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
