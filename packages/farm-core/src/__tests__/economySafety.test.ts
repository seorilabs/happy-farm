/// <reference types="jest" />

import * as core from '../index';
import { createFarmPersistence } from '../../../farm-ui/src/persistence';

const LIMIT = 1e300;
const NOW = Date.parse('2026-10-23T00:00:00Z');

describe('economy overflow safety (#482)', () => {
  test('exports a finite economy ceiling below the floating point limit', () => {
    expect(core).toHaveProperty('MAX_ECONOMY_VALUE', LIMIT);
    expect(LIMIT).toBeLessThan(Number.MAX_VALUE);
  });

  test.each([false, true])('overflowing harvest pays only the credited amount, donation=%s', (donating) => {
    const base = core.createInitialState();
    const state = {
      ...base,
      gold: LIMIT * 0.9,
      prestige: { ...base.prestige, level: 100_000 },
      automationSettings: { ...base.automationSettings, donationModeEnabled: donating },
      research: { ...base.research, points: LIMIT * 0.9, totalPointsEarned: LIMIT * 0.9 },
      lifetimeStats: { ...base.lifetimeStats, totalGoldEarned: LIMIT * 0.9, researchPointsEarned: LIMIT * 0.9 },
    };
    const outcome = core.performHarvest(state, 0, { now: NOW, rng: () => 0.999 })!;
    expect(outcome).not.toBeNull();
    expect(outcome.state.gold).toBe(donating ? state.gold : LIMIT);
    expect(outcome.state.research.points).toBe(donating ? LIMIT : state.research.points);
    expect(outcome.goldGained).toBe(outcome.state.gold - state.gold);
    expect(outcome.rpGained).toBe(outcome.state.research.points - state.research.points);
    expect(outcome.state.lifetimeStats.totalGoldEarned).toBe(donating ? state.lifetimeStats.totalGoldEarned : LIMIT);
    expect(outcome.state.research.totalPointsEarned).toBe(donating ? LIMIT : state.research.totalPointsEarned);
    expect(outcome.state.lifetimeStats.researchPointsEarned).toBe(donating ? LIMIT : state.lifetimeStats.researchPointsEarned);
  });

  test('a saturated harvest does not report or accumulate money that was not paid', () => {
    const base = core.createInitialState();
    const state = { ...base, gold: LIMIT };
    const result = core.performHarvestAll(state, { now: NOW, rng: () => 0.999 });
    expect(result.harvestedCount).toBe(1);
    expect(result.totalGoldGained).toBe(0);
    expect(result.state.gold).toBe(LIMIT);
    expect(result.state.lifetimeStats.totalGoldEarned).toBe(0);
  });

  test('wheel gold and research rewards saturate', () => {
    const base = core.createInitialState();
    const state = { ...base, gold: LIMIT * 0.9, research: { ...base.research, points: LIMIT * 0.9, totalPointsEarned: LIMIT * 0.9 } };
    const newState = base.wheelState;
    expect(core.applyWheelReward(state, { newState, reward: { type: 'gold', slotKey: 'gold_small', gold: LIMIT } }, NOW).gold).toBe(LIMIT);
    const rp = core.applyWheelReward(state, { newState, reward: { type: 'rp', slotKey: 'rp_small', rp: LIMIT } }, NOW);
    expect(rp.research.points).toBe(LIMIT);
    expect(rp.research.totalPointsEarned).toBe(LIMIT);
  });

  test('chain income and captured offline bonus settle only the remaining capacity', () => {
    const base = core.createInitialState();
    const state = { ...base, gold: LIMIT * 0.9, chainFarms: [{ id: 0, archetype: base.prestige.currentRegionArchetype, goldPerHour: LIMIT, lastCollectedAt: NOW - 3_600_000 }] };
    const chain = core.collectChainIncome(state, NOW)!;
    expect(chain.state.gold).toBe(LIMIT);
    expect(chain.collectedGold).toBe(LIMIT - state.gold);
    expect(chain.state.lifetimeStats.totalGoldEarned).toBe(chain.collectedGold);
    expect(chain.state.chainFarms[0]!.lastCollectedAt).toBe(NOW);
    const captured = core.collectReturnSummaryOfflineGoldWithAdBonus(state, { capturedAt: NOW, chainGold: LIMIT, activeFarmGold: LIMIT });
    expect(captured.state.gold).toBe(LIMIT);
    expect(captured.collectedGold).toBe(LIMIT - state.gold);
    expect(captured.chainGold + captured.activeFarmGold).toBe(captured.collectedGold);
  });

  test('non-finite prestige costs cannot be satisfied even by infinite gold', () => {
    const base = core.createInitialState();
    const state = { ...base, gold: Infinity, harvestedCropKeys: core.getAreaCropKeys('legend_field'), prestige: { ...base.prestige, level: 100_000 } };
    expect(core.getPrestigeCost(state.prestige.level)).toBe(Infinity);
    expect(core.canPrestige(state)).toMatchObject({ goldSufficient: false, allowed: false });
    expect(core.prestigeFarm(state, 'plains', NOW)).toBeNull();
  });

  test.each([null, NaN, -1, -Infinity])('invalid saved balances %s become zero', (value) => {
    const base = core.createInitialState();
    const state = core.migrateLoadedState({ ...base, gold: value as number, research: { ...base.research, points: value as number, totalPointsEarned: value as number } }, base);
    expect(state.gold).toBe(0);
    expect(state.research.points).toBe(0);
    expect(state.research.totalPointsEarned).toBe(0);
  });

  test('serialization preserves positive overflow as the ceiling without mutating the source', async () => {
    const base = core.createInitialState();
    const state = { ...base, gold: Infinity, research: { ...base.research, points: Infinity, totalPointsEarned: Infinity }, lifetimeStats: { ...base.lifetimeStats, totalGoldEarned: Infinity, researchPointsEarned: Infinity }, chainFarms: [{ id: 7, archetype: base.prestige.currentRegionArchetype, goldPerHour: Infinity, lastCollectedAt: NOW }] };
    const data = new Map<string, string>();
    const storage = core.SAVE_KEY;
    const persistence = createFarmPersistence({ getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, value); }, removeItem: async key => { data.delete(key); } });
    await persistence.writePersistedGameState(state);
    const raw = JSON.parse(data.get(storage)!);
    expect(raw.gold).toBe(LIMIT);
    expect(raw.research).toMatchObject({ points: LIMIT, totalPointsEarned: LIMIT });
    expect(raw.lifetimeStats).toMatchObject({ totalGoldEarned: LIMIT, researchPointsEarned: LIMIT });
    expect(raw.chainFarms[0]).toMatchObject({ goldPerHour: LIMIT, id: 7, lastCollectedAt: NOW });
    const restored = await persistence.readPersistedGameState();
    expect(restored.gold).toBe(LIMIT);
    expect(restored.research.points).toBe(LIMIT);
    expect(state.gold).toBe(Infinity);
    expect(state.research.points).toBe(Infinity);
    expect(data.get(`${storage}.backup`)).toBe(data.get(storage));
  });

  test('finite prestige prices above the economy ceiling are not discounted', () => {
    const base = core.createInitialState();
    const state = { ...base, gold: LIMIT, harvestedCropKeys: core.getAreaCropKeys('legend_field'), prestige: { ...base.prestige, level: 380 } };
    const status = core.canPrestige(state);
    expect(Number.isFinite(status.cost)).toBe(true);
    expect(status.cost).toBeGreaterThan(LIMIT);
    expect(status.allowed).toBe(false);
  });

  test('a finite harvest that exceeds remaining capacity also saturates', () => {
    const base = core.createInitialState();
    const state = { ...base, gold: LIMIT * (1 - 1e-14), prestige: { ...base.prestige, level: 380 } };
    expect(Number.isFinite(core.getCropModifiers(state, 'carrot', NOW).profitMultiplier)).toBe(true);
    const result = core.performHarvest(state, 0, { now: NOW, rng: () => 0.999 })!;
    expect(result.state.gold).toBe(LIMIT);
    expect(result.goldGained).toBe(LIMIT - state.gold);
  });

  test('animal and workshop collection summaries do not invent revenue at the ceiling', () => {
    const base = core.createInitialState();
    const animal = core.ANIMALS[0]!;
    const recipe = core.PRODUCTION_RECIPES[0]!;
    const state = { ...base, gold: LIMIT, animals: { owned: [animal.key], feeding: { [animal.key]: NOW - animal.produceTimerMs } }, production: { inventory: {}, crafting: { [recipe.key]: NOW - recipe.timerMs } } };
    const animals = core.collectAllReadyProduce(state, NOW);
    const crafts = core.collectAllReadyCrafts(state, NOW);
    expect(animals.collectedCount).toBe(1);
    expect(animals.totalGold).toBe(0);
    expect(animals.outcomes[0]!.finalRevenue).toBe(0);
    expect(animals.state.gold).toBe(LIMIT);
    expect(crafts.collectedCount).toBe(1);
    expect(crafts.totalGold).toBe(0);
    expect(crafts.state.gold).toBe(LIMIT);
  });

  test('daily, collection and mission claims respect capacity and remain one-time', () => {
    const base = core.createInitialState();
    const bonus = core.claimDailyBonus(base.dailyBonusState, NOW, LIMIT, LIMIT)!;
    expect(bonus.goldAwarded).toBe(0);
    expect(core.claimDailyBonus(bonus.newState, NOW, LIMIT, LIMIT)).toBeNull();
    expect(core.previewDailyBonus(base.dailyBonusState, NOW, LIMIT, LIMIT).goldAwarded).toBe(0);
    const collectionState = { ...base, gold: LIMIT, harvestedCropKeys: core.getAreaCropKeys('starter_field') };
    const collection = core.claimCollectionReward(collectionState, 'starter_field')!;
    expect(collection).not.toBeNull();
    expect(collection.awardedGold).toBe(0);
    expect(collection.state.gold).toBe(LIMIT);
    expect(core.claimCollectionReward(collection.state, 'starter_field')).toBeNull();
    const daily = core.getDailyMissionsSnapshot(base.dailyMissionState, NOW, base.unlockedAreas);
    const weekly = core.getWeeklyMissionsSnapshot(base.weeklyMissionState, NOW, base.unlockedAreas);
    const state = { ...base, gold: LIMIT, dailyMissionState: { ...daily.state, progress: daily.missions.map(m => m.target) }, weeklyMissionState: { ...weekly.state, progress: weekly.missions.map(m => m.target) } };
    const dailyClaim = core.claimMission(state, 0, NOW)!;
    const weeklyClaim = core.claimWeeklyMission(state, 0, NOW)!;
    expect(dailyClaim).not.toBeNull();
    expect(weeklyClaim).not.toBeNull();
    expect(dailyClaim.gold).toBe(LIMIT);
    expect(weeklyClaim.gold).toBe(LIMIT);
    expect(core.claimMission(dailyClaim, 0, NOW)).toBeNull();
    expect(core.claimWeeklyMission(weeklyClaim, 0, NOW)).toBeNull();
  });

  test('normal saves round-trip without changing their structure or balances', async () => {
    const base = core.createInitialState();
    const state = { ...base, gold: 12_345, research: { ...base.research, points: 789, totalPointsEarned: 900 } };
    let raw: string | null = null;
    const persistence = createFarmPersistence({ getItem: async () => raw, setItem: async (_key, value) => { raw = value; }, removeItem: async () => {} });
    await persistence.writePersistedGameState(state);
    expect(JSON.parse(raw!)).toEqual(state);
    const restored = await persistence.readPersistedGameState();
    expect(restored.gold).toBe(state.gold);
    expect(restored.research).toEqual(state.research);
  });
});
