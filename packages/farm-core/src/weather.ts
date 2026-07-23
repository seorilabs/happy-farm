import balance from './balance.json';
import { getResetDayIndex, getResetDayStart } from './resetBoundary';
import type { WeatherKey } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export type WeatherAxis = 'sell' | 'speed' | null;
export type WeatherPrecipitation = 'rain' | 'snow' | null;

export type WeatherDefinition = {
  key: WeatherKey;
  icon: string;
  weight: number;
  axis: WeatherAxis;
  multiplier: number;
  precipitation: WeatherPrecipitation;
};

export type WeatherStatus = WeatherDefinition & {
  windowStartAt: number;
  windowEndAt: number;
};

export const WEATHER_TYPES = balance.weather.types as WeatherDefinition[];
const TOTAL_WEATHER_WEIGHT = WEATHER_TYPES.reduce((total, weather) => total + weather.weight, 0);

// Weather uses a seed distinct from crop-of-the-day so both daily systems do
// not move in lockstep. Integer mixing keeps consecutive reset days scattered
// across the weighted roster while remaining deterministic and save-free.
function hashWeatherDay(day: number): number {
  let hash = (day ^ 0x7f4a7c15) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

export function getWeather(now = Date.now()): WeatherStatus {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  if (WEATHER_TYPES.length === 0 || TOTAL_WEATHER_WEIGHT <= 0) {
    throw new Error('No weather configured');
  }

  const day = getResetDayIndex(safeNow);
  const roll = hashWeatherDay(day) % TOTAL_WEATHER_WEIGHT;
  let cursor = 0;
  const weather =
    WEATHER_TYPES.find((candidate) => {
      cursor += candidate.weight;
      return roll < cursor;
    }) ?? WEATHER_TYPES[0]!;
  const windowStartAt = getResetDayStart(day);

  return {
    ...weather,
    windowStartAt,
    windowEndAt: windowStartAt + DAY_MS,
  };
}

export function getWeatherSellMultiplier(now = Date.now()): number {
  const weather = getWeather(now);
  return weather.axis === 'sell' ? weather.multiplier : 1;
}

export function getWeatherSpeedMultiplier(now = Date.now()): number {
  const weather = getWeather(now);
  return weather.axis === 'speed' ? weather.multiplier : 1;
}
