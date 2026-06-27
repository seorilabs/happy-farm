import balance from './balance.json';
import type { AreaKey, CropKey } from './types';
import { CROPS } from './constants';

// Weekend crop festival. A purely time-deterministic, save-state-free live event:
// every weekend (Friday–Sunday, UTC) one area's crops sell for a limited-time
// bonus. The featured area rotates each weekend, giving the week-one lifecycle a
// recurring reason to come back. Mirrors cropOfTheDay's deterministic-hash design
// so the same instant always yields the same event with no persistence.

export const WEEKLY_EVENT_MULTIPLIER = 1.5;

const DAY_MS = 24 * 60 * 60 * 1000;
// Friday + Saturday + Sunday.
const WEEKEND_LENGTH_DAYS = 3;

// epoch day 0 (1970-01-01) was a Thursday, so dayOfWeek 0=Thu, 1=Fri … 6=Wed.
function dayOfWeek(epochDay: number): number {
  return ((epochDay % 7) + 7) % 7;
}

// Unsigned-32 multiplicative hash (Knuth constant) so consecutive weekends scatter
// across the area list instead of cycling in order.
function hashWeekend(fridayEpochDay: number): number {
  let h = (fridayEpochDay ^ 0x27d4eb2f) >>> 0;
  h = Math.imul(h, 0x9e3779b9) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

// Areas eligible to be featured (every defined area, gated ones included so the
// theme rotation stays varied for late-game players too).
const FEATURABLE_AREAS = balance.areas.map((area) => area.key) as AreaKey[];

// The weekend window + theme, without the (O(crops)) featured-crop list — cheap
// enough to call on the per-plot hot path.
type WeeklyEventWindow = {
  active: boolean;
  areaKey: AreaKey;
  multiplier: number;
  windowStartAt: number;
  windowEndAt: number;
};

function getWeeklyEventWindow(now: number): WeeklyEventWindow {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const epochDay = Math.floor(safeNow / DAY_MS);
  const dow = dayOfWeek(epochDay);

  // Friday epoch-day of the weekend `now` falls in (Fri–Sun) or, on a weekday,
  // the upcoming one — so the theme is well-defined every day of the week.
  let fridayEpochDay: number;
  if (dow >= 1 && dow <= 3) {
    fridayEpochDay = epochDay - (dow - 1);
  } else {
    // Days until the next Friday: Thu→1, Mon→4, Tue→3, Wed→2.
    const daysUntilFriday = dow === 0 ? 1 : 8 - dow;
    fridayEpochDay = epochDay + daysUntilFriday;
  }

  const windowStartAt = fridayEpochDay * DAY_MS;
  const windowEndAt = windowStartAt + WEEKEND_LENGTH_DAYS * DAY_MS;
  const active = safeNow >= windowStartAt && safeNow < windowEndAt;
  const areaKey = FEATURABLE_AREAS[hashWeekend(fridayEpochDay) % FEATURABLE_AREAS.length]!;

  return {
    active,
    areaKey,
    multiplier: active ? WEEKLY_EVENT_MULTIPLIER : 1,
    windowStartAt,
    windowEndAt,
  };
}

export type WeeklyEventStatus = WeeklyEventWindow & {
  // Crop keys that receive the boost (all crops in the featured area).
  cropKeys: CropKey[];
};

// Returns the weekend-festival status for `now`. Pure and deterministic: the same
// instant always yields the same theme/multiplier/window with no save state, and
// the result flips to the next theme automatically at the weekend boundary.
export function getWeeklyEventStatus(now = Date.now()): WeeklyEventStatus {
  const window = getWeeklyEventWindow(now);
  const cropKeys = (Object.keys(CROPS) as CropKey[]).filter((cropKey) => CROPS[cropKey]!.area === window.areaKey);
  return { ...window, cropKeys };
}

// The festival sale multiplier for a single crop at `now`: WEEKLY_EVENT_MULTIPLIER
// only while the festival is live AND the crop is in the featured area, otherwise
// 1. Combined multiplicatively with the crop-of-the-day bonus in getCropModifiers.
export function getWeeklyEventMultiplier(cropKey: CropKey, now = Date.now()): number {
  const window = getWeeklyEventWindow(now);
  if (!window.active) {
    return 1;
  }
  return CROPS[cropKey]?.area === window.areaKey ? window.multiplier : 1;
}
