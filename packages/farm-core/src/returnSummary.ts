import type { GameState } from './types';
import { getChainIncome } from './prestige';
import { isPlotGrowthComplete } from './harvest';

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
};

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

  const offlineGold = getChainIncome(gameState, now).accruedGold;

  let readyCropCount = 0;
  for (const plot of gameState.plots) {
    if (plot.state === 2 || isPlotGrowthComplete(gameState, plot, now)) {
      readyCropCount += 1;
    }
  }

  if (offlineGold <= 0 && readyCropCount <= 0) {
    return null;
  }

  return { awayMs, offlineGold, readyCropCount };
}
