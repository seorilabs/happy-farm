import type { GameState } from './types';

// Leave headroom for intermediate arithmetic before a reward is credited.
export const MAX_ECONOMY_VALUE = 1e300;

export function normalizeEconomyValue(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return 0;
  return Math.min(value, MAX_ECONOMY_VALUE);
}

export function creditEconomyValue(current: number, reward: number) {
  const previous = normalizeEconomyValue(current);
  const balance = normalizeEconomyValue(previous + normalizeEconomyValue(reward));
  return { balance, credited: balance - previous };
}

// Normalize a copy before JSON.stringify would turn Infinity/NaN into null.
// Costs, counters, identifiers and timestamps deliberately keep their rules.
export function normalizeEconomyState(state: GameState): GameState {
  return {
    ...state,
    gold: normalizeEconomyValue(state.gold),
    research: {
      ...state.research,
      points: normalizeEconomyValue(state.research.points),
      totalPointsEarned: normalizeEconomyValue(state.research.totalPointsEarned),
    },
    lifetimeStats: {
      ...state.lifetimeStats,
      totalGoldEarned: normalizeEconomyValue(state.lifetimeStats.totalGoldEarned),
      researchPointsEarned: normalizeEconomyValue(state.lifetimeStats.researchPointsEarned),
    },
    chainFarms: state.chainFarms.map(farm => ({ ...farm, goldPerHour: normalizeEconomyValue(farm.goldPerHour) })),
  };
}
