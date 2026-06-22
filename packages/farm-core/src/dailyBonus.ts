// 일일 출석 보너스 로직
// 마지막 수령으로부터 24시간이 지나면 보너스 지급.
// streak은 "마지막 수령 시각(lastClaimedAt)" 기준으로 관리됩니다.
// 즉, 48시간 이내에 보너스를 수령하면 streak이 유지됩니다.
// 앱을 방문하더라도 수령하지 않으면 streak 유지로 간주하지 않습니다.

import balance from './balance.json';
import { DEFAULT_LOCALE, type SupportedLocale } from './i18n';
import { getDailyBonusMessages } from './i18n/dailyBonusMessages';

export const DAILY_BONUS_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24시간
export const DAILY_BONUS_STREAK_EXPIRE_MS = 48 * 60 * 60 * 1000; // 마지막 수령 후 48시간 내 재수령하지 않으면 streak 초기화

// 진행도 정보(광고 보상 골드)가 없을 때 사용하는 기본값.
// 광고 보상은 다음 목표 비용에 비례해 스케일링되며 최소값이 rewardedGoldAmount(=초기 100G)다.
// 따라서 이 기본값을 쓰면 초반 데일리 보너스는 기존과 동일한 구간(streak1=50G)에서 시작한다.
const DAILY_BONUS_BASE_AD_REWARD_GOLD = balance.ads.rewardedGoldAmount;

// streak 단계별 "광고 보상 대비 비율". 데일리 보너스는 진행도 스케일된 광고 보상에
// 이 비율을 곱한 값이며, 비율이 모두 1 미만이라 항상 광고 보상보다 낮게 유지된다(광고 인센티브 보존).
// 기본 광고 보상(100G) 기준 환산: streak1=50G, streak2=75G, streak3+=90G.
const DAILY_BONUS_AD_REWARD_RATIO_BY_STREAK: Record<number, number> = balance.dailyBonus.adRewardRatioByStreak;
const DAILY_BONUS_AD_REWARD_RATIO_MAX = balance.dailyBonus.adRewardRatioMax; // streak 3일 이상 상한 비율

export type DailyBonusState = {
  // 마지막으로 보너스를 받은 UTC ms 타임스탬프. null이면 한 번도 받지 않음.
  lastClaimedAt: number | null;
  // 현재 연속 출석 일수
  streak: number;
};

export type DailyBonusResult = {
  goldAwarded: number;
  streak: number;
  newState: DailyBonusState;
};

/**
 * streak과 현재 광고 보상 골드를 기준으로 데일리 보너스 금액을 계산합니다.
 *
 * @param streak 연속 출석 일수(1 이상으로 클램프).
 * @param adRewardGold 진행도에 비례 스케일된 광고 보상 골드(`getRewardedGoldAmount`). 생략 시
 *   기본 광고 보상(초기 100G)을 사용해 기존 고정값과 동일한 구간에서 동작합니다.
 *
 * 보너스 = floor(adRewardGold × streak별 비율). 모든 비율이 1 미만이므로 결과는 항상 광고 보상보다
 * 낮게 유지되어 광고 인센티브를 보존합니다. 진행도가 오르면 광고 보상과 함께 보너스도 커집니다.
 */
export function getDailyBonusGold(
  streak: number,
  adRewardGold: number = DAILY_BONUS_BASE_AD_REWARD_GOLD
): number {
  const clamped = Math.max(1, Math.floor(streak));
  const ratio = DAILY_BONUS_AD_REWARD_RATIO_BY_STREAK[clamped] ?? DAILY_BONUS_AD_REWARD_RATIO_MAX;
  const base =
    Number.isFinite(adRewardGold) && adRewardGold > 0 ? adRewardGold : DAILY_BONUS_BASE_AD_REWARD_GOLD;
  const scaled = Math.floor(base * ratio);
  // 광고 보상보다 항상 낮게(비율<1) 유지하면서 최소 1골드는 보장한다.
  return Number.isFinite(scaled) ? Math.max(1, scaled) : DAILY_BONUS_BASE_AD_REWARD_GOLD;
}

/**
 * 오늘 보너스를 받을 수 있는지 확인합니다.
 * - lastClaimedAt이 null이거나 24시간 이상 지났으면 true
 */
export function isDailyBonusAvailable(state: DailyBonusState, now = Date.now()): boolean {
  if (state.lastClaimedAt == null) return true;
  // Clamp future timestamps to now: treats the bonus as claimed at the current
  // moment, so the 24h cooldown still applies. This prevents repeated claims
  // via clock manipulation while avoiding a permanent lock-out.
  const safeLastClaimedAt = Math.min(state.lastClaimedAt, now);
  return now - safeLastClaimedAt >= DAILY_BONUS_COOLDOWN_MS;
}

/**
 * 보너스를 지급하고 새로운 DailyBonusState를 반환합니다.
 * 보너스를 받을 수 없는 상태면 null을 반환합니다.
 */
export function claimDailyBonus(
  state: DailyBonusState,
  now = Date.now(),
  adRewardGold: number = DAILY_BONUS_BASE_AD_REWARD_GOLD
): DailyBonusResult | null {
  if (!isDailyBonusAvailable(state, now)) return null;

  // streak 유지: safeLastClaimedAt 기준으로 48시간 이내에 돌아온 경우.
  // 미래 타임스탬프는 min(lastClaimedAt, now)로 정규화하므로 streak이 부당하게 초기화되지 않는다.
  const safeLastClaimedAt = state.lastClaimedAt != null ? Math.min(state.lastClaimedAt, now) : null;
  const isStreakAlive =
    safeLastClaimedAt != null &&
    now - safeLastClaimedAt < DAILY_BONUS_STREAK_EXPIRE_MS;

  const newStreak = isStreakAlive ? state.streak + 1 : 1;
  const goldAwarded = getDailyBonusGold(newStreak, adRewardGold);

  return {
    goldAwarded,
    streak: newStreak,
    newState: {
      lastClaimedAt: now,
      streak: newStreak,
    },
  };
}

/**
 * 데일리 보너스 쿨다운이 끝나는(다시 수령 가능해지는) UTC ms를 반환합니다.
 * 복귀 유도 알림을 "쿨다운 만료 시점"에 예약하기 위한 순수 계산 함수입니다.
 * - 한 번도 수령하지 않았으면 이미 수령 가능하므로 알림이 불필요 → null
 * - 이미 수령 가능(쿨다운 경과) 상태여도 알림 불필요 → null
 * - 아직 쿨다운 중이면 만료 시각(미래)을 반환
 * 미래 타임스탬프는 isDailyBonusAvailable과 동일하게 now로 클램프해 시계 조작에 견고합니다.
 */
export function getDailyBonusReminderAt(state: DailyBonusState, now = Date.now()): number | null {
  if (state.lastClaimedAt == null) return null;
  const safeLastClaimedAt = Math.min(state.lastClaimedAt, now);
  const readyAt = safeLastClaimedAt + DAILY_BONUS_COOLDOWN_MS;
  return readyAt > now ? readyAt : null;
}

/**
 * 클레임 전 표시용 프리뷰 값을 계산합니다. 상태를 변경하지 않으며 UI 표시에만 사용합니다.
 * `available`이 false이면 쿨다운 미충족 상태이므로 보너스를 표시하지 않아야 합니다.
 */
export function previewDailyBonus(
  state: DailyBonusState,
  now = Date.now(),
  adRewardGold: number = DAILY_BONUS_BASE_AD_REWARD_GOLD
): { available: boolean; streak: number; goldAwarded: number } {
  const available = isDailyBonusAvailable(state, now);
  const safeLastClaimedAt = state.lastClaimedAt != null ? Math.min(state.lastClaimedAt, now) : null;
  const isStreakAlive =
    safeLastClaimedAt != null &&
    now - safeLastClaimedAt < DAILY_BONUS_STREAK_EXPIRE_MS;
  const streak = isStreakAlive ? state.streak + 1 : 1;
  return { available, streak, goldAwarded: getDailyBonusGold(streak, adRewardGold) };
}

/**
 * 직렬화된 unknown 값을 DailyBonusState로 정규화합니다.
 * 잘못된 값은 초기 상태로 복구됩니다.
 */
export function normalizeDailyBonusState(value: unknown): DailyBonusState {
  if (typeof value !== 'object' || value == null) {
    return { lastClaimedAt: null, streak: 0 };
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
  return { lastClaimedAt, streak };
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
