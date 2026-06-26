import { NetworkTimeoutError, runWithNetworkPolicy } from '../network';

describe('runWithNetworkPolicy', () => {
  test('returns the operation result when it resolves within the timeout', async () => {
    const operation = jest.fn(async () => 'ok');

    await expect(
      runWithNetworkPolicy(operation, { label: 'test:resolve', timeoutMs: 50, retries: 0 })
    ).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  test('rejects with NetworkTimeoutError when the operation hangs past the timeout', async () => {
    // A never-resolving operation must be cut off by the timeout rather than hang.
    const operation = jest.fn(() => new Promise<string>(() => undefined));

    await expect(
      runWithNetworkPolicy(operation, { label: 'test:hang', timeoutMs: 20, retries: 0 })
    ).rejects.toBeInstanceOf(NetworkTimeoutError);
  });

  test('retries a transient failure and then succeeds', async () => {
    let calls = 0;
    const operation = jest.fn(async () => {
      calls += 1;
      if (calls < 2) {
        throw new Error('transient');
      }
      return 'recovered';
    });

    await expect(
      runWithNetworkPolicy(operation, {
        label: 'test:retry',
        timeoutMs: 50,
        retries: 2,
        retryBaseDelayMs: 1,
      })
    ).resolves.toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  test('throws the last error after exhausting retries', async () => {
    const operation = jest.fn(async () => {
      throw new Error('always fails');
    });

    await expect(
      runWithNetworkPolicy(operation, {
        label: 'test:exhaust',
        timeoutMs: 50,
        retries: 2,
        retryBaseDelayMs: 1,
      })
    ).rejects.toThrow('always fails');
    // 최초 1회 + 재시도 2회 = 3회 호출.
    expect(operation).toHaveBeenCalledTimes(3);
  });

  test('does not retry when shouldRetry returns false', async () => {
    const operation = jest.fn(async () => {
      throw new Error('permanent');
    });

    await expect(
      runWithNetworkPolicy(operation, {
        label: 'test:no-retry',
        timeoutMs: 50,
        retries: 3,
        retryBaseDelayMs: 1,
        shouldRetry: () => false,
      })
    ).rejects.toThrow('permanent');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
