/// <reference types="jest" />

import {
  ACHIEVEMENT_TITLES,
  ACHIEVEMENT_TRACKS,
  claimNextAchievementTier,
  getAchievementClaimKey,
  getAchievementThreshold,
  getAchievementTrackStatus,
  getClaimableAchievementCount,
  getUnlockedTitles,
  isTitleUnlocked,
  normalizeActiveTitle,
  normalizeClaimedAchievements,
  normalizeLifetimeStats,
  setActiveTitle,
} from '../achievements';
import { createInitialState, migrateLoadedState } from '../constants';
import { performHarvest } from '../harvest';
import type { GameState } from '../types';

function getTrack(key: string) {
  const track = ACHIEVEMENT_TRACKS.find((candidate) => candidate.key === key);
  if (track == null) {
    throw new Error(`Achievement balance must include the ${key} track.`);
  }
  return track;
}

function stateWithStats(stats: Partial<GameState['lifetimeStats']>): GameState {
  const base = createInitialState();
  return { ...base, lifetimeStats: { ...base.lifetimeStats, ...stats } };
}

describe('achievement tracks', () => {
  test('thresholds grow geometrically and tiers are endless', () => {
    const track = getTrack('harvest_total');

    expect(getAchievementThreshold(track, 1)).toBe(track.base);
    expect(getAchievementThreshold(track, 2)).toBe(Math.floor(track.base * track.growth));
    expect(getAchievementThreshold(track, 10)).toBeGreaterThan(getAchievementThreshold(track, 9));
  });

  test('tiers must be claimed in order', () => {
    const track = getTrack('harvest_total');
    const tier3Value = getAchievementThreshold(track, 3);
    const state = stateWithStats({ totalHarvests: tier3Value });

    const status = getAchievementTrackStatus(state, 'harvest_total');
    expect(status.nextTier).toBe(1);
    expect(status.claimable).toBe(true);

    const first = claimNextAchievementTier(state, 'harvest_total');
    expect(first?.claimedTier).toBe(1);
    expect(first?.starsAwarded).toBe(track.starsPerTier);
    expect(first?.state.prestige.stars).toBe(track.starsPerTier);

    const second = claimNextAchievementTier(first!.state, 'harvest_total');
    expect(second?.claimedTier).toBe(2);

    const third = claimNextAchievementTier(second!.state, 'harvest_total');
    expect(third?.claimedTier).toBe(3);

    // Tier 4 is beyond the current stat value, so nothing more to claim.
    expect(claimNextAchievementTier(third!.state, 'harvest_total')).toBeNull();
    expect(getClaimableAchievementCount(third!.state)).toBe(0);
  });

  test('claiming below the threshold is rejected', () => {
    const track = getTrack('harvest_total');
    const state = stateWithStats({ totalHarvests: track.base - 1 });

    expect(claimNextAchievementTier(state, 'harvest_total')).toBeNull();
  });

  test('performHarvest feeds lifetime stats', () => {
    const base = createInitialState();
    const ready: GameState = {
      ...base,
      plots: base.plots.map((plot, index) =>
        index === 0 ? { ...plot, cropType: 'carrot' as const, startTime: 0, state: 2 as const } : plot
      ),
    };

    const outcome = performHarvest(ready, 0, { now: 1000, rng: () => 0.999 });
    expect(outcome!.state.lifetimeStats.totalHarvests).toBe(1);
    expect(outcome!.state.lifetimeStats.totalGoldEarned).toBe(outcome!.goldGained);
    expect(outcome!.state.lifetimeStats.mutationsFound).toBe(0);
  });
});

describe('titles', () => {
  test('titles unlock when the referenced tier is claimed and can be equipped', () => {
    const title = ACHIEVEMENT_TITLES[0]!;
    const track = getTrack(title.track);
    const claimKeys = Array.from({ length: title.tier }, (_, index) =>
      getAchievementClaimKey(title.track, index + 1)
    );
    const state: GameState = {
      ...stateWithStats({ [track.stat]: getAchievementThreshold(track, title.tier) }),
      claimedAchievements: claimKeys,
    };

    expect(isTitleUnlocked(state, title.key)).toBe(true);
    expect(getUnlockedTitles(state)).toContainEqual(title);

    const equipped = setActiveTitle(state, title.key);
    expect(equipped.activeTitle).toBe(title.key);
    expect(setActiveTitle(equipped, null).activeTitle).toBeNull();
  });

  test('locked titles cannot be equipped', () => {
    const state = createInitialState();
    expect(setActiveTitle(state, ACHIEVEMENT_TITLES[0]!.key).activeTitle).toBeNull();
  });
});

describe('achievement save migration', () => {
  test('normalizes lifetime stats and rejects garbage', () => {
    expect(normalizeLifetimeStats(undefined)).toEqual({
      totalHarvests: 0,
      totalGoldEarned: 0,
      mutationsFound: 0,
      prestigeCount: 0,
      researchPointsEarned: 0,
      breedsUnlocked: 0,
    });
    expect(normalizeLifetimeStats({ totalHarvests: -3, totalGoldEarned: Number.NaN, mutationsFound: 2.9 })).toEqual({
      totalHarvests: 0,
      totalGoldEarned: 0,
      mutationsFound: 2,
      prestigeCount: 0,
      researchPointsEarned: 0,
      breedsUnlocked: 0,
    });
  });

  test('keeps only well-formed claim keys and validates the active title', () => {
    expect(
      normalizeClaimedAchievements([
        'harvest_total:1',
        'harvest_total:1',
        'ghost_track:1',
        'harvest_total:zero',
        'harvest_total:1:extra',
        42,
      ])
    ).toEqual(['harvest_total:1']);

    const title = ACHIEVEMENT_TITLES[0]!;
    const claimKeys = Array.from({ length: title.tier }, (_, index) =>
      getAchievementClaimKey(title.track, index + 1)
    );
    expect(normalizeActiveTitle(title.key, claimKeys)).toBe(title.key);
    expect(normalizeActiveTitle(title.key, [])).toBeNull();
    expect(normalizeActiveTitle('ghost_title', claimKeys)).toBeNull();
  });

  test('lifetime harvest totals never trail proven harvest counts', () => {
    const migrated = migrateLoadedState(
      {
        harvestCounts: { carrot: 40, wheat: 10 },
        lifetimeStats: { totalHarvests: 3 } as never,
      },
      createInitialState()
    );

    expect(migrated.lifetimeStats.totalHarvests).toBe(50);
  });

  test('migration is idempotent for achievement fields', () => {
    const once = migrateLoadedState(
      {
        harvestCounts: { carrot: 200 },
        claimedAchievements: ['harvest_total:1'],
        prestige: { level: 2, stars: 5, totalStarsEarned: 9, skills: {}, currentRegionArchetype: 'plains' },
      },
      createInitialState()
    );
    const twice = migrateLoadedState(once, createInitialState());

    expect(twice.lifetimeStats).toEqual(once.lifetimeStats);
    expect(twice.claimedAchievements).toEqual(once.claimedAchievements);
    expect(twice.prestige).toEqual(once.prestige);
  });
});
