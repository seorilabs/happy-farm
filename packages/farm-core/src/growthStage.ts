// Growth-stage visualization mapping. Pure: turns a 0..1 growth progress ratio
// into a coarse visual stage so the UI can reveal a crop gradually (sprout →
// sapling → a dim preview of the crop itself → the full crop) instead of a flat
// 🌱→🌿→icon jump that makes all 47 crops look identical until 65%.
//
// Boundaries: the crop's own icon starts previewing past the halfway mark to
// build anticipation, and fully shows in the final stretch. Kept in farm-core so
// the thresholds are unit-tested independently of any rendering.
export type CropGrowthStage = 'sprout' | 'sapling' | 'budding' | 'mature';

// Lower bound (inclusive) of each non-sprout stage, as a growth ratio.
export const CROP_GROWTH_STAGE_THRESHOLDS = {
  sapling: 0.25,
  budding: 0.55,
  mature: 0.8,
} as const;

// At/after this ratio a still-growing crop shows the "almost ready" cue.
export const CROP_NEARLY_READY_RATIO = 0.9;

// Clamp non-finite input to 0 so a missing/NaN ratio degrades to the earliest
// stage rather than throwing or skipping ahead.
function safeRatio(progressRatio: number): number {
  return Number.isFinite(progressRatio) ? progressRatio : 0;
}

export function getCropGrowthStage(progressRatio: number): CropGrowthStage {
  const p = safeRatio(progressRatio);
  if (p >= CROP_GROWTH_STAGE_THRESHOLDS.mature) return 'mature';
  if (p >= CROP_GROWTH_STAGE_THRESHOLDS.budding) return 'budding';
  if (p >= CROP_GROWTH_STAGE_THRESHOLDS.sapling) return 'sapling';
  return 'sprout';
}

// True once a growing crop is close enough to ripe to earn a "soon" pulse.
export function isCropNearlyReady(progressRatio: number): boolean {
  return safeRatio(progressRatio) >= CROP_NEARLY_READY_RATIO;
}
