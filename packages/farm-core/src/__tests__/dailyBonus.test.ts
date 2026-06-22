/// <reference types="jest" />

import {
  DAILY_BONUS_COOLDOWN_MS,
  DAILY_BONUS_STREAK_EXPIRE_MS,
  claimDailyBonus,
  getDailyBonusGold,
  getDailyBonusReminderAt,
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

  test('future lastClaimedAt is treated as not available (clamped to now, so 0ms elapsed)', () => {
    const state: DailyBonusState = { lastClaimedAt: NOW + H24, streak: 3 };
    expect(isDailyBonusAvailable(state, NOW)).toBe(false);
  });

  test('future lastClaimedAt unlocks after 24h have passed in real time', () => {
    // safeLastClaimedAt = min(NOW + H24, NOW + H24 + 1) = NOW + H24
    // elapsed = 1ms < 24h → still locked
    const state: DailyBonusState = { lastClaimedAt: NOW + H24, streak: 3 };
    expect(isDailyBonusAvailable(state, NOW + H24 + 1)).toBe(false);
    // After another full 24h window from lastClaimedAt, unlocks normally
    expect(isDailyBonusAvailable(state, NOW + H24 + DAILY_BONUS_COOLDOWN_MS)).toBe(true);
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

  test('second claim within 48h gives streak 2 and 75G', () => {
    const state: DailyBonusState = { lastClaimedAt: NOW - H24, streak: 1 };
    const result = claimDailyBonus(state, NOW);
    expect(result!.streak).toBe(2);
    expect(result!.goldAwarded).toBe(75);
  });

  test('third claim within 48h gives streak 3 and 90G (base ad reward)', () => {
    const state: DailyBonusState = { lastClaimedAt: NOW - H24, streak: 2 };
    const result = claimDailyBonus(state, NOW);
    expect(result!.streak).toBe(3);
    expect(result!.goldAwarded).toBe(90);
  });

  test('ad reward scales the bonus: streak 3 with adReward 1000 gives 900G', () => {
    const state: DailyBonusState = { lastClaimedAt: NOW - H24, streak: 2 };
    const result = claimDailyBonus(state, NOW, 1000);
    expect(result!.streak).toBe(3);
    expect(result!.goldAwarded).toBe(900);
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
    expect(result!.goldAwarded).toBe(90);
  });

  test('future lastClaimedAt returns null (treated as just claimed, cooldown active)', () => {
    const state: DailyBonusState = { lastClaimedAt: NOW + H24, streak: 5 };
    expect(claimDailyBonus(state, NOW)).toBeNull();
  });

  test('future lastClaimedAt: claim succeeds after real 24h passes, preserves streak', () => {
    // safeLastClaimedAt = min(NOW + H24, NOW + H24 + COOLDOWN) = NOW + H24
    // elapsed = COOLDOWN → available
    // streak: safeLastClaimedAt = NOW + H24, elapsed since it = COOLDOWN < H48 → alive
    const state: DailyBonusState = { lastClaimedAt: NOW + H24, streak: 3 };
    const result = claimDailyBonus(state, NOW + H24 + DAILY_BONUS_COOLDOWN_MS);
    expect(result).not.toBeNull();
    expect(result!.streak).toBe(4);
    expect(result!.goldAwarded).toBe(90);
  });
});

describe('getDailyBonusGold', () => {
  // 기본값(광고 보상 골드 미지정)은 초기 광고 보상 100G 기준으로 환산된다.
  test('streak 1 → 50G', () => expect(getDailyBonusGold(1)).toBe(50));
  test('streak 2 → 75G', () => expect(getDailyBonusGold(2)).toBe(75));
  test('streak 3 → 90G', () => expect(getDailyBonusGold(3)).toBe(90));
  test('streak 10 → 90G (상한 비율)', () => expect(getDailyBonusGold(10)).toBe(90));
  test('streak 0 → 50G (clamped to 1)', () => expect(getDailyBonusGold(0)).toBe(50));

  test('진행도(광고 보상)에 비례해 스케일링된다', () => {
    expect(getDailyBonusGold(1, 1000)).toBe(500);
    expect(getDailyBonusGold(2, 1000)).toBe(750);
    expect(getDailyBonusGold(3, 1000)).toBe(900);
  });

  test('어떤 streak/진행도에서도 광고 보상보다 항상 낮다', () => {
    for (const adReward of [100, 250, 1000, 50000, 1_000_000]) {
      for (const streak of [1, 2, 3, 5, 50]) {
        expect(getDailyBonusGold(streak, adReward)).toBeLessThan(adReward);
      }
    }
  });

  test('streak이 오를수록 보너스도 단조 증가한다(상한까지)', () => {
    expect(getDailyBonusGold(1, 1000)).toBeLessThan(getDailyBonusGold(2, 1000));
    expect(getDailyBonusGold(2, 1000)).toBeLessThan(getDailyBonusGold(3, 1000));
    expect(getDailyBonusGold(3, 1000)).toBe(getDailyBonusGold(4, 1000)); // streak 3+ 동일 상한
  });

  test('비정상 광고 보상 값은 기본 광고 보상으로 폴백한다', () => {
    expect(getDailyBonusGold(1, Number.NaN)).toBe(50);
    expect(getDailyBonusGold(1, 0)).toBe(50);
    expect(getDailyBonusGold(1, -100)).toBe(50);
  });
});

describe('getDailyBonusReminderAt', () => {
  test('never claimed → null (이미 수령 가능, 알림 불필요)', () => {
    expect(getDailyBonusReminderAt(fresh, NOW)).toBeNull();
  });

  test('쿨다운 중이면 만료 시각을 반환', () => {
    const state: DailyBonusState = { lastClaimedAt: NOW, streak: 1 };
    expect(getDailyBonusReminderAt(state, NOW)).toBe(NOW + H24);
  });

  test('쿨다운이 막 끝났으면 null (now 시점에 수령 가능)', () => {
    const state: DailyBonusState = { lastClaimedAt: NOW - H24, streak: 1 };
    expect(getDailyBonusReminderAt(state, NOW)).toBeNull();
  });

  test('쿨다운 경과(이미 수령 가능) → null', () => {
    const state: DailyBonusState = { lastClaimedAt: NOW - H24 - 1000, streak: 1 };
    expect(getDailyBonusReminderAt(state, NOW)).toBeNull();
  });

  test('미래 lastClaimedAt은 now로 클램프되어 now+24h를 반환', () => {
    const state: DailyBonusState = { lastClaimedAt: NOW + H24, streak: 1 };
    expect(getDailyBonusReminderAt(state, NOW)).toBe(NOW + H24);
  });
});

describe('normalizeDailyBonusState', () => {
  test('null returns default state', () => {
    expect(normalizeDailyBonusState(null)).toEqual({ lastClaimedAt: null, streak: 0 });
  });

  test('undefined returns default state', () => {
    expect(normalizeDailyBonusState(undefined)).toEqual({ lastClaimedAt: null, streak: 0 });
  });

  test('valid state is returned as-is', () => {
    const state = { lastClaimedAt: NOW, streak: 2 };
    expect(normalizeDailyBonusState(state)).toEqual(state);
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

  test('zero lastClaimedAt is replaced with null (epoch time = never claimed)', () => {
    const result = normalizeDailyBonusState({ lastClaimedAt: 0, streak: 1 });
    expect(result.lastClaimedAt).toBeNull();
  });

  test('Infinity lastClaimedAt is replaced with null', () => {
    const result = normalizeDailyBonusState({ lastClaimedAt: Infinity, streak: 1 });
    expect(result.lastClaimedAt).toBeNull();
  });

  test('NaN lastClaimedAt is replaced with null', () => {
    const result = normalizeDailyBonusState({ lastClaimedAt: NaN, streak: 1 });
    expect(result.lastClaimedAt).toBeNull();
  });

  test('Infinity streak is replaced with 0', () => {
    const result = normalizeDailyBonusState({ lastClaimedAt: null, streak: Infinity });
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
    expect(preview.goldAwarded).toBe(90);
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

  test('동일한 광고 보상 골드로 preview와 claim 값이 일치한다', () => {
    const state: DailyBonusState = { lastClaimedAt: NOW - H24, streak: 1 };
    const preview = previewDailyBonus(state, NOW, 1000);
    const claim = claimDailyBonus(state, NOW, 1000)!;
    expect(preview.goldAwarded).toBe(claim.goldAwarded);
    expect(preview.goldAwarded).toBe(750);
  });
});
