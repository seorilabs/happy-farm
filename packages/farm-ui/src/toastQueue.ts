// 토스트 큐(#606 AC-9). 예전에는 새 토스트가 오면 보이던 것을 바로 덮어써서 연달아 일어난 결과를
// 놓쳤다. 한 번에 하나만 보이되 차례로 보여 주고, 같은 문구의 연타는 하나로 합친다.
export const TOAST_DURATION_MS = 1_800;
// 뒤에 기다리는 토스트가 있으면 지금 것을 짧게 보여 주고 넘긴다. 피드백이 늦어지지 않게 한다.
export const TOAST_HURRIED_DURATION_MS = 900;
export const TOAST_MERGE_WINDOW_MS = 500;
export const TOAST_MAX_PENDING = 3;

export type ToastQueueState = {
  current: { message: string; shownAt: number } | null;
  pending: string[];
};

export const EMPTY_TOAST_QUEUE: ToastQueueState = { current: null, pending: [] };

export function enqueueToast(state: ToastQueueState, message: string, now: number): ToastQueueState {
  if (state.current == null) {
    return { current: { message, shownAt: now }, pending: [] };
  }
  if (state.current.message === message && now - state.current.shownAt <= TOAST_MERGE_WINDOW_MS) {
    return state;
  }
  if (state.pending.includes(message)) {
    return state;
  }
  return { ...state, pending: [...state.pending, message].slice(-TOAST_MAX_PENDING) };
}

export function advanceToast(state: ToastQueueState, now: number): ToastQueueState {
  const [next, ...rest] = state.pending;
  return next == null ? EMPTY_TOAST_QUEUE : { current: { message: next, shownAt: now }, pending: rest };
}

export function getToastDismissAt(state: ToastQueueState): number | null {
  if (state.current == null) return null;
  const duration = state.pending.length > 0 ? TOAST_HURRIED_DURATION_MS : TOAST_DURATION_MS;
  return state.current.shownAt + duration;
}
