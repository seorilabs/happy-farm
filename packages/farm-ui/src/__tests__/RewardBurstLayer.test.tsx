/// <reference types="jest" />

import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';

import { RewardBurstLayer } from '../components/RewardBurstLayer';
import { REWARD_BURST_COIN_COUNT, REWARD_BURST_TOTAL_MS } from '../rewardBurst';

describe('RewardBurstLayer (#606 AC-3)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('금액과 코인을 그리고 연출 시간이 끝나면 완료를 알린다', () => {
    const onDone = jest.fn();
    const view = render(
      <RewardBurstLayer
        bursts={[{ id: 7, amountLabel: '+1,200', from: { x: 200, y: 600 }, to: { x: 60, y: 120 } }]}
        renderCoin={() => <Text>🪙</Text>}
        onDone={onDone}
      />
    );

    expect(view.getByTestId('reward-burst-7')).toBeTruthy();
    expect(view.getByText('+1,200')).toBeTruthy();
    expect(view.getAllByText('🪙')).toHaveLength(REWARD_BURST_COIN_COUNT);

    act(() => {
      jest.advanceTimersByTime(REWARD_BURST_TOTAL_MS - 1);
    });
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onDone).toHaveBeenCalledWith(7);
  });

  test('입력을 막지 않는다', () => {
    const view = render(
      <RewardBurstLayer
        bursts={[{ id: 1, amountLabel: '+5', from: { x: 0, y: 0 }, to: { x: 10, y: 10 } }]}
        renderCoin={() => <Text>🪙</Text>}
        onDone={jest.fn()}
      />
    );
    expect(view.getByTestId('reward-burst-layer').props.pointerEvents).toBe('none');
  });
});
