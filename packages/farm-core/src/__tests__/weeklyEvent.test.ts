/// <reference types="jest" />

import {
  getWeeklyEventStatus,
  getWeeklyEventMultiplier,
  getWeeklyEventSpeedMultiplier,
  WEEKLY_EVENT_MULTIPLIER,
  WEEKLY_EVENT_TYPES,
} from '../weeklyEvent';
import { CROPS, createInitialState } from '../constants';
import { getCropModifiers } from '../modifiers';
import { getCropOfTheDayStatus } from '../cropOfTheDay';
import balance from '../balance.json';
import type { AreaKey, CropKey } from '../types';

// Every distinct area key, derived from the crop table.
const ALL_AREAS = [...new Set((Object.keys(CROPS) as CropKey[]).map((key) => CROPS[key]!.area))] as AreaKey[];

const DAY_MS = 24 * 60 * 60 * 1000;
// 2026-06-26 is a Friday (UTC); the festival window runs from Friday for the
// balance-configured number of days (default 3 → Fri–Sun). Derive the bounds from
// balance.json so these assertions track the data instead of a hardcoded 3.
const WEEKEND_LENGTH_DAYS = balance.weeklyEvent.weekendLengthDays;
const FRI_START = Date.UTC(2026, 5, 26);
const WINDOW_END = FRI_START + WEEKEND_LENGTH_DAYS * DAY_MS;
const FRI_NOON = FRI_START + 12 * 60 * 60 * 1000;

// The event TYPE rotates deterministically per weekend, independent of the featured
// area. Scan forward from FRI_NOON (in 1-week steps) for the first weekend whose
// rotation lands on `typeKey`, so per-type assertions don't hardcode a calendar date.
function findWeekendNoonOfType(typeKey: string, unlockedAreas?: AreaKey[]): number {
  for (let week = 0; week < 520; week += 1) {
    const now = FRI_NOON + week * 7 * DAY_MS;
    if (getWeeklyEventStatus(now, unlockedAreas).typeKey === typeKey) {
      return now;
    }
  }
  throw new Error(`No weekend found for event type "${typeKey}" within the scan window`);
}

const SALE_NOON = findWeekendNoonOfType('sale');
const HARVEST_NOON = findWeekendNoonOfType('harvest');

describe('weeklyEvent balance data', () => {
  test('multiplier and window length are sourced from balance.json with unchanged defaults', () => {
    // Multiplier comes from balance.json and keeps the historical 1.5 default.
    expect(WEEKLY_EVENT_MULTIPLIER).toBe(balance.weeklyEvent.sellMultiplier);
    expect(balance.weeklyEvent.sellMultiplier).toBe(1.5);
    // The live window length (Fri–Sun) is driven by balance.json's 3-day default,
    // reflected in the active window bounds.
    expect(balance.weeklyEvent.weekendLengthDays).toBe(3);
    const fri = getWeeklyEventStatus(FRI_NOON);
    expect(fri.windowEndAt - fri.windowStartAt).toBe(balance.weeklyEvent.weekendLengthDays * DAY_MS);
  });
});

describe('getWeeklyEventStatus', () => {
  test('is active across the Fri–Sun window with a stable theme and bounds', () => {
    const fri = getWeeklyEventStatus(FRI_NOON);
    expect(fri.active).toBe(true);
    expect(fri.windowStartAt).toBe(FRI_START);
    expect(fri.windowEndAt).toBe(WINDOW_END);
    expect(fri.multiplier).toBe(WEEKLY_EVENT_MULTIPLIER);
    expect(fri.cropKeys.length).toBeGreaterThan(0);
    // Theme + window stay constant for every instant in the same weekend: the
    // start of each in-window day plus the final instant before it closes.
    const inWindowOffsets = [
      ...Array.from({ length: WEEKEND_LENGTH_DAYS }, (_, day) => day * DAY_MS),
      WEEKEND_LENGTH_DAYS * DAY_MS - 1,
    ];
    for (const offset of inWindowOffsets) {
      const status = getWeeklyEventStatus(FRI_START + offset);
      expect(status.active).toBe(true);
      expect(status.areaKey).toBe(fri.areaKey);
      expect(status.windowStartAt).toBe(FRI_START);
      expect(status.windowEndAt).toBe(WINDOW_END);
    }
  });

  test('is inactive on weekdays but reports the upcoming weekend window', () => {
    const thursday = getWeeklyEventStatus(FRI_START - 60 * 1000); // Thursday 23:59 UTC
    expect(thursday.active).toBe(false);
    expect(thursday.multiplier).toBe(1);
    expect(thursday.windowStartAt).toBe(FRI_START); // the upcoming weekend

    const monday = getWeeklyEventStatus(WINDOW_END); // Monday 00:00 UTC, just ended
    expect(monday.active).toBe(false);
    expect(monday.windowStartAt).toBe(FRI_START + 7 * DAY_MS); // next weekend
  });

  test('is deterministic and save-state-free (same instant → same result)', () => {
    expect(getWeeklyEventStatus(FRI_NOON)).toEqual(getWeeklyEventStatus(FRI_NOON));
  });

  test('falls back to the current time for non-finite input', () => {
    const status = getWeeklyEventStatus(Number.NaN);
    expect(typeof status.active).toBe('boolean');
    expect(status.cropKeys.length).toBeGreaterThan(0);
  });
});

describe('getWeeklyEventMultiplier (sale axis)', () => {
  test('boosts only featured-area crops on a sale weekend while the festival is live', () => {
    const status = getWeeklyEventStatus(SALE_NOON);
    expect(status.axis).toBe('sell');
    const featured = status.cropKeys[0]!;
    const other = (Object.keys(CROPS) as CropKey[]).find((key) => CROPS[key]!.area !== status.areaKey)!;

    expect(getWeeklyEventMultiplier(featured, SALE_NOON)).toBe(status.multiplier);
    expect(getWeeklyEventMultiplier(other, SALE_NOON)).toBe(1);
    // Outside the weekend window even a featured crop gets no boost.
    expect(getWeeklyEventMultiplier(featured, WINDOW_END)).toBe(1);
    // A sale weekend leaves the speed axis untouched.
    expect(getWeeklyEventSpeedMultiplier(featured, SALE_NOON)).toBe(1);
  });
});

describe('getWeeklyEventSpeedMultiplier (harvest axis)', () => {
  test('boosts only featured-area crops on a harvest weekend and leaves sale untouched', () => {
    const status = getWeeklyEventStatus(HARVEST_NOON);
    expect(status.axis).toBe('speed');
    const featured = status.cropKeys[0]!;
    const other = (Object.keys(CROPS) as CropKey[]).find((key) => CROPS[key]!.area !== status.areaKey)!;

    expect(getWeeklyEventSpeedMultiplier(featured, HARVEST_NOON)).toBe(status.multiplier);
    expect(getWeeklyEventSpeedMultiplier(other, HARVEST_NOON)).toBe(1);
    // A harvest weekend does not touch the sale axis (back-compat: sell stays 1).
    expect(getWeeklyEventMultiplier(featured, HARVEST_NOON)).toBe(1);
    // Just before its window opens the harvest boost is inactive → speed axis is 1.
    const beforeWindow = getWeeklyEventStatus(HARVEST_NOON).windowStartAt - 60_000;
    expect(getWeeklyEventSpeedMultiplier(featured, beforeWindow)).toBe(1);
  });
});

describe('weekly event type rotation', () => {
  test('the event type is deterministic and stable across the whole weekend window', () => {
    const fri = getWeeklyEventStatus(SALE_NOON);
    const weekendStart = fri.windowStartAt;
    for (let day = 0; day < WEEKEND_LENGTH_DAYS; day += 1) {
      const status = getWeeklyEventStatus(weekendStart + day * DAY_MS);
      expect(status.typeKey).toBe(fri.typeKey);
      expect(status.axis).toBe(fri.axis);
    }
  });

  test('every configured event type is reachable over enough weekends', () => {
    const seen = new Set<string>();
    for (let week = 0; week < 520; week += 1) {
      seen.add(getWeeklyEventStatus(FRI_NOON + week * 7 * DAY_MS).typeKey);
    }
    for (const type of WEEKLY_EVENT_TYPES) {
      expect(seen.has(type.key)).toBe(true);
    }
  });
});

describe('weekly event sale integration', () => {
  test('a sale weekend stacks multiplicatively into the getCropModifiers sale multiplier', () => {
    const state = createInitialState();
    // Match what getCropModifiers feeds the festival lookup (the player's unlocked
    // areas) so the featured crop we pick is the one the modifier actually boosts.
    const status = getWeeklyEventStatus(SALE_NOON, state.unlockedAreas);
    expect(status.axis).toBe('sell');
    const cotd = getCropOfTheDayStatus(SALE_NOON).cropKey;

    // A featured-area crop and a non-featured crop, both NOT the crop of the day,
    // so the only differing sale factor is the festival multiplier (mastery is 1
    // for every crop in the initial state and the global factors are crop-agnostic).
    const featured = status.cropKeys.find((key) => key !== cotd)!;
    const other = (Object.keys(CROPS) as CropKey[]).find(
      (key) => CROPS[key]!.area !== status.areaKey && key !== cotd
    )!;

    const featuredMods = getCropModifiers(state, featured, SALE_NOON);
    const otherMods = getCropModifiers(state, other, SALE_NOON);
    expect(featuredMods.profitMultiplier).toBeCloseTo(otherMods.profitMultiplier * status.multiplier);
    // Speed axis is unaffected on a sale weekend.
    expect(featuredMods.speedMultiplier).toBeCloseTo(otherMods.speedMultiplier);
  });

  test('a harvest weekend stacks into the getCropModifiers speed multiplier, not sale', () => {
    const state = createInitialState();
    const status = getWeeklyEventStatus(HARVEST_NOON, state.unlockedAreas);
    expect(status.axis).toBe('speed');

    const featured = status.cropKeys[0]!;
    const other = (Object.keys(CROPS) as CropKey[]).find(
      (key) => CROPS[key]!.area !== status.areaKey
    )!;

    const featuredMods = getCropModifiers(state, featured, HARVEST_NOON);
    const otherMods = getCropModifiers(state, other, HARVEST_NOON);
    // Growth speed of the featured crop is boosted by the festival multiplier.
    expect(featuredMods.speedMultiplier).toBeCloseTo(otherMods.speedMultiplier * status.multiplier);
    // Sale price of the featured crop is NOT boosted on a harvest weekend.
    expect(featuredMods.profitMultiplier).toBeCloseTo(otherMods.profitMultiplier);
  });
});

describe('weekly event featured-area restriction (해금 구역만)', () => {
  // Sample one instant per weekend across ~16 weekends so the deterministic hash
  // lands on several different draws.
  const weekends = Array.from({ length: 16 }, (_, i) => FRI_NOON + i * 7 * DAY_MS);

  test('starter-only unlock state always features the starter area', () => {
    const { unlockedAreas } = createInitialState();
    for (const now of weekends) {
      const { areaKey } = getWeeklyEventStatus(now, unlockedAreas);
      expect(unlockedAreas).toContain(areaKey);
    }
  });

  test('the featured area is always within the provided unlocked set', () => {
    // A two-area unlock set: the draw must never escape it (no gated/locked area).
    const unlocked: AreaKey[] = ALL_AREAS.slice(0, 2);
    for (const now of weekends) {
      const { areaKey } = getWeeklyEventStatus(now, unlocked);
      expect(unlocked).toContain(areaKey);
    }
  });

  test('a wider unlock set can surface areas a narrower one never would', () => {
    // With every area unlocked the draw can reach a non-starter area at least once,
    // confirming the restriction widens (not just clamps to starter).
    const drawn = new Set<AreaKey>();
    for (const now of weekends) {
      drawn.add(getWeeklyEventStatus(now, ALL_AREAS).areaKey);
    }
    const starter = createInitialState().unlockedAreas;
    expect([...drawn].some((area) => !starter.includes(area))).toBe(true);
  });

  test('deterministic for the same instant + same unlock state', () => {
    const unlocked = createInitialState().unlockedAreas;
    expect(getWeeklyEventStatus(FRI_NOON, unlocked)).toEqual(getWeeklyEventStatus(FRI_NOON, unlocked));
  });

  test('weekend active/inactive transition is unaffected by the unlock filter', () => {
    const unlocked = createInitialState().unlockedAreas;
    expect(getWeeklyEventStatus(FRI_NOON, unlocked).active).toBe(true);
    expect(getWeeklyEventStatus(FRI_START - 60_000, unlocked).active).toBe(false);
    expect(getWeeklyEventStatus(WINDOW_END, unlocked).active).toBe(false);
  });

  test('empty unlock set falls back to a starter area (never throws/empty)', () => {
    const { areaKey, cropKeys } = getWeeklyEventStatus(FRI_NOON, []);
    const starter = createInitialState().unlockedAreas;
    expect(starter).toContain(areaKey);
    expect(cropKeys.length).toBeGreaterThan(0);
  });

  test('multiplier honors the unlocked featured area (sale weekend)', () => {
    const unlocked = createInitialState().unlockedAreas;
    // Pin to a sale weekend restricted to the unlocked pool so the sell axis applies.
    const saleNoon = findWeekendNoonOfType('sale', unlocked);
    const { areaKey, cropKeys, multiplier } = getWeeklyEventStatus(saleNoon, unlocked);
    expect(unlocked).toContain(areaKey);
    const featured = cropKeys[0]!;
    expect(getWeeklyEventMultiplier(featured, saleNoon, unlocked)).toBe(multiplier);
    const other = (Object.keys(CROPS) as CropKey[]).find((key) => CROPS[key]!.area !== areaKey)!;
    expect(getWeeklyEventMultiplier(other, saleNoon, unlocked)).toBe(1);
  });
});
