import type { GameState } from './types';
import { collectChainIncome, getChainIncome } from './prestige';
import { isPlotGrowthComplete } from './harvest';
import { isDailyBonusAvailable, normalizeDailyBonusState } from './dailyBonus';
import {
  getCropEconomyEstimate,
  getProfitMultiplier,
  getSpeedMultiplier,
  OFFLINE_INCOME_CAP_MS,
  OFFLINE_INCOME_EFFICIENCY_RATIO,
} from './constants';

const MS_PER_HOUR = 60 * 60 * 1000;

// Minimum time away before a returning player is greeted with the offline
// progress summary. Short app switches (checking a notification, swapping apps
// for a few seconds) should never trigger the "welcome back" moment — it only
// feels rewarding when real time has passed.
export const RETURN_SUMMARY_MIN_AWAY_MS = 10 * 60 * 1000;

export type ReturnSummary = {
  // How long the player was away (clamped to a non-negative value).
  awayMs: number;
  // Passive chain-farm gold accrued while away and waiting to be collected.
  offlineGold: number;
  // Crops sitting ready to harvest right now.
  readyCropCount: number;
  // Whether the daily login bonus can be claimed right now. Surfaced so the
  // welcome-back card can offer a "claim daily bonus" first-action CTA without
  // the player having to hunt for it (the daily sheet is otherwise suppressed
  // whenever a welcome-back recap is shown).
  dailyBonusAvailable: boolean;
};

// Passive gold the player's *active* farm accrues while away, independent of
// prestige chain farms. Only currently-growing plots (state 1 with a crop)
// contribute, each at OFFLINE_INCOME_EFFICIENCY_RATIO of its crop's hourly net
// profit, over the away window capped at OFFLINE_INCOME_CAP_MS. Tying this to
// actually-planted plots (rather than a hypothetical best-crop-on-all-plots
// estimate) means an empty or under-invested farm earns nothing, so early
// balance isn't trivialized. Pure and defensive: a non-positive or non-finite
// away window, or a degenerate rate, yields 0.
export function getActiveFarmOfflineGold(gameState: GameState, awayMs: number): number {
  if (!Number.isFinite(awayMs) || awayMs <= 0) {
    return 0;
  }
  const cappedMs = Math.min(awayMs, OFFLINE_INCOME_CAP_MS);
  if (cappedMs <= 0) {
    return 0;
  }

  const speedMultiplier = getSpeedMultiplier(gameState.upgrades.speed);
  const profitMultiplier = getProfitMultiplier(gameState.upgrades.profit);

  let netProfitPerHour = 0;
  for (const plot of gameState.plots) {
    if (plot.id >= gameState.unlockedPlotCount || plot.state !== 1 || plot.cropType == null) {
      continue;
    }
    netProfitPerHour += getCropEconomyEstimate(plot.cropType, {
      speedMultiplier,
      profitMultiplier,
    }).netProfitPerHour;
  }

  const goldPerHour = netProfitPerHour * OFFLINE_INCOME_EFFICIENCY_RATIO;
  if (!Number.isFinite(goldPerHour) || goldPerHour <= 0) {
    return 0;
  }
  return Math.floor((goldPerHour * cappedMs) / MS_PER_HOUR);
}

// Sweeps the active farm's pre-prestige offline gold into the player's purse,
// mirroring how collectChainIncome settles chain farms. Unlike chain farms there
// is no per-farm timestamp to reset: the accrual is a function of the away window
// (now - lastSeenAt), and the welcome-back recap fires once per return, so a
// single grant on settlement cannot double-pay. Pure; a no-op (state unchanged,
// grantedGold 0) when nothing accrued.
export function creditActiveFarmOfflineGold(
  gameState: GameState,
  awayMs: number
): { state: GameState; grantedGold: number } {
  const grantedGold = getActiveFarmOfflineGold(gameState, awayMs);
  if (grantedGold <= 0) {
    return { state: gameState, grantedGold: 0 };
  }
  return {
    state: {
      ...gameState,
      gold: gameState.gold + grantedGold,
      lifetimeStats: {
        ...gameState.lifetimeStats,
        totalGoldEarned: gameState.lifetimeStats.totalGoldEarned + grantedGold,
      },
    },
    grantedGold,
  };
}

// Settles ALL offline gold owed on return in a single state transition: the
// post-prestige chain accrual and the active farm's pre-prestige accrual,
// together. Keeping both in one function makes them inseparable — there is no
// caller path that can collect one while withholding the other, which is the
// invariant the welcome-back recap relies on. Returns the credited state plus a
// breakdown so the caller can drive feedback (toast/analytics). Pure.
export function collectReturnOfflineGold(
  gameState: GameState,
  awayMs: number,
  now = Date.now()
): { state: GameState; collectedGold: number; chainGold: number; activeFarmGold: number } {
  const chain = collectChainIncome(gameState, now);
  const afterChain = chain?.state ?? gameState;
  const chainGold = chain?.collectedGold ?? 0;

  const active = creditActiveFarmOfflineGold(afterChain, awayMs);

  return {
    state: active.state,
    collectedGold: chainGold + active.grantedGold,
    chainGold,
    activeFarmGold: active.grantedGold,
  };
}

// Builds the "welcome back" summary shown when a player returns after being
// away. Returns null when there is nothing worth interrupting the player for:
// they only just left, this is their very first session, or no progress is
// waiting. Pure and side-effect free so the decision can be unit tested.
export function getReturnSummary(
  gameState: GameState | null | undefined,
  lastSeenAt: number | null | undefined,
  now = Date.now()
): ReturnSummary | null {
  if (gameState == null) {
    return null;
  }
  if (lastSeenAt == null || !Number.isFinite(lastSeenAt) || lastSeenAt <= 0) {
    return null;
  }

  const awayMs = now - lastSeenAt;
  if (awayMs < RETURN_SUMMARY_MIN_AWAY_MS) {
    return null;
  }

  // Total offline gold = post-prestige chain income + the active farm's
  // pre-prestige accrual. For early/mid players (no chain farms) the active
  // farm term is the entire idle reward; for graduated players it adds to it.
  const offlineGold = getChainIncome(gameState, now).accruedGold + getActiveFarmOfflineGold(gameState, awayMs);

  let readyCropCount = 0;
  for (const plot of gameState.plots) {
    if (plot.state === 2 || isPlotGrowthComplete(gameState, plot, now)) {
      readyCropCount += 1;
    }
  }

  // The card still only interrupts the player when passive income or ready
  // crops are waiting; daily-bonus availability alone keeps the existing
  // (separate) daily sheet path and does not force a welcome-back recap.
  if (offlineGold <= 0 && readyCropCount <= 0) {
    return null;
  }

  const dailyBonusAvailable = isDailyBonusAvailable(normalizeDailyBonusState(gameState.dailyBonusState), now);

  return { awayMs, offlineGold, readyCropCount, dailyBonusAvailable };
}
