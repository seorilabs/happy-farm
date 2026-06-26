// Firebase(Firestore/Auth 등) 네트워크 호출에 공통으로 적용하는 타임아웃·재시도
// 정책. Firebase SDK는 오프라인 캐시는 두지만 호출 자체가 무한정 매달릴 수 있어,
// 게임 로딩을 막는 경로(클라우드 복원 등)가 영원히 대기하지 않도록 상한을 둔다.
// 일시적 실패는 지수 백오프로 제한적으로 재시도하고, 모두 소진되면 마지막 에러를
// 그대로 던져 호출 측의 Crashlytics 기록 경로로 일관되게 흘려보낸다.

export const DEFAULT_NETWORK_TIMEOUT_MS = 10_000;
export const DEFAULT_NETWORK_RETRIES = 2;
export const DEFAULT_NETWORK_RETRY_BASE_DELAY_MS = 500;

type TimerHandle = ReturnType<typeof setTimeout>;

// 타임아웃으로 중단된 호출임을 호출 측/Crashlytics에서 식별할 수 있도록 별도 타입.
export class NetworkTimeoutError extends Error {
  readonly label: string;
  readonly timeoutMs: number;

  constructor(label: string, timeoutMs: number) {
    super(`Network operation "${label}" timed out after ${timeoutMs}ms`);
    this.name = 'NetworkTimeoutError';
    this.label = label;
    this.timeoutMs = timeoutMs;
  }
}

export type NetworkPolicyOptions = {
  // Crashlytics/타임아웃 메시지에 쓰이는 호출 식별자.
  label: string;
  timeoutMs?: number;
  // 재시도 횟수(최초 시도 제외). 0이면 한 번만 시도한다.
  retries?: number;
  retryBaseDelayMs?: number;
  // 테스트에서 시간 제어를 위해 주입 가능. 미주입 시 전역 타이머 사용.
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
  // 재시도 가치가 없는 에러(예: 영구적 권한 오류)를 걸러내고 싶을 때 사용.
  shouldRetry?: (error: unknown) => boolean;
};

function withTimeout<T>(
  operation: () => Promise<T>,
  label: string,
  timeoutMs: number,
  setTimer: NonNullable<NetworkPolicyOptions['setTimer']>,
  clearTimer: NonNullable<NetworkPolicyOptions['clearTimer']>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const timer = setTimer(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new NetworkTimeoutError(label, timeoutMs));
    }, timeoutMs);

    operation().then(
      (value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimer(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimer(timer);
        reject(error);
      }
    );
  });
}

// 주어진 비동기 작업을 타임아웃 상한 + 지수 백오프 재시도로 감싼다. 성공 시 결과를
// 반환하고, 재시도를 모두 소진하면 마지막 에러를 던진다.
export async function runWithNetworkPolicy<T>(
  operation: () => Promise<T>,
  options: NetworkPolicyOptions
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_NETWORK_TIMEOUT_MS;
  const retries = Math.max(0, options.retries ?? DEFAULT_NETWORK_RETRIES);
  const retryBaseDelayMs = options.retryBaseDelayMs ?? DEFAULT_NETWORK_RETRY_BASE_DELAY_MS;
  const setTimer = options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
  const shouldRetry = options.shouldRetry ?? (() => true);

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await withTimeout(operation, options.label, timeoutMs, setTimer, clearTimer);
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !shouldRetry(error)) {
        break;
      }
      // 지수 백오프: base * 2^attempt (0.5s, 1s, 2s, ...).
      const delayMs = retryBaseDelayMs * 2 ** attempt;
      await new Promise<void>((resolve) => {
        setTimer(() => resolve(), delayMs);
      });
    }
  }

  throw lastError;
}
