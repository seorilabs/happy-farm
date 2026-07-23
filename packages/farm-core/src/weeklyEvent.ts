import balance from './balance.json';
import type { AreaKey, CropKey } from './types';
import { CROPS } from './constants';
import { RESET_OFFSET_MS } from './resetBoundary';

// Weekend crop festival. A purely time-deterministic, save-state-free live event:
// every weekend (Friday–Sunday, UTC) one area's crops receive a limited-time
// sale, growth-speed, or mutation-chance bonus. The featured area rotates each
// weekend, giving the week-one lifecycle a recurring reason to come back. Mirrors
// cropOfTheDay's deterministic-hash design so the same instant always yields the
// same event with no persistence.

// Festival sale bonus and window length now live in balance.json so live ops can
// tune event strength/duration without code changes. Defaults stay 1.5 / 3.
// Both are validated at module load so a malformed balance file fails fast rather
// than silently producing a broken (zero-length / negative / NaN) festival window.
export const WEEKLY_EVENT_MULTIPLIER = balance.weeklyEvent.sellMultiplier;
if (!Number.isFinite(WEEKLY_EVENT_MULTIPLIER) || WEEKLY_EVENT_MULTIPLIER < 1) {
  throw new Error(
    `Invalid weeklyEvent.sellMultiplier: ${WEEKLY_EVENT_MULTIPLIER} (must be a finite number >= 1)`
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;
// Friday + Saturday + Sunday by default. Must be a positive integer so the active
// window [windowStart, windowStart + n*DAY) is well-defined.
const WEEKEND_LENGTH_DAYS = balance.weeklyEvent.weekendLengthDays;
if (!Number.isInteger(WEEKEND_LENGTH_DAYS) || WEEKEND_LENGTH_DAYS < 1) {
  throw new Error(
    `Invalid weeklyEvent.weekendLengthDays: ${WEEKEND_LENGTH_DAYS} (must be a positive integer)`
  );
}

// The event AXIS decides which modifier the weekend boost multiplies: a 'sell'
// festival lifts the featured area's sale price (legacy behavior), a 'speed'
// festival lifts its growth speed, and a 'mutation' festival lifts mutation
// chances. All axes are scoped to the featured area by the shared lookup below.
export type WeeklyEventAxis = 'sell' | 'speed' | 'mutation';

export type WeeklyEventType = {
  key: string;
  axis: WeeklyEventAxis;
  multiplier: number;
  weight: number;
};

// Event-type roster, validated at module load like the multiplier/window above so
// a malformed balance file fails fast instead of silently producing a broken
// rotation. Back-compat: a missing/empty roster falls back to the single legacy
// sale event derived from sellMultiplier, so old balance data behaves unchanged.
export const WEEKLY_EVENT_TYPES: WeeklyEventType[] = parseWeeklyEventTypes();

function parseWeeklyEventTypes(): WeeklyEventType[] {
  const raw = (balance.weeklyEvent as { types?: unknown }).types;
  if (raw == null) {
    return [{ key: 'sale', axis: 'sell', multiplier: WEEKLY_EVENT_MULTIPLIER, weight: 1 }];
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Invalid weeklyEvent.types: must be a non-empty array');
  }
  return raw.map((entry, index) => {
    const type = entry as { key?: unknown; axis?: unknown; multiplier?: unknown; weight?: unknown };
    if (typeof type.key !== 'string' || type.key.length === 0) {
      throw new Error(`Invalid weeklyEvent.types[${index}].key (must be a non-empty string)`);
    }
    if (type.axis !== 'sell' && type.axis !== 'speed' && type.axis !== 'mutation') {
      throw new Error(
        `Invalid weeklyEvent.types[${index}].axis: ${String(type.axis)} (must be 'sell', 'speed', or 'mutation')`
      );
    }
    if (typeof type.multiplier !== 'number' || !Number.isFinite(type.multiplier) || type.multiplier < 1) {
      throw new Error(
        `Invalid weeklyEvent.types[${index}].multiplier: ${String(type.multiplier)} (must be a finite number >= 1)`
      );
    }
    const weight = type.weight ?? 1;
    if (typeof weight !== 'number' || !Number.isInteger(weight) || weight < 1) {
      throw new Error(`Invalid weeklyEvent.types[${index}].weight: ${String(weight)} (must be a positive integer)`);
    }
    return { key: type.key, axis: type.axis, multiplier: type.multiplier, weight };
  });
}

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

// Weighted, deterministic event-type draw for the weekend. Salts the day before
// hashing so the TYPE rotation is independent of the featured-AREA draw (which
// hashes the raw fridayEpochDay) — otherwise area and type would move in lockstep.
//
// The hash is mapped into [0, totalWeight) in FRACTION space (not `% totalWeight`)
// so any weight ratio stays exactly proportional: `% totalWeight` would add modulo
// bias when totalWeight doesn't divide 2^32, undermining the data-driven-weight
// promise live-ops relies on to tune the roster. hashWeekend ∈ [0, 2^32), so
// dividing by 2^32 gives a uniform [0, 1) that scales cleanly to any total weight.
function pickWeeklyEventType(fridayEpochDay: number): WeeklyEventType {
  const totalWeight = WEEKLY_EVENT_TYPES.reduce((sum, type) => sum + type.weight, 0);
  const target = (hashWeekend(fridayEpochDay ^ 0x85ebca6b) / 0x100000000) * totalWeight;
  let cumulative = 0;
  for (const type of WEEKLY_EVENT_TYPES) {
    cumulative += type.weight;
    if (target < cumulative) {
      return type;
    }
  }
  return WEEKLY_EVENT_TYPES[WEEKLY_EVENT_TYPES.length - 1]!;
}

// Every defined area, in declaration order. The featured-area draw indexes into
// the subset of these the player has actually unlocked (see getEligibleAreas).
const FEATURABLE_AREAS = balance.areas.map((area) => area.key) as AreaKey[];

// Starter areas (free, ungated) — derived from balance.json at load (always
// ready, unlike importing constants which would risk a module-init cycle). Used
// as the defensive fallback when an unlocked-areas list is supplied but empty.
const STARTER_AREAS = balance.areas
  .filter((area) => area.unlock?.cost === 0 && area.unlock?.gate == null)
  .map((area) => area.key) as AreaKey[];

// The pool the weekend theme is drawn from. With no unlockedAreas (legacy
// callers / pure time queries) every area stays eligible. With a list, only the
// player's unlocked areas are featurable so the rotated bonus is always reachable;
// the order (FEATURABLE_AREAS) is preserved so the draw stays deterministic.
function getEligibleAreas(unlockedAreas?: readonly AreaKey[]): AreaKey[] {
  if (unlockedAreas == null) {
    return FEATURABLE_AREAS;
  }
  const unlocked = new Set(unlockedAreas);
  const eligible = FEATURABLE_AREAS.filter((key) => unlocked.has(key));
  if (eligible.length > 0) {
    return eligible;
  }
  // Corrupt/empty unlock state: fall back to starter so a theme is always defined.
  return STARTER_AREAS.length > 0 ? STARTER_AREAS : FEATURABLE_AREAS;
}

// The weekend window + theme, without the (O(crops)) featured-crop list — cheap
// enough to call on the per-plot hot path.
type WeeklyEventWindow = {
  active: boolean;
  areaKey: AreaKey;
  // The weekend's rotated event type: its key (for type-specific UI copy), its
  // axis (which modifier the boost feeds), and the multiplier (the type's bonus
  // while live, else 1). typeKey/axis stay defined even when inactive so the
  // teaser can preview the upcoming weekend's type.
  typeKey: string;
  axis: WeeklyEventAxis;
  multiplier: number;
  windowStartAt: number;
  windowEndAt: number;
};

function getWeeklyEventWindow(now: number, unlockedAreas?: readonly AreaKey[]): WeeklyEventWindow {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  // 요일 판정은 UTC epoch-day 기준을 유지한다(주말이 어느 "금요일"에 걸리는지는 바뀌지
  // 않는다). 리셋 오프셋은 창 경계에만 적용해(아래) 시작/종료 시각만 KST 04:00 리셋
  // 경계로 옮긴다 — epoch-day 자체를 오프셋 이동하면 KST 요일이 하루 밀려 축제가
  // 토요일에 시작하는 부작용이 생기기 때문이다(#251).
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

  // 리셋 오프셋 반영(#251): 예전엔 fridayEpochDay*DAY(금 00:00 UTC = 금 09:00 KST)에
  // 시작했다. 리셋 경계(기본 KST 04:00)에 맞춰 (DAY - offset)만큼 앞당겨, 금요일 04:00
  // KST부터 창이 열리게 한다(금요일 저녁을 온전히 포함, 출근 시간 09:00 회피).
  const windowStartAt = fridayEpochDay * DAY_MS - (DAY_MS - RESET_OFFSET_MS);
  const windowEndAt = windowStartAt + WEEKEND_LENGTH_DAYS * DAY_MS;
  const active = safeNow >= windowStartAt && safeNow < windowEndAt;
  const eligibleAreas = getEligibleAreas(unlockedAreas);
  const areaKey = eligibleAreas[hashWeekend(fridayEpochDay) % eligibleAreas.length]!;
  const type = pickWeeklyEventType(fridayEpochDay);

  return {
    active,
    areaKey,
    typeKey: type.key,
    axis: type.axis,
    multiplier: active ? type.multiplier : 1,
    windowStartAt,
    windowEndAt,
  };
}

export type WeeklyEventStatus = WeeklyEventWindow & {
  // Crop keys that receive the boost (all crops in the featured area).
  cropKeys: CropKey[];
};

// Returns the weekend-festival status for `now`. Pure and deterministic: the same
// instant (+ unlock state) always yields the same theme/multiplier/window with no
// save state, and the result flips to the next theme automatically at the weekend
// boundary. Pass `unlockedAreas` so the featured theme is always an area the
// player can reach; omit it for a pure time query (legacy/full-pool behavior).
export function getWeeklyEventStatus(
  now = Date.now(),
  unlockedAreas?: readonly AreaKey[]
): WeeklyEventStatus {
  const window = getWeeklyEventWindow(now, unlockedAreas);
  const cropKeys = (Object.keys(CROPS) as CropKey[]).filter((cropKey) => CROPS[cropKey]!.area === window.areaKey);
  return { ...window, cropKeys };
}

// The festival multiplier for a single crop on a given axis at `now`: the type's
// multiplier only while the festival is live AND the crop is in the featured area
// AND the live event's axis matches, otherwise 1. `unlockedAreas` must match what
// the UI banner uses so the boosted crop the player sees is the one that actually
// gets boosted.
function getWeeklyEventAxisMultiplier(
  cropKey: CropKey,
  axis: WeeklyEventAxis,
  now: number,
  unlockedAreas?: readonly AreaKey[]
): number {
  const window = getWeeklyEventWindow(now, unlockedAreas);
  if (!window.active || window.axis !== axis) {
    return 1;
  }
  return CROPS[cropKey]?.area === window.areaKey ? window.multiplier : 1;
}

// Sale-axis festival multiplier. Combined multiplicatively with the crop-of-the-day
// bonus in getCropModifiers. Returns 1 for a non-sale (e.g. harvest/speed) weekend,
// preserving the legacy sell-only behavior for sale festivals.
export function getWeeklyEventMultiplier(
  cropKey: CropKey,
  now = Date.now(),
  unlockedAreas?: readonly AreaKey[]
): number {
  return getWeeklyEventAxisMultiplier(cropKey, 'sell', now, unlockedAreas);
}

// Speed-axis festival multiplier (harvest festival): boosts the featured area's
// growth speed. Returns 1 for a non-speed weekend.
export function getWeeklyEventSpeedMultiplier(
  cropKey: CropKey,
  now = Date.now(),
  unlockedAreas?: readonly AreaKey[]
): number {
  return getWeeklyEventAxisMultiplier(cropKey, 'speed', now, unlockedAreas);
}

// Mutation-axis festival multiplier: increases the chance of every already
// unlocked mutation for crops in the featured area. The canonical harvest path
// receives this through getCropModifiers; non-mutation weekends, weekdays, and
// crops outside the featured area all retain the exact baseline multiplier 1.
export function getWeeklyEventMutationMultiplier(
  cropKey: CropKey,
  now = Date.now(),
  unlockedAreas?: readonly AreaKey[]
): number {
  return getWeeklyEventAxisMultiplier(cropKey, 'mutation', now, unlockedAreas);
}
