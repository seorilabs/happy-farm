/// <reference types="jest" />

import {
  PRODUCTION_RECIPES,
  addCropToInventory,
  cancelCraft,
  canCollectCraft,
  canStartCraft,
  collectAllReadyCrafts,
  collectCraft,
  createInitialProductionState,
  getProductionState,
  getProductionStates,
  getCraftTimerMs,
  getRecipe,
  getRecipes,
  hasIngredients,
  isKnownRecipeKey,
  normalizeProductionState,
  startCraft,
  type ProductionState,
} from '../production';
import { CROPS, createInitialState, migrateLoadedState } from '../constants';
import { RESEARCH_NODES } from '../research';
import { performHarvest } from '../harvest';
import { createPrestigedState } from '../prestige';
import { getProductionRecipeLabel } from '../i18n';
import type { CropKey, GameState, ProductionRecipeKey } from '../types';
import { META_LAYER_KEYS } from '../types';
import { getDailyMissionsSnapshot } from '../missions';
import { getWeeklyMissionsSnapshot } from '../weeklyMissions';

const FIRST = PRODUCTION_RECIPES[0]!;
const MS_PER_HOUR = 60 * 60 * 1000;

function stateWith(production: ProductionState, gold = 0): GameState {
  return { ...createInitialState(), gold, production };
}

// FIRST 레시피 입력을 모두 충족하는 인벤토리로 상태를 만든다.
function stateWithIngredients(): GameState {
  const inventory: Partial<Record<CropKey, number>> = {};
  for (const input of FIRST.inputs) {
    inventory[input.crop] = input.qty;
  }
  return stateWith({ inventory, crafting: {} });
}

describe('production catalog', () => {
  test('catalog is non-empty with unique keys, valid inputs, and value-add pricing', () => {
    expect(PRODUCTION_RECIPES.length).toBeGreaterThan(0);
    const keys = PRODUCTION_RECIPES.map((recipe) => recipe.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const recipe of PRODUCTION_RECIPES) {
      expect(recipe.timerMs).toBeGreaterThan(0);
      expect(recipe.sellPrice).toBeGreaterThan(0);
      expect(recipe.inputs.length).toBeGreaterThan(0);
      const inputSellSum = recipe.inputs.reduce((sum, input) => {
        expect(CROPS[input.crop]).toBeDefined();
        expect(Number.isInteger(input.qty) && input.qty > 0).toBe(true);
        return sum + CROPS[input.crop]!.sell * input.qty;
      }, 0);
      // 판매가는 입력 작물 판매가 합보다 크다(부가가치).
      expect(recipe.sellPrice).toBeGreaterThan(inputSellSum);
    }
  });

  test('recipe net/h stays below the cheapest crop net/h (does not dominate crops)', () => {
    const minCropNetPerHour = Math.min(
      ...Object.values(CROPS).map((crop) => ((crop.sell - crop.cost) / crop.growTime) * MS_PER_HOUR)
    );
    for (const recipe of PRODUCTION_RECIPES) {
      // 재고 입력은 수확 부산물(무료)이라 실현 net/h = 판매가 전액 / 타이머.
      const netPerHour = (recipe.sellPrice / recipe.timerMs) * MS_PER_HOUR;
      expect(netPerHour).toBeGreaterThan(0);
      expect(netPerHour).toBeLessThan(minCropNetPerHour);
    }
  });

  test('tier 6~7 recipes extend the sink in ascending price with ko/en labels (#297)', () => {
    const lateTierRecipes: ProductionRecipeKey[] = [
      'coconut_bar',
      'kiwi_smoothie',
      'avocado_toast',
      'cactus_candy',
      'bamboo_tea',
      'ginseng_tonic',
      'crystal_elixir',
    ];
    const catalogKeys = PRODUCTION_RECIPES.map((recipe) => recipe.key);

    for (const key of lateTierRecipes) {
      const recipe = getRecipe(key);
      expect(recipe).not.toBeNull();
      // 입력이 tier 6 이상 작물이다(후반 재고 소비처).
      expect(recipe!.inputs.every((input) => (CROPS[input.crop]?.tier ?? 0) >= 6)).toBe(true);
      // ko/en 라벨이 모두 비어 있지 않다.
      for (const locale of ['ko-KR', 'en-US'] as const) {
        const label = getProductionRecipeLabel(key, locale);
        expect(label.name.trim()).not.toBe('');
        expect(label.description.trim()).not.toBe('');
      }
    }
    // 신규 7종이 카탈로그 최상단(최고가)에 선언 순서대로 놓인다.
    expect(catalogKeys.slice(-7)).toEqual(lateTierRecipes);
    // 카탈로그 전체가 sellPrice 오름차순이다(선언 순서=가격 오름차순 유지 — #297).
    for (let index = 1; index < PRODUCTION_RECIPES.length; index += 1) {
      expect(PRODUCTION_RECIPES[index]!.sellPrice).toBeGreaterThan(PRODUCTION_RECIPES[index - 1]!.sellPrice);
    }
  });

  test('mid/late recipes consume tier-4+ crop inventory and craft end to end (#271)', () => {
    // 후반 재고 소비: 최소 6종의 레시피가 tier 4 이상 작물을 입력으로 가진다.
    const tier4Recipes = PRODUCTION_RECIPES.filter((recipe) =>
      recipe.inputs.some((input) => (CROPS[input.crop]?.tier ?? 0) >= 4)
    );
    expect(tier4Recipes.length).toBeGreaterThanOrEqual(6);

    // 대표 후반 레시피(배 잼)를 실제로 가공·수령해 소비/보상이 동작함을 확인한다.
    const pearJam = getRecipe('pear_jam');
    expect(pearJam).not.toBeNull();
    expect(pearJam!.inputs.some((input) => (CROPS[input.crop]?.tier ?? 0) >= 4)).toBe(true);

    const now = 5_000_000;
    const inventory: Partial<Record<CropKey, number>> = {};
    for (const input of pearJam!.inputs) {
      inventory[input.crop] = input.qty;
    }
    const seeded = stateWith({ inventory, crafting: {} }, 1000);
    const crafting = startCraft(seeded, 'pear_jam', now)!;
    // 입력 작물이 인벤토리에서 차감된다.
    for (const input of pearJam!.inputs) {
      expect(crafting.production.inventory[input.crop] ?? 0).toBe(0);
    }
    // 타이머 이후 수령하면 sellPrice가 1회 지급된다.
    const readyAt = now + pearJam!.timerMs;
    expect(canCollectCraft(crafting, 'pear_jam', readyAt)).toBe(true);
    const collected = collectCraft(crafting, 'pear_jam', readyAt)!;
    expect(collected.gold).toBe(seeded.gold + pearJam!.sellPrice);
  });

  test('every recipe has ko/en labels', () => {
    for (const recipe of PRODUCTION_RECIPES) {
      for (const locale of ['ko-KR', 'en-US'] as const) {
        const label = getProductionRecipeLabel(recipe.key, locale);
        expect(label.name.trim()).not.toBe('');
        expect(label.description.trim()).not.toBe('');
      }
    }
  });

  test('isKnownRecipeKey / getRecipes reflect the catalog', () => {
    expect(isKnownRecipeKey(FIRST.key)).toBe(true);
    expect(isKnownRecipeKey('not_a_recipe')).toBe(false);
    expect(isKnownRecipeKey(7)).toBe(false);
    expect(getRecipes()).toBe(PRODUCTION_RECIPES);
  });
});

describe('harvest byproduct', () => {
  test('each harvest deposits one crop unit into the inventory (in addition to gold)', () => {
    const base = createInitialState();
    // 심고 익힌 밭 하나 준비.
    const cropKey = Object.keys(CROPS)[0] as CropKey;
    const planted: GameState = {
      ...base,
      plots: base.plots.map((plot, index) =>
        index === 0 ? { id: 0, cropType: cropKey, startTime: 0, state: 2 as const } : plot
      ),
    };
    const outcome = performHarvest(planted, 0, { now: 1_000_000, rng: () => 0.999999 });
    expect(outcome).not.toBeNull();
    // 골드 보상은 그대로이고, 인벤토리에 작물 1개가 적재된다.
    expect(outcome!.goldGained).toBeGreaterThan(0);
    expect(outcome!.state.production.inventory[cropKey]).toBe(1);
    // 원래 상태는 불변.
    expect(planted.production.inventory[cropKey] ?? 0).toBe(0);
  });
});

describe('addCropToInventory', () => {
  test('adds and accumulates; ignores non-positive amounts', () => {
    const cropKey = Object.keys(CROPS)[0] as CropKey;
    let inv = addCropToInventory({}, cropKey, 1);
    expect(inv[cropKey]).toBe(1);
    inv = addCropToInventory(inv, cropKey, 2);
    expect(inv[cropKey]).toBe(3);
    expect(addCropToInventory(inv, cropKey, 0)).toBe(inv);
    expect(addCropToInventory(inv, cropKey, -5)).toBe(inv);
  });
});

describe('startCraft / collectCraft cycle', () => {
  test('starting a craft consumes inputs and begins a deterministic timer', () => {
    const now = 2_000_000;
    const before = stateWithIngredients();
    expect(hasIngredients(before, FIRST.key)).toBe(true);
    expect(canStartCraft(before, FIRST.key)).toBe(true);

    const crafting = startCraft(before, FIRST.key, now)!;
    // 입력이 차감됐다.
    for (const input of FIRST.inputs) {
      expect(crafting.production.inventory[input.crop] ?? 0).toBe((before.production.inventory[input.crop] ?? 0) - input.qty);
    }
    const status = getProductionState(crafting, FIRST.key, now)!;
    expect(status.phase).toBe('crafting');
    expect(status.readyAt).toBe(now + FIRST.timerMs);
    expect(status.remainingMs).toBe(FIRST.timerMs);
  });

  test('cannot start without ingredients or when already crafting', () => {
    const empty = stateWith(createInitialProductionState());
    expect(canStartCraft(empty, FIRST.key)).toBe(false);
    expect(startCraft(empty, FIRST.key, 1)).toBeNull();

    const crafting = startCraft(stateWithIngredients(), FIRST.key, 1)!;
    expect(canStartCraft(crafting, FIRST.key)).toBe(false);
    expect(startCraft(crafting, FIRST.key, 2)).toBeNull();
  });

  test('canceling an in-progress craft refunds every input once without changing gold', () => {
    const now = 2_500_000;
    const recipe = getRecipe('pumpkin_tart')!;
    expect(recipe.inputs.length).toBeGreaterThanOrEqual(2);
    const inventory: Partial<Record<CropKey, number>> = {};
    for (const [index, input] of recipe.inputs.entries()) {
      inventory[input.crop] = input.qty + index + 2;
    }
    const before = stateWith({ inventory, crafting: {} }, 777);
    const originalInventory = { ...before.production.inventory };
    const crafting = startCraft(before, recipe.key, now)!;

    const canceled = cancelCraft(crafting, recipe.key, now + recipe.timerMs - 1)!;

    expect(canceled.production.inventory).toEqual(originalInventory);
    expect(canceled.production.crafting[recipe.key]).toBeUndefined();
    expect(canceled.gold).toBe(crafting.gold);
    expect(crafting.production.crafting[recipe.key]).toBe(now);
    expect(before.production.inventory).toEqual(originalInventory);
    expect(cancelCraft(canceled, recipe.key, now + 1)).toBeNull();
  });

  test('cancel rejects unknown, idle, and completed crafts; ready output remains collectable', () => {
    const now = 2_750_000;
    const idle = stateWithIngredients();
    expect(cancelCraft(idle, FIRST.key, now)).toBeNull();
    expect(cancelCraft(idle, 'nope' as ProductionRecipeKey, now)).toBeNull();

    const crafting = startCraft(idle, FIRST.key, now)!;
    const readyAt = now + FIRST.timerMs;
    expect(cancelCraft(crafting, FIRST.key, readyAt - 1)).not.toBeNull();
    expect(cancelCraft(crafting, FIRST.key, readyAt)).toBeNull();

    const collected = collectCraft(crafting, FIRST.key, readyAt);
    expect(collected).not.toBeNull();
    expect(collected!.gold).toBe(crafting.gold + FIRST.sellPrice);
  });

  test('produce is collectable only after the timer, paying sellPrice once', () => {
    const now = 3_000_000;
    const crafting = startCraft(stateWithIngredients(), FIRST.key, now)!;

    const midway = now + FIRST.timerMs - 1;
    expect(canCollectCraft(crafting, FIRST.key, midway)).toBe(false);
    expect(collectCraft(crafting, FIRST.key, midway)).toBeNull();

    const readyAt = now + FIRST.timerMs;
    expect(getProductionState(crafting, FIRST.key, readyAt)!.phase).toBe('ready');
    expect(canCollectCraft(crafting, FIRST.key, readyAt)).toBe(true);

    const collected = collectCraft(crafting, FIRST.key, readyAt)!;
    expect(collected.gold).toBe(crafting.gold + FIRST.sellPrice);
    expect(collected.production.crafting[FIRST.key]).toBeUndefined();
    expect(getProductionState(collected, FIRST.key, readyAt)!.phase).toBe('idle');
    expect(
      getDailyMissionsSnapshot(collected.dailyMissionState, readyAt, collected.unlockedAreas).missions.find(
        (mission) => mission.type === 'craft_complete'
      )!.progress
    ).toBe(1);
    expect(
      getWeeklyMissionsSnapshot(collected.weeklyMissionState, readyAt, collected.unlockedAreas).missions.find(
        (mission) => mission.type === 'craft_complete'
      )!.progress
    ).toBe(1);
    // 이중 수집 불가.
    expect(collectCraft(collected, FIRST.key, readyAt)).toBeNull();
  });

  test('가공 연구는 진행 중인 가공의 남은 시간까지 줄인다', () => {
    const now = 4_000_000;
    const craftNode = RESEARCH_NODES.find((node) => node.key === 'craft_studies')!;
    const crafting = startCraft(stateWithIngredients(), FIRST.key, now)!;
    expect(getCraftTimerMs(crafting, FIRST.key)).toBe(FIRST.timerMs);

    // 이미 시작한 가공에 연구를 얹으면 readyAt이 앞당겨진다(타이머는 매번 재계산).
    const studied: GameState = {
      ...crafting,
      research: {
        ...crafting.research,
        nodeLevels: { donation_amplifier: 1, craft_studies: 5 },
        unlockedNodes: ['donation_amplifier', 'craft_studies'],
      },
    };
    const shortened = Math.ceil(FIRST.timerMs / (1 + craftNode.effectPerLevel * 5));
    expect(shortened).toBeLessThan(FIRST.timerMs);
    expect(getCraftTimerMs(studied, FIRST.key)).toBe(shortened);

    const status = getProductionState(studied, FIRST.key, now)!;
    expect(status.timerMs).toBe(shortened);
    expect(status.readyAt).toBe(now + shortened);
    expect(getProductionState(studied, FIRST.key, now + shortened - 1)!.phase).toBe('crafting');
    expect(getProductionState(studied, FIRST.key, now + shortened)!.phase).toBe('ready');
    // 연구가 없었다면 아직 진행 중이었을 시점에도 수집할 수 있다.
    expect(canCollectCraft(crafting, FIRST.key, now + shortened)).toBe(false);
    expect(canCollectCraft(studied, FIRST.key, now + shortened)).toBe(true);
    // 판매가는 그대로다(가공 연구는 시간만 줄인다).
    expect(collectCraft(studied, FIRST.key, now + shortened)!.gold).toBe(studied.gold + FIRST.sellPrice);
    expect(getCraftTimerMs(studied, 'nope' as ProductionRecipeKey)).toBe(0);
  });

  test('getProductionState returns null for unknown keys; getProductionStates keeps catalog order', () => {
    const base = stateWith(createInitialProductionState());
    expect(getProductionState(base, 'nope' as ProductionRecipeKey, 0)).toBeNull();
    expect(getProductionStates(base, 0).map((status) => status.key)).toEqual(
      PRODUCTION_RECIPES.map((recipe) => recipe.key)
    );
  });

  test('non-finite now falls back without throwing', () => {
    const crafting = startCraft(stateWithIngredients(), FIRST.key, Number.NaN);
    expect(crafting).not.toBeNull();
    expect(Number.isFinite(crafting!.production.crafting[FIRST.key]!)).toBe(true);
  });
});

describe('collectAllReadyCrafts', () => {
  test('collects every completed recipe at one boundary and preserves in-progress work', () => {
    const now = 20_000_000;
    const first = PRODUCTION_RECIPES[0]!;
    const second = PRODUCTION_RECIPES[1]!;
    const third = PRODUCTION_RECIPES[2]!;
    const inventory = { [first.inputs[0]!.crop]: 7 };
    const before = stateWith(
      {
        inventory,
        crafting: {
          [first.key]: now - first.timerMs,
          [second.key]: now - second.timerMs - 1,
          [third.key]: now - third.timerMs + 1,
        },
      },
      100
    );

    const result = collectAllReadyCrafts(before, now);

    expect(result.collectedKeys).toEqual([first.key, second.key]);
    expect(result.collectedCount).toBe(2);
    expect(result.totalGold).toBe(first.sellPrice + second.sellPrice);
    expect(result.state.gold).toBe(before.gold + result.totalGold);
    expect(result.state.production.inventory).toBe(inventory);
    expect(result.state.production.crafting[first.key]).toBeUndefined();
    expect(result.state.production.crafting[second.key]).toBeUndefined();
    expect(result.state.production.crafting[third.key]).toBe(before.production.crafting[third.key]);
    expect(before.production.crafting[first.key]).toBeDefined();

    const secondAttempt = collectAllReadyCrafts(result.state, now);
    expect(secondAttempt.state).toBe(result.state);
    expect(secondAttempt.collectedCount).toBe(0);
    expect(secondAttempt.totalGold).toBe(0);
  });

  test('returns the input state reference when no craft is ready', () => {
    const before = stateWith(createInitialProductionState(), 100);
    const result = collectAllReadyCrafts(before, 10);

    expect(result.state).toBe(before);
    expect(result.collectedKeys).toEqual([]);
    expect(result.collectedCount).toBe(0);
    expect(result.totalGold).toBe(0);
  });
});

describe('normalizeProductionState', () => {
  test('non-object/legacy save normalizes to empty state', () => {
    expect(normalizeProductionState(undefined)).toEqual({ inventory: {}, crafting: {} });
    expect(normalizeProductionState(null)).toEqual({ inventory: {}, crafting: {} });
    expect(normalizeProductionState(5)).toEqual({ inventory: {}, crafting: {} });
  });

  test('drops unknown crop/recipe keys and non-positive/non-finite values', () => {
    const cropKey = Object.keys(CROPS)[0] as CropKey;
    const normalized = normalizeProductionState({
      inventory: { [cropKey]: 4.9, ghost: 3, [Object.keys(CROPS)[1]!]: 0, bad: Number.POSITIVE_INFINITY },
      crafting: { [FIRST.key]: 123, phantom: 9, [FIRST.key + '_x']: Number.NaN },
    } as unknown);
    // 4.9 → floor 4, 0/무한/미지의 키 제거.
    expect(normalized.inventory).toEqual({ [cropKey]: 4 });
    expect(normalized.crafting).toEqual({ [FIRST.key]: 123 });
  });

  test('drops fractional inventory that floors to 0 and drops negative startedAt', () => {
    const c0 = Object.keys(CROPS)[0] as CropKey;
    const c1 = Object.keys(CROPS)[1] as CropKey;
    const normalized = normalizeProductionState({
      inventory: { [c0]: 0.1, [c1]: 2.9 },
      crafting: { [FIRST.key]: -5 },
    } as unknown);
    // 0.1 → floor 0 → "재고 0" 항목을 남기지 않고 제거. 2.9 → 2 유지.
    expect(normalized.inventory).toEqual({ [c1]: 2 });
    // 음수 startedAt(손상 세이브)은 제거된다.
    expect(normalized.crafting).toEqual({});
  });

  test('getProductionState treats a negative startedAt as idle (readyAt never negative)', () => {
    // 정규화를 거치지 않고 음수 startedAt을 직접 넣어도 방어된다(idle, readyAt null).
    const state = stateWith({ inventory: {}, crafting: { [FIRST.key]: -1000 } });
    const status = getProductionState(state, FIRST.key, 0)!;
    expect(status.phase).toBe('idle');
    expect(status.startedAt).toBeNull();
    expect(status.readyAt).toBeNull();
  });
});

describe('meta-layer integration', () => {
  test('production is classified as a meta-layer field', () => {
    expect(META_LAYER_KEYS).toContain('production');
    expect(getRecipe(FIRST.key)).toBeDefined();
  });

  test('a save without the field migrates to an empty production state', () => {
    const base = createInitialState();
    const migrated = migrateLoadedState({} as Partial<GameState>, base);
    expect(migrated.production).toEqual({ inventory: {}, crafting: {} });
  });

  test('inventory and in-progress crafts survive prestige (meta layer preserved)', () => {
    const crafting = startCraft(stateWithIngredients(), FIRST.key, 11)!;
    const withStock: GameState = {
      ...crafting,
      production: {
        ...crafting.production,
        inventory: addCropToInventory(crafting.production.inventory, Object.keys(CROPS)[0] as CropKey, 5),
      },
    };
    const prestiged = createPrestigedState(withStock);
    expect(prestiged.production.crafting[FIRST.key]).toBe(11);
    expect(prestiged.production.inventory[Object.keys(CROPS)[0] as CropKey]).toBe(5);
  });
});
