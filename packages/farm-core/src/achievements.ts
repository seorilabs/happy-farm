import balance from './balance.json';
import type { AchievementTrackKey, GameState, LifetimeStats, TitleKey } from './types';

export type AchievementTrack = {
  key: AchievementTrackKey;
  icon: string;
  stat: keyof LifetimeStats;
  base: number;
  growth: number;
  starsPerTier: number;
};

export type AchievementTitle = {
  key: TitleKey;
  icon: string;
  track: AchievementTrackKey;
  tier: number;
};

export const ACHIEVEMENT_TRACKS = balance.achievements.tracks as AchievementTrack[];
export const ACHIEVEMENT_TITLES = balance.achievements.titles as AchievementTitle[];

function getKnownTrack(trackKey: AchievementTrackKey): AchievementTrack {
  const track = ACHIEVEMENT_TRACKS.find((candidate) => candidate.key === trackKey);
  if (track == null) {
    throw new Error(`Unknown achievement track: ${trackKey}`);
  }
  return track;
}

// Tiers are endless: tier N (1-based) unlocks at base * growth^(N-1).
export function getAchievementThreshold(track: AchievementTrack, tier: number): number {
  return Math.floor(track.base * Math.pow(track.growth, Math.max(1, tier) - 1));
}

export function getAchievementClaimKey(trackKey: AchievementTrackKey, tier: number): string {
  return `${trackKey}:${tier}`;
}

function getClaimedTiers(gameState: GameState, trackKey: AchievementTrackKey): Set<number> {
  const tiers = new Set<number>();
  for (const claimKey of gameState.claimedAchievements) {
    const [claimedTrack, rawTier] = claimKey.split(':');
    if (claimedTrack !== trackKey) continue;
    const tier = Number(rawTier);
    if (Number.isInteger(tier) && tier >= 1) {
      tiers.add(tier);
    }
  }
  return tiers;
}

export type AchievementTrackStatus = {
  track: AchievementTrack;
  statValue: number;
  claimedTierCount: number;
  nextTier: number;
  nextThreshold: number;
  claimable: boolean;
  progressRatio: number;
};

export function getAchievementTrackStatus(gameState: GameState, trackKey: AchievementTrackKey): AchievementTrackStatus {
  const track = getKnownTrack(trackKey);
  const statValue = gameState.lifetimeStats[track.stat];
  const claimedTiers = getClaimedTiers(gameState, trackKey);

  // Tiers must be claimed in order; the next tier is the lowest unclaimed one.
  let nextTier = 1;
  while (claimedTiers.has(nextTier)) {
    nextTier += 1;
  }

  const nextThreshold = getAchievementThreshold(track, nextTier);
  return {
    track,
    statValue,
    claimedTierCount: claimedTiers.size,
    nextTier,
    nextThreshold,
    claimable: statValue >= nextThreshold,
    progressRatio: nextThreshold <= 0 ? 1 : Math.min(1, Math.max(0, statValue / nextThreshold)),
  };
}

export function getClaimableAchievementCount(gameState: GameState): number {
  return ACHIEVEMENT_TRACKS.filter((track) => getAchievementTrackStatus(gameState, track.key).claimable).length;
}

export function claimNextAchievementTier(
  gameState: GameState,
  trackKey: AchievementTrackKey
): { state: GameState; claimedTier: number; starsAwarded: number } | null {
  const status = getAchievementTrackStatus(gameState, trackKey);
  if (!status.claimable) {
    return null;
  }

  const starsAwarded = status.track.starsPerTier;
  return {
    state: {
      ...gameState,
      claimedAchievements: [...gameState.claimedAchievements, getAchievementClaimKey(trackKey, status.nextTier)],
      prestige: {
        ...gameState.prestige,
        stars: gameState.prestige.stars + starsAwarded,
        totalStarsEarned: gameState.prestige.totalStarsEarned + starsAwarded,
      },
    },
    claimedTier: status.nextTier,
    starsAwarded,
  };
}

export function isTitleUnlocked(gameState: GameState, titleKey: TitleKey): boolean {
  const title = ACHIEVEMENT_TITLES.find((candidate) => candidate.key === titleKey);
  if (title == null) {
    return false;
  }
  return getClaimedTiers(gameState, title.track).has(title.tier);
}

export function getUnlockedTitles(gameState: GameState): AchievementTitle[] {
  return ACHIEVEMENT_TITLES.filter((title) => isTitleUnlocked(gameState, title.key));
}

export function setActiveTitle(gameState: GameState, titleKey: TitleKey | null): GameState {
  if (titleKey != null && !isTitleUnlocked(gameState, titleKey)) {
    return gameState;
  }
  return { ...gameState, activeTitle: titleKey };
}

function normalizeStat(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

export function createInitialLifetimeStats(): LifetimeStats {
  return {
    totalHarvests: 0,
    totalGoldEarned: 0,
    mutationsFound: 0,
    prestigeCount: 0,
    researchPointsEarned: 0,
    breedsUnlocked: 0,
  };
}

export function normalizeLifetimeStats(value: unknown): LifetimeStats {
  const loaded = (typeof value === 'object' && value != null ? value : {}) as Partial<LifetimeStats>;
  return {
    totalHarvests: normalizeStat(loaded.totalHarvests),
    totalGoldEarned: normalizeStat(loaded.totalGoldEarned),
    mutationsFound: normalizeStat(loaded.mutationsFound),
    prestigeCount: normalizeStat(loaded.prestigeCount),
    researchPointsEarned: normalizeStat(loaded.researchPointsEarned),
    breedsUnlocked: normalizeStat(loaded.breedsUnlocked),
  };
}

export function normalizeClaimedAchievements(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .filter((entry) => {
      const [trackKey, rawTier] = entry.split(':');
      const tier = Number(rawTier);
      return (
        ACHIEVEMENT_TRACKS.some((track) => track.key === trackKey) && Number.isInteger(tier) && tier >= 1
      );
    })
    .filter((entry, index, items) => items.indexOf(entry) === index);
}

export function normalizeActiveTitle(value: unknown, claimedAchievements: string[]): TitleKey | null {
  const title = ACHIEVEMENT_TITLES.find((candidate) => candidate.key === value);
  if (title == null) {
    return null;
  }
  return claimedAchievements.includes(getAchievementClaimKey(title.track, title.tier)) ? title.key : null;
}
