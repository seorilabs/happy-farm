/// <reference types="jest" />

import React from 'react';
import { act, render } from '@testing-library/react-native';

import { CountUpText } from '../components/CountUpText';
import { REWARD_COUNT_UP_DELAY_MS, REWARD_COUNT_UP_DURATION_MS } from '../rewardBurst';

const NOW = 1_700_000_000_000;
const format = (value: number) => `${value}G`;

describe('CountUpText (#606 AC-3)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  test('연출 시작 전에는 지급 전 값을 붙잡고, 시작하면 실제 잔액까지 올린다', () => {
    const held = { from: 100, to: 500, startedAt: Number.POSITIVE_INFINITY };
    const view = render(<CountUpText value={500} run={held} format={format} />);
    expect(view.getByText('100G')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(view.getByText('100G')).toBeTruthy();

    view.rerender(<CountUpText value={500} run={{ ...held, startedAt: Date.now() }} format={format} />);
    act(() => {
      jest.advanceTimersByTime(REWARD_COUNT_UP_DELAY_MS + REWARD_COUNT_UP_DURATION_MS + 50);
    });
    expect(view.getByText('500G')).toBeTruthy();
  });

  test('잔액이 목표와 다르면(그사이 수확 등) 바로 실제 값을 보인다', () => {
    const view = render(
      <CountUpText value={520} run={{ from: 100, to: 500, startedAt: Date.now() }} format={format} />
    );
    expect(view.getByText('520G')).toBeTruthy();
  });
});
