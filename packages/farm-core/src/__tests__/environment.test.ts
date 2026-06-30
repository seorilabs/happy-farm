/// <reference types="jest" />

import { getEnvironmentTone, getLocalMinutesOfDay, type EnvironmentPhase } from '../environment';

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
