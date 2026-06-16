// 일일 출석 보너스 로직
// 마지막 수령으로부터 24시간이 지나면 보너스 지급.
// streak은 "마지막 수령 시각(lastClaimedAt)" 기준으로 관리됩니다.
// 즉, 48시간 이내에 보너스를 수령하면 streak이 유지됩니다.
// 앱을 방문하더라도 수령하지 않으면 streak 유지로 간주하지 않습니다.

import { DEFAULT_LOCALE, type SupportedLocale } from './i18n';
import { getDailyBonusMessages } from './i18n/dailyBonusMessages';

export const DAILY_BONUS_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24시간
export const DAILY_BONUS_STREAK_EXPIRE_MS = 48 * 60 * 60 * 1000; // 마지막 수령 후 48시간 내 재수령하지 않으면 streak 초기화

// streak 단계별 보너스 골드
export const DAILY_BONUS_GOLD_BY_STREAK: Record<number, number> = {
  1: 50,
  2: 75,
};
export const DAILY_BONUS_GOLD_MAX = 100; // streak 3일 이상

export type DailyBonusState = {
  // 마지막으로 보너스를 받은 UTC ms 타임스탬프. null이면 한 번도 받지 않음.
  lastClaimedAt: number | null;
  // 현재 연속 출석 일수
  streak: number;
  // 클레임은 성공했지만 게임 저장에 아직 반영되지 않은 골드. 0이면 없음.
  // 다음 로드 시 이 값이 양수이면 자동 복구됩니다.
  pendingGold?: number;
};

export type DailyBonusResult = {
  goldAwarded: number;
  streak: number;
  newState: DailyBonusState;
};

/**
 * 현재 streak에 따른 보너스 골드 금액을 반환합니다.
 */
export function getDailyBonusGold(streak: number): number {
  if (streak <= 0) return DAILY_BONUS_GOLD_BY_STREAK[1] ?? 50;
  const clamped = Math.max(1, streak);
  return DAILY_BONUS_GOLD_BY_STREAK[clamped] ?? DAILY_BONUS_GOLD_MAX;
}

/**
 * 오늘 보너스를 받을 수 있는지 확인합니다.
 * - lastClaimedAt이 null이거나 24시간 이상 지났으면 true
 */
export function isDailyBonusAvailable(state: DailyBonusState, now = Date.now()): boolean {
  if (state.lastClaimedAt == null) return true;
  return now - state.lastClaimedAt >= DAILY_BONUS_COOLDOWN_MS;
}

/**
 * 보너스를 지급하고 새로운 DailyBonusState를 반환합니다.
 * 보너스를 받을 수 없는 상태면 null을 반환합니다.
 */
export function claimDailyBonus(state: DailyBonusState, now = Date.now()): DailyBonusResult | null {
  if (!isDailyBonusAvailable(state, now)) return null;

  // streak 유지: 마지막 수령 후 48시간 이내에 돌아온 경우
  const isStreakAlive =
    state.lastClaimedAt != null && now - state.lastClaimedAt < DAILY_BONUS_STREAK_EXPIRE_MS;

  const newStreak = isStreakAlive ? state.streak + 1 : 1;
  const goldAwarded = getDailyBonusGold(newStreak);

  return {
    goldAwarded,
    streak: newStreak,
    newState: {
      lastClaimedAt: now,
      streak: newStreak,
      // pendingGold is set so the next load can recover the award if the app
      // crashes before the game auto-save reflects it.
      pendingGold: goldAwarded,
    },
  };
}

/**
 * 클레임 전 표시용 프리뷰 값을 계산합니다. 상태를 변경하지 않으며 UI 표시에만 사용합니다.
 * `available`이 false이면 쿨다운 미충족 상태이므로 보너스를 표시하지 않아야 합니다.
 */
export function previewDailyBonus(state: DailyBonusState, now = Date.now()): { available: boolean; streak: number; goldAwarded: number } {
  const available = isDailyBonusAvailable(state, now);
  const isStreakAlive =
    state.lastClaimedAt != null && now - state.lastClaimedAt < DAILY_BONUS_STREAK_EXPIRE_MS;
  const streak = isStreakAlive ? state.streak + 1 : 1;
  return { available, streak, goldAwarded: getDailyBonusGold(streak) };
}

/**
 * 직렬화된 unknown 값을 DailyBonusState로 정규화합니다.
 * 잘못된 값은 초기 상태로 복구됩니다.
 */
export function normalizeDailyBonusState(value: unknown): DailyBonusState {
  if (typeof value !== 'object' || value == null) {
    return { lastClaimedAt: null, streak: 0, pendingGold: 0 };
  }
  const raw = value as Record<string, unknown>;
  const lastClaimedAt =
    typeof raw.lastClaimedAt === 'number' && Number.isFinite(raw.lastClaimedAt) && raw.lastClaimedAt > 0
      ? raw.lastClaimedAt
      : null;
  const streak =
    typeof raw.streak === 'number' && Number.isFinite(raw.streak) && raw.streak >= 0
      ? Math.floor(raw.streak)
      : 0;
  const pendingGold =
    typeof raw.pendingGold === 'number' && Number.isFinite(raw.pendingGold) && raw.pendingGold > 0
      ? Math.floor(raw.pendingGold)
      : 0;
  return { lastClaimedAt, streak, pendingGold };
}

/**
 * 일일 보너스 관련 i18n 메시지를 반환합니다.
 */
export function getDailyBonusLabel(
  streak: number,
  goldAwarded: number,
  locale: SupportedLocale = DEFAULT_LOCALE
): { title: string; message: string; streakLabel: string } {
  const msgs = getDailyBonusMessages(locale);
  return {
    title: msgs.dailyBonusTitle,
    message: msgs.dailyBonusMessage(goldAwarded),
    streakLabel: msgs.dailyBonusStreak(streak),
  };
}
