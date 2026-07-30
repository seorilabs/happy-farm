import React from 'react';
import { render } from '@testing-library/react-native';

import { useAnalyticsTransition, type AnalyticsTransitionKey } from '../useAnalyticsTransition';

function TransitionHarness({
  transitionKey,
  snapshot,
  onTrack,
}: {
  transitionKey: AnalyticsTransitionKey;
  snapshot: string;
  onTrack: (snapshot: string) => void;
}) {
  useAnalyticsTransition(transitionKey, snapshot, onTrack);
  return null;
}

describe('useAnalyticsTransition', () => {
  test('같은 transition key의 재렌더에서는 추적하지 않고 닫았다 다시 열면 최신 snapshot으로 추적한다', () => {
    const firstTrack = jest.fn();
    const secondTrack = jest.fn();
    const screen = render(
      <TransitionHarness transitionKey="shop" snapshot="first" onTrack={firstTrack} />
    );

    expect(firstTrack).toHaveBeenCalledTimes(1);
    expect(firstTrack).toHaveBeenLastCalledWith('first');

    screen.rerender(
      <TransitionHarness transitionKey="shop" snapshot="tick-update" onTrack={secondTrack} />
    );
    expect(firstTrack).toHaveBeenCalledTimes(1);
    expect(secondTrack).not.toHaveBeenCalled();

    screen.rerender(
      <TransitionHarness transitionKey={null} snapshot="closed" onTrack={secondTrack} />
    );
    screen.rerender(
      <TransitionHarness transitionKey="shop" snapshot="reopened" onTrack={secondTrack} />
    );

    expect(secondTrack).toHaveBeenCalledTimes(1);
    expect(secondTrack).toHaveBeenLastCalledWith('reopened');
  });
});
