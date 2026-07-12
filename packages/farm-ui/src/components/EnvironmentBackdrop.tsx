import React, { memo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import type { EnvironmentPhase } from '../../../farm-core/src';

type EnvironmentBackdropProps = {
  phase: EnvironmentPhase;
  minutesOfDay: number;
  backgroundColor: string;
};

type PhasePalette = {
  bands: readonly [string, string, string, string, string];
  glow: string;
};

const MINUTES_PER_DAY = 24 * 60;

const PHASE_PALETTES: Record<EnvironmentPhase, PhasePalette> = {
  night: {
    bands: [
      'rgba(93, 110, 167, 0.44)',
      'rgba(118, 133, 181, 0.36)',
      'rgba(149, 161, 200, 0.28)',
      'rgba(179, 188, 215, 0.20)',
      'rgba(213, 218, 234, 0.12)',
    ],
    glow: 'rgba(219, 224, 241, 0.36)',
  },
  dawn: {
    bands: [
      'rgba(166, 157, 209, 0.28)',
      'rgba(207, 169, 205, 0.28)',
      'rgba(239, 186, 186, 0.30)',
      'rgba(250, 205, 169, 0.34)',
      'rgba(255, 230, 174, 0.38)',
    ],
    glow: 'rgba(255, 205, 117, 0.52)',
  },
  day: {
    bands: [
      'rgba(91, 183, 224, 0.34)',
      'rgba(120, 199, 228, 0.30)',
      'rgba(158, 217, 226, 0.25)',
      'rgba(193, 231, 219, 0.20)',
      'rgba(224, 242, 205, 0.16)',
    ],
    glow: 'rgba(255, 240, 169, 0.30)',
  },
  dusk: {
    bands: [
      'rgba(126, 116, 181, 0.32)',
      'rgba(174, 126, 181, 0.30)',
      'rgba(222, 146, 169, 0.32)',
      'rgba(247, 173, 143, 0.36)',
      'rgba(255, 210, 151, 0.40)',
    ],
    glow: 'rgba(255, 167, 104, 0.48)',
  },
};

const STAR_POSITIONS = [
  { left: '8%', top: 12, size: 3, opacity: 0.8 },
  { left: '18%', top: 47, size: 2, opacity: 0.65 },
  { left: '28%', top: 24, size: 4, opacity: 0.9 },
  { left: '39%', top: 61, size: 2, opacity: 0.7 },
  { left: '49%', top: 9, size: 3, opacity: 0.75 },
  { left: '58%', top: 39, size: 2, opacity: 0.65 },
  { left: '68%', top: 19, size: 4, opacity: 0.85 },
  { left: '78%', top: 54, size: 2, opacity: 0.7 },
  { left: '88%', top: 14, size: 3, opacity: 0.85 },
  { left: '93%', top: 67, size: 2, opacity: 0.6 },
] as const;

const CLOUD_POSITIONS = [
  { left: '12%', top: 18, scale: 0.8, opacity: 0.62 },
  { left: '64%', top: 43, scale: 1, opacity: 0.72 },
] as const;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeMinutes(minutesOfDay: number): number {
  if (!Number.isFinite(minutesOfDay)) return 0;
  return ((minutesOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function percent(value: number): `${number}%` {
  return `${Math.round(value * 10) / 10}%`;
}

function getCelestialArcStyle(minutesOfDay: number, celestial: 'sun' | 'moon'): ViewStyle {
  const normalized = normalizeMinutes(minutesOfDay);
  const adjustedMinutes = celestial === 'moon' && normalized < 390 ? normalized + MINUTES_PER_DAY : normalized;
  const startMinute = celestial === 'sun' ? 300 : 1230;
  const endMinute = celestial === 'sun' ? 1230 : 1830;
  const progress = clamp01((adjustedMinutes - startMinute) / (endMinute - startMinute));
  const arcHeight = Math.sin(progress * Math.PI);

  return {
    left: percent(5 + progress * 84),
    // Keep the body inside the transparent sky cap above the plot grid. A
    // percentage of the whole stage placed it behind opaque plot tiles.
    top: 14 + (1 - arcHeight) * 20,
  };
}

function Cloud({ index }: { index: number }) {
  const cloud = CLOUD_POSITIONS[index]!;
  return (
    <View
      testID={`environment-cloud-${index}`}
      style={[
        styles.cloud,
        {
          left: cloud.left,
          top: cloud.top,
          opacity: cloud.opacity,
          transform: [{ scale: cloud.scale }],
        },
      ]}
    >
      <View style={[styles.cloudPuff, styles.cloudPuffLeft]} />
      <View style={[styles.cloudPuff, styles.cloudPuffCenter]} />
      <View style={[styles.cloudPuff, styles.cloudPuffRight]} />
      <View style={styles.cloudBase} />
    </View>
  );
}

export const EnvironmentBackdrop = memo(function EnvironmentBackdrop({
  phase,
  minutesOfDay,
  backgroundColor,
}: EnvironmentBackdropProps) {
  const palette = PHASE_PALETTES[phase];
  const isNight = phase === 'night';
  const hasHorizonGlow = phase === 'dawn' || phase === 'dusk';

  return (
    <View
      testID={`environment-backdrop-${phase}`}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.backdrop, { backgroundColor }]}
    >
      <View testID={`environment-sky-bands-${phase}`} style={styles.skyBands}>
        {palette.bands.map((color, index) => (
          <View
            key={`${phase}-${index}`}
            testID={`environment-sky-band-${index}`}
            style={[styles.skyBand, { backgroundColor: color }]}
          />
        ))}
      </View>

      {hasHorizonGlow ? (
        <View testID="environment-horizon-glow" style={[styles.horizonGlow, { backgroundColor: palette.glow }]} />
      ) : null}

      {isNight ? (
        <>
          {STAR_POSITIONS.map((star, index) => (
            <View
              key={index}
              testID={`environment-star-${index}`}
              style={[
                styles.star,
                {
                  left: star.left,
                  top: star.top,
                  width: star.size,
                  height: star.size,
                  borderRadius: star.size / 2,
                  opacity: star.opacity,
                },
              ]}
            />
          ))}
          <View testID="environment-moon" style={[styles.moon, getCelestialArcStyle(minutesOfDay, 'moon')]}>
            <View style={[styles.moonCrater, styles.moonCraterLarge]} />
            <View style={[styles.moonCrater, styles.moonCraterSmall]} />
          </View>
        </>
      ) : (
        <>
          <View testID="environment-sun" style={[styles.sunHalo, getCelestialArcStyle(minutesOfDay, 'sun')]}>
            <View style={styles.sun} />
          </View>
          {phase === 'day' ? CLOUD_POSITIONS.map((_, index) => <Cloud key={index} index={index} />) : null}
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  skyBands: {
    ...StyleSheet.absoluteFillObject,
  },
  skyBand: {
    flex: 1,
  },
  horizonGlow: {
    position: 'absolute',
    left: '-10%',
    right: '-10%',
    top: 48,
    height: 52,
    borderRadius: 999,
  },
  sunHalo: {
    position: 'absolute',
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 27,
    backgroundColor: 'rgba(255, 231, 118, 0.28)',
  },
  sun: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ffd75e',
    borderWidth: 3,
    borderColor: 'rgba(255, 247, 197, 0.90)',
  },
  moon: {
    position: 'absolute',
    width: 42,
    height: 42,
    overflow: 'hidden',
    borderRadius: 21,
    backgroundColor: '#fff4c7',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.86)',
  },
  moonCrater: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(217, 202, 161, 0.42)',
  },
  moonCraterLarge: {
    left: 8,
    top: 10,
    width: 10,
    height: 10,
  },
  moonCraterSmall: {
    right: 8,
    bottom: 8,
    width: 6,
    height: 6,
  },
  star: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    shadowColor: '#ffffff',
    shadowOpacity: 0.8,
    shadowRadius: 2,
  },
  cloud: {
    position: 'absolute',
    width: 76,
    height: 34,
  },
  cloudPuff: {
    position: 'absolute',
    bottom: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
  },
  cloudPuffLeft: {
    left: 7,
    width: 25,
    height: 25,
  },
  cloudPuffCenter: {
    left: 25,
    bottom: 9,
    width: 32,
    height: 32,
  },
  cloudPuffRight: {
    right: 5,
    width: 22,
    height: 22,
  },
  cloudBase: {
    position: 'absolute',
    left: 8,
    right: 5,
    bottom: 4,
    height: 17,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
  },
});
