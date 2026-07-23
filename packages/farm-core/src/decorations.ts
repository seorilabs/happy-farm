import balance from './balance.json';
import type { DecorationKey, GameState } from './types';
import { recordMissionProgressEvent } from './missionEvents';

// Cosmetic farm decorations. A late-game gold sink and self-expression layer:
// the player spends surplus gold on purely cosmetic items (fence, scarecrow,
// signpost, pond …) that have no gameplay effect. Ownership lives in the
// meta-layer field GameState.placedDecorations, so a bought decoration survives
// every prestige. The canonical catalog (key/icon/price) is balance.json; the
// localized names/descriptions live in i18n/labels.ts.

export type Decoration = {
  key: DecorationKey;
  icon: string;
  // Gold cost. Prices climb across the catalog so decorations only become an
  // attractive sink once expansion/upgrades are largely exhausted.
  price: number;
};

// Catalog in declaration order (cheapest → most expensive). The UI renders this
// order and normalizePlacedDecorations preserves it for owned items.
export const DECORATIONS: readonly Decoration[] = balance.decorations.items as readonly Decoration[];

const DECORATION_BY_KEY = new Map<string, Decoration>(DECORATIONS.map((decoration) => [decoration.key, decoration]));

export function isKnownDecorationKey(value: unknown): value is DecorationKey {
  return typeof value === 'string' && DECORATION_BY_KEY.has(value);
}

export function getDecoration(key: DecorationKey): Decoration | undefined {
  return DECORATION_BY_KEY.get(key);
}

export function createInitialPlacedDecorations(): DecorationKey[] {
  return [];
}

// Drops unknown keys (catalog items removed in a later build) and de-duplicates,
// keeping the catalog declaration order so a corrupt/legacy save always loads
// into a clean, render-stable list.
export function normalizePlacedDecorations(value: unknown): DecorationKey[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const owned = new Set<DecorationKey>();
  for (const item of value) {
    if (isKnownDecorationKey(item)) {
      owned.add(item);
    }
  }
  return DECORATIONS.filter((decoration) => owned.has(decoration.key)).map((decoration) => decoration.key);
}

export function isDecorationOwned(placedDecorations: readonly DecorationKey[], key: DecorationKey): boolean {
  return placedDecorations.includes(key);
}

// Owned decorations resolved to their catalog entries (key/icon/price) for the
// farm-screen render layer. Always returns catalog declaration order and drops
// any unknown/legacy key so the render stays stable regardless of how the save
// stored the list. Returns [] when nothing is owned so callers can hide the
// layer entirely.
export function getPlacedDecorations(state: GameState): Decoration[] {
  if (state.placedDecorations.length === 0) {
    return [];
  }
  const owned = new Set<DecorationKey>(state.placedDecorations);
  return DECORATIONS.filter((decoration) => owned.has(decoration.key));
}

// True only when the decoration exists, the player does not already own it (each
// is a one-time purchase), and they can afford it.
export function canPurchaseDecoration(state: GameState, key: DecorationKey): boolean {
  const decoration = getDecoration(key);
  if (decoration == null) {
    return false;
  }
  if (isDecorationOwned(state.placedDecorations, key)) {
    return false;
  }
  return state.gold >= decoration.price;
}

// Pure buy: returns a new state with gold deducted and the decoration recorded,
// or null when the purchase is not allowed (unknown key, already owned, or
// insufficient gold) so callers never double-charge or double-own.
export function purchaseDecoration(state: GameState, key: DecorationKey, now = Date.now()): GameState | null {
  const decoration = getDecoration(key);
  if (decoration == null || !canPurchaseDecoration(state, key)) {
    return null;
  }
  const next: GameState = {
    ...state,
    gold: state.gold - decoration.price,
    placedDecorations: [...state.placedDecorations, key],
  };
  return recordMissionProgressEvent(next, { type: 'spend_gold', amount: decoration.price }, now);
}
