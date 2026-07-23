/// <reference types="jest" />

import React from 'react';
import { StyleSheet } from 'react-native';
import { cleanup, render, within } from '@testing-library/react-native';

import { getAreaEnvironmentTheme } from '../../../../../packages/farm-core/src';
import { EnvironmentBackdrop } from '../../../../../packages/farm-ui/src/components/EnvironmentBackdrop';

describe('EnvironmentBackdrop', () => {
  afterEach(() => {
    cleanup();
  });

  test.each([
    ['night', 60, 'environment-moon'],
    ['dawn', 7 * 60, 'environment-sun'],
    ['day', 12 * 60, 'environment-sun'],
    ['dusk', 19 * 60, 'environment-sun'],
  ] as const)('renders a distinct %s sky presentation', (phase, minutesOfDay, celestialTestId) => {
    const screen = render(<EnvironmentBackdrop phase={phase} minutesOfDay={minutesOfDay} backgroundColor="#eaf6e6" />);

    // The whole decorative subtree is intentionally hidden from accessibility-aware
    // queries, so inspect it through the explicit unsafe escape hatch.
    const getDecoration = (testID: string) => screen.UNSAFE_getByProps({ testID });
    const queryDecoration = (testID: string) => screen.UNSAFE_queryByProps({ testID });
    const backdrop = getDecoration(`environment-backdrop-${phase}`);
    expect(backdrop.props.pointerEvents).toBe('none');
    expect(backdrop.props.accessible).toBe(false);
    expect(backdrop.props.accessibilityElementsHidden).toBe(true);
    expect(backdrop.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(getDecoration(`environment-sky-bands-${phase}`)).toBeTruthy();
    expect(getDecoration(celestialTestId)).toBeTruthy();

    if (phase === 'night') {
      for (let index = 0; index < 10; index += 1) {
        expect(getDecoration(`environment-star-${index}`)).toBeTruthy();
      }
      expect(queryDecoration('environment-star-10')).toBeNull();
      expect(queryDecoration('environment-sun')).toBeNull();
    } else {
      expect(queryDecoration('environment-moon')).toBeNull();
      expect(queryDecoration('environment-star-0')).toBeNull();
    }

    if (phase === 'dawn' || phase === 'dusk') {
      expect(getDecoration('environment-horizon-glow')).toBeTruthy();
    } else {
      expect(queryDecoration('environment-horizon-glow')).toBeNull();
    }

    if (phase === 'day') {
      expect(getDecoration('environment-cloud-0')).toBeTruthy();
      expect(getDecoration('environment-cloud-1')).toBeTruthy();
      expect(queryDecoration('environment-cloud-2')).toBeNull();
    } else {
      expect(queryDecoration('environment-cloud-0')).toBeNull();
    }
  });

  test('moves the sun along its arc as the local minute changes', () => {
    const screen = render(<EnvironmentBackdrop phase="day" minutesOfDay={8 * 60} backgroundColor="#eaf6e6" />);
    const morningStyle = screen.UNSAFE_getByProps({ testID: 'environment-sun' }).props.style;

    screen.rerender(<EnvironmentBackdrop phase="day" minutesOfDay={12 * 60} backgroundColor="#eaf6e6" />);

    expect(screen.UNSAFE_getByProps({ testID: 'environment-sun' }).props.style).not.toEqual(morningStyle);
  });

  test('keeps all four phase palettes visually distinct', () => {
    const phases = ['night', 'dawn', 'day', 'dusk'] as const;
    const screen = render(
      <EnvironmentBackdrop phase="night" minutesOfDay={60} backgroundColor="#eaf6e6" />
    );
    const palettes: string[][] = [];

    for (const phase of phases) {
      screen.rerender(
        <EnvironmentBackdrop phase={phase} minutesOfDay={12 * 60} backgroundColor="#eaf6e6" />
      );
      palettes.push(
        Array.from({ length: 5 }, (_, index) =>
          String(
            StyleSheet.flatten(
              screen.UNSAFE_getByProps({ testID: `environment-sky-band-${index}` }).props.style
            ).backgroundColor
          )
        )
      );
    }

    expect(new Set(palettes.map((palette) => JSON.stringify(palette))).size).toBe(phases.length);
  });

  test.each([
    ['night', 60, 'environment-moon', 'rgba(45, 54, 88, 0.26)', 'rgba(31, 44, 69, 0.34)'],
    ['dawn', 7 * 60, 'environment-sun', 'rgba(118, 88, 131, 0.16)', 'rgba(91, 83, 111, 0.22)'],
    ['day', 12 * 60, 'environment-sun', 'rgba(63, 126, 91, 0.10)', 'rgba(43, 104, 72, 0.14)'],
    ['dusk', 19 * 60, 'environment-sun', 'rgba(116, 72, 111, 0.20)', 'rgba(79, 60, 91, 0.28)'],
  ] as const)(
    'renders the %s hills inside the non-interactive backdrop with a distinct phase palette (#361)',
    (phase, minutesOfDay, celestialTestID, backTint, frontTint) => {
      const screen = render(
        <EnvironmentBackdrop
          phase={phase}
          minutesOfDay={minutesOfDay}
          backgroundColor="#eaf6e6"
          areaTheme={getAreaEnvironmentTheme('starter_field')}
        />
      );
      const backdrop = screen.UNSAFE_getByProps({ testID: `environment-backdrop-${phase}` });
      const horizon = within(backdrop).UNSAFE_getByProps({ testID: 'environment-area-horizon' });
      const hills = within(horizon).UNSAFE_getByProps({ testID: `environment-hills-${phase}` });

      expect(hills.props.pointerEvents).toBe('none');
      expect(hills.props.accessible).toBe(false);
      expect(hills.props.accessibilityElementsHidden).toBe(true);
      expect(hills.props.importantForAccessibility).toBe('no-hide-descendants');
      expect(within(hills).UNSAFE_getByProps({ testID: 'environment-hill-back' })).toBeTruthy();
      expect(within(hills).UNSAFE_getByProps({ testID: 'environment-hill-front' })).toBeTruthy();
      expect(
        StyleSheet.flatten(
          within(hills).UNSAFE_getByProps({ testID: `environment-hill-back-tint-${phase}` }).props.style
        ).backgroundColor
      ).toBe(backTint);
      expect(
        StyleSheet.flatten(
          within(hills).UNSAFE_getByProps({ testID: `environment-hill-front-tint-${phase}` }).props.style
        ).backgroundColor
      ).toBe(frontTint);

      const skyZIndex = StyleSheet.flatten(
        screen.UNSAFE_getByProps({ testID: `environment-sky-bands-${phase}` }).props.style
      ).zIndex;
      const hillZIndex = StyleSheet.flatten(horizon.props.style).zIndex;
      const celestialZIndex = StyleSheet.flatten(
        screen.UNSAFE_getByProps({ testID: celestialTestID }).props.style
      ).zIndex;
      expect(hillZIndex).toBeGreaterThan(skyZIndex);
      expect(hillZIndex).toBeLessThan(celestialZIndex);
    }
  );

  test('composes visually distinct area themes without replacing the time-of-day sky', () => {
    const areaKeys = ['starter_field', 'orchard', 'mystic_field'] as const;
    const screen = render(
      <EnvironmentBackdrop
        phase="day"
        minutesOfDay={12 * 60}
        backgroundColor="#eaf6e6"
        areaTheme={getAreaEnvironmentTheme(areaKeys[0])}
      />
    );
    const signatures: string[] = [];

    for (const areaKey of areaKeys) {
      const theme = getAreaEnvironmentTheme(areaKey);
      screen.rerender(
        <EnvironmentBackdrop
          phase="day"
          minutesOfDay={12 * 60}
          backgroundColor="#eaf6e6"
          areaTheme={theme}
        />
      );

      expect(screen.UNSAFE_getByProps({ testID: 'environment-backdrop-day' })).toBeTruthy();
      expect(screen.UNSAFE_getByProps({ testID: 'environment-sun' })).toBeTruthy();
      expect(screen.UNSAFE_getByProps({ testID: `environment-area-motif-${theme.motif}` })).toBeTruthy();

      signatures.push(
        JSON.stringify([
          StyleSheet.flatten(
            screen.UNSAFE_getByProps({ testID: `environment-area-layer-${theme.key}` }).props.style
          ).backgroundColor,
          theme.horizonColor,
          theme.groundColor,
        ])
      );
    }

    expect(new Set(signatures).size).toBe(areaKeys.length);
  });

  test('uses a neutral fallback when no area theme is supplied', () => {
    const screen = render(
      <EnvironmentBackdrop phase="night" minutesOfDay={60} backgroundColor="#dfe4f2" />
    );

    expect(screen.UNSAFE_getByProps({ testID: 'environment-backdrop-night' })).toBeTruthy();
    expect(screen.UNSAFE_getByProps({ testID: 'environment-moon' })).toBeTruthy();
    expect(
      StyleSheet.flatten(screen.UNSAFE_getByProps({ testID: 'environment-area-layer-default' }).props.style)
        .backgroundColor
    ).toBe('transparent');
    expect(screen.UNSAFE_queryByProps({ testID: 'environment-area-horizon' })).toBeNull();
  });

  test('renders deterministic rain and snow layers when weather effects are enabled', () => {
    const screen = render(
      <EnvironmentBackdrop
        phase="day"
        minutesOfDay={12 * 60}
        backgroundColor="#eaf6e6"
        weatherKey="rain"
      />
    );

    expect(screen.UNSAFE_getByProps({ testID: 'environment-weather-tone-rain' })).toBeTruthy();
    expect(screen.UNSAFE_getByProps({ testID: 'environment-weather-rain' })).toBeTruthy();
    for (let index = 0; index < 12; index += 1) {
      expect(screen.UNSAFE_getByProps({ testID: `environment-rain-drop-${index}` })).toBeTruthy();
    }
    expect(screen.UNSAFE_queryByProps({ testID: 'environment-rain-drop-12' })).toBeNull();

    screen.rerender(
      <EnvironmentBackdrop
        phase="day"
        minutesOfDay={12 * 60}
        backgroundColor="#eaf6e6"
        weatherKey="snow"
      />
    );

    expect(screen.UNSAFE_getByProps({ testID: 'environment-weather-tone-snow' })).toBeTruthy();
    expect(screen.UNSAFE_getByProps({ testID: 'environment-weather-snow' })).toBeTruthy();
    for (let index = 0; index < 12; index += 1) {
      expect(screen.UNSAFE_getByProps({ testID: `environment-snow-flake-${index}` })).toBeTruthy();
    }
    expect(screen.UNSAFE_queryByProps({ testID: 'environment-snow-flake-12' })).toBeNull();
  });

  test('keeps the weather tone but suppresses precipitation in reduced-effects mode', () => {
    const screen = render(
      <EnvironmentBackdrop
        phase="day"
        minutesOfDay={12 * 60}
        backgroundColor="#eaf6e6"
        weatherKey="rain"
        weatherEffectsEnabled={false}
      />
    );

    expect(screen.UNSAFE_getByProps({ testID: 'environment-weather-tone-rain' })).toBeTruthy();
    expect(screen.UNSAFE_queryByProps({ testID: 'environment-weather-rain' })).toBeNull();
    expect(screen.UNSAFE_queryByProps({ testID: 'environment-rain-drop-0' })).toBeNull();

    screen.rerender(
      <EnvironmentBackdrop
        phase="day"
        minutesOfDay={12 * 60}
        backgroundColor="#eaf6e6"
        weatherKey="snow"
        weatherEffectsEnabled={false}
      />
    );

    expect(screen.UNSAFE_getByProps({ testID: 'environment-weather-tone-snow' })).toBeTruthy();
    expect(screen.UNSAFE_queryByProps({ testID: 'environment-weather-snow' })).toBeNull();
    expect(screen.UNSAFE_queryByProps({ testID: 'environment-snow-flake-0' })).toBeNull();
  });

  test.each(['petal', 'leaf', 'snow'] as const)(
    'renders the %s seasonal layer inside the non-interactive, accessibility-hidden background backdrop (#353 AC-2)',
    (particle) => {
      const screen = render(
        <EnvironmentBackdrop
          phase="day"
          minutesOfDay={12 * 60}
          backgroundColor="#eaf6e6"
          weatherKey="clear"
          seasonalParticle={particle}
        />
      );

      // 배경 backdrop은 터치 불가 + 접근성 제외라, 그 안의 계절 레이어도 스크린리더·터치·
      // 플롯 오클루전에 영향이 없다(밭 타일 뒤 absolute-fill 배경 레이어).
      const backdrop = screen.UNSAFE_getByProps({ testID: 'environment-backdrop-day' });
      expect(backdrop.props.pointerEvents).toBe('none');
      expect(backdrop.props.accessibilityElementsHidden).toBe(true);
      expect(backdrop.props.importantForAccessibility).toBe('no-hide-descendants');

      // 계절 레이어와 파티클이 그 backdrop 서브트리 '내부'에 거주한다(배경 레이어 전용).
      const layer = within(backdrop).UNSAFE_getByProps({ testID: `environment-seasonal-${particle}` });
      expect(layer).toBeTruthy();
      for (let index = 0; index < 12; index += 1) {
        expect(within(layer).UNSAFE_getByProps({ testID: `environment-seasonal-particle-${index}` })).toBeTruthy();
      }
      expect(within(layer).UNSAFE_queryByProps({ testID: 'environment-seasonal-particle-12' })).toBeNull();
    }
  );

  test('renders no seasonal layer for summer (particle "none") (#353)', () => {
    const screen = render(
      <EnvironmentBackdrop
        phase="day"
        minutesOfDay={12 * 60}
        backgroundColor="#eaf6e6"
        weatherKey="clear"
        seasonalParticle="none"
      />
    );

    expect(screen.UNSAFE_queryByProps({ testID: 'environment-seasonal-particle-0' })).toBeNull();
    expect(screen.UNSAFE_queryByProps({ testID: 'environment-seasonal-none' })).toBeNull();
  });

  test('disables the seasonal layer when the effects/reduced-motion setting is off (#353 AC-3)', () => {
    const screen = render(
      <EnvironmentBackdrop
        phase="day"
        minutesOfDay={12 * 60}
        backgroundColor="#eaf6e6"
        weatherKey="clear"
        seasonalParticle="petal"
        weatherEffectsEnabled={false}
      />
    );

    expect(screen.UNSAFE_queryByProps({ testID: 'environment-seasonal-petal' })).toBeNull();
    expect(screen.UNSAFE_queryByProps({ testID: 'environment-seasonal-particle-0' })).toBeNull();
  });

  test('yields to active precipitation so seasonal and weather particles do not stack (#353)', () => {
    // 겨울(눈) 계절이라도 이미 강수(눈) 날씨가 파티클을 그리면 계절 레이어는 양보한다.
    const screen = render(
      <EnvironmentBackdrop
        phase="day"
        minutesOfDay={12 * 60}
        backgroundColor="#eaf6e6"
        weatherKey="snow"
        seasonalParticle="snow"
      />
    );

    expect(screen.UNSAFE_getByProps({ testID: 'environment-weather-snow' })).toBeTruthy();
    expect(screen.UNSAFE_queryByProps({ testID: 'environment-seasonal-snow' })).toBeNull();

    // 강수 없는 흐림에서는 계절 레이어가 노출된다.
    screen.rerender(
      <EnvironmentBackdrop
        phase="day"
        minutesOfDay={12 * 60}
        backgroundColor="#eaf6e6"
        weatherKey="cloudy"
        seasonalParticle="snow"
      />
    );

    expect(screen.UNSAFE_getByProps({ testID: 'environment-seasonal-snow' })).toBeTruthy();
  });
});
