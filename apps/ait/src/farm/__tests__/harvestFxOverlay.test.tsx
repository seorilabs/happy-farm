/// <reference types="jest" />

import React from 'react';
import { Animated } from 'react-native';
import { act, cleanup, render } from '@testing-library/react-native';

import {
  HARVEST_BURST_DURATION_MS,
  HARVEST_BURST_PARTICLE_COUNT,
  HARVEST_FX_MAX_CONCURRENT,
  HarvestFxOverlay,
  type HarvestFxHandle,
} from '../../../../../packages/farm-ui/src/FarmGame';

function countHostTestIDs(node: unknown, matches: (testID: string) => boolean): number {
  if (Array.isArray(node)) {
    return node.reduce((total, child) => total + countHostTestIDs(child, matches), 0);
  }
  if (typeof node !== 'object' || node == null) {
    return 0;
  }
  const rendered = node as { props?: { testID?: unknown }; children?: unknown[] | null };
  const testID = typeof rendered.props?.testID === 'string' ? rendered.props.testID : null;
  return (testID != null && matches(testID) ? 1 : 0) + countHostTestIDs(rendered.children, matches);
}

describe('HarvestFxOverlay (#368)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('spawns a non-interactive coin and sparkle burst with the existing text pop', () => {
    const timingSpy = jest.spyOn(Animated, 'timing');
    const ref = React.createRef<HarvestFxHandle>();
    const screen = render(<HarvestFxOverlay ref={ref} tileSize={72} />);

    act(() => {
      ref.current?.spawn(0, '+14', 'normal');
    });

    const burst = screen.UNSAFE_getByProps({ testID: 'harvest-burst-1' });
    expect(burst.props.accessible).toBe(false);
    expect(burst.props.accessibilityElementsHidden).toBe(true);
    expect(burst.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(countHostTestIDs(screen.toJSON(), (testID) => testID.startsWith('harvest-particle-'))).toBe(
      HARVEST_BURST_PARTICLE_COUNT
    );
    expect(countHostTestIDs(screen.toJSON(), (testID) => testID === 'harvest-particle-coin')).toBe(3);
    expect(countHostTestIDs(screen.toJSON(), (testID) => testID === 'harvest-particle-spark')).toBe(3);
    expect(screen.getByTestId('harvest-pop-normal')).toHaveTextContent('+14');
    expect(timingSpy.mock.calls.some(([, config]) => config.duration === HARVEST_BURST_DURATION_MS)).toBe(true);

    timingSpy.mockRestore();
  });

  test('caps rapid harvest bursts and all of their particle nodes', () => {
    const ref = React.createRef<HarvestFxHandle>();
    const screen = render(<HarvestFxOverlay ref={ref} tileSize={72} />);

    act(() => {
      for (let index = 0; index < HARVEST_FX_MAX_CONCURRENT + 3; index += 1) {
        ref.current?.spawn(index, `+${index + 1}`, 'normal');
      }
    });

    expect(screen.UNSAFE_queryByProps({ testID: 'harvest-burst-1' })).toBeNull();
    expect(screen.UNSAFE_queryByProps({ testID: 'harvest-burst-2' })).toBeNull();
    expect(screen.UNSAFE_queryByProps({ testID: 'harvest-burst-3' })).toBeNull();
    expect(countHostTestIDs(screen.toJSON(), (testID) => testID.startsWith('harvest-burst-'))).toBe(
      HARVEST_FX_MAX_CONCURRENT
    );
    expect(
      countHostTestIDs(screen.toJSON(), (testID) => testID.startsWith('harvest-particle-'))
    ).toBe(HARVEST_FX_MAX_CONCURRENT * HARVEST_BURST_PARTICLE_COUNT);
  });

  test('self-removes the text and particle burst after the animation finishes', () => {
    const ref = React.createRef<HarvestFxHandle>();
    const screen = render(<HarvestFxOverlay ref={ref} tileSize={72} />);

    act(() => {
      ref.current?.spawn(0, '+14', 'normal');
    });
    expect(screen.UNSAFE_getByProps({ testID: 'harvest-burst-1' })).toBeTruthy();

    act(() => {
      jest.runAllTimers();
    });

    expect(screen.UNSAFE_queryByProps({ testID: 'harvest-burst-1' })).toBeNull();
    expect(screen.UNSAFE_queryByProps({ testID: 'harvest-pop-normal' })).toBeNull();
    expect(countHostTestIDs(screen.toJSON(), (testID) => testID.startsWith('harvest-particle-'))).toBe(0);
  });
});
