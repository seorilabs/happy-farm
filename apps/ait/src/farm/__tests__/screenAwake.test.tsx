/// <reference types="jest" />

import React from 'react';
import { cleanup, render } from '@testing-library/react-native';

const mockSetScreenAwakeMode = jest.fn(() => Promise.resolve({ enabled: true }));
let mockIsVisible = true;

jest.mock('@apps-in-toss/framework', () => ({
  setScreenAwakeMode: mockSetScreenAwakeMode,
}));
jest.mock('@granite-js/react-native', () => ({
  useVisibility: () => mockIsVisible,
}));

const { useAppsInTossScreenAwake } =
  jest.requireActual<typeof import('../platform/screenAwake')>('../platform/screenAwake');
function Harness() {
  useAppsInTossScreenAwake();
  return null;
}

describe('useAppsInTossScreenAwake', () => {
  beforeEach(() => {
    mockIsVisible = true;
    mockSetScreenAwakeMode.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  test('enables only while the Granite screen is visible and disables on unmount', () => {
    const screen = render(<Harness />);

    expect(mockSetScreenAwakeMode).toHaveBeenLastCalledWith({ enabled: true });

    mockIsVisible = false;
    screen.rerender(<Harness />);
    expect(mockSetScreenAwakeMode).toHaveBeenLastCalledWith({ enabled: false });

    mockIsVisible = true;
    screen.rerender(<Harness />);
    expect(mockSetScreenAwakeMode).toHaveBeenLastCalledWith({ enabled: true });

    screen.unmount();
    expect(mockSetScreenAwakeMode).toHaveBeenLastCalledWith({ enabled: false });
  });
});
