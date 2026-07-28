/// <reference types="jest" />

import {
  createEmptyPlots,
  createInitialState as createBaseInitialState,
  getCropEconomyEstimate,
  getProfitMultiplier,
  getSpeedMultiplier,
  OFFLINE_INCOME_CAP_MS,
  OFFLINE_INCOME_EFFICIENCY_RATIO,
} from '../constants';
import { ANIMALS } from '../animals';
import {
  collectReturnOfflineGold,
  collectReturnSummaryOfflineGold,
  collectReturnSummaryOfflineGoldWithAdBonus,
  creditActiveFarmOfflineGold,
  getActiveFarmOfflineGold,
  getActiveFarmOfflineCapMs,
  getActiveFarmOfflineGoldPerHour,
  getReturnSummary,
  RETURN_SUMMARY_MIN_AWAY_MS,
} from '../returnSummary';
import { CHAIN_OFFLINE_CAP_MS, getChainIncome } from '../prestige';
import { PRODUCTION_RECIPES } from '../production';
import type { AnimalKey, CropKey, GameState, ProductionRecipeKey } from '../types';

// #427: createInitialState는 이제 첫 밭에 스타터 carrot을 자동 파종한다. 이 파일의
// 오프라인 복귀 요약 테스트는 "빈 농장"을 전제로 하므로, 밭을 비운 초기 상태로 감싼다.
const createInitialState = (): GameState => ({ ...createBaseInitialState(), plots: createEmptyPlots() });

const NOW = Date.parse('2026-06-13T03:00:00.000Z');
const MS_PER_HOUR = 60 * 60 * 1000;

const READY_CROP_KEY = 'carrot' as CropKey;

function withReadyCrop(plotIndex: number, base: GameState): GameState {
  const plots = base.plots.map((plot, index) =>
    index === plotIndex
      ? { ...plot, cropType: READY_CROP_KEY, startTime: NOW - MS_PER_HOUR, state: 2 as const }
      : plot
  );
  return { ...base, plots };
}

// Plant a growing crop (state 1) in a plot so it contributes pre-prestige
// offline income.
function withGrowingCrop(plotIndex: number, cropKey: CropKey, base: GameState): GameState {
  const plots = base.plots.map((plot, index) =>
    index === plotIndex ? { ...plot, cropType: cropKey, startTime: NOW, state: 1 as const } : plot
  );
  return { ...base, plots };
}

// Expected hourly pre-prestige rate for a set of growing crops at base upgrades.
function expectedGoldPerHour(cropKeys: CropKey[], base: GameState): number {
  const speedMultiplier = getSpeedMultiplier(base.upgrades.speed);
  const profitMultiplier = getProfitMultiplier(base.upgrades.profit);
  const sum = cropKeys.reduce(
    (acc, cropKey) =>
      acc + getCropEconomyEstimate(cropKey, { speedMultiplier, profitMultiplier }).netProfitPerHour,
    0
  );
  return sum * OFFLINE_INCOME_EFFICIENCY_RATIO;
}

function withChainFarm(goldPerHour: number, lastCollectedAt: number, base: GameState): GameState {
  return {
    ...base,
    chainFarms: [{ id: 1, archetype: 'plains', goldPerHour, lastCollectedAt }],
  };
}

function withSecondaryLoopProgress(
  readyAnimalCount: number,
  growingAnimalCount: number,
  readyCraftCount: number,
  craftingCount: number,
  base: GameState
): GameState {
  const owned: AnimalKey[] = [];
  const feeding: Partial<Record<AnimalKey, number>> = {};
  for (const [index, animal] of ANIMALS.entries()) {
    if (index >= readyAnimalCount + growingAnimalCount) break;
    owned.push(animal.key);
    feeding[animal.key] =
      index < readyAnimalCount ? NOW - animal.produceTimerMs : NOW - animal.produceTimerMs + 1;
  }

  const crafting: Partial<Record<ProductionRecipeKey, number>> = {};
  for (const [index, recipe] of PRODUCTION_RECIPES.entries()) {
    if (index >= readyCraftCount + craftingCount) break;
    crafting[recipe.key] = index < readyCraftCount ? NOW - recipe.timerMs : NOW - recipe.timerMs + 1;
  }

  return {
    ...base,
    animals: { owned, feeding },
    production: { ...base.production, crafting },
  };
}

describe('getReturnSummary', () => {
  test('returns null when no game state is available', () => {
    const lastSeen = NOW - 2 * MS_PER_HOUR;
    expect(getReturnSummary(null, lastSeen, NOW)).toBeNull();
    expect(getReturnSummary(undefined, lastSeen, NOW)).toBeNull();
  });

  test('returns null without a prior session timestamp', () => {
    const state = withReadyCrop(0, createInitialState());
    expect(getReturnSummary(state, null, NOW)).toBeNull();
    expect(getReturnSummary(state, 0, NOW)).toBeNull();
    expect(getReturnSummary(state, Number.NaN, NOW)).toBeNull();
  });

  test('returns null for short away windows', () => {
    const state = withReadyCrop(0, createInitialState());
    const lastSeen = NOW - (RETURN_SUMMARY_MIN_AWAY_MS - 1000);
    expect(getReturnSummary(state, lastSeen, NOW)).toBeNull();
  });

  test('returns null when nothing is waiting after a long absence', () => {
    const state = createInitialState();
    const lastSeen = NOW - 5 * MS_PER_HOUR;
    expect(getReturnSummary(state, lastSeen, NOW)).toBeNull();
  });

  test('surfaces ready crops after a long absence', () => {
    const state = withReadyCrop(2, withReadyCrop(0, createInitialState()));
    const lastSeen = NOW - 2 * MS_PER_HOUR;
    const summary = getReturnSummary(state, lastSeen, NOW);
    expect(summary).not.toBeNull();
    expect(summary?.readyCropCount).toBe(2);
    expect(summary?.offlineGold).toBe(0);
    expect(summary?.awayMs).toBe(2 * MS_PER_HOUR);
  });

  test('reports zero ready animal and workshop counts when no secondary timer completed', () => {
    const state = withReadyCrop(0, createInitialState());
    const summary = getReturnSummary(state, NOW - 2 * MS_PER_HOUR, NOW);

    expect(summary?.readyAnimalCount).toBe(0);
    expect(summary?.readyCraftCount).toBe(0);
  });

  test('counts only completed animal and workshop timers at the exact ready boundary', () => {
    const state = withSecondaryLoopProgress(1, 1, 1, 1, withReadyCrop(0, createInitialState()));
    const summary = getReturnSummary(state, NOW - 2 * MS_PER_HOUR, NOW);

    expect(summary?.readyAnimalCount).toBe(1);
    expect(summary?.readyCraftCount).toBe(1);
  });

  test('counts every completed animal and workshop timer', () => {
    const state = withSecondaryLoopProgress(
      ANIMALS.length,
      0,
      PRODUCTION_RECIPES.length,
      0,
      withReadyCrop(0, createInitialState())
    );
    const summary = getReturnSummary(state, NOW - 2 * MS_PER_HOUR, NOW);

    expect(summary?.readyAnimalCount).toBe(ANIMALS.length);
    expect(summary?.readyCraftCount).toBe(PRODUCTION_RECIPES.length);
  });

  test('keeps the existing card gate when only animal or workshop output is ready', () => {
    const state = withSecondaryLoopProgress(1, 0, 1, 0, createInitialState());

    expect(getReturnSummary(state, NOW - 2 * MS_PER_HOUR, NOW)).toBeNull();
  });

  test('surfaces accrued offline chain gold', () => {
    const state = withChainFarm(3600, NOW - 2 * MS_PER_HOUR, createInitialState());
    const lastSeen = NOW - 2 * MS_PER_HOUR;
    const summary = getReturnSummary(state, lastSeen, NOW);
    expect(summary).not.toBeNull();
    expect(summary?.offlineGold).toBe(7200);
    expect(summary?.readyCropCount).toBe(0);
  });

  test('offline gold respects the chain accrual cap', () => {
    const state = withChainFarm(3600, NOW - 100 * MS_PER_HOUR, createInitialState());
    const lastSeen = NOW - 100 * MS_PER_HOUR;
    const summary = getReturnSummary(state, lastSeen, NOW);
    expect(summary?.offlineGold).toBe((3600 * CHAIN_OFFLINE_CAP_MS) / MS_PER_HOUR);
  });

  test('accrues pre-prestige offline gold from growing plots even without chain farms', () => {
    const base = createInitialState();
    const state = withGrowingCrop(1, 'wheat', withGrowingCrop(0, 'wheat', base));
    const lastSeen = NOW - 2 * MS_PER_HOUR;

    const summary = getReturnSummary(state, lastSeen, NOW);
    expect(summary).not.toBeNull();
    const expected = Math.floor((expectedGoldPerHour(['wheat', 'wheat'], base) * 2 * MS_PER_HOUR) / MS_PER_HOUR);
    expect(expected).toBeGreaterThan(0);
    expect(summary?.offlineGold).toBe(expected);
  });

  test('pre-prestige offline gold is capped at the offline window', () => {
    const base = createInitialState();
    const state = withGrowingCrop(0, 'wheat', base);
    // Away far beyond the cap: accrual must clamp to OFFLINE_INCOME_CAP_MS.
    const lastSeen = NOW - 1000 * MS_PER_HOUR;

    const summary = getReturnSummary(state, lastSeen, NOW);
    const cappedExpected = Math.floor((expectedGoldPerHour(['wheat'], base) * OFFLINE_INCOME_CAP_MS) / MS_PER_HOUR);
    expect(summary?.offlineGold).toBe(cappedExpected);

    // A longer absence must not pay more than the cap.
    const longerSummary = getReturnSummary(state, NOW - 5000 * MS_PER_HOUR, NOW);
    expect(longerSummary?.offlineGold).toBe(cappedExpected);
  });

  test('pre-prestige offline gold adds to chain income', () => {
    const base = createInitialState();
    const withChain = withChainFarm(3600, NOW - 2 * MS_PER_HOUR, base);
    const state = withGrowingCrop(0, 'wheat', withChain);
    const lastSeen = NOW - 2 * MS_PER_HOUR;

    const summary = getReturnSummary(state, lastSeen, NOW);
    const activeFarm = Math.floor((expectedGoldPerHour(['wheat'], base) * 2 * MS_PER_HOUR) / MS_PER_HOUR);
    expect(summary?.offlineGold).toBe(7200 + activeFarm);
  });

  test('getActiveFarmOfflineGold is pure and defends against bad windows and empty farms', () => {
    const base = createInitialState();
    const planted = withGrowingCrop(0, 'wheat', base);

    // Empty/idle farm earns nothing (no growing plots).
    expect(getActiveFarmOfflineGold(base, 2 * MS_PER_HOUR)).toBe(0);
    // Ready (state 2) crops are not "growing" and do not accrue.
    expect(getActiveFarmOfflineGold(withReadyCrop(0, base), 2 * MS_PER_HOUR)).toBe(0);
    // Non-positive / non-finite away windows are rejected.
    expect(getActiveFarmOfflineGold(planted, 0)).toBe(0);
    expect(getActiveFarmOfflineGold(planted, -5 * MS_PER_HOUR)).toBe(0);
    expect(getActiveFarmOfflineGold(planted, Number.NaN)).toBe(0);
    expect(getActiveFarmOfflineGold(planted, Number.POSITIVE_INFINITY)).toBe(0);

    // A finite, very long window clamps to the cap (sanity vs the Infinity guard).
    expect(getActiveFarmOfflineGold(planted, 10 * OFFLINE_INCOME_CAP_MS)).toBe(
      Math.floor((expectedGoldPerHour(['wheat'], base) * OFFLINE_INCOME_CAP_MS) / MS_PER_HOUR)
    );
  });

  test('reports the active-farm offline hourly rate from growing unlocked plots', () => {
    const base = createInitialState();
    const upgraded: GameState = {
      ...base,
      upgrades: { speed: 3, profit: 4 },
    };
    const growing = withGrowingCrop(
      base.unlockedPlotCount,
      'potato',
      withGrowingCrop(1, 'wheat', withGrowingCrop(0, 'carrot', upgraded))
    );
    const before = structuredClone(growing);
    const expected = expectedGoldPerHour(['carrot', 'wheat'], upgraded);

    expect(getActiveFarmOfflineGoldPerHour(growing)).toBeCloseTo(expected);
    expect(getActiveFarmOfflineGold(growing, MS_PER_HOUR)).toBe(Math.floor(expected));
    expect(growing).toEqual(before);
    expect(getActiveFarmOfflineGoldPerHour(base)).toBe(0);
    expect(getActiveFarmOfflineGoldPerHour(withReadyCrop(0, base))).toBe(0);
  });

  test('offline studies extend the active-farm accrual cap per level', () => {
    const base = createInitialState();
    const researched: GameState = {
      ...base,
      research: {
        ...base.research,
        nodeLevels: { offline_studies: 2 },
        unlockedNodes: ['offline_studies'],
      },
    };
    const growing = withGrowingCrop(0, 'wheat', researched);
    const extendedCap = OFFLINE_INCOME_CAP_MS + 4 * MS_PER_HOUR;

    expect(getActiveFarmOfflineCapMs(researched)).toBe(extendedCap);
    expect(getActiveFarmOfflineGold(growing, 10 * extendedCap)).toBe(
      Math.floor((expectedGoldPerHour(['wheat'], researched) * extendedCap) / MS_PER_HOUR)
    );
  });

  // #273: 오프라인 튜닝 불변식 — 오프라인 세션 수익은 동일 시간 온라인 능동
  // 플레이 수익을 절대 초과하지 않는다(능동 플레이 지배 금지). 오프라인 gold는
  // 창(window ≤ cap)에 대해 정확히 efficiencyRatio × 동일창 능동 수익이므로,
  // ratio가 도메인 상한(0.5) 이하인 한 이 관계가 스테이지와 무관하게 성립한다.
  test('offline income never exceeds same-duration active play (#273)', () => {
    const base = createInitialState();
    // 여러 밭이 자라는 대표 농장(단일 밀 밭이 아닌 합산 케이스로 검증).
    const state = withGrowingCrop(2, 'wheat', withGrowingCrop(1, 'wheat', withGrowingCrop(0, 'wheat', base)));

    const speedMultiplier = getSpeedMultiplier(base.upgrades.speed);
    const profitMultiplier = getProfitMultiplier(base.upgrades.profit);
    // 동일 시간 온라인 능동 플레이 수익률(효율계수 미적용 = 100% net/h 합산).
    const activeNetPerHour = ['wheat', 'wheat', 'wheat'].reduce(
      (acc, key) =>
        acc + getCropEconomyEstimate(key as CropKey, { speedMultiplier, profitMultiplier }).netProfitPerHour,
      0
    );

    for (const awayHours of [1, 6, 24, 48]) {
      const awayMs = awayHours * MS_PER_HOUR;
      const offline = getActiveFarmOfflineGold(state, awayMs);
      const cappedHours = Math.min(awayMs, OFFLINE_INCOME_CAP_MS) / MS_PER_HOUR;
      const activePlay = Math.floor(activeNetPerHour * cappedHours);
      // 오프라인은 동일창 능동 수익을 절대 초과하지 않는다.
      expect(offline).toBeLessThanOrEqual(activePlay);
      // 그리고 정확히 efficiencyRatio 비율만큼이다(스테이지 무관 선형 관계).
      expect(offline).toBe(Math.floor(activeNetPerHour * OFFLINE_INCOME_EFFICIENCY_RATIO * cappedHours));
    }

    // 효율계수는 능동 플레이 지배 방지를 위한 상한(0.5) 이하로 유지된다.
    expect(OFFLINE_INCOME_EFFICIENCY_RATIO).toBeLessThanOrEqual(0.5);
    expect(OFFLINE_INCOME_EFFICIENCY_RATIO).toBeGreaterThan(0);
  });

  test('flags daily bonus as available when it has never been claimed', () => {
    const state = withReadyCrop(0, createInitialState());
    const lastSeen = NOW - 2 * MS_PER_HOUR;
    const summary = getReturnSummary(state, lastSeen, NOW);
    expect(summary?.dailyBonusAvailable).toBe(true);
  });

  test('flags daily bonus as unavailable when claimed within the cooldown', () => {
    const base = createInitialState();
    const state = withReadyCrop(0, {
      ...base,
      dailyBonusState: { lastClaimedAt: NOW - 1000, streak: 1 },
    });
    const lastSeen = NOW - 2 * MS_PER_HOUR;
    const summary = getReturnSummary(state, lastSeen, NOW);
    // 수확할 작물이 있어 카드는 노출되지만, 데일리는 쿨다운 중이라 CTA 비노출.
    expect(summary).not.toBeNull();
    expect(summary?.dailyBonusAvailable).toBe(false);
  });
});

describe('creditActiveFarmOfflineGold', () => {
  test('credits the accrued amount into gold and lifetime earnings', () => {
    const base = createInitialState();
    const state = withGrowingCrop(0, 'wheat', base);
    const awayMs = 2 * MS_PER_HOUR;

    const expected = getActiveFarmOfflineGold(state, awayMs);
    expect(expected).toBeGreaterThan(0);

    const { state: next, grantedGold } = creditActiveFarmOfflineGold(state, awayMs);
    expect(grantedGold).toBe(expected);
    expect(next.gold).toBe(state.gold + expected);
    expect(next.lifetimeStats.totalGoldEarned).toBe(state.lifetimeStats.totalGoldEarned + expected);
  });

  test('is a no-op (grantedGold 0, identical state reference) for every degenerate input', () => {
    const base = createInitialState();
    const planted = withGrowingCrop(0, 'wheat', base);

    // No growing plots → nothing accrues regardless of the (valid) away window.
    const empty = creditActiveFarmOfflineGold(base, 2 * MS_PER_HOUR);
    expect(empty.grantedGold).toBe(0);
    expect(empty.state).toBe(base); // same reference, not a copy

    // Every degenerate away window is rejected even with a growing plot present,
    // and must return the input state by reference (no allocation, no mutation).
    for (const badAwayMs of [0, -1, -5 * MS_PER_HOUR, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = creditActiveFarmOfflineGold(planted, badAwayMs);
      expect(result.grantedGold).toBe(0);
      expect(result.state).toBe(planted);
      // Purity: the input is never mutated.
      expect(result.state.gold).toBe(planted.gold);
      expect(result.state.lifetimeStats.totalGoldEarned).toBe(planted.lifetimeStats.totalGoldEarned);
    }
  });
});

describe('collectReturnOfflineGold', () => {
  test('settles chain and active-farm gold together in one transition', () => {
    const base = createInitialState();
    const state = withGrowingCrop(0, 'wheat', withChainFarm(3600, NOW - 2 * MS_PER_HOUR, base));
    const awayMs = 2 * MS_PER_HOUR;

    const activeFarm = getActiveFarmOfflineGold(state, awayMs);
    expect(activeFarm).toBeGreaterThan(0);

    const result = collectReturnOfflineGold(state, awayMs, NOW);
    expect(result.chainGold).toBe(7200);
    expect(result.activeFarmGold).toBe(activeFarm);
    expect(result.collectedGold).toBe(7200 + activeFarm);
    expect(result.state.gold).toBe(state.gold + 7200 + activeFarm);
    // Chain timestamp reset so the same window can't be double-collected.
    expect(result.state.chainFarms[0]!.lastCollectedAt).toBe(NOW);
    const second = collectReturnOfflineGold(result.state, 0, NOW);
    expect(second.collectedGold).toBe(0);
  });

  test('matches the summary offlineGold the welcome-back card displays', () => {
    const base = createInitialState();
    const state = withGrowingCrop(1, 'wheat', withGrowingCrop(0, 'wheat', base));
    const lastSeen = NOW - 3 * MS_PER_HOUR;

    const summary = getReturnSummary(state, lastSeen, NOW);
    const settled = collectReturnOfflineGold(state, summary!.awayMs, NOW);
    // What the card promises (offlineGold) is exactly what settlement credits.
    expect(settled.collectedGold).toBe(summary?.offlineGold);
  });
});

describe('collectReturnSummaryOfflineGold', () => {
  test('credits the captured amount after a growing plot reconciles to ready', () => {
    const base = createInitialState();
    const source = withGrowingCrop(0, 'wheat', base);
    const lastSeen = NOW - 2 * MS_PER_HOUR;
    const summary = getReturnSummary(source, lastSeen, NOW);
    expect(summary?.activeFarmGold).toBeGreaterThan(0);

    const reconciled = {
      ...source,
      plots: source.plots.map((plot, index) => (index === 0 ? { ...plot, state: 2 as const } : plot)),
    };
    const result = collectReturnSummaryOfflineGold(reconciled, summary!);

    expect(result.collectedGold).toBe(summary?.offlineGold);
    expect(result.activeFarmGold).toBe(summary?.activeFarmGold);
    expect(result.state.gold).toBe(reconciled.gold + summary!.offlineGold);
    expect(result.state.lifetimeStats.totalGoldEarned).toBe(
      reconciled.lifetimeStats.totalGoldEarned + summary!.offlineGold
    );
  });

  test('advances chain timestamps only to the capture instant', () => {
    const base = withChainFarm(3600, NOW - 2 * MS_PER_HOUR, createInitialState());
    const summary = getReturnSummary(base, NOW - 2 * MS_PER_HOUR, NOW);
    expect(summary?.chainGold).toBe(7200);

    const result = collectReturnSummaryOfflineGold(base, summary!);
    expect(result.state.chainFarms[0]?.lastCollectedAt).toBe(NOW);
    expect(getChainIncome(result.state, NOW + MS_PER_HOUR).accruedGold).toBe(3600);
  });

  test('credits base plus an equal ad bonus atomically with a 2x payout', () => {
    const base = withChainFarm(3600, NOW - MS_PER_HOUR, createInitialState());
    const summary = getReturnSummary(base, NOW - MS_PER_HOUR, NOW)!;
    expect(summary.offlineGold).toBeGreaterThan(0);

    const result = collectReturnSummaryOfflineGoldWithAdBonus(base, summary);

    expect(result.collectedGold).toBe(summary.offlineGold * 2);
    expect(result.state.gold).toBe(base.gold + summary.offlineGold * 2);
    expect(result.state.lifetimeStats.totalGoldEarned).toBe(
      base.lifetimeStats.totalGoldEarned + summary.offlineGold * 2
    );
    expect(result.state.chainFarms[0]?.lastCollectedAt).toBe(summary.capturedAt);
  });

  test('falls back to the guaranteed 1x payout for an invalid multiplier', () => {
    const base = withChainFarm(3600, NOW - MS_PER_HOUR, createInitialState());
    const summary = getReturnSummary(base, NOW - MS_PER_HOUR, NOW)!;

    for (const multiplier of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(collectReturnSummaryOfflineGold(base, summary, multiplier).collectedGold).toBe(summary.offlineGold);
    }
  });

  test('is a no-op for an empty or invalid snapshot', () => {
    const base = createInitialState();
    const result = collectReturnSummaryOfflineGold(base, {
      capturedAt: NOW,
      chainGold: Number.NaN,
      activeFarmGold: -1,
    });

    expect(result.state).toBe(base);
    expect(result.collectedGold).toBe(0);

    for (const capturedAt of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
      const invalidCapture = collectReturnSummaryOfflineGold(base, {
        capturedAt,
        chainGold: 100,
        activeFarmGold: 50,
      });
      expect(invalidCapture.state).toBe(base);
      expect(invalidCapture.collectedGold).toBe(0);
    }
  });
});
