/// <reference types="jest" />

import {
  DAILY_BONUS_COOLDOWN_MS,
  DAILY_BONUS_STREAK_EXPIRE_MS,
  claimDailyBonus,
  getDailyBonusGold,
  isDailyBonusAvailable,
  normalizeDailyBonusState,
  previewDailyBonus,
  type DailyBonusState,
} from '../dailyBonus';

const NOW = Date.parse('2026-06-13T12:00:00.000Z');
const H24 = DAILY_BONUS_COOLDOWN_MS;
const H48 = DAILY_BONUS_STREAK_EXPIRE_MS;

const fresh: DailyBonusState = { lastClaimedAt: null, streak: 0 };

describe('isDailyBonusAvailable', () => {
  test('available when never claimed', () => {
    expect(isDailyBonusAvailable(fresh, NOW)).toBe(true);
  });

  test('not available if claimed less than 24h ago', () => {
    const state: DailyBonusState = { lastClaimedAt: NOW - H24 + 1, streak: 1 };
    expect(isDailyBonusAvailable(state, NOW)).toBe(false);
  });

  test('available at exactly 24h boundary', () => {
    const state: DailyBonusState = { lastClaimedAt: NOW - H24, streak: 1 };
    expect(isDailyBonusAvailable(state, NOW)).toBe(true);
  });

  test('available after more than 24h', () => {
    const state: DailyBonusState = { lastClaimedAt: NOW - H24 - 1, streak: 1 };
    expect(isDailyBonusAvailable(state, NOW)).toBe(true);
  });
});

describe('claimDailyBonus', () => {
  test('returns null if not available', () => {
    const state: DailyBonusState = { lastClaimedAt: NOW - H24 + 1000, streak: 1 };
    expect(claimDailyBonus(state, NOW)).toBeNull();
  });

  test('first claim gives streak 1 and 50G', () => {
    const result = claimDailyBonus(fresh, NOW);
    expect(result).not.toBeNull();
    expect(result!.streak).toBe(1);
    expect(result!.goldAwarded).toBe(50);
  });

  test('sets lastClaimedAt to now in newState', () => {
    const result = claimDailyBonus(fresh, NOW);
    expect(result!.newState.lastClaimedAt).toBe(NOW);
  });

  test('sets pendingGold in newState for crash recovery', () => {
    const result = claimDailyBonus(fresh, NOW);
    expect(result!.newState.pendingGold).toBe(result!.goldAwarded);
  });

  test('second claim within 48h gives streak 2 and 75G', () => {
    const state: DailyBonusState = { lastClaimedAt: NOW - H24, streak: 1 };
    const result = claimDailyBonus(state, NOW);
    expect(result!.streak).toBe(2);
    expect(result!.goldAwarded).toBe(75);
  });

  test('third claim within 48h gives streak 3 and 100G', () => {
    const state: DailyBonusState = { lastClaimedAt: NOW - H24, streak: 2 };
    const result = claimDailyBonus(state, NOW);
    expect(result!.streak).toBe(3);
    expect(result!.goldAwarded).toBe(100);
  });

  test('streak resets at exactly 48h boundary', () => {
    // Condition: now - lastClaimedAt < H48 → at H48 exactly, streak is NOT alive
    const state: DailyBonusState = { lastClaimedAt: NOW - H48, streak: 5 };
    const result = claimDailyBonus(state, NOW);
    expect(result!.streak).toBe(1);
    expect(result!.goldAwarded).toBe(50);
  });

  test('streak resets when beyond 48h', () => {
    const state: DailyBonusState = { lastClaimedAt: NOW - H48 - 1000, streak: 5 };
    const result = claimDailyBonus(state, NOW);
    expect(result!.streak).toBe(1);
    expect(result!.goldAwarded).toBe(50);
  });

  test('streak preserved when 1ms before 48h boundary', () => {
    const state: DailyBonusState = { lastClaimedAt: NOW - H48 + 1, streak: 3 };
    const result = claimDailyBonus(state, NOW);
    expect(result!.streak).toBe(4);
    expect(result!.goldAwarded).toBe(100);
  });
});

describe('getDailyBonusGold', () => {
  test('streak 1 → 50G', () => expect(getDailyBonusGold(1)).toBe(50));
  test('streak 2 → 75G', () => expect(getDailyBonusGold(2)).toBe(75));
  test('streak 3 → 100G', () => expect(getDailyBonusGold(3)).toBe(100));
  test('streak 10 → 100G', () => expect(getDailyBonusGold(10)).toBe(100));
  test('streak 0 → 50G (clamped to 1)', () => expect(getDailyBonusGold(0)).toBe(50));
});

describe('normalizeDailyBonusState', () => {
  test('null returns default state', () => {
    expect(normalizeDailyBonusState(null)).toEqual({ lastClaimedAt: null, streak: 0, pendingGold: 0 });
  });

  test('undefined returns default state', () => {
    expect(normalizeDailyBonusState(undefined)).toEqual({ lastClaimedAt: null, streak: 0, pendingGold: 0 });
  });

  test('valid state is returned as-is', () => {
    const state = { lastClaimedAt: NOW, streak: 2, pendingGold: 50 };
    expect(normalizeDailyBonusState(state)).toEqual(state);
  });

  test('missing pendingGold defaults to 0', () => {
    const result = normalizeDailyBonusState({ lastClaimedAt: NOW, streak: 1 });
    expect(result.pendingGold).toBe(0);
  });

  test('negative pendingGold is replaced with 0', () => {
    const result = normalizeDailyBonusState({ lastClaimedAt: NOW, streak: 1, pendingGold: -10 });
    expect(result.pendingGold).toBe(0);
  });

  test('invalid lastClaimedAt is replaced with null', () => {
    const result = normalizeDailyBonusState({ lastClaimedAt: 'bad', streak: 1 });
    expect(result.lastClaimedAt).toBeNull();
  });

  test('negative lastClaimedAt is replaced with null', () => {
    const result = normalizeDailyBonusState({ lastClaimedAt: -1, streak: 1 });
    expect(result.lastClaimedAt).toBeNull();
  });

  test('fractional streak is floored', () => {
    const result = normalizeDailyBonusState({ lastClaimedAt: null, streak: 2.9 });
    expect(result.streak).toBe(2);
  });

  test('negative streak is replaced with 0', () => {
    const result = normalizeDailyBonusState({ lastClaimedAt: null, streak: -1 });
    expect(result.streak).toBe(0);
  });
});

describe('previewDailyBonus', () => {
  test('never claimed: available true, streak 1, 50G', () => {
    const preview = previewDailyBonus(fresh, NOW);
    expect(preview.available).toBe(true);
    expect(preview.streak).toBe(1);
    expect(preview.goldAwarded).toBe(50);
  });

  test('within cooldown: available false', () => {
    const state: DailyBonusState = { lastClaimedAt: NOW - H24 + 1, streak: 1 };
    const preview = previewDailyBonus(state, NOW);
    expect(preview.available).toBe(false);
  });

  test('within 48h previews streak+1', () => {
    const state: DailyBonusState = { lastClaimedAt: NOW - H24, streak: 2 };
    const preview = previewDailyBonus(state, NOW);
    expect(preview.available).toBe(true);
    expect(preview.streak).toBe(3);
    expect(preview.goldAwarded).toBe(100);
  });

  test('after 48h previews streak reset to 1', () => {
    const state: DailyBonusState = { lastClaimedAt: NOW - H48, streak: 5 };
    const preview = previewDailyBonus(state, NOW);
    expect(preview.available).toBe(true);
    expect(preview.streak).toBe(1);
    expect(preview.goldAwarded).toBe(50);
  });

  test('preview matches claimDailyBonus values', () => {
    const state: DailyBonusState = { lastClaimedAt: NOW - H24, streak: 1 };
    const preview = previewDailyBonus(state, NOW);
    const claim = claimDailyBonus(state, NOW)!;
    expect(preview.streak).toBe(claim.streak);
    expect(preview.goldAwarded).toBe(claim.goldAwarded);
  });
});
