/// <reference types="jest" />

import {
  getEnvironmentTone,
  getLocalMinutesOfDay,
  getSeasonalAmbience,
  type EnvironmentPhase,
  type SeasonalAmbience,
} from '../environment';

const HEX = /^#[0-9a-f]{6}$/;

function channels(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

describe('getEnvironmentTone phases', () => {
  test('maps the day into at least three distinct phases', () => {
    const phases = new Set<EnvironmentPhase>();
    for (let minute = 0; minute < 24 * 60; minute += 1) {
      phases.add(getEnvironmentTone(minute).phase);
    }
    expect(phases.size).toBeGreaterThanOrEqual(3);
    expect(phases.has('day')).toBe(true);
    expect(phases.has('night')).toBe(true);
  });

  test('anchor times map to their expected phase and tone', () => {
    expect(getEnvironmentTone(12 * 60)).toEqual({ phase: 'day', backgroundColor: '#eaf6e6' });
    expect(getEnvironmentTone(6 * 60 + 30)).toEqual({ phase: 'dawn', backgroundColor: '#fdefe3' });
    expect(getEnvironmentTone(18 * 60 + 30)).toEqual({ phase: 'dusk', backgroundColor: '#fbe3d6' });
    expect(getEnvironmentTone(23 * 60).phase).toBe('night');
  });

  test('every tone is a valid light hex (keeps contrast with dark text/cards)', () => {
    for (let minute = 0; minute < 24 * 60; minute += 1) {
      const { backgroundColor } = getEnvironmentTone(minute);
      expect(backgroundColor).toMatch(HEX);
      // All channels stay high so dark foreground text and sheets remain readable.
      for (const channel of channels(backgroundColor)) {
        expect(channel).toBeGreaterThanOrEqual(200);
      }
    }
  });
});

describe('smoothness and determinism', () => {
  test('adjacent minutes never jump abruptly (gradual transition)', () => {
    let prev = channels(getEnvironmentTone(0).backgroundColor);
    // Walk a full loop including the midnight wrap (1440 -> 0).
    for (let minute = 1; minute <= 24 * 60; minute += 1) {
      const current = channels(getEnvironmentTone(minute % (24 * 60)).backgroundColor);
      for (let c = 0; c < 3; c += 1) {
        expect(Math.abs(current[c]! - prev[c]!)).toBeLessThanOrEqual(2);
      }
      prev = current;
    }
  });

  test('is deterministic and wraps/handles out-of-range input', () => {
    expect(getEnvironmentTone(12 * 60)).toEqual(getEnvironmentTone(12 * 60));
    // Wrap: a full day later is the same tone.
    expect(getEnvironmentTone(12 * 60 + 24 * 60)).toEqual(getEnvironmentTone(12 * 60));
    // Negative wraps into range.
    expect(getEnvironmentTone(-60)).toEqual(getEnvironmentTone(23 * 60));
    // Non-finite falls back to the midnight tone.
    expect(getEnvironmentTone(Number.NaN)).toEqual(getEnvironmentTone(0));
  });
});

describe('getLocalMinutesOfDay', () => {
  test('derives minutes-of-day from a local Date', () => {
    const date = new Date(2026, 5, 30, 9, 45); // local 09:45
    expect(getLocalMinutesOfDay(date)).toBe(9 * 60 + 45);
  });
});

describe('getSeasonalAmbience (#353)', () => {
  // 월(0=1월..11=12월) → 기대 계절/파티클. 봄=꽃잎, 여름=없음, 가을=낙엽, 겨울=눈.
  const EXPECTED: readonly SeasonalAmbience[] = [
    { season: 'winter', particle: 'snow' }, // 1월
    { season: 'winter', particle: 'snow' }, // 2월
    { season: 'spring', particle: 'petal' }, // 3월
    { season: 'spring', particle: 'petal' }, // 4월
    { season: 'spring', particle: 'petal' }, // 5월
    { season: 'summer', particle: 'none' }, // 6월
    { season: 'summer', particle: 'none' }, // 7월
    { season: 'summer', particle: 'none' }, // 8월
    { season: 'autumn', particle: 'leaf' }, // 9월
    { season: 'autumn', particle: 'leaf' }, // 10월
    { season: 'autumn', particle: 'leaf' }, // 11월
    { season: 'winter', particle: 'snow' }, // 12월
  ];

  test.each(EXPECTED.map((expected, month) => [month, expected] as const))(
    'maps month index %i deterministically to its season and particle',
    (month, expected) => {
      const date = new Date(2026, month, 15, 12, 0);
      expect(getSeasonalAmbience(date)).toEqual(expected);
    }
  );

  test('wraps the December→January boundary to winter on both sides', () => {
    expect(getSeasonalAmbience(new Date(2026, 11, 31, 23, 59)).season).toBe('winter');
    expect(getSeasonalAmbience(new Date(2027, 0, 1, 0, 0)).season).toBe('winter');
  });

  test('is deterministic for the same month', () => {
    const a = getSeasonalAmbience(new Date(2026, 3, 2, 8, 0));
    const b = getSeasonalAmbience(new Date(2099, 3, 27, 21, 30));
    expect(a).toEqual(b);
    expect(a).toEqual({ season: 'spring', particle: 'petal' });
  });

  test('falls back to a particle-free summer for an invalid Date', () => {
    expect(getSeasonalAmbience(new Date(NaN))).toEqual({ season: 'summer', particle: 'none' });
  });
});
