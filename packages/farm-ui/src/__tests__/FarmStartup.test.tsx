import React, { useEffect } from 'react';
import { Text } from 'react-native';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInitialState } from '../../../farm-core/src';
import { FarmStartup, type FarmStartupSnapshot } from '../FarmStartup';
import type { FarmGamePersistence } from '../FarmGame';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const art = { background: { uri: 'data:image/jpeg;base64,AA==' }, shade: { uri: 'data:image/png;base64,AA==' } };

function persistence(): FarmGamePersistence & {
  readPersistedGameState: jest.Mock;
  readPersistedGameSettings: jest.Mock;
  writePersistedGameState: jest.Mock;
} {
  return {
    readPersistedGameState: jest.fn(async () => ({ ...createInitialState(), gold: 1234 })),
    readPersistedGameSettings: jest.fn(async () => ({ locale: 'en-US' })),
    readLastSeenAt: jest.fn(async () => 123),
    writePersistedGameState: jest.fn(async () => undefined),
    removePersistedGameState: jest.fn(async () => undefined),
  };
}

afterEach(cleanup);

test('shows real completed reads, waits for the save, and keeps gameplay unmounted until start', async () => {
  const host = persistence();
  const settings = deferred<{ locale: 'en-US' }>();
  const save = deferred<ReturnType<typeof createInitialState>>();
  host.readPersistedGameSettings.mockReturnValue(settings.promise);
  host.readPersistedGameState.mockReturnValue(save.promise);
  const child = jest.fn((snapshot: FarmStartupSnapshot) => <Text testID="game">{snapshot.gameState.gold}</Text>);
  render(
    <FarmStartup art={art} persistence={host}>
      {child}
    </FarmStartup>
  );
  expect(screen.getByTestId('title-progress').props.accessibilityValue.now).toBe(0);
  fireEvent.press(screen.getByTestId('title-start'));
  expect(child).not.toHaveBeenCalled();
  await act(async () => settings.resolve({ locale: 'en-US' }));
  expect(screen.getByTestId('title-progress').props.accessibilityValue.now).toBe(1);
  expect(screen.getByText('Reading your saved farm')).toBeTruthy();
  expect(screen.getByTestId('title-start').props.accessibilityState.disabled).toBe(true);
  expect(host.writePersistedGameState).not.toHaveBeenCalled();
  await act(async () => save.resolve({ ...createInitialState(), gold: 1234 }));
  expect(screen.getByTestId('title-progress').props.accessibilityValue.now).toBe(2);
  expect(child).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Enter Farm'));
  expect(screen.getByText('1234')).toBeTruthy();
  expect(child.mock.calls[0]?.[0].lastSeenAt).toBe(123);
  expect(host.readPersistedGameState).toHaveBeenCalledTimes(1);
  expect(host.readPersistedGameSettings).toHaveBeenCalledTimes(1);
});

test('read failure preserves the save and retry runs real preparation again', async () => {
  const host = persistence();
  host.readPersistedGameState.mockRejectedValueOnce(new Error('unavailable'));
  const child = jest.fn(() => <Text>game</Text>);
  render(
    <FarmStartup art={art} persistence={host}>
      {child}
    </FarmStartup>
  );
  await waitFor(() => expect(screen.getByText('Could not read your farm')).toBeTruthy());
  expect(screen.getByTestId('title-progress').props.accessibilityValue.now).toBe(1);
  expect(child).not.toHaveBeenCalled();
  expect(host.writePersistedGameState).not.toHaveBeenCalled();
  expect(host.removePersistedGameState).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Try Again'));
  await waitFor(() => expect(screen.getByText('Your farm is ready')).toBeTruthy());
  expect(host.readPersistedGameState).toHaveBeenCalledTimes(2);
  expect(host.readPersistedGameSettings).toHaveBeenCalledTimes(2);
  expect(child).not.toHaveBeenCalled();
});

test('rapid start taps mount one game exactly once', async () => {
  const host = persistence();
  const mounted = jest.fn();
  const onStart = jest.fn();
  function Game() {
    useEffect(mounted, []);
    return <Text>game</Text>;
  }
  render(
    <FarmStartup art={art} persistence={host} onStart={onStart}>
      {() => <Game />}
    </FarmStartup>
  );
  await waitFor(() => expect(screen.getByText('Enter Farm')).toBeTruthy());
  const button = screen.getByTestId('title-start');
  act(() => {
    fireEvent.press(button);
    fireEvent.press(button);
  });
  expect(mounted).toHaveBeenCalledTimes(1);
  expect(onStart).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('farm-title')).toBeNull();
  expect(host.readPersistedGameState).toHaveBeenCalledTimes(1);
});

test('settings failure remains at zero and does not start reading or overwriting the game', async () => {
  const host = persistence();
  host.readPersistedGameSettings.mockRejectedValueOnce(new Error('unavailable'));
  render(
    <FarmStartup art={art} persistence={host}>
      {() => <Text>game</Text>}
    </FarmStartup>
  );
  await waitFor(() => expect(screen.getByText('농장을 읽지 못했어요')).toBeTruthy());
  expect(screen.getByTestId('title-progress').props.accessibilityValue.now).toBe(0);
  expect(host.readPersistedGameState).not.toHaveBeenCalled();
  expect(host.writePersistedGameState).not.toHaveBeenCalled();
});

test('ignores late completion from an unmounted startup', async () => {
  const host = persistence();
  const pending = deferred<ReturnType<typeof createInitialState>>();
  host.readPersistedGameState.mockReturnValue(pending.promise);
  const child = jest.fn(() => <Text>game</Text>);
  const view = render(
    <FarmStartup art={art} persistence={host}>
      {child}
    </FarmStartup>
  );
  await waitFor(() => expect(host.readPersistedGameState).toHaveBeenCalledTimes(1));
  view.unmount();
  await act(async () => pending.resolve(createInitialState()));
  expect(child).not.toHaveBeenCalled();
  expect(host.writePersistedGameState).not.toHaveBeenCalled();
});
