import type { CropKey } from './types';
import { CROPS } from './constants';

export const CROP_OF_THE_DAY_MULTIPLIER = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

// Unsigned-32 multiplicative hash of a day index. Uses the Knuth multiplicative
// constant (nearest prime to 2^32 × φ) so consecutive day numbers scatter
// unpredictably across the crop list rather than cycling in sequence.
function hashDay(day: number): number {
  let h = (day ^ 0x5a3b7f1e) >>> 0;
  h = Math.imul(h, 0x9e3779b9) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export type CropOfTheDayStatus = {
  cropKey: CropKey;
  multiplier: number;
  // UTC midnight that opened this window.
  windowStartAt: number;
  // UTC midnight that closes this window (= windowStartAt of next day).
  windowEndAt: number;
};

// Returns the featured crop for the UTC calendar day that contains `now`.
// Pure and deterministic: the same day always yields the same crop, and the
// result changes automatically at UTC midnight with no save-state required.
export function getCropOfTheDayStatus(now = Date.now()): CropOfTheDayStatus {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const cropKeys = Object.keys(CROPS) as CropKey[];
  if (cropKeys.length === 0) {
    throw new Error('No crops configured');
  }
  const day = Math.floor(safeNow / DAY_MS);
  const index = hashDay(day) % cropKeys.length;
  const cropKey = cropKeys[index]!;
  const windowStartAt = day * DAY_MS;
  return {
    cropKey,
    multiplier: CROP_OF_THE_DAY_MULTIPLIER,
    windowStartAt,
    windowEndAt: windowStartAt + DAY_MS,
  };
}
