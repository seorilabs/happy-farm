/// <reference types="jest" />

import { createInitialState } from '../constants';
import { getCropOfTheDayStatus } from '../cropOfTheDay';
import { getCropModifiers, getGlobalModifiers } from '../modifiers';
import { getResetDayStart } from '../resetBoundary';
import { getWeather, type WeatherAxis, type WeatherStatus } from '../weather';
import { getWeeklyEventMultiplier, getWeeklyEventSpeedMultiplier } from '../weeklyEvent';

function findQuietWeather(axis: WeatherAxis): { now: number; weather: WeatherStatus } {
  const state = createInitialState();
  for (let day = 0; day < 1_000; day += 1) {
    const now = getResetDayStart(day) + 3_600_000;
    const weather = getWeather(now);
    if (weather.axis !== axis) continue;
    if (getCropOfTheDayStatus(now, state).cropKey === 'carrot') continue;
    if (getWeeklyEventMultiplier('carrot', now, state.unlockedAreas) !== 1) continue;
    if (getWeeklyEventSpeedMultiplier('carrot', now, state.unlockedAreas) !== 1) continue;
    return { now, weather };
  }
  throw new Error(`No quiet weather day found for axis ${axis}`);
}

describe('weather crop modifiers', () => {
  test.each(['speed', 'sell', null] as const)('multiplies only the %s axis', (axis) => {
    const state = createInitialState();
    const { now, weather } = findQuietWeather(axis);
    const global = getGlobalModifiers(state, now);
    const crop = getCropModifiers(state, 'carrot', now);

    expect(crop.speedMultiplier / global.speedMultiplier).toBeCloseTo(
      axis === 'speed' ? weather.multiplier : 1
    );
    expect(crop.profitMultiplier / global.profitMultiplier).toBeCloseTo(
      axis === 'sell' ? weather.multiplier : 1
    );
  });
});
