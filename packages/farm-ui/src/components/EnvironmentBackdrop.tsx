import React, { memo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import {
  DEFAULT_AREA_ENVIRONMENT_THEME,
  type AreaEnvironmentMotif,
  type AreaEnvironmentTheme,
  type EnvironmentPhase,
  type SeasonalAmbienceParticle,
  type WeatherKey,
} from '../../../farm-core/src';

type EnvironmentBackdropProps = {
  phase: EnvironmentPhase;
  minutesOfDay: number;
  backgroundColor: string;
  areaTheme?: AreaEnvironmentTheme;
  weatherKey?: WeatherKey;
  weatherEffectsEnabled?: boolean;
  // 계절 앰비언트(#353): 월 기반 낙하 파티클(봄=꽃잎/가을=낙엽/겨울=눈, 여름='none').
  seasonalParticle?: SeasonalAmbienceParticle;
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

const PRECIPITATION_POSITIONS = [
  { left: '5%', top: '8%', size: 3 },
  { left: '13%', top: '31%', size: 4 },
  { left: '21%', top: '16%', size: 3 },
  { left: '30%', top: '51%', size: 5 },
  { left: '38%', top: '23%', size: 4 },
  { left: '46%', top: '67%', size: 3 },
  { left: '54%', top: '10%', size: 5 },
  { left: '62%', top: '42%', size: 3 },
  { left: '70%', top: '73%', size: 4 },
  { left: '78%', top: '20%', size: 3 },
  { left: '86%', top: '55%', size: 5 },
  { left: '94%', top: '34%', size: 4 },
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

function AreaMotif({ motif, color }: { motif: AreaEnvironmentMotif; color: string }) {
  if (motif === 'furrows') {
    return (
      <View testID="environment-area-motif-furrows" style={styles.motifFill}>
        {[0, 1, 2].map((index) => (
          <View
            key={index}
            style={[styles.furrow, { bottom: 7 + index * 8, backgroundColor: color, opacity: 0.34 + index * 0.1 }]}
          />
        ))}
      </View>
    );
  }

  if (motif === 'orchard') {
    return (
      <View testID="environment-area-motif-orchard" style={styles.motifFill}>
        {[18, 48, 78].map((left, index) => (
          <View key={left} style={[styles.orchardTree, { left: `${left}%` }]}>
            <View style={[styles.orchardCrown, { backgroundColor: index === 1 ? color : 'rgba(63, 122, 66, 0.64)' }]} />
            <View style={[styles.orchardTrunk, { backgroundColor: color }]} />
          </View>
        ))}
      </View>
    );
  }

  if (motif === 'glasshouse' || motif === 'prism') {
    return (
      <View testID={`environment-area-motif-${motif}`} style={styles.motifFill}>
        <View style={[styles.glasshouse, { borderColor: color }]}>
          <View style={[styles.glasshousePane, { borderColor: color }]} />
          <View style={[styles.glasshouseRoof, { borderColor: color }]} />
        </View>
        {motif === 'prism' ? (
          <View style={[styles.prism, { borderColor: color, backgroundColor: 'rgba(255, 255, 255, 0.16)' }]} />
        ) : null}
      </View>
    );
  }

  if (motif === 'crystal') {
    return (
      <View testID="environment-area-motif-crystal" style={styles.motifFill}>
        {[24, 50, 74].map((left, index) => (
          <View
            key={left}
            style={[
              styles.crystal,
              {
                left: `${left}%`,
                height: 22 + index * 7,
                backgroundColor: color,
                opacity: 0.48 + index * 0.1,
              },
            ]}
          />
        ))}
      </View>
    );
  }

  if (motif === 'summit') {
    return (
      <View testID="environment-area-motif-summit" style={styles.motifFill}>
        <View style={[styles.summit, styles.summitLeft, { backgroundColor: color }]} />
        <View style={[styles.summit, styles.summitRight, { backgroundColor: color }]} />
      </View>
    );
  }

  const isBlossom = motif === 'blossom';
  return (
    <View testID={`environment-area-motif-${motif}`} style={styles.motifFill}>
      {[20, 40, 63, 82].map((left, index) => (
        <View
          key={left}
          style={[
            styles.meadowAccent,
            {
              left: `${left}%`,
              bottom: 11 + (index % 2) * 9,
              backgroundColor: color,
              width: isBlossom ? 9 : 5,
              height: isBlossom ? 9 : 12,
              borderRadius: isBlossom ? 5 : 3,
            },
          ]}
        />
      ))}
    </View>
  );
}

export const EnvironmentBackdrop = memo(function EnvironmentBackdrop({
  phase,
  minutesOfDay,
  backgroundColor,
  areaTheme = DEFAULT_AREA_ENVIRONMENT_THEME,
  weatherKey = 'clear',
  weatherEffectsEnabled = true,
  seasonalParticle = 'none',
}: EnvironmentBackdropProps) {
  const palette = PHASE_PALETTES[phase];
  const isNight = phase === 'night';
  const hasHorizonGlow = phase === 'dawn' || phase === 'dusk';
  // 계절 앰비언트는 순수 장식이라 이펙트/모션 축소 설정(weatherEffectsEnabled)이 off면
  // 억제한다. 또한 이미 강수(비/눈) 파티클을 그리는 날에는 겹쳐 그리지 않도록, 활성
  // 강수 날씨에서는 계절 레이어를 양보한다(맑음·흐림에서만 계절 파티클 노출).
  const showSeasonalParticles =
    weatherEffectsEnabled &&
    seasonalParticle !== 'none' &&
    weatherKey !== 'rain' &&
    weatherKey !== 'snow';

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

      <View
        testID={`environment-area-layer-${areaTheme.key}`}
        style={[styles.areaTint, { backgroundColor: areaTheme.skyTint }]}
      />

      {areaTheme.motif != null ? (
        <View testID="environment-area-horizon" style={styles.areaHorizon}>
          <View style={[styles.horizonBack, { backgroundColor: areaTheme.horizonColor }]} />
          <View style={[styles.horizonFront, { backgroundColor: areaTheme.groundColor }]} />
          <AreaMotif motif={areaTheme.motif} color={areaTheme.accentColor} />
        </View>
      ) : null}

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

      {weatherKey !== 'clear' ? (
        <View
          testID={`environment-weather-tone-${weatherKey}`}
          style={[styles.weatherTone, weatherKey === 'snow' && styles.snowTone]}
        />
      ) : null}

      {weatherEffectsEnabled && weatherKey === 'rain' ? (
        <View testID="environment-weather-rain" style={styles.weatherParticles}>
          {PRECIPITATION_POSITIONS.map((position, index) => (
            <View
              key={index}
              testID={`environment-rain-drop-${index}`}
              style={[styles.rainDrop, { left: position.left, top: position.top }]}
            />
          ))}
        </View>
      ) : null}

      {weatherEffectsEnabled && weatherKey === 'snow' ? (
        <View testID="environment-weather-snow" style={styles.weatherParticles}>
          {PRECIPITATION_POSITIONS.map((position, index) => (
            <View
              key={index}
              testID={`environment-snow-flake-${index}`}
              style={[
                styles.snowFlake,
                {
                  left: position.left,
                  top: position.top,
                  width: position.size,
                  height: position.size,
                  borderRadius: position.size / 2,
                },
              ]}
            />
          ))}
        </View>
      ) : null}

      {showSeasonalParticles ? (
        <View testID={`environment-seasonal-${seasonalParticle}`} style={styles.weatherParticles}>
          {PRECIPITATION_POSITIONS.map((position, index) => (
            <View
              key={index}
              testID={`environment-seasonal-particle-${index}`}
              style={[
                styles.seasonalParticle,
                seasonalParticle === 'petal' && styles.seasonalPetal,
                seasonalParticle === 'leaf' && styles.seasonalLeaf,
                seasonalParticle === 'snow' && styles.seasonalSnow,
                {
                  left: position.left,
                  top: position.top,
                  width: position.size + 2,
                  height: position.size + 2,
                },
              ]}
            />
          ))}
        </View>
      ) : null}
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
  weatherTone: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(69, 86, 116, 0.18)',
  },
  snowTone: {
    backgroundColor: 'rgba(225, 235, 246, 0.22)',
  },
  weatherParticles: {
    ...StyleSheet.absoluteFillObject,
  },
  rainDrop: {
    position: 'absolute',
    width: 2,
    height: 24,
    borderRadius: 2,
    backgroundColor: 'rgba(164, 211, 237, 0.72)',
    transform: [{ rotate: '16deg' }],
  },
  snowFlake: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.90)',
    borderWidth: 1,
    borderColor: 'rgba(202, 222, 240, 0.74)',
  },
  seasonalParticle: {
    position: 'absolute',
  },
  // 봄: 연분홍 꽃잎(둥근 타원).
  seasonalPetal: {
    borderRadius: 999,
    backgroundColor: 'rgba(247, 190, 214, 0.78)',
    transform: [{ rotate: '24deg' }],
  },
  // 가을: 호박색 낙엽(모서리를 비대칭으로 굴린 잎 형태).
  seasonalLeaf: {
    borderTopLeftRadius: 999,
    borderBottomRightRadius: 999,
    backgroundColor: 'rgba(214, 138, 74, 0.78)',
    transform: [{ rotate: '-18deg' }],
  },
  // 겨울: 흰 눈송이(강수 눈과 톤을 맞추되 계절 레이어로 분리).
  seasonalSnow: {
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(202, 222, 240, 0.70)',
  },
  areaTint: {
    ...StyleSheet.absoluteFillObject,
  },
  areaHorizon: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '40%',
    overflow: 'hidden',
  },
  horizonBack: {
    position: 'absolute',
    left: '-12%',
    right: '28%',
    bottom: '12%',
    height: '74%',
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    transform: [{ rotate: '-4deg' }],
  },
  horizonFront: {
    position: 'absolute',
    left: '20%',
    right: '-16%',
    bottom: '-8%',
    height: '72%',
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    transform: [{ rotate: '3deg' }],
  },
  motifFill: {
    ...StyleSheet.absoluteFillObject,
  },
  meadowAccent: {
    position: 'absolute',
  },
  furrow: {
    position: 'absolute',
    left: '7%',
    right: '7%',
    height: 3,
    borderRadius: 999,
    transform: [{ rotate: '-2deg' }],
  },
  orchardTree: {
    position: 'absolute',
    bottom: 6,
    width: 30,
    height: 48,
    marginLeft: -15,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  orchardCrown: {
    position: 'absolute',
    top: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  orchardTrunk: {
    width: 6,
    height: 25,
    borderRadius: 3,
  },
  glasshouse: {
    position: 'absolute',
    left: '22%',
    right: '22%',
    bottom: 7,
    height: 46,
    borderWidth: 2,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  glasshousePane: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    borderLeftWidth: 1,
  },
  glasshouseRoof: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 15,
    borderTopWidth: 1,
  },
  prism: {
    position: 'absolute',
    right: '17%',
    bottom: 28,
    width: 20,
    height: 20,
    borderWidth: 2,
    transform: [{ rotate: '45deg' }],
  },
  crystal: {
    position: 'absolute',
    bottom: 7,
    width: 14,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    transform: [{ rotate: '8deg' }],
  },
  summit: {
    position: 'absolute',
    bottom: -31,
    width: 82,
    height: 82,
    borderRadius: 8,
    opacity: 0.48,
    transform: [{ rotate: '45deg' }],
  },
  summitLeft: {
    left: '18%',
  },
  summitRight: {
    right: '12%',
    width: 62,
    height: 62,
    bottom: -23,
    opacity: 0.34,
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
