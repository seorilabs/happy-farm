import { DEFAULT_AREA_ENVIRONMENT_THEME, getAreaEnvironmentTheme, type AreaEnvironmentTheme } from '../areaEnvironment';
import type { AreaKey } from '../types';

const AREA_KEYS: readonly AreaKey[] = [
  'starter_field',
  'vegetable_field',
  'fruit_field',
  'orchard',
  'greenhouse',
  'mystic_field',
  'legend_field',
  'hybrid_greenhouse',
];

function visualSignature(theme: AreaEnvironmentTheme): string {
  return JSON.stringify([theme.skyTint, theme.horizonColor, theme.groundColor, theme.accentColor, theme.motif]);
}

describe('getAreaEnvironmentTheme', () => {
  test('maps every known area to a deterministic data-driven theme', () => {
    for (const areaKey of AREA_KEYS) {
      const first = getAreaEnvironmentTheme(areaKey);
      const second = getAreaEnvironmentTheme(areaKey);

      expect(first).toBe(second);
      expect(first).not.toBe(DEFAULT_AREA_ENVIRONMENT_THEME);
      expect(first.key).not.toBe('default');
      expect(first.motif).not.toBeNull();
    }
  });

  test('keeps at least three area presentations visually distinct', () => {
    const signatures = AREA_KEYS.map((areaKey) => visualSignature(getAreaEnvironmentTheme(areaKey)));
    expect(new Set(signatures).size).toBeGreaterThanOrEqual(3);
  });

  test.each([['unknown_area'], [''], [null], [undefined]])(
    'falls back to the existing neutral presentation for %p',
    (areaKey) => {
      expect(getAreaEnvironmentTheme(areaKey)).toBe(DEFAULT_AREA_ENVIRONMENT_THEME);
      expect(getAreaEnvironmentTheme(areaKey).skyTint).toBe('transparent');
    }
  );
});
