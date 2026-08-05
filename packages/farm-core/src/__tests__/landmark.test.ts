/// <reference types="jest" />

import balance from '../balance.json';
import { createInitialState, getShopRewardedAdOffer, migrateLoadedState } from '../constants';
import {
  LANDMARK_STAGES,
  LANDMARK_TOTAL_GOLD_COST_RATIO,
  createInitialLandmarkState,
  fundLandmarkStage,
  getLandmarkStageQuote,
  getLandmarkStatus,
  getLandmarkVisualState,
  grantLandmarkAnimalProductStock,
  grantLandmarkFestivalDeliveryPoints,
  normalizeLandmarkState,
  type LandmarkStageKey,
} from '../landmark';
import { getDailyMissionsSnapshot } from '../missions';
import { createPrestigedState, getPrestigeCost } from '../prestige';
import { getCookingTimerMs, resolveCooking, startCooking } from '../cooking';
import { ANIMALS, collectAllReadyProduce, collectProduceWithOutcome } from '../animals';
import { META_LAYER_KEYS, type CropKey, type GameState } from '../types';

const NOW = Date.parse('2026-08-05T03:00:00.000Z');

function tierOneProject(overrides: Partial<GameState> = {}): GameState {
  const base = createInitialState();
  return {
    ...base,
    prestige: { ...base.prestige, level: 1 },
    gold: getPrestigeCost(1),
    production: {
      ...base.production,
      inventory: { carrot: 300 },
    },
    landmark: {
      ...base.landmark,
      festivalDeliveryPoints: 20,
      animalProductStock: 30,
    },
    ...overrides,
  };
}

describe('landmark catalog and status', () => {
  test('uses the fixed five-stage plan and exactly 72% of graduation cost', () => {
    expect(LANDMARK_STAGES.map((stage) => stage.key)).toEqual([
      'foundation',
      'frame',
      'equipment',
      'festival_prep',
      'complete',
    ]);
    expect(LANDMARK_STAGES.map((stage) => stage.goldCostRatio)).toEqual([0.03, 0.07, 0.12, 0.2, 0.3]);
    expect(LANDMARK_TOTAL_GOLD_COST_RATIO).toBe(0.72);
    expect(LANDMARK_STAGES.reduce((total, stage) => total + stage.goldCostRatio, 0)).toBeCloseTo(0.72, 12);
  });

  test('is locked at P0 and opens the first foundation project at P1', () => {
    const p0 = createInitialState();
    expect(getLandmarkStatus(p0)).toMatchObject({
      isFeatureUnlocked: false,
      hasActiveProject: false,
      completedTier: 0,
      currentTier: 1,
      currentStageKey: null,
      visualState: 'locked',
    });
    expect(getLandmarkStageQuote(p0)).toBeNull();

    const p1 = tierOneProject();
    expect(getLandmarkStatus(p1)).toMatchObject({
      isFeatureUnlocked: true,
      hasActiveProject: true,
      completedForCurrentPrestige: false,
      currentTier: 1,
      currentStageIndex: 0,
      currentStageKey: 'foundation',
      visualState: 'foundation',
    });
    expect(getLandmarkStageQuote(p1)?.requirements).toEqual({
      gold: Math.floor(getPrestigeCost(1) * 0.03),
      cropUnits: 10,
      animalProducts: 0,
      festivalPoints: 0,
    });
  });

  test('maps construction progress to the stable environment visual states', () => {
    const base = tierOneProject();
    expect(getLandmarkVisualState(base)).toBe('foundation');
    expect(
      getLandmarkVisualState({
        ...base,
        landmark: { ...base.landmark, completedStages: ['foundation', 'frame'] },
      })
    ).toBe('scaffold');
    expect(
      getLandmarkVisualState({
        ...base,
        landmark: {
          ...base.landmark,
          completedStages: ['foundation', 'frame', 'equipment', 'festival_prep'],
        },
      })
    ).toBe('festival');
    expect(
      getLandmarkVisualState({
        ...base,
        landmark: { ...base.landmark, completedTier: 1, completedStages: [] },
      })
    ).toBe('complete');

    const p2 = {
      ...base,
      prestige: { ...base.prestige, level: 2 },
      landmark: { ...base.landmark, completedTier: 1, completedStages: [] },
    };
    expect(getLandmarkVisualState(p2)).toBe('foundation');
  });
});

describe('landmark funding transition', () => {
  test('atomically consumes gold and lowest-tier crops, and records spend_gold once', () => {
    const base = tierOneProject();
    const state: GameState = {
      ...base,
      production: {
        ...base.production,
        inventory: { carrot: 5, wheat: 6, corn: 100 },
      },
    };
    const quote = getLandmarkStageQuote(state)!;
    const funded = fundLandmarkStage(state, 1, 'foundation', NOW)!;

    expect(funded.quote).toEqual(quote);
    expect(funded.state.gold).toBe(state.gold - quote.requirements.gold);
    expect(funded.state.production.inventory).toEqual({ wheat: 1, corn: 100 });
    expect(funded.state.landmark.completedStages).toEqual(['foundation']);
    expect(
      getDailyMissionsSnapshot(funded.state.dailyMissionState, NOW, funded.state.unlockedAreas).missions.find(
        (mission) => mission.type === 'spend_gold'
      )?.progress
    ).toBe(quote.requirements.gold);
    expect(state.production.inventory).toEqual({ carrot: 5, wheat: 6, corn: 100 });
  });

  test('rejects stale tier/stage guards and a repeated double tap', () => {
    const state = tierOneProject();
    expect(fundLandmarkStage(state, 2, 'foundation', NOW)).toBeNull();
    expect(fundLandmarkStage(state, 1, 'frame', NOW)).toBeNull();

    const first = fundLandmarkStage(state, 1, 'foundation', NOW)!;
    expect(fundLandmarkStage(first.state, 1, 'foundation', NOW)).toBeNull();
  });

  test('does not mutate or partially consume resources when any requirement is missing', () => {
    const base = tierOneProject();
    const stageThree: GameState = {
      ...base,
      landmark: {
        completedTier: 0,
        completedStages: ['foundation', 'frame'],
        goldSpentThisTier: 0,
        animalProductStock: 3,
        festivalDeliveryPoints: 0,
      },
    };
    const before = JSON.parse(JSON.stringify(stageThree)) as GameState;
    const quote = getLandmarkStageQuote(stageThree)!;
    expect(quote.blockedReason).toBe('insufficient_festival_points');
    expect(fundLandmarkStage(stageThree, quote.tier, quote.stageKey, NOW)).toBeNull();
    expect(stageThree).toEqual(before);

    const cropPoor: GameState = {
      ...base,
      production: { ...base.production, inventory: { carrot: 9 } },
    };
    expect(getLandmarkStageQuote(cropPoor)?.blockedReason).toBe('insufficient_crops');
    expect(fundLandmarkStage(cropPoor, 1, 'foundation', NOW)).toBeNull();
  });

  test('completes all stages for exactly 72% of that tier graduation cost', () => {
    let state = tierOneProject();
    const initialGold = state.gold;
    const fundedStageKeys: LandmarkStageKey[] = [];

    while (getLandmarkStatus(state).hasActiveProject) {
      const quote = getLandmarkStageQuote(state)!;
      fundedStageKeys.push(quote.stageKey);
      state = fundLandmarkStage(state, quote.tier, quote.stageKey, NOW)!.state;
    }

    expect(fundedStageKeys).toEqual(LANDMARK_STAGES.map((stage) => stage.key));
    expect(initialGold - state.gold).toBe(Math.floor(getPrestigeCost(1) * LANDMARK_TOTAL_GOLD_COST_RATIO));
    expect(state.landmark).toMatchObject({ completedTier: 1, completedStages: [] });
    expect(getLandmarkStatus(state)).toMatchObject({
      hasActiveProject: false,
      completedForCurrentPrestige: true,
      visualState: 'complete',
    });
  });

  test.each([8, 18])(
    'keeps each quote equal to the observed debit and the tier total at exact 72%% for P%s',
    (tier) => {
      const base = createInitialState();
      let state: GameState = {
        ...base,
        prestige: { ...base.prestige, level: tier },
        gold: getPrestigeCost(tier),
        production: { ...base.production, inventory: { carrot: 1_000 } },
        landmark: {
          ...createInitialLandmarkState(),
          completedTier: tier - 1,
          animalProductStock: 100,
          festivalDeliveryPoints: 100,
        },
      };
      const initialGold = state.gold;
      let quotedTotal = 0;

      while (getLandmarkStatus(state).hasActiveProject) {
        const quote = getLandmarkStageQuote(state)!;
        const beforeGold = state.gold;
        const funded = fundLandmarkStage(state, quote.tier, quote.stageKey, NOW)!;
        expect(beforeGold - funded.state.gold).toBe(quote.requirements.gold);
        quotedTotal += quote.requirements.gold;
        state = funded.state;
      }

      const exactGraduationCost =
        BigInt(balance.regions.graduation.costBase) *
        BigInt(balance.regions.graduation.costGrowth) ** BigInt(tier);
      const exactTargetAsNumber = Number((exactGraduationCost * 72n) / 100n);
      expect(quotedTotal).toBe(exactTargetAsNumber);
      expect(initialGold - state.gold).toBe(exactTargetAsNumber);
    }
  );
});

describe('landmark material sources and rewarded ad motivation', () => {
  test('only duplicate successful dishes grant one festival delivery point', () => {
    const ingredients = ['carrot', 'wheat'] as CropKey[];
    const timerMs = getCookingTimerMs(ingredients);
    const base = tierOneProject({
      production: {
        ...createInitialState().production,
        inventory: { carrot: 2, wheat: 2 },
      },
      landmark: createInitialLandmarkState(),
    });

    const firstStarted = startCooking(base, ingredients, NOW)!;
    const first = resolveCooking(firstStarted, NOW + timerMs, () => 0)!;
    expect(first.result).toMatchObject({ outcome: 'success', isNew: true });
    expect(first.state.landmark.festivalDeliveryPoints).toBe(0);

    const secondReady = startCooking(
      {
        ...first.state,
        production: {
          ...first.state.production,
          inventory: { carrot: 1, wheat: 1 },
        },
      },
      ingredients,
      NOW + timerMs
    )!;
    const duplicate = resolveCooking(secondReady, NOW + timerMs * 2, () => 0)!;
    expect(duplicate.result).toMatchObject({ outcome: 'success', isNew: false });
    expect(duplicate.state.landmark.festivalDeliveryPoints).toBe(1);
  });

  test('each successful animal collection adds one product, including collect-all', () => {
    const chicken = ANIMALS.find((animal) => animal.key === 'chicken')!;
    const cow = ANIMALS.find((animal) => animal.key === 'cow')!;
    const base = tierOneProject({
      landmark: createInitialLandmarkState(),
      animals: {
        owned: [chicken.key, cow.key],
        feeding: {
          [chicken.key]: NOW - chicken.produceTimerMs,
          [cow.key]: NOW - cow.produceTimerMs,
        },
      },
    });

    const single = collectProduceWithOutcome(base, chicken.key, NOW)!;
    expect(single.state.landmark.animalProductStock).toBe(1);
    expect(collectProduceWithOutcome(single.state, chicken.key, NOW)).toBeNull();

    const all = collectAllReadyProduce(base, NOW);
    expect(all.collectedCount).toBe(2);
    expect(all.state.landmark.animalProductStock).toBe(2);
  });

  test('grants are non-negative and the shop ad switches from gold to landmark points at P1', () => {
    const p0 = createInitialState();
    expect(getShopRewardedAdOffer(p0)).toEqual({
      kind: 'gold',
      amount: expect.any(Number),
    });

    const p1 = tierOneProject({ landmark: createInitialLandmarkState() });
    expect(getShopRewardedAdOffer(p1)).toEqual({
      kind: 'festival_delivery_points',
      amount: balance.landmark.rewardedAdFestivalPoints,
    });
    const withFestival = grantLandmarkFestivalDeliveryPoints(p1, 1);
    expect(withFestival.landmark.festivalDeliveryPoints).toBe(1);
    const withAnimal = grantLandmarkAnimalProductStock(withFestival);
    expect(withAnimal.landmark.animalProductStock).toBe(1);
    expect(grantLandmarkFestivalDeliveryPoints(withAnimal, Number.NaN)).toBe(withAnimal);
  });
});

describe('landmark save migration and prestige boundary', () => {
  test('backfills only old tiers for a legacy Pn save and keeps explicit state idempotent', () => {
    const initial = createInitialState();
    const legacyP5: Partial<GameState> = {
      ...initial,
      prestige: { ...initial.prestige, level: 5 },
    };
    delete legacyP5.landmark;
    const migrated = migrateLoadedState(legacyP5, createInitialState());
    expect(migrated.landmark).toEqual({
      completedTier: 4,
      completedStages: [],
      goldSpentThisTier: 0,
      festivalDeliveryPoints: 0,
      animalProductStock: 0,
    });
    expect(getLandmarkStatus(migrated)).toMatchObject({ currentTier: 5, hasActiveProject: true });

    const explicit = normalizeLandmarkState(
      {
        completedTier: 2,
        completedStages: ['foundation', 'frame'],
        festivalDeliveryPoints: 7,
        animalProductStock: 9,
      },
      5,
      false
    );
    expect(normalizeLandmarkState(explicit, 5, false)).toEqual(explicit);
  });

  test('repairs malformed progress to a contiguous prefix and canonical completed tier', () => {
    expect(
      normalizeLandmarkState(
        {
          completedTier: 0,
          completedStages: ['foundation', 'equipment', 'frame'],
          festivalDeliveryPoints: -3,
          animalProductStock: Number.POSITIVE_INFINITY,
        },
        1,
        false
      )
    ).toEqual({
      completedTier: 0,
      completedStages: ['foundation'],
      goldSpentThisTier: Math.floor(getPrestigeCost(1) * 0.03),
      festivalDeliveryPoints: 0,
      animalProductStock: 0,
    });

    expect(
      normalizeLandmarkState(
        {
          completedTier: 0,
          completedStages: LANDMARK_STAGES.map((stage) => stage.key),
          festivalDeliveryPoints: 2,
          animalProductStock: 3,
        },
        1,
        false
      )
    ).toEqual({
      completedTier: 1,
      completedStages: [],
      goldSpentThisTier: 0,
      festivalDeliveryPoints: 2,
      animalProductStock: 3,
    });
  });

  test('classifies landmark as meta state and preserves it across prestige reset', () => {
    expect(META_LAYER_KEYS).toContain('landmark');
    const state = tierOneProject({
      landmark: {
        completedTier: 0,
        completedStages: ['foundation'],
        goldSpentThisTier: Math.floor(getPrestigeCost(1) * 0.03),
        festivalDeliveryPoints: 4,
        animalProductStock: 6,
      },
    });
    expect(createPrestigedState(state).landmark).toBe(state.landmark);
  });
});
