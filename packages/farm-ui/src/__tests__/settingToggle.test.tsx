import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SettingToggle } from '../components/SheetParts';

test('#575 설정 토글은 현재 값과 비활성 상태를 switch로 제공한다', () => {
  const onPress = jest.fn();
  const view = render(<SettingToggle label="Weather" desc="Rain and snow" value={false} onPress={onPress} />);
  fireEvent.press(view.getByRole('switch', { name: 'Weather', checked: false }));
  expect(onPress).toHaveBeenCalledTimes(1);
  view.rerender(<SettingToggle label="Weather" desc="Rain and snow" value disabled onPress={onPress} />);
  fireEvent.press(view.getByRole('switch', { name: 'Weather', checked: true, disabled: true }));
  expect(onPress).toHaveBeenCalledTimes(1);
});
