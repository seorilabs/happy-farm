import type { PrestigeProgress } from './types';

export function createInitialPrestigeProgress(): PrestigeProgress {
  return { level: 0, stars: 0, totalStarsEarned: 0 };
}

function normalizeCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

export function normalizePrestigeProgress(value: unknown): PrestigeProgress {
  const loaded = (typeof value === 'object' && value != null ? value : {}) as Partial<PrestigeProgress>;
  const stars = normalizeCount(loaded.stars);
  return {
    level: normalizeCount(loaded.level),
    stars,
    // Total earned can never trail the currently held amount.
    totalStarsEarned: Math.max(stars, normalizeCount(loaded.totalStarsEarned)),
  };
}
