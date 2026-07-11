/// <reference types="jest" />

import {
  DECORATIONS,
  canPurchaseDecoration,
  createInitialPlacedDecorations,
  getDecoration,
  isDecorationOwned,
  isKnownDecorationKey,
  normalizePlacedDecorations,
  purchaseDecoration,
  getPlacedDecorations,
} from '../decorations';
import { createInitialState, migrateLoadedState } from '../constants';
import { createPrestigedState } from '../prestige';
import { getDecorationLabel } from '../i18n';
import type { DecorationKey, GameState } from '../types';
import { META_LAYER_KEYS } from '../types';

const FIRST = DECORATIONS[0]!.key;
const SECOND = DECORATIONS[1]!.key;

function stateWithGold(gold: number, placedDecorations: DecorationKey[] = []): GameState {
  return { ...createInitialState(), gold, placedDecorations };
}

describe('decorations catalog', () => {
  test('catalog is non-empty with unique keys and positive prices', () => {
    expect(DECORATIONS.length).toBeGreaterThan(0);
    const keys = DECORATIONS.map((decoration) => decoration.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const decoration of DECORATIONS) {
      expect(decoration.price).toBeGreaterThan(0);
      expect(typeof decoration.icon).toBe('string');
      expect(decoration.icon.length).toBeGreaterThan(0);
    }
  });

  test('every catalog item has ko/en labels', () => {
    for (const decoration of DECORATIONS) {
      for (const locale of ['ko-KR', 'en-US'] as const) {
        const label = getDecorationLabel(decoration.key, locale);
        expect(label.name.trim()).not.toBe('');
        expect(label.description.trim()).not.toBe('');
      }
    }
  });

  test('prestige-era top-tier decorations extend the catalog in ascending order with ko/en labels (#293)', () => {
    const prestigeTier: DecorationKey[] = ['observatory', 'aurora_arch', 'celestial_palace'];
    const catalogKeys = DECORATIONS.map((decoration) => decoration.key);

    // 신규 3종이 카탈로그에 존재하고 최상단(최고가)에 선언 순서대로 놓인다.
    for (const key of prestigeTier) {
      expect(catalogKeys).toContain(key);
    }
    expect(catalogKeys.slice(-3)).toEqual(prestigeTier);

    // 카탈로그 전체가 가격 순증가(골드 싱크 사다리 단조성 — #293 리뷰: 간격이 사다리를
    // 끊지 않도록 오름차순 불변식을 회귀로 고정).
    for (let index = 1; index < DECORATIONS.length; index += 1) {
      expect(DECORATIONS[index]!.price).toBeGreaterThan(DECORATIONS[index - 1]!.price);
    }

    // 신규 3종 각각 ko/en 라벨이 비어 있지 않다.
    for (const key of prestigeTier) {
      for (const locale of ['ko-KR', 'en-US'] as const) {
        const label = getDecorationLabel(key, locale);
        expect(label.name.trim()).not.toBe('');
        expect(label.description.trim()).not.toBe('');
      }
    }
  });

  test('isKnownDecorationKey accepts catalog keys and rejects others', () => {
    expect(isKnownDecorationKey(FIRST)).toBe(true);
    expect(isKnownDecorationKey('not_a_decoration')).toBe(false);
    expect(isKnownDecorationKey(42)).toBe(false);
    expect(isKnownDecorationKey(null)).toBe(false);
  });
});

describe('purchaseDecoration', () => {
  test('deducts gold and records ownership exactly once', () => {
    const decoration = getDecoration(FIRST)!;
    const before = stateWithGold(decoration.price + 100);

    const after = purchaseDecoration(before, FIRST);
    expect(after).not.toBeNull();
    expect(after!.gold).toBe(100);
    expect(after!.placedDecorations).toEqual([FIRST]);
    // Pure: the original state is untouched.
    expect(before.gold).toBe(decoration.price + 100);
    expect(before.placedDecorations).toEqual([]);
  });

  test('returns null when gold is insufficient (no charge)', () => {
    const decoration = getDecoration(FIRST)!;
    const before = stateWithGold(decoration.price - 1);
    expect(canPurchaseDecoration(before, FIRST)).toBe(false);
    expect(purchaseDecoration(before, FIRST)).toBeNull();
  });

  test('cannot buy the same decoration twice', () => {
    const decoration = getDecoration(FIRST)!;
    const owned = stateWithGold(decoration.price * 5, [FIRST]);
    expect(isDecorationOwned(owned.placedDecorations, FIRST)).toBe(true);
    expect(canPurchaseDecoration(owned, FIRST)).toBe(false);
    expect(purchaseDecoration(owned, FIRST)).toBeNull();
  });

  test('rejects unknown keys', () => {
    const rich = stateWithGold(1_000_000);
    expect(purchaseDecoration(rich, 'mystery_item' as DecorationKey)).toBeNull();
  });
});

describe('normalizePlacedDecorations', () => {
  test('drops unknown keys, de-duplicates, and uses catalog order', () => {
    const messy = [SECOND, 'ghost', FIRST, FIRST, 99] as unknown;
    expect(normalizePlacedDecorations(messy)).toEqual([FIRST, SECOND]);
  });

  test('non-array input normalizes to empty', () => {
    expect(normalizePlacedDecorations(undefined)).toEqual([]);
    expect(normalizePlacedDecorations('fence')).toEqual([]);
    expect(normalizePlacedDecorations(createInitialPlacedDecorations())).toEqual([]);
  });
});

describe('getPlacedDecorations (render layer)', () => {
  test('returns [] when the player owns nothing (layer hidden)', () => {
    expect(getPlacedDecorations(stateWithGold(0))).toEqual([]);
  });

  test('resolves owned keys to catalog entries in catalog order', () => {
    // Store the keys out of catalog order to prove the render order is stable.
    const state = stateWithGold(0, [SECOND, FIRST]);
    const placed = getPlacedDecorations(state);
    expect(placed.map((decoration) => decoration.key)).toEqual([FIRST, SECOND]);
    // Each entry carries the icon/price needed to render.
    expect(placed[0]).toEqual(getDecoration(FIRST));
    expect(placed[1]).toEqual(getDecoration(SECOND));
  });

  test('drops unknown/legacy keys from the render list', () => {
    const state = stateWithGold(0, [FIRST, 'removed_in_v2' as DecorationKey]);
    expect(getPlacedDecorations(state).map((decoration) => decoration.key)).toEqual([FIRST]);
  });
});

describe('save migration & prestige', () => {
  test('placedDecorations is a meta-layer field', () => {
    expect(META_LAYER_KEYS).toContain('placedDecorations');
  });

  test('migration filters unknown decoration keys from a loaded save', () => {
    const base = createInitialState();
    const loaded = { placedDecorations: [FIRST, 'removed_in_v2', SECOND] } as unknown as Partial<GameState>;
    const migrated = migrateLoadedState(loaded, base);
    expect(migrated.placedDecorations).toEqual([FIRST, SECOND]);
  });

  test('a save without placedDecorations loads as empty', () => {
    const base = createInitialState();
    const migrated = migrateLoadedState({} as Partial<GameState>, base);
    expect(migrated.placedDecorations).toEqual([]);
  });

  test('owned decorations survive prestige (meta layer preserved)', () => {
    const decoration = getDecoration(FIRST)!;
    const owned = purchaseDecoration(stateWithGold(decoration.price + 5_000), FIRST)!;
    const prestiged = createPrestigedState(owned);
    expect(prestiged.placedDecorations).toEqual([FIRST]);
  });
});

// #210: 장식 카탈로그 중·후반 티어 확장. "후반 골드 싱크" 설계 의도에 맞게 카탈로그가
// 100,000G~수십억G 구간을 커버하고, 가격 오름차순·아이콘/키 유일성·구 카탈로그 세이브의
// 안정 렌더를 데이터 계약으로 고정한다.
describe('catalog tier coverage (#210)', () => {
  test('가격이 카탈로그 선언 순서대로 순증가한다(오름차순 계약)', () => {
    for (let index = 1; index < DECORATIONS.length; index += 1) {
      expect(DECORATIONS[index]!.price).toBeGreaterThan(DECORATIONS[index - 1]!.price);
    }
  });

  test('카탈로그가 중·후반 구간(100,000G~수십억G)을 커버한다', () => {
    const prices = DECORATIONS.map((decoration) => decoration.price);
    // 신규 6종의 하한(100,000G)과 상한(수십억G) 커버.
    expect(prices.some((price) => price >= 100_000 && price < 10_000_000)).toBe(true);
    expect(prices.some((price) => price >= 10_000_000 && price < 1_000_000_000)).toBe(true);
    expect(Math.max(...prices)).toBeGreaterThanOrEqual(10_000_000_000);
    // 총합이 기존 70,700G에서 유의미하게 확장됐다(후반 잉여 골드 싱크).
    expect(prices.reduce((sum, price) => sum + price, 0)).toBeGreaterThan(1_000_000_000);
  });

  test('아이콘도 키처럼 카탈로그 안에서 중복이 없다', () => {
    const icons = DECORATIONS.map((decoration) => decoration.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  test('구 카탈로그(확장 전 6종) 세이브가 신규 카탈로그 순서로 안정 렌더된다', () => {
    // 확장 전 세이브가 가질 수 있는 보유 목록: 기존 6종 일부(저장 순서 뒤섞임 + 잡음 키).
    const legacySave = ['lantern', 'signpost', 'pond', 'ghost_item', 'signpost'];
    const normalized = normalizePlacedDecorations(legacySave);
    // 알 수 없는 키 제거·중복 제거 후 카탈로그 선언 순서로 정렬된다.
    expect(normalized).toEqual(['signpost', 'pond', 'lantern']);

    // getPlacedDecorations도 같은 순서 계약으로 렌더 목록을 만든다(신규 항목이 카탈로그
    // 뒤에 추가돼도 기존 보유분의 순서는 변하지 않는다).
    const state: GameState = { ...createInitialState(), placedDecorations: normalized };
    expect(getPlacedDecorations(state).map((decoration) => decoration.key)).toEqual([
      'signpost',
      'pond',
      'lantern',
    ]);
  });

  test('신규 후반 장식도 구매 경로(부족→불가, 충분→1회 구매)가 동일하게 동작한다', () => {
    const last = DECORATIONS[DECORATIONS.length - 1]!;
    expect(canPurchaseDecoration(stateWithGold(last.price - 1), last.key)).toBe(false);
    const bought = purchaseDecoration(stateWithGold(last.price), last.key);
    expect(bought).not.toBeNull();
    expect(bought!.gold).toBe(0);
    expect(isDecorationOwned(bought!.placedDecorations, last.key)).toBe(true);
  });
});
