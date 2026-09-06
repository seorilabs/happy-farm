import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { Presence, SDK_VERSION } from '@seorilabs/platform-sdk';

// 선언한 exact 버전이 실제로 설치돼 있어야 이 테스트가 그 버전의 동작을 본 것이 된다.
// 버전 숫자를 여기 박아 두면 SDK를 올릴 때마다 무관한 파일을 고쳐야 한다.
const DECLARED_SDK_VERSION = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
).dependencies['@seorilabs/platform-sdk'];

const CONTEXT = { platform: 'ait', appVersion: '1.0.0' };
const BOOTSTRAP = {
  enabled: true,
  token: 'ephemeral-presence-token',
  edgeUrl: 'https://presence-edge.invalid',
  expiresIn: 300,
  heartbeatIntervalSeconds: 60,
};

function createTimerHarness() {
  let resolveScheduled;
  const scheduled = new Promise((resolve) => {
    resolveScheduled = resolve;
  });
  return {
    scheduled,
    setTimer: () => {
      resolveScheduled();
      return { unref() {} };
    },
    clearTimer: () => {},
  };
}

test('선언한 exact SDK에서 기본 비활성 Presence는 네트워크를 열지 않는다', async () => {
  assert.match(DECLARED_SDK_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(SDK_VERSION, DECLARED_SDK_VERSION);

  let tokenRequests = 0;
  let edgeRequests = 0;
  const presence = new Presence({
    enabled: false,
    context: CONTEXT,
    tokenTransport: {
      request: async () => {
        tokenRequests += 1;
        return BOOTSTRAP;
      },
    },
    fetchImpl: async () => {
      edgeRequests += 1;
      return { ok: true, status: 204, headers: { get: () => null } };
    },
  });

  presence.start();
  presence.resume();
  await delay(0);
  presence.stop();

  assert.equal(tokenRequests, 0);
  assert.equal(edgeRequests, 0);
});

const edgeFailures = [
  {
    name: '503',
    fetchImpl: async () => ({ ok: false, status: 503, headers: { get: () => null } }),
  },
  {
    name: 'DNS',
    fetchImpl: async () => {
      throw new TypeError('fetch failed: ENOTFOUND');
    },
  },
  {
    name: 'TLS',
    fetchImpl: async () => {
      throw new TypeError('fetch failed: certificate verification');
    },
  },
  {
    name: '2초 timeout',
    fetchImpl: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          'abort',
          () => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })),
          { once: true },
        );
      }),
  },
];

for (const failure of edgeFailures) {
  test(`Edge ${failure.name} 실패가 제품 흐름을 막거나 오류를 전파하지 않는다`, async () => {
    const timers = createTimerHarness();
    let coreActionCount = 0;
    const presence = new Presence({
      enabled: true,
      context: CONTEXT,
      tokenTransport: {
        request: async (request) => {
          assert.equal(request.path, '/v1/presence/token');
          assert.equal(request.noRetry, true);
          return BOOTSTRAP;
        },
      },
      fetchImpl: async (url, init) => {
        assert.equal(url, 'https://presence-edge.invalid/v1/presence/heartbeat');
        assert.equal(init.credentials, 'omit');
        return failure.fetchImpl(url, init);
      },
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });

    assert.doesNotThrow(() => presence.start());
    coreActionCount += 1;
    assert.equal(coreActionCount, 1);

    await timers.scheduled;
    coreActionCount += 1;
    assert.equal(coreActionCount, 2);
    presence.stop();
  });
}
