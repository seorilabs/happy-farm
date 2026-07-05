/// <reference types="jest" />

import {
  ANIMALS,
  canCollectProduce,
  canFeedAnimal,
  canPurchaseAnimal,
  collectProduce,
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

    const collected = collectProduce(fed, FIRST, readyAt)!;
    expect(collected.gold).toBe(animal.producePrice);
    // 급여 상태가 비워져 다시 유휴(재급여 가능).
    expect(collected.animals.feeding[FIRST]).toBeUndefined();
    expect(getAnimalState(collected, FIRST, readyAt)!.phase).toBe('idle');

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
