import balance from './balance.json';
import type { DecorationKey, DecorationPlacement, GameState } from './types';
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

export const DECORATION_GRID_COLUMNS = 5;
// One fixed slot per catalog item guarantees that every owned decoration can be
// placed at once. Adding catalog items expands the cosmetic grid without a save
// migration because slots are simple zero-based indices.
export const DECORATION_GRID_SLOT_COUNT = DECORATIONS.length;

const DECORATION_BY_KEY = new Map<string, Decoration>(DECORATIONS.map((decoration) => [decoration.key, decoration]));

export function isKnownDecorationKey(value: unknown): value is DecorationKey {
  return typeof value === 'string' && DECORATION_BY_KEY.has(value);
}

export function getDecoration(key: DecorationKey): Decoration | undefined {
  return DECORATION_BY_KEY.get(key);
}

export function createInitialPlacedDecorations(): DecorationPlacement[] {
  return [];
}

export function isValidDecorationSlot(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < DECORATION_GRID_SLOT_COUNT;
}

// Migrates legacy DecorationKey[] ownership into default catalog-order slots,
// while preserving modern {key, slot} records. Invalid/colliding slots become
// stored items (slot null) instead of dropping ownership.
export function normalizePlacedDecorations(value: unknown): DecorationPlacement[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const owned = new Set<DecorationKey>();
  const explicitSlots = new Map<DecorationKey, unknown>();
  const explicitOrder: DecorationKey[] = [];
  for (const item of value) {
    if (isKnownDecorationKey(item)) {
      owned.add(item);
      continue;
    }
    if (typeof item !== 'object' || item == null) {
      continue;
    }
    const candidate = item as { key?: unknown; slot?: unknown };
    if (isKnownDecorationKey(candidate.key)) {
      owned.add(candidate.key);
      if (!explicitSlots.has(candidate.key)) {
        explicitSlots.set(candidate.key, candidate.slot);
        explicitOrder.push(candidate.key);
      }
    }
  }

  const usedSlots = new Set<number>();
  const normalizedSlots = new Map<DecorationKey, number | null>();
  for (const key of explicitOrder) {
    const requestedSlot = explicitSlots.get(key);
    if (isValidDecorationSlot(requestedSlot) && !usedSlots.has(requestedSlot)) {
      normalizedSlots.set(key, requestedSlot);
      usedSlots.add(requestedSlot);
    } else {
      normalizedSlots.set(key, null);
    }
  }

  // Legacy string entries have no coordinates. Place them losslessly into the
  // first free slots after reserving all valid modern placements.
  for (const decoration of DECORATIONS) {
    if (!owned.has(decoration.key) || explicitSlots.has(decoration.key)) {
      continue;
    }
    const slot = firstFreeDecorationSlot(usedSlots);
    normalizedSlots.set(decoration.key, slot);
    if (slot != null) {
      usedSlots.add(slot);
    }
  }

  return DECORATIONS.filter((decoration) => owned.has(decoration.key)).map((decoration) => ({
    key: decoration.key,
    slot: normalizedSlots.get(decoration.key) ?? null,
  }));
}

export function isDecorationOwned(
  placedDecorations: readonly DecorationPlacement[],
  key: DecorationKey
): boolean {
  return placedDecorations.some((placement) => placement.key === key);
}

export type OwnedDecoration = Decoration & { slot: number | null };
export type PlacedDecoration = Decoration & { slot: number };

export function getOwnedDecorations(state: GameState): OwnedDecoration[] {
  const placementByKey = new Map(state.placedDecorations.map((placement) => [placement.key, placement.slot]));
  return DECORATIONS.filter((decoration) => placementByKey.has(decoration.key)).map((decoration) => ({
    ...decoration,
    slot: placementByKey.get(decoration.key) ?? null,
  }));
}

// Fixed-grid render layer: stored items are excluded and placed items are sorted
// by slot so callers can render stable coordinates without touching plot hitboxes.
export function getPlacedDecorations(state: GameState): PlacedDecoration[] {
  return getOwnedDecorations(state)
    .filter((decoration): decoration is PlacedDecoration => decoration.slot != null)
    .sort((left, right) => left.slot - right.slot);
}

function firstFreeDecorationSlot(usedSlots: ReadonlySet<number>): number | null {
  for (let slot = 0; slot < DECORATION_GRID_SLOT_COUNT; slot += 1) {
    if (!usedSlots.has(slot)) {
      return slot;
    }
  }
  return null;
}

export function placeDecorationInSlot(
  state: GameState,
  key: DecorationKey,
  slot: number
): GameState | null {
  if (!isValidDecorationSlot(slot) || !isDecorationOwned(state.placedDecorations, key)) {
    return null;
  }
  const current = state.placedDecorations.find((placement) => placement.key === key);
  if (current?.slot === slot) {
    return state;
  }
  if (state.placedDecorations.some((placement) => placement.key !== key && placement.slot === slot)) {
    return null;
  }
  return {
    ...state,
    placedDecorations: state.placedDecorations.map((placement) =>
      placement.key === key ? { ...placement, slot } : placement
    ),
  };
}

export function storeDecoration(state: GameState, key: DecorationKey): GameState | null {
  const current = state.placedDecorations.find((placement) => placement.key === key);
  if (current == null) {
    return null;
  }
  if (current.slot == null) {
    return state;
  }
  return {
    ...state,
    placedDecorations: state.placedDecorations.map((placement) =>
      placement.key === key ? { ...placement, slot: null } : placement
    ),
  };
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
    placedDecorations: [
      ...state.placedDecorations,
      {
        key,
        slot: firstFreeDecorationSlot(
          new Set(
            state.placedDecorations
              .map((placement) => placement.slot)
              .filter((slot): slot is number => slot != null)
          )
        ),
      },
    ],
  };
  return recordMissionProgressEvent(next, { type: 'spend_gold', amount: decoration.price }, now);
}
