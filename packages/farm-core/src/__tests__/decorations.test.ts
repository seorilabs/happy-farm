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
