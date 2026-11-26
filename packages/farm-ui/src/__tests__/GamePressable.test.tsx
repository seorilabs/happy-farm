/// <reference types="jest" />

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import { GameFeedbackContext, GamePressable, PRESSED_DEPTH_STYLE } from '../components/GamePressable';

function renderWithFeedback(element: React.ReactElement, playTap = jest.fn()) {
  const view = render(<GameFeedbackContext.Provider value={{ playTap }}>{element}</GameFeedbackContext.Provider>);
  return { view, playTap };
}

describe('GamePressable (#606 AC-8)', () => {
  test('누르면 탭음을 먼저 내고 원래 동작을 실행한다', () => {
    const order: string[] = [];
    const onPress = jest.fn(() => order.push('press'));
    const { view, playTap } = renderWithFeedback(
      <GamePressable testID="btn" onPress={onPress}>
        <Text>OK</Text>
      </GamePressable>,
      jest.fn(() => order.push('tap'))
    );

    fireEvent.press(view.getByTestId('btn'));

    expect(playTap).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['tap', 'press']);
  });

  test('자체 효과음이 있는 버튼은 silent로 탭음을 끈다', () => {
    const onPress = jest.fn();
    const { view, playTap } = renderWithFeedback(
      <GamePressable testID="btn" silent onPress={onPress}>
        <Text>OK</Text>
      </GamePressable>
    );

    fireEvent.press(view.getByTestId('btn'));

    expect(playTap).not.toHaveBeenCalled();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('비활성 버튼은 소리도 동작도 없다', () => {
    const onPress = jest.fn();
    const { view, playTap } = renderWithFeedback(
      <GamePressable testID="btn" disabled onPress={onPress}>
        <Text>OK</Text>
      </GamePressable>
    );

    fireEvent.press(view.getByTestId('btn'));

    expect(playTap).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });

  test('누르는 동안 아래 두께를 줄이고 같은 양만큼 내려앉는다', () => {
    const idle = render(
      <GamePressable testID="btn" style={{ borderBottomWidth: 4 }} pressedStyle={PRESSED_DEPTH_STYLE} onPress={jest.fn()}>
        <Text>OK</Text>
      </GamePressable>
    );
    expect(StyleSheet.flatten(idle.getByTestId('btn').props.style)).toMatchObject({ borderBottomWidth: 4 });

    const pressed = render(
      <GamePressable
        testID="btn-pressed"
        testOnly_pressed
        style={{ borderBottomWidth: 4 }}
        pressedStyle={PRESSED_DEPTH_STYLE}
        onPress={jest.fn()}
      >
        <Text>OK</Text>
      </GamePressable>
    );
    expect(StyleSheet.flatten(pressed.getByTestId('btn-pressed').props.style)).toMatchObject({
      borderBottomWidth: 2,
      transform: [{ translateY: 2 }],
    });
  });

  test('공급자가 없으면 탭음 없이 동작한다', () => {
    const onPress = jest.fn();
    const view = render(
      <GamePressable testID="btn" onPress={onPress}>
        <Text>OK</Text>
      </GamePressable>
    );

    fireEvent.press(view.getByTestId('btn'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
