/// <reference types="jest" />

import {
  WHEEL_SLOTS,
  createInitialWheelState,
  normalizeWheelState,
  getWheelStatus,
  pickWheelSlot,
  getWheelSlotGold,
  spinWheel,
} from '../wheel';
import type { WheelState } from '../wheel';
import { createInitialState, migrateLoadedState, getRewardedGoldAmount } from '../constants';
import { createPrestigedState } from '../prestige';
import type { GameState } from '../types';
import { META_LAYER_KEYS } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
// An arbitrary UTC midnight (day index 20000) to anchor deterministic day math.
const DAY0 = 20000 * DAY_MS;

// An rng that yields a fixed value (for deterministic slot selection).
const constRng = (value: number) => () => value;

describe('wheel slot catalog', () => {
  test('is non-empty with unique keys and positive weights/ratios', () => {
    expect(WHEEL_SLOTS.length).toBeGreaterThanOrEqual(6);
    const keys = WHEEL_SLOTS.map((slot) => slot.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const slot of WHEEL_SLOTS) {
      expect(slot.weight).toBeGreaterThan(0);
      expect(slot.goldRatio).toBeGreaterThan(0);
      expect(typeof slot.icon).toBe('string');
      expect(slot.icon.length).toBeGreaterThan(0);
    }
  });
});

describe('getWheelStatus (daily gating + UTC midnight rollover)', () => {
  test('a fresh state can spin immediately', () => {
    const status = getWheelStatus(createInitialWheelState(), DAY0 + 3_600_000);
    expect(status.canSpin).toBe(true);
    expect(status.nextSpinAt).toBe(DAY0 + 3_600_000);
  });

  test('after spinning today, the next spin opens at the next UTC midnight', () => {
    const state: WheelState = { lastFreeSpinAt: DAY0 + 1_000 };
    const status = getWheelStatus(state, DAY0 + 5_000);
    expect(status.canSpin).toBe(false);
    expect(status.nextSpinAt).toBe(DAY0 + DAY_MS);
  });

  test('crossing UTC midnight re-opens the free spin', () => {
    const state: WheelState = { lastFreeSpinAt: DAY0 + 1_000 };
    // Same calendar day, later: still locked.
    expect(getWheelStatus(state, DAY0 + DAY_MS - 1).canSpin).toBe(false);
    // Next day: available again.
    expect(getWheelStatus(state, DAY0 + DAY_MS).canSpin).toBe(true);
  });

  test('future lastFreeSpinAt (clock manipulation) is clamped and stays locked today', () => {
    const state: WheelState = { lastFreeSpinAt: DAY0 + 10 * DAY_MS };
    // now is "today" but the save claims a spin 10 days in the future.
    const status = getWheelStatus(state, DAY0 + 5_000);
    expect(status.canSpin).toBe(false);
  });
});

describe('pickWheelSlot (weighted, deterministic)', () => {
  test('rng≈0 selects the first slot, rng≈1 selects the last slot', () => {
    expect(pickWheelSlot(constRng(0)).key).toBe(WHEEL_SLOTS[0]!.key);
    expect(pickWheelSlot(constRng(0.9999999)).key).toBe(WHEEL_SLOTS[WHEEL_SLOTS.length - 1]!.key);
  });

  test('the same rng value always yields the same slot', () => {
    const a = pickWheelSlot(constRng(0.42));
    const b = pickWheelSlot(constRng(0.42));
    expect(a.key).toBe(b.key);
  });

  test('a full sweep of rng lands on the weighted slot boundaries', () => {
    const total = WHEEL_SLOTS.reduce((sum, slot) => sum + slot.weight, 0);
    let cumulative = 0;
    for (const slot of WHEEL_SLOTS) {
      // A roll just inside this slot's weight band must map to this slot.
      const mid = (cumulative + slot.weight / 2) / total;
      expect(pickWheelSlot(constRng(mid)).key).toBe(slot.key);
      cumulative += slot.weight;
    }
  });

  test('out-of-range rng values are clamped (never throws, always a valid slot)', () => {
    const keys = new Set(WHEEL_SLOTS.map((slot) => slot.key));
    for (const bad of [-1, 1, 2, NaN, Infinity]) {
      expect(keys.has(pickWheelSlot(constRng(bad)).key)).toBe(true);
    }
  });
});

describe('getWheelSlotGold (progression-scaled reward)', () => {
  test('reward = floor(baseGold * goldRatio) and always >= 1', () => {
    const base = 1000;
    for (const slot of WHEEL_SLOTS) {
      expect(getWheelSlotGold(slot, base)).toBe(Math.floor(base * slot.goldRatio));
      expect(getWheelSlotGold(slot, base)).toBeGreaterThan(0);
    }
  });

  test('invalid baseGold falls back so the reward stays positive', () => {
    for (const bad of [0, -5, NaN, Infinity]) {
      expect(getWheelSlotGold(WHEEL_SLOTS[0]!, bad)).toBeGreaterThan(0);
    }
  });
});

describe('spinWheel (one free spin/day, no double claim)', () => {
  test('awards a reward within the slot range and records the spin time', () => {
    const base = 2000;
    const result = spinWheel(createInitialWheelState(), base, DAY0 + 1_000, constRng(0));
    expect(result).not.toBeNull();
    expect(result!.reward.slotKey).toBe(WHEEL_SLOTS[0]!.key);
    expect(result!.reward.gold).toBe(Math.floor(base * WHEEL_SLOTS[0]!.goldRatio));
    expect(result!.newState.lastFreeSpinAt).toBe(DAY0 + 1_000);
  });

  test('reward gold stays within [min, max] slot multiplier band for any rng', () => {
    const base = 5000;
    const ratios = WHEEL_SLOTS.map((slot) => slot.goldRatio);
    const min = Math.floor(base * Math.min(...ratios));
    const max = Math.floor(base * Math.max(...ratios));
    for (let i = 0; i < 50; i++) {
      const roll = i / 50;
      const result = spinWheel(createInitialWheelState(), base, DAY0, constRng(roll));
      expect(result!.reward.gold).toBeGreaterThanOrEqual(min);
      expect(result!.reward.gold).toBeLessThanOrEqual(max);
    }
  });

  test('a second spin on the same day is rejected (double-claim prevented)', () => {
    const first = spinWheel(createInitialWheelState(), 1000, DAY0 + 1_000, constRng(0.5));
    expect(first).not.toBeNull();
    const second = spinWheel(first!.newState, 1000, DAY0 + 2_000, constRng(0.5));
    expect(second).toBeNull();
  });

  test('a spin re-opens after crossing UTC midnight', () => {
    const first = spinWheel(createInitialWheelState(), 1000, DAY0 + 1_000, constRng(0.5))!;
    const nextDay = spinWheel(first.newState, 1000, DAY0 + DAY_MS + 5_000, constRng(0.5));
    expect(nextDay).not.toBeNull();
    expect(nextDay!.newState.lastFreeSpinAt).toBe(DAY0 + DAY_MS + 5_000);
  });

  test('is pure: the input state is not mutated', () => {
    const state = createInitialWheelState();
    spinWheel(state, 1000, DAY0, constRng(0.5));
    expect(state.lastFreeSpinAt).toBeNull();
  });
});

describe('normalizeWheelState', () => {
  test('junk normalizes to "never spun"', () => {
    expect(normalizeWheelState(undefined)).toEqual({ lastFreeSpinAt: null });
    expect(normalizeWheelState('nope')).toEqual({ lastFreeSpinAt: null });
    expect(normalizeWheelState({ lastFreeSpinAt: 'x' })).toEqual({ lastFreeSpinAt: null });
    expect(normalizeWheelState({ lastFreeSpinAt: -1 })).toEqual({ lastFreeSpinAt: null });
    expect(normalizeWheelState({ lastFreeSpinAt: NaN })).toEqual({ lastFreeSpinAt: null });
  });

  test('a valid timestamp is preserved', () => {
    expect(normalizeWheelState({ lastFreeSpinAt: DAY0 })).toEqual({ lastFreeSpinAt: DAY0 });
  });
});

describe('save migration & prestige', () => {
  test('wheelState is a meta-layer field', () => {
    expect(META_LAYER_KEYS).toContain('wheelState');
  });

  test('a save without wheelState loads as spinnable', () => {
    const migrated = migrateLoadedState({} as Partial<GameState>, createInitialState());
    expect(migrated.wheelState).toEqual({ lastFreeSpinAt: null });
    expect(getWheelStatus(migrated.wheelState, DAY0).canSpin).toBe(true);
  });

  test('a malformed wheelState is repaired on load', () => {
    const loaded = { wheelState: { lastFreeSpinAt: 'bad' } } as unknown as Partial<GameState>;
    const migrated = migrateLoadedState(loaded, createInitialState());
    expect(migrated.wheelState).toEqual({ lastFreeSpinAt: null });
  });

  test('the last spin time survives prestige (meta layer preserved)', () => {
    const base = createInitialState();
    const spun: GameState = { ...base, wheelState: { lastFreeSpinAt: DAY0 } };
    const prestiged = createPrestigedState(spun);
    expect(prestiged.wheelState).toEqual({ lastFreeSpinAt: DAY0 });
  });

  test('reward scales with progression via getRewardedGoldAmount', () => {
    const state = createInitialState();
    const base = getRewardedGoldAmount(state);
    const result = spinWheel(state.wheelState, base, DAY0, constRng(0.9999999));
    // Jackpot (last slot) at the initial progression base.
    expect(result!.reward.gold).toBe(Math.floor(base * WHEEL_SLOTS[WHEEL_SLOTS.length - 1]!.goldRatio));
  });
});
