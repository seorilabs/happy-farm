import type { AreaKey } from './types';

export type AreaEnvironmentMotif =
  | 'meadow'
  | 'furrows'
  | 'blossom'
  | 'orchard'
  | 'glasshouse'
  | 'crystal'
  | 'summit'
  | 'prism';

export type AreaEnvironmentThemeKey = 'default' | AreaEnvironmentMotif;

export type AreaEnvironmentTheme = Readonly<{
  key: AreaEnvironmentThemeKey;
  motif: AreaEnvironmentMotif | null;
  skyTint: string;
  horizonColor: string;
  groundColor: string;
  accentColor: string;
}>;

// Unknown or migrated area keys keep the existing time-of-day presentation.
// Transparent layers make this a true visual fallback rather than inventing a
// theme for data that the current balance catalog does not understand.
export const DEFAULT_AREA_ENVIRONMENT_THEME: AreaEnvironmentTheme = Object.freeze({
  key: 'default',
  motif: null,
  skyTint: 'transparent',
  horizonColor: 'transparent',
  groundColor: 'transparent',
  accentColor: 'transparent',
});

const AREA_ENVIRONMENT_THEMES: Readonly<Record<AreaEnvironmentMotif, AreaEnvironmentTheme>> = Object.freeze({
  meadow: Object.freeze({
    key: 'meadow',
    motif: 'meadow',
    skyTint: 'rgba(163, 218, 129, 0.13)',
    horizonColor: 'rgba(113, 181, 103, 0.34)',
    groundColor: 'rgba(82, 151, 78, 0.28)',
    accentColor: 'rgba(251, 224, 111, 0.62)',
  }),
  furrows: Object.freeze({
    key: 'furrows',
    motif: 'furrows',
    skyTint: 'rgba(201, 220, 120, 0.12)',
    horizonColor: 'rgba(141, 179, 83, 0.32)',
    groundColor: 'rgba(132, 103, 65, 0.28)',
    accentColor: 'rgba(224, 196, 112, 0.58)',
  }),
  blossom: Object.freeze({
    key: 'blossom',
    motif: 'blossom',
    skyTint: 'rgba(244, 173, 194, 0.14)',
    horizonColor: 'rgba(210, 139, 169, 0.30)',
    groundColor: 'rgba(116, 158, 101, 0.27)',
    accentColor: 'rgba(255, 221, 235, 0.72)',
  }),
  orchard: Object.freeze({
    key: 'orchard',
    motif: 'orchard',
    skyTint: 'rgba(240, 171, 101, 0.13)',
    horizonColor: 'rgba(91, 145, 80, 0.38)',
    groundColor: 'rgba(73, 116, 67, 0.31)',
    accentColor: 'rgba(103, 73, 46, 0.62)',
  }),
  glasshouse: Object.freeze({
    key: 'glasshouse',
    motif: 'glasshouse',
    skyTint: 'rgba(91, 205, 211, 0.14)',
    horizonColor: 'rgba(80, 173, 169, 0.28)',
    groundColor: 'rgba(68, 133, 128, 0.25)',
    accentColor: 'rgba(224, 255, 248, 0.68)',
  }),
  crystal: Object.freeze({
    key: 'crystal',
    motif: 'crystal',
    skyTint: 'rgba(150, 105, 225, 0.16)',
    horizonColor: 'rgba(109, 80, 177, 0.32)',
    groundColor: 'rgba(76, 58, 132, 0.27)',
    accentColor: 'rgba(222, 196, 255, 0.72)',
  }),
  summit: Object.freeze({
    key: 'summit',
    motif: 'summit',
    skyTint: 'rgba(240, 159, 76, 0.16)',
    horizonColor: 'rgba(97, 91, 132, 0.36)',
    groundColor: 'rgba(68, 64, 101, 0.30)',
    accentColor: 'rgba(255, 222, 146, 0.68)',
  }),
  prism: Object.freeze({
    key: 'prism',
    motif: 'prism',
    skyTint: 'rgba(78, 203, 221, 0.14)',
    horizonColor: 'rgba(89, 125, 186, 0.30)',
    groundColor: 'rgba(83, 75, 142, 0.27)',
    accentColor: 'rgba(244, 188, 255, 0.72)',
  }),
});

const AREA_THEME_KEYS: Readonly<Record<AreaKey, AreaEnvironmentMotif>> = Object.freeze({
  starter_field: 'meadow',
  vegetable_field: 'furrows',
  fruit_field: 'blossom',
  orchard: 'orchard',
  greenhouse: 'glasshouse',
  mystic_field: 'crystal',
  legend_field: 'summit',
  hybrid_greenhouse: 'prism',
});

export function getAreaEnvironmentTheme(areaKey: string | null | undefined): AreaEnvironmentTheme {
  if (areaKey == null || !Object.prototype.hasOwnProperty.call(AREA_THEME_KEYS, areaKey)) {
    return DEFAULT_AREA_ENVIRONMENT_THEME;
  }

  const themeKey = AREA_THEME_KEYS[areaKey as AreaKey];
  return themeKey == null ? DEFAULT_AREA_ENVIRONMENT_THEME : AREA_ENVIRONMENT_THEMES[themeKey];
}
