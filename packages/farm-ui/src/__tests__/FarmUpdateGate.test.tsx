import React from 'react';
import { AppState, Modal, Platform, Text, type AppStateStatus } from 'react-native';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { FarmUpdateGate } from '../FarmUpdateGate';
import type { FarmUpdateGateController, FarmUpdateGateState } from '../updateGate';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
let foreground: (state: AppStateStatus) => void;
beforeEach(() => {
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    foreground = listener; return { remove: jest.fn() };
  });
});
afterEach(() => { cleanup(); jest.restoreAllMocks(); });

function host(state: FarmUpdateGateState = { kind: 'recommended', message: 'Server message', updateUrl: 'https://play.google.com/store/apps/details?id=test', recommendedVersion: '1.13.0' }) {
  return {
    controller: {
      load: jest.fn<Promise<FarmUpdateGateState>, []>(async () => state),
      shouldPrompt: jest.fn(async () => true),
      markPrompted: jest.fn(async () => undefined),
    } satisfies FarmUpdateGateController,
    onShown: jest.fn(), onStoreClick: jest.fn(), openUrl: jest.fn(async () => undefined),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test('권장 안내는 실제 렌더 뒤 기록하고 닫기와 주소 열기를 제공한다', async () => {
  const h = host(); render(<FarmUpdateGate {...h} locale="en-US" enabled />);
  expect(await screen.findByText('Server message')).toBeTruthy();
  fireEvent(screen.getByTestId('update-gate-modal'), 'show');
  fireEvent(screen.getByTestId('update-gate-card'), 'layout');
  await waitFor(() => expect(h.controller.markPrompted).toHaveBeenCalledTimes(1));
  fireEvent.press(screen.getByTestId('update-gate-open'));
  await waitFor(() => expect(h.openUrl).toHaveBeenCalledWith('https://play.google.com/store/apps/details?id=test'));
  expect(h.onStoreClick).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByTestId('update-gate-later'));
  expect(screen.queryByText('Server message')).toBeNull();
  expect(h.onShown).toHaveBeenCalledTimes(1);
});

test.each(['required', 'maintenance'] as const)('%s 안내는 뒤로와 배경으로 닫히지 않고 주소 없으면 버튼을 만들지 않는다', async (kind) => {
  const h = host({ kind, message: 'Blocked' }); render(<FarmUpdateGate {...h} locale="en-US" enabled />);
  await screen.findByText('Blocked');
  fireEvent(screen.getByTestId('update-gate-modal'), 'show');
  expect(screen.queryByTestId('update-gate-later')).toBeNull();
  expect(screen.queryByTestId('update-gate-open')).toBeNull();
  fireEvent.press(screen.getByTestId('update-gate-backdrop', { includeHiddenElements: true }));
  fireEvent(screen.getByTestId('update-gate-modal'), 'requestClose');
  expect(screen.getByText('Blocked')).toBeTruthy();
  h.controller.load.mockResolvedValue({ kind: 'ok' });
  fireEvent.press(screen.getByTestId('update-gate-retry'));
  await waitFor(() => expect(h.controller.load).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByText('Blocked')).toBeNull());
});

test('노출 이력이 억제한 권장 안내와 ok는 렌더하거나 기록하지 않는다', async () => {
  const h = host(); h.controller.shouldPrompt.mockResolvedValue(false);
  render(<FarmUpdateGate {...h} locale="en-US" enabled />);
  await waitFor(() => expect(h.controller.shouldPrompt).toHaveBeenCalled());
  expect(screen.queryByText('Server message')).toBeNull();
  expect(h.controller.markPrompted).not.toHaveBeenCalled();
  h.controller.load.mockResolvedValue({ kind: 'ok' });
  await act(async () => foreground('active'));
  expect(screen.queryByTestId('update-gate-modal')).toBeNull();
});

test('조회 실패는 화면을 막지 않고 복귀 갱신으로 회복한다', async () => {
  const h = host(); h.controller.load.mockRejectedValueOnce(new Error('offline'));
  render(<FarmUpdateGate {...h} locale="en-US" enabled />);
  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByTestId('update-gate-modal')).toBeNull();
  await act(async () => foreground('active'));
  expect(screen.getByText('Server message')).toBeTruthy();
});

test('늦은 이전 조회가 새 서버 판정을 덮지 못한다', async () => {
  const first = deferred<FarmUpdateGateState>(); const second = deferred<FarmUpdateGateState>(); const h = host();
  h.controller.load.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  render(<FarmUpdateGate {...h} locale="en-US" enabled />);
  await act(async () => foreground('active'));
  await act(async () => second.resolve({ kind: 'required', message: 'Newest policy' }));
  await act(async () => first.resolve({ kind: 'ok' }));
  expect(screen.getByText('Newest policy')).toBeTruthy();
});

test('열린 동일 권장 안내의 복귀 갱신은 노출과 이력을 중복 기록하지 않는다', async () => {
  const h = host(); render(<FarmUpdateGate {...h} locale="en-US" enabled />);
  await screen.findByText('Server message'); fireEvent(screen.getByTestId('update-gate-card'), 'layout');
  h.controller.shouldPrompt.mockResolvedValue(false);
  await act(async () => foreground('active'));
  expect(screen.getByText('Server message')).toBeTruthy();
  expect(h.onShown).toHaveBeenCalledTimes(1);
  expect(h.controller.markPrompted).toHaveBeenCalledTimes(1);
});

test('링크 실패는 현지화해 표시하고 다음 시도에 성공하면 지운다', async () => {
  const h = host(); h.openUrl.mockRejectedValueOnce(new Error('unsupported'));
  render(<FarmUpdateGate {...h} locale="en-US" enabled />); await screen.findByText('Server message');
  fireEvent.press(screen.getByTestId('update-gate-open'));
  expect(await screen.findByText('Could not open the store. Please try again.')).toBeTruthy();
  fireEvent.press(screen.getByTestId('update-gate-open'));
  await waitFor(() => expect(screen.queryByText('Could not open the store. Please try again.')).toBeNull());
  expect(h.onStoreClick).toHaveBeenCalledTimes(2);
});

test('준비 전과 unmount 뒤에는 조회 결과를 노출하거나 기록하지 않는다', async () => {
  const pending = deferred<FarmUpdateGateState>(); const h = host(); h.controller.load.mockReturnValue(pending.promise);
  const view = render(<FarmUpdateGate {...h} locale="en-US" enabled={false} />);
  expect(h.controller.load).not.toHaveBeenCalled();
  view.rerender(<FarmUpdateGate {...h} locale="en-US" enabled />); view.unmount();
  await act(async () => pending.resolve({ kind: 'required', message: 'late' }));
  expect(h.onShown).not.toHaveBeenCalled(); expect(h.controller.markPrompted).not.toHaveBeenCalled();
});

test('기존 화면이 안내를 표시할 수 있을 때까지 노출 이력을 기록하지 않는다', async () => {
  const h = host();
  const view = render(<FarmUpdateGate {...h} locale="en-US" enabled hosted>{() => null}</FarmUpdateGate>);
  await waitFor(() => expect(h.controller.shouldPrompt).toHaveBeenCalled());
  expect(h.onShown).not.toHaveBeenCalled(); expect(h.controller.markPrompted).not.toHaveBeenCalled();
  view.rerender(<FarmUpdateGate {...h} locale="en-US" enabled hosted>{(gate) => gate?.node}</FarmUpdateGate>);
  await screen.findByText('Server message'); fireEvent(screen.getByTestId('update-gate-card'), 'layout');
  await waitFor(() => expect(h.controller.markPrompted).toHaveBeenCalledTimes(1));
});

test('시작 화면에서 게임으로 넘어가면 이전 네이티브 창이 닫힌 뒤 안내를 넘긴다', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const h = host();
  const children = (gate: import('../updateGate').FarmUpdateGatePresentation | null) => <Text testID="host-state">{gate?.canPresent === false ? 'waiting' : 'ready'}</Text>;
  const view = render(<FarmUpdateGate {...h} locale="en-US" enabled>{children}</FarmUpdateGate>);
  await screen.findByText('Server message');
  fireEvent(screen.getByTestId('update-gate-modal'), 'show');
  view.rerender(<FarmUpdateGate {...h} locale="en-US" enabled hosted>{children}</FarmUpdateGate>);
  expect(screen.getByText('waiting')).toBeTruthy();
  act(() => view.UNSAFE_getByType(Modal).props.onDismiss());
  expect(screen.getByText('ready')).toBeTruthy();
  expect(screen.queryByTestId('update-gate-modal')).toBeNull();
});
