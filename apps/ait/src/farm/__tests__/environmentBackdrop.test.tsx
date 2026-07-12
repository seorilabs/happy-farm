/// <reference types="jest" />

import React from 'react';
import { StyleSheet } from 'react-native';
import { cleanup, render } from '@testing-library/react-native';

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
});
