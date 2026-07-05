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
import { RESET_OFFSET_MS } from '../resetBoundary';
import type { AreaKey, CropKey } from '../types';

// Every distinct area key, derived from the crop table.
const ALL_AREAS = [...new Set((Object.keys(CROPS) as CropKey[]).map((key) => CROPS[key]!.area))] as AreaKey[];

const DAY_MS = 24 * 60 * 60 * 1000;
// 2026-06-26 is a Friday (UTC). 리셋 오프셋(#251) 반영으로 축제 창은 금 00:00 UTC가 아니라
// 그보다 (DAY - offset)만큼 앞선 리셋 경계(기본 금 04:00 KST = 목 19:00 UTC)에 열린다.
const WEEKEND_LENGTH_DAYS = balance.weeklyEvent.weekendLengthDays;
const FRI_MIDNIGHT_UTC = Date.UTC(2026, 5, 26);
const WINDOW_SHIFT = DAY_MS - RESET_OFFSET_MS; // 리셋 경계로 앞당기는 양(기본 5h)
const WINDOW_START = FRI_MIDNIGHT_UTC - WINDOW_SHIFT;
const WINDOW_END = WINDOW_START + WEEKEND_LENGTH_DAYS * DAY_MS;
const FRI_NOON = FRI_MIDNIGHT_UTC + 12 * 60 * 60 * 1000;

// The event TYPE rotates deterministically per weekend, independent of the featured
// area. Scan forward from FRI_NOON (in 1-week steps) for the first weekend whose
// rotation lands on `typeKey`, so per-type assertions don't hardcode a calendar date.
//
// The scan bound is derived from the roster weights (not a fixed 520) so a future
// weight-skewed type can't silently push its first appearance past the window: a
// type with probability minWeight/totalWeight is expected once every
// totalWeight/minWeight weekends, so ~500× that gives an astronomically safe margin
// while staying fast for the current 1:1 roster. Misses throw with a clear message.
const WEEKLY_EVENT_TOTAL_WEIGHT = WEEKLY_EVENT_TYPES.reduce((sum, type) => sum + type.weight, 0);
const WEEKLY_EVENT_MIN_WEIGHT = Math.min(...WEEKLY_EVENT_TYPES.map((type) => type.weight));
const TYPE_SCAN_WEEKS = Math.max(520, Math.ceil((WEEKLY_EVENT_TOTAL_WEIGHT / WEEKLY_EVENT_MIN_WEIGHT) * 500));

function findWeekendNoonOfType(typeKey: string, unlockedAreas?: AreaKey[]): number {
  for (let week = 0; week < TYPE_SCAN_WEEKS; week += 1) {
    const now = FRI_NOON + week * 7 * DAY_MS;
    if (getWeeklyEventStatus(now, unlockedAreas).typeKey === typeKey) {
      return now;
    }
  }
  throw new Error(
    `No weekend found for event type "${typeKey}" within ${TYPE_SCAN_WEEKS} weeks (check the weeklyEvent.types roster/weights)`
  );
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
    expect(fri.windowStartAt).toBe(WINDOW_START);
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
      const status = getWeeklyEventStatus(WINDOW_START + offset);
      expect(status.active).toBe(true);
      expect(status.areaKey).toBe(fri.areaKey);
      expect(status.windowStartAt).toBe(WINDOW_START);
      expect(status.windowEndAt).toBe(WINDOW_END);
    }
  });

  test('is inactive before the window but reports the upcoming weekend window', () => {
    const beforeStart = getWeeklyEventStatus(WINDOW_START - 60 * 1000); // 리셋 경계 직전
    expect(beforeStart.active).toBe(false);
    expect(beforeStart.multiplier).toBe(1);
    expect(beforeStart.windowStartAt).toBe(WINDOW_START); // the upcoming weekend

    // 다음 주 평일(월요일 낮 UTC)에는 다음 주말 창을 가리킨다.
    const nextMonday = getWeeklyEventStatus(FRI_MIDNIGHT_UTC + 3 * DAY_MS + 12 * 60 * 60 * 1000);
    expect(nextMonday.active).toBe(false);
    expect(nextMonday.windowStartAt).toBe(WINDOW_START + 7 * DAY_MS); // next weekend
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
    for (let week = 0; week < TYPE_SCAN_WEEKS; week += 1) {
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

    // 오늘의 작물(×2 판매 배수)을 제외해, featured/other의 유일한 차이가 축제 배수만
    // 되게 한다(sale integration 테스트와 동일한 가드).
    const cotd = getCropOfTheDayStatus(HARVEST_NOON).cropKey;
    const featured = status.cropKeys.find((key) => key !== cotd)!;
    const other = (Object.keys(CROPS) as CropKey[]).find(
      (key) => CROPS[key]!.area !== status.areaKey && key !== cotd
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
    expect(getWeeklyEventStatus(WINDOW_START - 60_000, unlocked).active).toBe(false);
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
