/// <reference types="jest" />

import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react-native';

import {
  DECORATIONS,
  DECORATION_GRID_SLOT_COUNT,
  createInitialState,
  type GameState,
} from '../../../../../packages/farm-core/src';
import { getFarmMessages } from '../../../../../packages/farm-ui/src';
import { DecorationLayoutSheet } from '../../../../../packages/farm-ui/src/components/DecorationLayoutSheet';

const messages = getFarmMessages('ko-KR');

afterEach(cleanup);

describe('DecorationLayoutSheet (#370)', () => {
  function decoratedState(): GameState {
    const base = createInitialState();
    return {
      ...base,
      placedDecorations: [
        { key: DECORATIONS[0]!.key, slot: 0 },
        { key: DECORATIONS[1]!.key, slot: null },
      ],
    };
  }

  test('renders the fixed grid and places a stored item into a selected empty slot', () => {
    const state = decoratedState();
    const onPlace = jest.fn();
    const screen = render(
      <DecorationLayoutSheet
        gameState={state}
        locale="ko-KR"
        messages={messages}
        onPlace={onPlace}
        onStore={jest.fn()}
      />
    );

    for (let slot = 0; slot < DECORATION_GRID_SLOT_COUNT; slot += 1) {
      expect(screen.getByTestId(`decoration-slot-${slot}`)).toBeTruthy();
    }
    expect(screen.getByTestId('decoration-slot-1').props.accessibilityState.disabled).toBe(true);

    fireEvent.press(screen.getByTestId(`decoration-inventory-${DECORATIONS[1]!.key}`));
    expect(screen.getByTestId('decoration-slot-1').props.accessibilityState.disabled).toBe(false);
    fireEvent.press(screen.getByTestId('decoration-slot-1'));

    expect(onPlace).toHaveBeenCalledTimes(1);
    expect(onPlace).toHaveBeenCalledWith(DECORATIONS[1]!.key, 1);
  });

  test('selects a placed item and exposes its store action', () => {
    const onStore = jest.fn();
    const screen = render(
      <DecorationLayoutSheet
        gameState={decoratedState()}
        locale="ko-KR"
        messages={messages}
        onPlace={jest.fn()}
        onStore={onStore}
      />
    );

    fireEvent.press(screen.getByTestId('decoration-slot-0'));
    fireEvent.press(screen.getByTestId('decoration-store-action'));

    expect(onStore).toHaveBeenCalledTimes(1);
    expect(onStore).toHaveBeenCalledWith(DECORATIONS[0]!.key);
  });

  test('shows an empty state when no decorations are owned', () => {
    const screen = render(
      <DecorationLayoutSheet
        gameState={createInitialState()}
        locale="ko-KR"
        messages={messages}
        onPlace={jest.fn()}
        onStore={jest.fn()}
      />
    );

    expect(screen.getByText(messages.decorationLayoutEmpty)).toBeTruthy();
    expect(screen.queryByTestId('decoration-layout-grid')).toBeNull();
  });
});
