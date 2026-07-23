/// <reference types="jest" />

import {
  ANIMALS,
  canCollectProduce,
  canFeedAnimal,
  canPurchaseAnimal,
  collectAllReadyProduce,
  collectProduce,
  collectProduceWithOutcome,
  createInitialAnimalsState,
  feedAnimal,
  getAnimal,
  getAnimalState,
  getAnimalStates,
  isAnimalOwned,
  isKnownAnimalKey,
  normalizeAnimalsState,
  purchaseAnimal,
  type AnimalsState,
} from '../animals';
import { CROPS, createInitialState, migrateLoadedState } from '../constants';
import { createPrestigedState } from '../prestige';
import { getAnimalLabel } from '../i18n';
import type { AnimalKey, GameState } from '../types';
import { META_LAYER_KEYS } from '../types';
import { getDailyMissionsSnapshot } from '../missions';
import { getWeeklyMissionsSnapshot } from '../weeklyMissions';

const FIRST = ANIMALS[0]!.key;
const SECOND = ANIMALS[1]!.key;

function stateWithGold(gold: number, animals: AnimalsState = createInitialAnimalsState()): GameState {
  return { ...createInitialState(), gold, animals };
}

// 소유 + (선택) 급여 진행 상태의 편의 팩토리.
function ownedState(gold: number, owned: AnimalKey[], feeding: AnimalsState['feeding'] = {}): GameState {
  return stateWithGold(gold, { owned, feeding });
}

describe('animals catalog', () => {
  test('catalog is non-empty with unique keys, positive numeric fields, and positive margin', () => {
    expect(ANIMALS.length).toBeGreaterThan(0);
    const keys = ANIMALS.map((animal) => animal.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const animal of ANIMALS) {
      expect(animal.purchaseCost).toBeGreaterThan(0);
      expect(animal.feedCost).toBeGreaterThan(0);
      expect(animal.produceTimerMs).toBeGreaterThan(0);
      // 사이클마다 양의 마진(판매가 > 사료비).
      expect(animal.producePrice).toBeGreaterThan(animal.feedCost);
      expect(typeof animal.icon).toBe('string');
      expect(animal.icon.length).toBeGreaterThan(0);
      expect(animal.produceIcon.length).toBeGreaterThan(0);
    }
  });

  test('animal net/h stays below the cheapest crop net/h (does not dominate crops)', () => {
    const MS_PER_HOUR = 60 * 60 * 1000;
    // balance.json 작물 최소 net/h를 코어 카탈로그에서 계산.
    const cropNetPerHours = Object.values(CROPS).map(
      (crop) => ((crop.sell - crop.cost) / crop.growTime) * MS_PER_HOUR
    );
    const minCropNetPerHour = Math.min(...cropNetPerHours);
    for (const animal of ANIMALS) {
      const netPerHour = ((animal.producePrice - animal.feedCost) / animal.produceTimerMs) * MS_PER_HOUR;
      expect(netPerHour).toBeGreaterThan(0);
      expect(netPerHour).toBeLessThan(minCropNetPerHour);
    }
  });

  test('catalog keeps purchaseCost ascending and includes the expanded kinds (#272)', () => {
    // purchaseCost 오름차순 정렬 유지(진행 구간을 넓게 커버하는 골드 싱크 계단).
    for (let i = 1; i < ANIMALS.length; i += 1) {
      expect(ANIMALS[i]!.purchaseCost).toBeGreaterThan(ANIMALS[i - 1]!.purchaseCost);
    }
    // chicken/cow 2종에서 최소 3종 이상 확장(보조 루프 다양화).
    expect(ANIMALS.length).toBeGreaterThanOrEqual(5);
    const keys = new Set(ANIMALS.map((animal) => animal.key));
    for (const key of ['duck', 'sheep', 'pig', 'bee']) {
      expect(keys.has(key as AnimalKey)).toBe(true);
    }
  });

  test('premium-tier animals extend the roster in ascending cost, below the crop ceiling, with ko/en labels (#299)', () => {
    const MS_PER_HOUR = 60 * 60 * 1000;
    const premiumTier: AnimalKey[] = ['goat', 'alpaca', 'turkey', 'peacock'] as AnimalKey[];
    const catalogKeys = ANIMALS.map((animal) => animal.key);
    const cropNetPerHours = Object.values(CROPS).map(
      (crop) => ((crop.sell - crop.cost) / crop.growTime) * MS_PER_HOUR
    );
    const minCropNetPerHour = Math.min(...cropNetPerHours);

    // 신규 4종이 카탈로그 최상단(최고가)에 선언 순서대로 놓인다.
    expect(catalogKeys.slice(-4)).toEqual(premiumTier);
    for (const key of premiumTier) {
      const animal = getAnimal(key)!;
      expect(animal).toBeDefined();
      // 산출물 net/h는 가장 싼 작물 net/h 미만이어야 한다(작물 지배 방지).
      const netPerHour = ((animal.producePrice - animal.feedCost) / animal.produceTimerMs) * MS_PER_HOUR;
      expect(netPerHour).toBeGreaterThan(0);
      expect(netPerHour).toBeLessThan(minCropNetPerHour);
      // ko/en 라벨이 모두 비어 있지 않다.
      for (const locale of ['ko-KR', 'en-US'] as const) {
        const label = getAnimalLabel(key, locale);
        expect(label.name.trim()).not.toBe('');
        expect(label.description.trim()).not.toBe('');
      }
    }

    // 신규 최상위 종(peacock)이 feed → collect 사이클을 완주한다.
    const peacock = getAnimal('peacock' as AnimalKey)!;
    const now = 12_000_000;
    const fed = feedAnimal(ownedState(peacock.feedCost, ['peacock' as AnimalKey]), 'peacock' as AnimalKey, now)!;
    const readyAt = now + peacock.produceTimerMs;
    expect(canCollectProduce(fed, 'peacock' as AnimalKey, readyAt)).toBe(true);
    expect(collectProduce(fed, 'peacock' as AnimalKey, readyAt)!.gold).toBe(peacock.producePrice);
  });

  test('a newly added animal (bee) runs the full feed → collect cycle (#272)', () => {
    const bee = getAnimal('bee' as AnimalKey)!;
    const now = 9_000_000;
    const fed = feedAnimal(ownedState(bee.feedCost, ['bee' as AnimalKey]), 'bee' as AnimalKey, now)!;
    const readyAt = now + bee.produceTimerMs;
    expect(canCollectProduce(fed, 'bee' as AnimalKey, readyAt)).toBe(true);
    const collected = collectProduce(fed, 'bee' as AnimalKey, readyAt)!;
    expect(collected.gold).toBe(bee.producePrice);
  });

  test('every catalog item has ko/en labels', () => {
    for (const animal of ANIMALS) {
      for (const locale of ['ko-KR', 'en-US'] as const) {
        const label = getAnimalLabel(animal.key, locale);
        expect(label.name.trim()).not.toBe('');
        expect(label.description.trim()).not.toBe('');
      }
    }
  });

  test('isKnownAnimalKey accepts catalog keys and rejects others', () => {
    expect(isKnownAnimalKey(FIRST)).toBe(true);
    expect(isKnownAnimalKey('not_an_animal')).toBe(false);
    expect(isKnownAnimalKey(42)).toBe(false);
    expect(isKnownAnimalKey(null)).toBe(false);
  });
});

describe('purchaseAnimal', () => {
  test('deducts gold and records ownership exactly once', () => {
    const animal = getAnimal(FIRST)!;
    const before = stateWithGold(animal.purchaseCost + 100);

    const after = purchaseAnimal(before, FIRST);
    expect(after).not.toBeNull();
    expect(after!.gold).toBe(100);
    expect(after!.animals.owned).toEqual([FIRST]);
    // Pure: the original state is untouched.
    expect(before.gold).toBe(animal.purchaseCost + 100);
    expect(before.animals.owned).toEqual([]);
  });

  test('returns null when gold is insufficient (no charge)', () => {
    const animal = getAnimal(FIRST)!;
    const before = stateWithGold(animal.purchaseCost - 1);
    expect(canPurchaseAnimal(before, FIRST)).toBe(false);
    expect(purchaseAnimal(before, FIRST)).toBeNull();
  });

  test('cannot buy the same animal twice', () => {
    const animal = getAnimal(FIRST)!;
    const owned = purchaseAnimal(stateWithGold(animal.purchaseCost * 2 + 10), FIRST)!;
    expect(canPurchaseAnimal(owned, FIRST)).toBe(false);
    expect(purchaseAnimal(owned, FIRST)).toBeNull();
  });
});

describe('feedAnimal / collectProduce cycle', () => {
  test('feeding deducts feedCost and starts a deterministic timer', () => {
    const animal = getAnimal(FIRST)!;
    const now = 1_000_000;
    const before = ownedState(animal.feedCost + 50, [FIRST]);
    expect(canFeedAnimal(before, FIRST)).toBe(true);

    const fed = feedAnimal(before, FIRST, now)!;
    expect(fed.gold).toBe(50);
    expect(fed.animals.feeding[FIRST]).toBe(now);

    const growing = getAnimalState(fed, FIRST, now)!;
    expect(growing.phase).toBe('growing');
    expect(growing.readyAt).toBe(now + animal.produceTimerMs);
    expect(growing.remainingMs).toBe(animal.produceTimerMs);
  });

  test('cannot feed an un-owned animal or one already feeding', () => {
    const animal = getAnimal(FIRST)!;
    const unowned = stateWithGold(animal.feedCost + 1000);
    expect(canFeedAnimal(unowned, FIRST)).toBe(false);
    expect(feedAnimal(unowned, FIRST, 1)).toBeNull();

    const fed = feedAnimal(ownedState(animal.feedCost * 2 + 10, [FIRST]), FIRST, 1)!;
    expect(canFeedAnimal(fed, FIRST)).toBe(false);
    expect(feedAnimal(fed, FIRST, 2)).toBeNull();
  });

  test('cannot feed without enough gold', () => {
    const animal = getAnimal(FIRST)!;
    const poor = ownedState(animal.feedCost - 1, [FIRST]);
    expect(canFeedAnimal(poor, FIRST)).toBe(false);
    expect(feedAnimal(poor, FIRST, 1)).toBeNull();
  });

  test('produce is collectable only after the timer elapses, paying producePrice once', () => {
    const animal = getAnimal(FIRST)!;
    const now = 5_000_000;
    const fed = feedAnimal(ownedState(animal.feedCost, [FIRST]), FIRST, now)!;

    // 타이머 도중: 수확 불가.
    const midway = now + animal.produceTimerMs - 1;
    expect(canCollectProduce(fed, FIRST, midway)).toBe(false);
    expect(collectProduce(fed, FIRST, midway)).toBeNull();

    // 정확한 경계(readyAt)에서 수확 가능.
    const readyAt = now + animal.produceTimerMs;
    const ready = getAnimalState(fed, FIRST, readyAt)!;
    expect(ready.phase).toBe('ready');
    expect(ready.remainingMs).toBe(0);
    expect(canCollectProduce(fed, FIRST, readyAt)).toBe(true);

    const result = collectProduceWithOutcome(fed, FIRST, readyAt + 321)!;
    const collected = result.state;
    expect(result.outcome).toEqual({
      animalKey: FIRST,
      baseRevenue: animal.producePrice,
      finalRevenue: animal.producePrice,
      isRare: false,
      rareMultiplier: 1,
      readyWaitMs: 321,
    });
    expect(collected.gold).toBe(animal.producePrice);
    // 급여 상태가 비워져 다시 유휴(재급여 가능).
    expect(collected.animals.feeding[FIRST]).toBeUndefined();
    expect(getAnimalState(collected, FIRST, readyAt)!.phase).toBe('idle');
    expect(
      getDailyMissionsSnapshot(collected.dailyMissionState, readyAt, collected.unlockedAreas).missions.find(
        (mission) => mission.type === 'collect_produce'
      )!.progress
    ).toBe(1);
    expect(
      getWeeklyMissionsSnapshot(collected.weeklyMissionState, readyAt, collected.unlockedAreas).missions.find(
        (mission) => mission.type === 'collect_produce'
      )!.progress
    ).toBe(1);

    // 이중 수확 불가.
    expect(collectProduce(collected, FIRST, readyAt)).toBeNull();
  });

  test('getAnimalState returns locked for un-owned, null for unknown keys', () => {
    const base = stateWithGold(0);
    const locked = getAnimalState(base, FIRST, 0)!;
    expect(locked.phase).toBe('locked');
    expect(locked.owned).toBe(false);
    expect(getAnimalState(base, 'nope' as AnimalKey, 0)).toBeNull();
  });

  test('getAnimalStates returns catalog order for all animals', () => {
    const states = getAnimalStates(stateWithGold(0), 0);
    expect(states.map((status) => status.key)).toEqual(ANIMALS.map((animal) => animal.key));
  });

  test('non-finite now falls back without throwing', () => {
    const animal = getAnimal(FIRST)!;
    const fed = feedAnimal(ownedState(animal.feedCost, [FIRST]), FIRST, Number.NaN);
    expect(fed).not.toBeNull();
    expect(Number.isFinite(fed!.animals.feeding[FIRST]!)).toBe(true);
  });
});

describe('collectAllReadyProduce', () => {
  test('collects every ready animal at one boundary and leaves growing animals untouched', () => {
    const now = 20_000_000;
    const first = ANIMALS[0]!;
    const second = ANIMALS[1]!;
    const third = ANIMALS[2]!;
    const before = ownedState(100, [first.key, second.key, third.key], {
      [first.key]: now - first.produceTimerMs,
      [second.key]: now - second.produceTimerMs - 1,
      [third.key]: now - third.produceTimerMs + 1,
    });

    const result = collectAllReadyProduce(before, now);

    expect(result.collectedKeys).toEqual([first.key, second.key]);
    expect(result.outcomes).toEqual([
      {
        animalKey: first.key,
        baseRevenue: first.producePrice,
        finalRevenue: first.producePrice,
        isRare: false,
        rareMultiplier: 1,
        readyWaitMs: 0,
      },
      {
        animalKey: second.key,
        baseRevenue: second.producePrice,
        finalRevenue: second.producePrice,
        isRare: false,
        rareMultiplier: 1,
        readyWaitMs: 1,
      },
    ]);
    expect(result.collectedCount).toBe(2);
    expect(result.totalGold).toBe(first.producePrice + second.producePrice);
    expect(result.state.gold).toBe(before.gold + result.totalGold);
    expect(result.state.animals.feeding[first.key]).toBeUndefined();
    expect(result.state.animals.feeding[second.key]).toBeUndefined();
    expect(result.state.animals.feeding[third.key]).toBe(before.animals.feeding[third.key]);
    expect(before.animals.feeding[first.key]).toBeDefined();

    const secondAttempt = collectAllReadyProduce(result.state, now);
    expect(secondAttempt.state).toBe(result.state);
    expect(secondAttempt.collectedCount).toBe(0);
    expect(secondAttempt.totalGold).toBe(0);
  });

  test('returns the input state reference when no animal is ready', () => {
    const before = ownedState(100, [FIRST]);
    const result = collectAllReadyProduce(before, 10);

    expect(result.state).toBe(before);
    expect(result.collectedKeys).toEqual([]);
    expect(result.outcomes).toEqual([]);
    expect(result.collectedCount).toBe(0);
    expect(result.totalGold).toBe(0);
  });
});

describe('normalizeAnimalsState', () => {
  test('non-object/legacy save normalizes to empty state', () => {
    expect(normalizeAnimalsState(undefined)).toEqual({ owned: [], feeding: {} });
    expect(normalizeAnimalsState(null)).toEqual({ owned: [], feeding: {} });
    expect(normalizeAnimalsState(42)).toEqual({ owned: [], feeding: {} });
  });

  test('drops unknown owned keys and de-duplicates in catalog order', () => {
    const normalized = normalizeAnimalsState({
      owned: [SECOND, 'ghost', FIRST, FIRST],
      feeding: {},
    });
    expect(normalized.owned).toEqual(ANIMALS.filter((a) => a.key === FIRST || a.key === SECOND).map((a) => a.key));
  });

  test('drops feeding for un-owned or non-finite entries', () => {
    const normalized = normalizeAnimalsState({
      owned: [FIRST],
      feeding: { [FIRST]: 123, [SECOND]: 999, ghost: 5, [FIRST + '_x']: Number.POSITIVE_INFINITY },
    } as unknown);
    expect(normalized.owned).toEqual([FIRST]);
    expect(normalized.feeding).toEqual({ [FIRST]: 123 });
  });
});

describe('meta-layer integration', () => {
  test('animals is classified as a meta-layer field', () => {
    expect(META_LAYER_KEYS).toContain('animals');
  });

  test('a save without the field migrates to an empty animals state', () => {
    const base = createInitialState();
    const migrated = migrateLoadedState({} as Partial<GameState>, base);
    expect(migrated.animals).toEqual({ owned: [], feeding: {} });
  });

  test('owned coops and in-progress feeding survive prestige (meta layer preserved)', () => {
    const animal = getAnimal(FIRST)!;
    const fed = feedAnimal(purchaseAnimal(stateWithGold(animal.purchaseCost + animal.feedCost), FIRST)!, FIRST, 7)!;
    expect(isAnimalOwned(fed, FIRST)).toBe(true);
    const prestiged = createPrestigedState(fed);
    expect(prestiged.animals.owned).toEqual([FIRST]);
    expect(prestiged.animals.feeding[FIRST]).toBe(7);
  });
});
