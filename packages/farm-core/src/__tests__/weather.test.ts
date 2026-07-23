/// <reference types="jest" />

import balance from '../balance.json';
import { getResetDayIndex, getResetDayStart } from '../resetBoundary';
import {
  WEATHER_TYPES,
  getWeather,
  getWeatherSellMultiplier,
  getWeatherSpeedMultiplier,
} from '../weather';

const DAY_MS = 24 * 60 * 60 * 1000;
const RESET_START = getResetDayStart(getResetDayIndex(Date.parse('2026-07-01T12:00:00.000Z')));

describe('getWeather', () => {
  test('same reset day always returns the same save-free weather', () => {
    const morning = getWeather(RESET_START + 1_000);
    const evening = getWeather(RESET_START + DAY_MS - 1);
    const repeated = getWeather(RESET_START + 1_000);

    expect(evening.key).toBe(morning.key);
    expect(repeated).toEqual(morning);
    expect(morning.windowStartAt).toBe(RESET_START);
    expect(morning.windowEndAt).toBe(RESET_START + DAY_MS);
  });

  test('reset boundary advances the weather window without persisted state', () => {
    expect(getWeather(RESET_START + DAY_MS).windowStartAt).toBe(RESET_START + DAY_MS);
  });

  test('weighted roster is data-driven and every configured type is reachable', () => {
    expect(WEATHER_TYPES).toEqual(balance.weather.types);
    const drawn = new Set<string>();
    for (let day = 0; day < 600; day += 1) {
      drawn.add(getWeather(RESET_START + day * DAY_MS).key);
    }
    expect([...drawn].sort()).toEqual(WEATHER_TYPES.map((weather) => weather.key).sort());
  });

  test('axis helpers expose only the selected weather bonus', () => {
    for (let day = 0; day < 200; day += 1) {
      const now = RESET_START + day * DAY_MS;
      const weather = getWeather(now);
      expect(getWeatherSellMultiplier(now)).toBe(weather.axis === 'sell' ? weather.multiplier : 1);
      expect(getWeatherSpeedMultiplier(now)).toBe(weather.axis === 'speed' ? weather.multiplier : 1);
    }
  });
});
