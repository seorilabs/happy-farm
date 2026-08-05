/// <reference types="jest" />

import balance from '../balance.json';
import {
  CROPS,
  DEFAULT_GOLD,
  FARM_AREAS,
  GROWTH_AD_COOLDOWN_MS,
  GROWTH_AD_SKIP_MS,
  GROWTH_AD_SKIP_PERCENT,
  getGrowthAdSkipMs,
  PLOT_DISCOUNT_AD_DAILY_LIMIT,
  PLOT_DISCOUNT_AD_PERCENT,
  RETURN_INTERSTITIAL_COOLDOWN_MS,
  canShowReturnInterstitial,
  getDiscountedPlotCost,
  recordReturnInterstitial,
  HARVEST_BONUS_AD_COOLDOWN_MS,
  HARVEST_BONUS_BOOST_DURATION_MS,
  HARVEST_BONUS_MULTIPLIER,
  INITIAL_AREA_KEYS,
  INITIAL_PLOTS,
  MAX_PLOTS,
  ONBOARDING_STEPS,
  REWARDED_GOLD_MAX_USES_PER_WINDOW,
  REWARDED_GOLD_WINDOW_MS,
  canUnlockArea,
  createEmptyPlots,
  createInitialAdUsage,
  createInitialState,
  getRewardedGoldAmount,
  REWARDED_GOLD_AMOUNT,
  formatMoney,
  getAreaUnlockRequirementText,
  getCropEconomyEstimate,
  getFarmProductivityEstimate,
  getHarvestBonusBoostStatus,
  getHarvestBonusPromptStatus,
  getPlotCost,
  getProfitMultiplier,
  getUpgradeBatchPurchase,
  UPGRADE_BATCH_MAX_SCAN,
  UPGRADE_BATCH_STEP,
  getRewardedAdLimitStatus,
  getSpeedMultiplier,
  getUpgradeCost,
  migrateLoadedState,
  normalizeAdUsage,
  getAdDailyKey,
  recordHarvestBonusAdPrompt,
  recordRewardedAdUsage,
  resolveOnboardingStep,
} from '../constants';
import type { CropKey, GameState } from '../types';

const NOW = Date.parse('2026-05-27T03:00:00.000Z');

function cropKeys() {
  return Object.keys(CROPS) as CropKey[];
}

function areaKeys() {
  return FARM_AREAS.map((area) => area.key);
}

describe('farm balance and model invariants', () => {
  test('initial state follows canonical balance data', () => {
    const state = createInitialState();

    expect(state.gold).toBe(DEFAULT_GOLD);
    expect(state.unlockedPlotCount).toBe(INITIAL_PLOTS);
    expect(state.unlockedAreas).toEqual(INITIAL_AREA_KEYS);
    expect(state.harvestedCropKeys).toEqual([]);
    expect(state.onboardingCompleted).toBe(false);
    // #427: selectSeed 제거 후 신규 유저는 harvest부터 시작한다.
    expect(state.onboardingStep).toBe('harvest');
    expect(state.firstSeedSelected).toBe(false);
    expect(state.onboardingReturnSettledAt).toBeNull();
    expect(ONBOARDING_STEPS).toEqual(['plant', 'harvest', 'reward']);
    expect(state.upgrades).toEqual({ speed: 1, profit: 1 });
    expect(state.plots).toHaveLength(MAX_PLOTS);
    expect(state.plots.map((plot) => plot.id)).toEqual(Array.from({ length: MAX_PLOTS }, (_, index) => index));
    // #427: 첫 밭에는 자동 파종된 carrot이 이미 자란(state 2) 상태로 놓인다.
    expect(state.plots[0]).toEqual({ id: 0, cropType: 'carrot', startTime: 0, state: 2 });
    expect(state.plots.slice(1).every((plot) => plot.cropType == null && plot.startTime == null && plot.state === 0)).toBe(
      true
    );
  });

  test('balance entries stay usable through late-game progression', () => {
    expect(cropKeys()).toHaveLength(balance.crops.length);

    for (const area of FARM_AREAS) {
      expect(area.name.length).toBeGreaterThan(0);
      expect(area.unlock.cost).toBeGreaterThanOrEqual(0);
      expect(area.unlock.requiredHarvestedCropCount).toBeGreaterThanOrEqual(0);
      expect(area.unlock.requiredUpgradeLevel).toBeGreaterThanOrEqual(1);
    }

    for (const cropKey of cropKeys()) {
      const crop = CROPS[cropKey]!;
      expect(areaKeys()).toContain(crop.area);
      expect(crop.cost).toBeGreaterThan(0);
      expect(crop.sell).toBeGreaterThan(crop.cost);
      expect(crop.growTime).toBeGreaterThan(0);
      expect(crop.name.length).toBeGreaterThan(0);
      expect(crop.icon.length).toBeGreaterThan(0);
    }

    const plotCosts = Array.from({ length: MAX_PLOTS - INITIAL_PLOTS }, (_, index) =>
      getPlotCost(INITIAL_PLOTS + index)
    );
    expect(plotCosts.every((cost) => Number.isFinite(cost) && cost > 0)).toBe(true);
    expect(plotCosts).toEqual([...plotCosts].sort((a, b) => a - b));

    for (const level of [1, 2, 8, 24, 100]) {
      expect(getUpgradeCost('speed', level)).toBeGreaterThan(0);
      expect(getUpgradeCost('profit', level)).toBeGreaterThan(0);
      expect(Number.isFinite(getSpeedMultiplier(level))).toBe(true);
      expect(Number.isFinite(getProfitMultiplier(level))).toBe(true);
    }

    for (const amount of [0, 9999, 10000, 1e8, 1e12, 1e16, 1e20, 9.876e23]) {
      expect(formatMoney(amount)).not.toMatch(/[eE]|Infinity|NaN/);
    }
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('0');
  });

  test('area unlock-cost jump multipliers form a gentle monotone curve without spikes', () => {
    // 진행 구역(gate 없는) 해금비의 단계별 배율이 단조 비감소이고, 첫 유료 점프는
    // 초반 이탈 구간을 고려해 ≤35, 후반 최대 점프는 ≤45여야 한다(진행 벽 방지).
    const sequential = FARM_AREAS.filter((area) => area.unlock.gate == null);
    const ratios: number[] = [];
    for (let index = 1; index < sequential.length; index += 1) {
      const prevCost = sequential[index - 1]!.unlock.cost;
      const currCost = sequential[index]!.unlock.cost;
      if (prevCost > 0 && currCost > 0) {
        ratios.push(currCost / prevCost);
      }
    }

    expect(ratios.length).toBeGreaterThan(0);
    expect(ratios[0]!).toBeLessThanOrEqual(35); // 첫 유료 점프 상한
    for (let index = 0; index < ratios.length; index += 1) {
      expect(ratios[index]!).toBeLessThanOrEqual(45); // 과도 스파이크 금지
      if (index > 0) {
        expect(ratios[index]!).toBeGreaterThanOrEqual(ratios[index - 1]!); // 단조 비감소(역전 금지)
      }
    }
  });

  test('area unlock checks require gold, harvested variety, and minimum research level', () => {
    const state = createInitialState();
    const nextArea = FARM_AREAS.find((area) => area.unlock.cost > 0);
    expect(nextArea).toBeDefined();

    const lockedState: GameState = {
      ...state,
      gold: nextArea!.unlock.cost,
      harvestedCropKeys: cropKeys().slice(0, Math.max(0, nextArea!.unlock.requiredHarvestedCropCount - 1)),
      upgrades: {
        speed: nextArea!.unlock.requiredUpgradeLevel,
        profit: nextArea!.unlock.requiredUpgradeLevel,
      },
    };
    expect(canUnlockArea(lockedState, nextArea!.key)).toBe(false);

    const unlockableState: GameState = {
      ...lockedState,
      harvestedCropKeys: cropKeys().slice(0, nextArea!.unlock.requiredHarvestedCropCount),
    };
    expect(canUnlockArea(unlockableState, nextArea!.key)).toBe(true);

    expect(
      canUnlockArea({ ...unlockableState, unlockedAreas: [...unlockableState.unlockedAreas, nextArea!.key] }, nextArea!.key)
    ).toBe(false);
  });

  test('area unlock text shows the required research level without repeating the current level', () => {
    const state: GameState = {
      ...createInitialState(),
      upgrades: { speed: 1, profit: 1 },
    };
    const area = FARM_AREAS.find((candidate) => candidate.unlock.requiredUpgradeLevel > 1);
    expect(area).toBeDefined();

    const text = getAreaUnlockRequirementText(state, area!.key);

    expect(text).toContain(`연구 Lv.${area!.unlock.requiredUpgradeLevel} 필요`);
    expect(text).not.toContain(`연구 Lv.1/${area!.unlock.requiredUpgradeLevel}`);
  });

  test('crop economy estimates expose ROI and hourly productivity', () => {
    const carrotEstimate = getCropEconomyEstimate('carrot', { speedMultiplier: 1, profitMultiplier: 1 });
    const carrot = CROPS.carrot;
    if (carrot == null) {
      throw new Error('Farm balance must include carrot.');
    }
    const expectedNetProfit = carrot.sell - carrot.cost;
    const expectedRoiPercent = (expectedNetProfit / carrot.cost) * 100;
    const expectedNetProfitPerHour = (expectedNetProfit / carrot.growTime) * 60 * 60 * 1000;

    expect(carrotEstimate.harvestValue).toBe(carrot.sell);
    expect(carrotEstimate.netProfit).toBe(expectedNetProfit);
    expect(carrotEstimate.roiPercent).toBeCloseTo(expectedRoiPercent);
    expect(carrotEstimate.netProfitPerHour).toBeCloseTo(expectedNetProfitPerHour);

    const state = createInitialState();
    const productivity = getFarmProductivityEstimate(state, { speedMultiplier: 1, profitMultiplier: 1 });

    expect(productivity.bestCropKey).not.toBeNull();
    expect(productivity.plotCount).toBe(state.unlockedPlotCount);
    expect(productivity.netProfitPerHour).toBeGreaterThan(0);
  });

  test('first-tier hybrid crops stay competitive with their unlock-era economy', () => {
    // 교배 온실(hybrid_greenhouse)은 골드 5M + RP 투자로 해금된다. 따라서 첫 신품종의
    // 시간당 순이익이 해금 시기 온실 작물(pineapple~avocado)보다 엄격히 높아야 하고,
    // 동시에 온실 졸업 작물(cactus)을 추월하지 않아야 정규 진행 동기가 유지된다(#285).
    const firstTierHybrids: CropKey[] = ['crystalberry', 'frost_blueberry', 'sun_grape', 'royal_potato'];
    const unlockEraGreenhouseCrops: CropKey[] = ['pineapple', 'coconut', 'kiwi', 'avocado'];

    const perHour = (cropKey: CropKey) =>
      getCropEconomyEstimate(cropKey, { speedMultiplier: 1, profitMultiplier: 1 }).netProfitPerHour;

    const unlockEraGreenhouseBest = Math.max(...unlockEraGreenhouseCrops.map(perHour));
    const greenhouseCeiling = perHour('cactus');
    expect(unlockEraGreenhouseBest).toBeGreaterThan(0);
    expect(greenhouseCeiling).toBeGreaterThan(unlockEraGreenhouseBest);

    for (const hybridKey of firstTierHybrids) {
      const crop = CROPS[hybridKey];
      if (crop == null) {
        throw new Error(`Farm balance must include first-tier hybrid ${hybridKey}.`);
      }
      // 판매가는 동시대 비교군과 같은 자릿수(6자리) 범위여야 한다.
      expect(crop.sell).toBeGreaterThanOrEqual(100000);
      expect(crop.sell / crop.cost).toBeCloseTo(2.5);

      const hybridPerHour = perHour(hybridKey);
      expect(hybridPerHour).toBeGreaterThan(unlockEraGreenhouseBest);
      expect(hybridPerHour).toBeLessThan(greenhouseCeiling);
    }
  });
});

describe('farm save migration', () => {
  test('normalizes old, corrupt, and over-progressed save data', () => {
    const base = createInitialState();
    const loaded = {
      gold: 987_654_321_000,
      unlockedPlotCount: MAX_PLOTS + 200,
      unlockedAreas: ['starter_field', 'starter_field', 'ghost_area', 'legend_field'],
      harvestedCropKeys: ['carrot', 'carrot', 'ghost_crop', 'world_tree'],
      upgrades: { speed: 42.8, profit: Number.NaN },
      adUsage: {
        dailyKey: '2026-05-26',
        rewardedGoldTimestamps: [NOW - 1000, NOW - REWARDED_GOLD_WINDOW_MS - 1, NOW + 1000, Number.NaN],
        rewardedGoldDailyCount: 99,
        growthAd: { lastUsedAt: NOW + 1000, dailyCount: 9 },
        harvestBonusAd: {
          lastUsedAt: NOW - 1000,
          lastPromptedAt: NOW - 2000,
          boostEndsAt: NOW + HARVEST_BONUS_BOOST_DURATION_MS,
          dailyCount: 3,
        },
      },
      plots: [
        { id: 999, cropType: 'ghost_crop', startTime: 'bad', state: 9 },
        { id: 999, cropType: 'carrot', startTime: NOW - 500, state: 1 },
        { id: 999, cropType: 'wheat', startTime: null, state: 2 },
      ],
    } as unknown as Partial<GameState>;

    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    const migrated = migrateLoadedState(loaded, base);

    expect(migrated.gold).toBe(987_654_321_000);
    expect(migrated.unlockedPlotCount).toBe(MAX_PLOTS);
    expect(migrated.unlockedAreas).toEqual(['starter_field', 'legend_field']);
    expect(migrated.harvestedCropKeys).toEqual(['carrot', 'world_tree']);
    expect(migrated.upgrades).toEqual({ speed: 42, profit: 1 });
    expect(migrated.plots).toHaveLength(MAX_PLOTS);
    expect(migrated.plots[0]).toEqual({ id: 0, cropType: null, startTime: null, state: 0 });
    expect(migrated.plots[1]).toEqual({ id: 1, cropType: 'carrot', startTime: NOW - 500, state: 1 });
    expect(migrated.plots[2]).toEqual({ id: 2, cropType: 'wheat', startTime: null, state: 2 });
    expect(migrated.plots[MAX_PLOTS - 1]).toEqual({
      id: MAX_PLOTS - 1,
      cropType: null,
      startTime: null,
      state: 0,
    });
    expect(migrated.adUsage).toEqual({
      // 광고 일일 키는 리셋 오프셋(#251) 반영으로 리셋 일 인덱스 문자열이다(구 세이브의
      // 다른 날짜 키와 불일치 → 일일 카운트 리셋). 형식은 getAdDailyKey로 데이터 유도.
      dailyKey: getAdDailyKey(NOW),
      rewardedGoldTimestamps: [NOW - 1000],
      rewardedGoldDailyCount: 0,
      growthAd: { lastUsedAt: null, dailyCount: 0 },
      plotDiscountAd: { lastUsedAt: null, dailyCount: 0 },
      offlineBonusAd: { lastUsedAt: null, dailyCount: 0 },
      harvestBonusAd: {
        lastUsedAt: NOW - 1000,
        lastPromptedAt: NOW - 2000,
        boostEndsAt: NOW + HARVEST_BONUS_BOOST_DURATION_MS,
        dailyCount: 0,
      },
      cookingSpeedAd: { lastUsedAt: null, dailyCount: 0 },
      returnInterstitialAt: null,
    });
  });

  test('falls back to safe defaults for invalid numeric fields', () => {
    const base = createInitialState();
    const migrated = migrateLoadedState(
      {
        gold: Number.POSITIVE_INFINITY,
        unlockedPlotCount: -10,
        upgrades: { speed: 0, profit: -3 },
      },
      base
    );

    expect(migrated.gold).toBe(base.gold);
    expect(migrated.unlockedPlotCount).toBe(INITIAL_PLOTS);
    expect(migrated.upgrades).toEqual({ speed: 1, profit: 1 });
  });

  test('prestigeGuideSeen backfills from prestige level for legacy saves', () => {
    const base = createInitialState();
    // 플래그 없는 레거시 + 이미 졸업(level>0): 개념을 아는 유저로 보고 본 것 처리.
    const graduated = migrateLoadedState(
      { prestige: { ...base.prestige, level: 2 } } as Partial<GameState>,
      base
    );
    expect(graduated.prestigeGuideSeen).toBe(true);
    // 플래그 없는 레거시 + 미졸업: 첫 졸업 때 가이드가 노출되도록 false 유지.
    const ungraduated = migrateLoadedState(
      { prestige: { ...base.prestige, level: 0 } } as Partial<GameState>,
      base
    );
    expect(ungraduated.prestigeGuideSeen).toBe(false);
    // 명시 저장값은 레벨과 무관하게 그대로 존중.
    const explicit = migrateLoadedState(
      { prestigeGuideSeen: false, prestige: { ...base.prestige, level: 5 } } as Partial<GameState>,
      base
    );
    expect(explicit.prestigeGuideSeen).toBe(false);
  });

  test.each(ONBOARDING_STEPS)('preserves valid onboarding step %s for incomplete saves', (onboardingStep) => {
    const base = createInitialState();
    const migrated = migrateLoadedState({ ...base, onboardingCompleted: false, onboardingStep }, base);

    expect(migrated.onboardingCompleted).toBe(false);
    expect(migrated.onboardingStep).toBe(onboardingStep);
  });

  test('keeps legacy and explicitly completed saves completed with no active onboarding step', () => {
    const base = createInitialState();
    const legacy = migrateLoadedState(
      { gold: base.gold, onboardingStep: 'plant' } as Partial<GameState>,
      base
    );
    const completed = migrateLoadedState(
      { ...base, onboardingCompleted: true, onboardingStep: 'harvest' },
      base
    );

    expect(legacy.onboardingCompleted).toBe(true);
    expect(legacy.onboardingStep).toBeNull();
    expect(completed.onboardingCompleted).toBe(true);
    expect(completed.onboardingStep).toBeNull();
  });

  test('infers resumable onboarding steps from normalized progress', () => {
    const base = createInitialState();
    const harvested = migrateLoadedState(
      { ...base, onboardingCompleted: false, onboardingStep: null, harvestedCropKeys: ['carrot'] },
      base
    );
    const lifetimeHarvested = migrateLoadedState(
      {
        ...base,
        onboardingCompleted: false,
        onboardingStep: null,
        lifetimeStats: { ...base.lifetimeStats, totalHarvests: 1 },
      },
      base
    );
    const planted = migrateLoadedState(
      {
        ...base,
        onboardingCompleted: false,
        onboardingStep: null,
        plots: [{ id: 0, cropType: 'carrot', startTime: NOW - 500, state: 1 }],
      },
      base
    );
    // #427: base는 이제 자동 파종 carrot을 담으므로, "아무것도 심지 않은" 케이스는
    // 빈 밭을 명시해 plant 폴백을 검증한다.
    const untouched = migrateLoadedState(
      { ...base, onboardingCompleted: false, onboardingStep: null, plots: createEmptyPlots() },
      base
    );

    expect(harvested.onboardingStep).toBe('reward');
    expect(lifetimeHarvested.onboardingStep).toBe('reward');
    expect(planted.onboardingStep).toBe('harvest');
    // #427: 아무것도 심지 않은 미완료 세이브는 이제 plant로 재개한다(selectSeed 제거).
    expect(untouched.onboardingStep).toBe('plant');
  });

  // #427 AC1: 신규 상태는 첫 밭에 자동 파종된 carrot(ready)을 담는다.
  test('createInitialState auto-plants a ready carrot only in the first plot (#427)', () => {
    const state = createInitialState();
    expect(state.plots[0]).toEqual({ id: 0, cropType: 'carrot', startTime: 0, state: 2 });
    expect(state.plots.slice(1).every((plot) => plot.cropType == null && plot.state === 0)).toBe(true);
    // 자동 파종 밭이 있으므로 온보딩은 harvest부터 시작한다.
    expect(state.onboardingStep).toBe('harvest');
    expect(state.onboardingCompleted).toBe(false);
  });

  // #427 AC4: 기존 세이브 마이그레이션은 스타터 carrot을 주입하지 않는다.
  test('migrateLoadedState never injects the starter crop into existing saves (#427)', () => {
    const base = createInitialState();

    // (a) 완료 세이브가 자체 밭 구성을 그대로 유지한다(스타터 carrot 미주입).
    const completedPlots = createEmptyPlots();
    completedPlots[3] = { id: 3, cropType: 'wheat', startTime: 123, state: 1 };
    const completed = migrateLoadedState(
      { ...base, onboardingCompleted: true, plots: completedPlots },
      base
    );
    expect(completed.plots[0]).toEqual({ id: 0, cropType: null, startTime: null, state: 0 });
    expect(completed.plots[3]).toEqual({ id: 3, cropType: 'wheat', startTime: 123, state: 1 });

    // (b) 진행 중(빈 밭) 세이브는 마이그레이션 후에도 빈 밭이다.
    const inProgress = migrateLoadedState(
      { ...base, onboardingCompleted: false, onboardingStep: 'plant', plots: createEmptyPlots() },
      base
    );
    expect(inProgress.plots.every((plot) => plot.cropType == null && plot.state === 0)).toBe(true);

    // (c) plots 필드가 없는(손상/부분) 세이브도 스타터 carrot이 아닌 빈 밭으로 폴백한다.
    const missingPlots = migrateLoadedState(
      { gold: 200, onboardingCompleted: false } as Partial<GameState>,
      base
    );
    expect(missingPlots.plots.every((plot) => plot.cropType == null && plot.state === 0)).toBe(true);
  });

  test('migrates the lifetime first-seed flag from explicit state or proven legacy progress (#371)', () => {
    const base = createInitialState();
    const explicit = migrateLoadedState({ ...base, firstSeedSelected: true }, base);
    const planted = migrateLoadedState(
      {
        ...base,
        firstSeedSelected: undefined,
        plots: [{ id: 0, cropType: 'carrot', startTime: NOW - 500, state: 1 }],
      } as unknown as Partial<GameState>,
      base
    );
    const harvested = migrateLoadedState(
      {
        ...base,
        firstSeedSelected: undefined,
        lifetimeStats: { ...base.lifetimeStats, totalHarvests: 1 },
      } as unknown as Partial<GameState>,
      base
    );
    const resumedAfterSelection = migrateLoadedState(
      { ...base, firstSeedSelected: undefined, onboardingStep: 'plant' } as unknown as Partial<GameState>,
      base
    );
    // #427: base가 자동 파종 carrot을 담으므로, 진짜 미개시 세이브는 빈 밭으로 명시한다.
    const untouched = migrateLoadedState(
      { ...base, firstSeedSelected: undefined, plots: createEmptyPlots() } as unknown as Partial<GameState>,
      base
    );

    expect(explicit.firstSeedSelected).toBe(true);
    expect(planted.firstSeedSelected).toBe(true);
    expect(harvested.firstSeedSelected).toBe(true);
    expect(resumedAfterSelection.firstSeedSelected).toBe(true);
    expect(untouched.firstSeedSelected).toBe(false);
  });

  test('rejects invalid persisted onboarding steps and resolves them from progress', () => {
    const state = {
      ...createInitialState(),
      onboardingCompleted: false,
      plots: createInitialState().plots.map((plot, index) =>
        index === 0 ? { ...plot, cropType: 'carrot' as const, startTime: NOW - 500, state: 1 as const } : plot
      ),
    };
    const loaded = { ...state, onboardingStep: 'unlock' } as unknown as Partial<GameState>;
    const migrated = migrateLoadedState(loaded, createInitialState());

    expect(resolveOnboardingStep(state, 'unlock')).toBe('harvest');
    expect(migrated.onboardingStep).toBe('harvest');
  });

  test('normalizes the idempotency marker for onboarding return settlement', () => {
    const base = createInitialState();
    const valid = migrateLoadedState({ ...base, onboardingReturnSettledAt: NOW + 0.9 }, base);
    const invalid = migrateLoadedState(
      { ...base, onboardingReturnSettledAt: Number.NaN },
      base
    );

    expect(valid.onboardingReturnSettledAt).toBe(NOW);
    expect(invalid.onboardingReturnSettledAt).toBeNull();
  });
});

describe('farm ad limits', () => {
  test('rewarded gold enforces both rolling-window and daily limits', () => {
    let state: GameState = { ...createInitialState(), adUsage: createInitialAdUsage(NOW) };

    for (let index = 0; index < REWARDED_GOLD_MAX_USES_PER_WINDOW; index += 1) {
      const timestamp = NOW + index;
      state = { ...state, adUsage: recordRewardedAdUsage(state, 'rewardedGold', timestamp) };
    }
    expect(getRewardedAdLimitStatus(state, 'rewardedGold', NOW + REWARDED_GOLD_MAX_USES_PER_WINDOW).allowed).toBe(
      false
    );
    expect(getRewardedAdLimitStatus(state, 'rewardedGold', NOW + REWARDED_GOLD_WINDOW_MS + 1).allowed).toBe(true);

    state = { ...createInitialState(), adUsage: createInitialAdUsage(NOW) };
    for (let index = 0; index < 4; index += 1) {
      const timestamp = NOW + index * (REWARDED_GOLD_WINDOW_MS + 1);
      state = { ...state, adUsage: recordRewardedAdUsage(state, 'rewardedGold', timestamp) };
    }
    const dailyLimit = getRewardedAdLimitStatus(state, 'rewardedGold', NOW + 4 * (REWARDED_GOLD_WINDOW_MS + 1));
    expect(dailyLimit.allowed).toBe(false);
    expect(dailyLimit.reason).toContain('오늘 이용 가능한 횟수');
  });

  test('growth ad cooldown resets after the configured duration', () => {
    const state: GameState = {
      ...createInitialState(),
      adUsage: recordRewardedAdUsage(createInitialState(), 'growthAd', NOW),
    };

    expect(getRewardedAdLimitStatus(state, 'growthAd', NOW + 1).allowed).toBe(false);
    expect(getRewardedAdLimitStatus(state, 'growthAd', NOW + GROWTH_AD_COOLDOWN_MS + 1).allowed).toBe(true);
  });

  test('growth ad skip tier: flat floor, percent share, capped at remaining', () => {
    expect(getGrowthAdSkipMs(0)).toBe(0);
    expect(getGrowthAdSkipMs(-100)).toBe(0);

    // Remaining below the flat floor → the whole remainder (full skip).
    expect(getGrowthAdSkipMs(GROWTH_AD_SKIP_MS - 1)).toBe(GROWTH_AD_SKIP_MS - 1);

    // Remaining where the percent share is still below the floor → the floor.
    expect(getGrowthAdSkipMs(GROWTH_AD_SKIP_MS * 2)).toBe(GROWTH_AD_SKIP_MS);

    // Long crop where the percent share dominates the flat floor.
    const long = Math.ceil(GROWTH_AD_SKIP_MS / GROWTH_AD_SKIP_PERCENT) * 10;
    expect(getGrowthAdSkipMs(long)).toBe(Math.floor(long * GROWTH_AD_SKIP_PERCENT));
    // ...and never removes more than what is left.
    expect(getGrowthAdSkipMs(long)).toBeLessThan(long);
  });

  test('plot-discount ad charges reduced gold and is capped at one per day', () => {
    // Discounted cost is a real (reduced) gold price, never free — the sink stays.
    const sampleCount = INITIAL_PLOTS + 3;
    const full = getPlotCost(sampleCount);
    const discounted = getDiscountedPlotCost(sampleCount);
    expect(discounted).toBe(Math.floor(full * (1 - PLOT_DISCOUNT_AD_PERCENT)));
    expect(discounted).toBeGreaterThan(0);
    expect(discounted).toBeLessThan(full);

    // Daily limit is the strong cap that replaces unlimited free grants.
    expect(PLOT_DISCOUNT_AD_DAILY_LIMIT).toBe(1);
    const base = createInitialState();
    expect(getRewardedAdLimitStatus(base, 'plotDiscountAd', NOW).allowed).toBe(true);

    const afterOne: GameState = {
      ...base,
      adUsage: recordRewardedAdUsage(base, 'plotDiscountAd', NOW),
    };
    expect(afterOne.adUsage.plotDiscountAd.dailyCount).toBe(1);
    expect(getRewardedAdLimitStatus(afterOne, 'plotDiscountAd', NOW + 1).allowed).toBe(false);

    // The counter resets on a new day, re-allowing one discount.
    const nextDay = NOW + 24 * 60 * 60 * 1000;
    expect(getRewardedAdLimitStatus(afterOne, 'plotDiscountAd', nextDay).allowed).toBe(true);
  });

  test('return interstitial respects its persisted cooldown', () => {
    const base = createInitialState();
    // Never shown yet → allowed on first return.
    expect(canShowReturnInterstitial(base, NOW)).toBe(true);

    const afterShow: GameState = { ...base, adUsage: recordReturnInterstitial(base, NOW) };
    expect(afterShow.adUsage.returnInterstitialAt).toBe(NOW);

    // Inside the cooldown window → suppressed (non-intrusive on frequent returns).
    expect(canShowReturnInterstitial(afterShow, NOW + 1)).toBe(false);
    expect(canShowReturnInterstitial(afterShow, NOW + RETURN_INTERSTITIAL_COOLDOWN_MS - 1)).toBe(false);

    // Once the cooldown elapses → allowed again.
    expect(canShowReturnInterstitial(afterShow, NOW + RETURN_INTERSTITIAL_COOLDOWN_MS)).toBe(true);
  });

  test('ad usage normalization rejects future and non-finite timestamps', () => {
    const adUsage = normalizeAdUsage(
      {
        // 오늘의 리셋 일 키와 일치해야 일일 카운트가 보존된다(#251 형식 변경 반영).
        dailyKey: getAdDailyKey(NOW),
        rewardedGoldTimestamps: [NOW - 1, NOW + 1, NOW - REWARDED_GOLD_WINDOW_MS - 1, Number.NaN],
        rewardedGoldDailyCount: -5,
        growthAd: { lastUsedAt: NOW + 1, dailyCount: Number.NaN },
        offlineBonusAd: { lastUsedAt: NOW - 2, dailyCount: 1 },
        harvestBonusAd: {
          lastUsedAt: NOW - 1,
          lastPromptedAt: NOW + 1,
          boostEndsAt: Number.NaN,
          dailyCount: 2,
        },
      },
      NOW
    );

    expect(adUsage.rewardedGoldTimestamps).toEqual([NOW - 1]);
    expect(adUsage.rewardedGoldDailyCount).toBe(0);
    expect(adUsage.growthAd).toEqual({ lastUsedAt: null, dailyCount: 0 });
    expect(adUsage.offlineBonusAd).toEqual({ lastUsedAt: NOW - 2, dailyCount: 1 });
    expect(adUsage.harvestBonusAd).toEqual({
      lastUsedAt: NOW - 1,
      lastPromptedAt: null,
      boostEndsAt: null,
      dailyCount: 2,
    });
  });

  test('harvest bonus prompt uses a long exposure cooldown', () => {
    let state: GameState = { ...createInitialState(), adUsage: createInitialAdUsage(NOW) };

    expect(getHarvestBonusPromptStatus(state, NOW).allowed).toBe(true);

    state = { ...state, adUsage: recordHarvestBonusAdPrompt(state, NOW) };

    const blocked = getHarvestBonusPromptStatus(state, NOW + 1);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain('12시간');
    expect(getHarvestBonusPromptStatus(state, NOW + HARVEST_BONUS_AD_COOLDOWN_MS + 1).allowed).toBe(true);
  });

  test('harvest bonus ad activates a timed reward multiplier', () => {
    const state: GameState = {
      ...createInitialState(),
      adUsage: recordRewardedAdUsage(createInitialState(), 'harvestBonusAd', NOW),
    };

    const activeBoost = getHarvestBonusBoostStatus(state, NOW + 1);
    expect(activeBoost.active).toBe(true);
    expect(activeBoost.multiplier).toBe(HARVEST_BONUS_MULTIPLIER);
    expect(activeBoost.remainingMs).toBe(HARVEST_BONUS_BOOST_DURATION_MS - 1);
    expect(getHarvestBonusBoostStatus(state, NOW + HARVEST_BONUS_BOOST_DURATION_MS + 1).active).toBe(false);
  });
});

describe('getRewardedGoldAmount', () => {
  test('returns REWARDED_GOLD_AMOUNT floor when next goal scales below it', () => {
    // Initial state: only starter_field unlocked, next goal = vegetable_field (300G)
    // 5 % of 300 = 15 < 100 floor
    const state = createInitialState();
    expect(getRewardedGoldAmount(state)).toBe(REWARDED_GOLD_AMOUNT);
  });

  test('scales with next non-gated area cost once vegetable_field is unlocked', () => {
    // vegetable_field unlocked → next goal = fruit_field (9 000G)
    // 5 % of 9 000 = 450 > 100 floor
    const vegetableArea = FARM_AREAS.find((a) => a.key === 'vegetable_field')!;
    const state: GameState = {
      ...createInitialState(),
      unlockedAreas: [...createInitialState().unlockedAreas, vegetableArea.key],
    };
    const expected = Math.floor(balance.areas.find((a) => a.key === 'fruit_field')!.unlock.cost * balance.ads.rewardedGoldScaling.nextGoalRatio);
    expect(getRewardedGoldAmount(state)).toBe(expected);
    expect(getRewardedGoldAmount(state)).toBeGreaterThan(REWARDED_GOLD_AMOUNT);
  });

  test('scales with orchard cost when fruit_field is already unlocked', () => {
    const state: GameState = {
      ...createInitialState(),
      unlockedAreas: [...createInitialState().unlockedAreas, 'vegetable_field', 'fruit_field'],
    };
    const orchardCost = balance.areas.find((a) => a.key === 'orchard')!.unlock.cost;
    const expected = Math.floor(orchardCost * balance.ads.rewardedGoldScaling.nextGoalRatio);
    expect(getRewardedGoldAmount(state)).toBe(expected);
  });

  test('uses prestige graduation cost when all non-gated areas are unlocked', () => {
    const nonGatedAreaKeys = balance.areas
      .filter((a) => a.unlock.gate == null)
      .map((a) => a.key) as GameState['unlockedAreas'];
    const state: GameState = {
      ...createInitialState(),
      unlockedAreas: nonGatedAreaKeys,
      prestige: { ...createInitialState().prestige, level: 0 },
    };
    const graduationCost = balance.regions.graduation.costBase;
    const expected = Math.floor(graduationCost * balance.ads.rewardedGoldScaling.nextGoalRatio);
    expect(getRewardedGoldAmount(state)).toBe(expected);
    expect(getRewardedGoldAmount(state)).toBeGreaterThan(REWARDED_GOLD_AMOUNT);
  });

  test('reward grows proportionally at higher prestige levels', () => {
    const nonGatedAreaKeys = balance.areas
      .filter((a) => a.unlock.gate == null)
      .map((a) => a.key) as GameState['unlockedAreas'];
    const stateLevel0: GameState = {
      ...createInitialState(),
      unlockedAreas: nonGatedAreaKeys,
      prestige: { ...createInitialState().prestige, level: 0 },
    };
    const stateLevel1: GameState = {
      ...stateLevel0,
      prestige: { ...stateLevel0.prestige, level: 1 },
    };
    expect(getRewardedGoldAmount(stateLevel1)).toBeGreaterThan(getRewardedGoldAmount(stateLevel0));
  });

  test('uses balance.areas definition order, not cost order, to find next goal', () => {
    // Verifies that each successive non-gated area (in FARM_AREAS order) is
    // picked as the next goal when all prior ones are unlocked.
    const nonGatedAreas = FARM_AREAS.filter((a) => a.unlock.gate == null && a.unlock.cost > 0);
    for (let index = 0; index < nonGatedAreas.length - 1; index += 1) {
      const unlockedKeys = [
        ...createInitialState().unlockedAreas,
        ...nonGatedAreas.slice(0, index + 1).map((a) => a.key),
      ] as GameState['unlockedAreas'];
      const state: GameState = { ...createInitialState(), unlockedAreas: unlockedKeys };
      const nextArea = nonGatedAreas[index + 1]!;
      const expected = Math.max(
        REWARDED_GOLD_AMOUNT,
        Math.floor(nextArea.unlock.cost * balance.ads.rewardedGoldScaling.nextGoalRatio)
      );
      expect(getRewardedGoldAmount(state)).toBe(expected);
    }
  });

  test('always returns a finite positive integer for abnormal prestige.level values', () => {
    const nonGatedAreaKeys = balance.areas
      .filter((a) => a.unlock.gate == null)
      .map((a) => a.key) as GameState['unlockedAreas'];
    const baseState: GameState = { ...createInitialState(), unlockedAreas: nonGatedAreaKeys };
    for (const level of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 10000]) {
      const state: GameState = { ...baseState, prestige: { ...baseState.prestige, level } };
      const result = getRewardedGoldAmount(state);
      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(REWARDED_GOLD_AMOUNT);
    }
  });
});

describe('getUpgradeBatchPurchase — 배치(일괄) 업그레이드 구매 (#426)', () => {
  // 매직 넘버 대신 getUpgradeCost로 기대 비용을 계산해 자기 정합적으로 검증한다.
  const sumCost = (kind: 'speed' | 'profit', from: number, count: number) => {
    let total = 0;
    for (let i = 0; i < count; i += 1) {
      total += getUpgradeCost(kind, from + i);
    }
    return total;
  };

  it('골드가 충분하면 +10을 전액 계산한다(레벨 수·총비용·from/to)', () => {
    const from = 1;
    const fullTenCost = sumCost('speed', from, UPGRADE_BATCH_STEP);
    const result = getUpgradeBatchPurchase('speed', from, Number.POSITIVE_INFINITY, UPGRADE_BATCH_STEP);
    expect(result).toEqual({
      levels: UPGRADE_BATCH_STEP,
      totalCost: fullTenCost,
      fromLevel: from,
      toLevel: from + UPGRADE_BATCH_STEP,
    });
  });

  it('골드로 감당 가능한 만큼만 클램프한다(+10 목표, 3레벨만 가능)', () => {
    const from = 4;
    const affordThree = sumCost('profit', from, 3);
    const affordFour = sumCost('profit', from, 4);
    // 정확히 3레벨 값 → 3레벨, 4레벨엔 1 모자람.
    const result = getUpgradeBatchPurchase('profit', from, affordFour - 1, UPGRADE_BATCH_STEP);
    expect(result.levels).toBe(3);
    expect(result.totalCost).toBe(affordThree);
    expect(result.toLevel).toBe(from + 3);
  });

  it('최대(큰 상한)는 골드가 허용하는 모든 레벨을 산다', () => {
    const from = 2;
    const affordFive = sumCost('speed', from, 5);
    const result = getUpgradeBatchPurchase('speed', from, affordFive, UPGRADE_BATCH_MAX_SCAN);
    expect(result.levels).toBe(5);
    expect(result.totalCost).toBe(affordFive);
    expect(result.totalCost).toBeLessThanOrEqual(affordFive);
  });

  it('골드 부족(1레벨도 못 삼)이면 levels 0·totalCost 0을 반환한다', () => {
    const result = getUpgradeBatchPurchase('speed', 1, 0, UPGRADE_BATCH_STEP);
    expect(result).toEqual({ levels: 0, totalCost: 0, fromLevel: 1, toLevel: 1 });
  });

  it('절대 골드를 초과 지출하지 않는다(총비용 <= 보유 골드)', () => {
    const from = 3;
    const gold = 250_000;
    const result = getUpgradeBatchPurchase('profit', from, gold, UPGRADE_BATCH_MAX_SCAN);
    expect(result.totalCost).toBeLessThanOrEqual(gold);
    // 한 레벨 더 샀다면 골드를 초과했어야 한다(경계 검증).
    const oneMore = result.totalCost + getUpgradeCost('profit', from + result.levels);
    expect(oneMore).toBeGreaterThan(gold);
  });
});
