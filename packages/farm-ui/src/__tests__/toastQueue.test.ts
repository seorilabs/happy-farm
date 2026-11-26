/// <reference types="jest" />

import {
  EMPTY_TOAST_QUEUE,
  TOAST_DURATION_MS,
  TOAST_HURRIED_DURATION_MS,
  TOAST_MAX_PENDING,
  TOAST_MERGE_WINDOW_MS,
  advanceToast,
  enqueueToast,
  getToastDismissAt,
} from '../toastQueue';

const NOW = 1_700_000_000_000;

describe('toastQueue (#606 AC-9)', () => {
  test('보이는 토스트가 없으면 바로 띄우고 기본 시간 동안 둔다', () => {
    const state = enqueueToast(EMPTY_TOAST_QUEUE, 'A', NOW);
    expect(state.current).toEqual({ message: 'A', shownAt: NOW });
    expect(getToastDismissAt(state)).toBe(NOW + TOAST_DURATION_MS);
  });

  test('연달아 오면 덮어쓰지 않고 차례로 보여 준다', () => {
    let state = enqueueToast(EMPTY_TOAST_QUEUE, 'A', NOW);
    state = enqueueToast(state, 'B', NOW + 100);
    expect(state.current?.message).toBe('A');
    expect(state.pending).toEqual(['B']);

    state = advanceToast(state, NOW + 900);
    expect(state.current).toEqual({ message: 'B', shownAt: NOW + 900 });
    expect(state.pending).toEqual([]);
    expect(advanceToast(state, NOW + 2_700).current).toBeNull();
  });

  test('뒤에 기다리는 토스트가 있으면 지금 토스트를 짧게 보여 준다', () => {
    let state = enqueueToast(EMPTY_TOAST_QUEUE, 'A', NOW);
    state = enqueueToast(state, 'B', NOW + 100);
    expect(getToastDismissAt(state)).toBe(NOW + TOAST_HURRIED_DURATION_MS);
  });

  test('같은 문구가 합치기 시간 안에 다시 오면 하나로 합친다', () => {
    let state = enqueueToast(EMPTY_TOAST_QUEUE, 'A', NOW);
    state = enqueueToast(state, 'A', NOW + TOAST_MERGE_WINDOW_MS);
    expect(state.pending).toEqual([]);

    state = enqueueToast(state, 'B', NOW + 600);
    state = enqueueToast(state, 'B', NOW + 650);
    expect(state.pending).toEqual(['B']);
  });

  test('대기열은 최근 것만 남긴다', () => {
    let state = enqueueToast(EMPTY_TOAST_QUEUE, 'A', NOW);
    for (const message of ['B', 'C', 'D', 'E']) {
      state = enqueueToast(state, message, NOW + 10);
    }
    expect(state.pending).toHaveLength(TOAST_MAX_PENDING);
    expect(state.pending).toEqual(['C', 'D', 'E']);
  });
});
