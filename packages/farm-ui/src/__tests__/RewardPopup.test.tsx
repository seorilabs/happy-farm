/// <reference types="jest" />

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

import { RewardPopup } from '../components/RewardPopup';

describe('RewardPopup (1회차 #2, #6)', () => {
  test('리본 제목, 받은 금액, 확인 버튼 하나를 보이고 확인을 누르면 알린다', () => {
    const onConfirm = jest.fn();
    const view = render(
      <RewardPopup
        testID="reward-popup"
        title="First harvest complete!"
        subtitle="Your farm is up and running."
        amount={{ value: 14, format: (value) => `+${value}` }}
        confirmLabel="Continue"
        confirmTestID="reward-confirm"
        motionEnabled={false}
        onConfirm={onConfirm}
      />
    );
    expect(view.getByText('First harvest complete!')).toBeTruthy();
    expect(view.getByText('+14')).toBeTruthy();
    expect(view.getByText('Your farm is up and running.')).toBeTruthy();
    fireEvent.press(view.getByTestId('reward-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test('움직임이 켜져 있으면 금액이 0에서 받은 값까지 올라간다', () => {
    jest.useFakeTimers();
    try {
      const view = render(
        <RewardPopup
          title="Daily bonus"
          amount={{ value: 400, format: (value) => `+${value}` }}
          confirmLabel="OK"
          motionEnabled
          onConfirm={() => undefined}
        />
      );
      expect(view.queryByText('+400')).toBeNull();
      act(() => {
        jest.advanceTimersByTime(2_000);
      });
      expect(view.getByText('+400')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  test('금액을 모르면(이어 하기) 코인만 보인다', () => {
    const view = render(
      <RewardPopup title="First harvest complete!" confirmLabel="Continue" motionEnabled={false} onConfirm={() => undefined} />
    );
    expect(view.queryByTestId('reward-popup-amount')).toBeNull();
  });
});
