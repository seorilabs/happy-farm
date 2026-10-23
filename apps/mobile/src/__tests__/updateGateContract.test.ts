import { Config, type UpdateGateState } from '@seorilabs/platform-sdk';
import { createUpdateGateStore, UPDATE_GATE_STORAGE_KEY } from '../../../../packages/farm-ui/src/updateGate';

const DAY = 24 * 60 * 60 * 1_000;
const START = 1_800_000_000_000;
const target = { appVersion: '9.9.9', platform: 'android' as const, locale: 'en-US' };
const configData = (status = 'deprecated', version = '1.13.0') => ({
  values: {}, features: {}, sdk: { status, recommendedVersion: version }, maintenance: { active: false },
});

function setup() {
  const values = new Map<string, string>();
  const storage = {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
  };
  let now = START;
  const request = jest.fn(async () => configData());
  const makeConfig = () => new Config({
    transport: { request } as unknown as ConstructorParameters<typeof Config>[0]['transport'],
    gateStore: createUpdateGateStore(storage),
    now: () => now,
    ttlMs: 0,
  });
  return { values, storage, request, makeConfig, setNow: (value: number) => { now = value; } };
}

test('실제 SDK가 재시작 후 24시간, 권장 버전 변경과 시계 역행을 판단한다', async () => {
  const h = setup(); const first = h.makeConfig();
  await first.fetch(target); const state = first.gate();
  // 앱 버전보다 낮은 권장 버전도 서버 판정 그대로 표시하며 재비교하지 않는다.
  expect(state.kind).toBe('recommended');
  expect(await first.shouldPrompt(state)).toBe(true);
  await first.markPrompted(state);
  expect(JSON.parse(h.values.get(UPDATE_GATE_STORAGE_KEY)!)).toEqual({ version: '1.13.0', promptedAt: START });
  const restarted = h.makeConfig(); await restarted.fetch(target);
  h.setNow(START + DAY - 1); expect(await restarted.shouldPrompt(state)).toBe(false);
  h.setNow(START + DAY); expect(await restarted.shouldPrompt(state)).toBe(true);
  h.setNow(START + 1); h.request.mockResolvedValue(configData('deprecated', '1.14.0'));
  await restarted.fetch(target); expect(await restarted.shouldPrompt(restarted.gate())).toBe(true);
  h.setNow(START - 1); expect(await restarted.shouldPrompt(state)).toBe(true);
});

test('최초 조회 실패는 열린 상태이며 이미 받은 서버 판정은 SDK 캐시를 따른다', async () => {
  const h = setup(); const config = h.makeConfig();
  h.request.mockRejectedValueOnce(new Error('offline'));
  await config.fetch(target); expect(config.gate()).toEqual({ kind: 'ok' });
  h.request.mockResolvedValue(configData('blocked'));
  await config.fetch(target); expect(config.gate().kind).toBe('required');
  h.request.mockRejectedValueOnce(new Error('offline'));
  await config.fetch(target); expect(config.gate().kind).toBe('required');
});

test('강제 안내와 점검은 이력과 무관하며 권장 이력만 기록한다', async () => {
  const h = setup(); const config = h.makeConfig();
  const states: UpdateGateState[] = [{ kind: 'required', message: 'update' }, { kind: 'maintenance', message: 'maintenance' }];
  for (const state of states) {
    expect(await config.shouldPrompt(state)).toBe(true);
    await config.markPrompted(state);
  }
  expect(h.storage.getItem).not.toHaveBeenCalled();
  expect(h.storage.setItem).not.toHaveBeenCalled();
});

test.each(['{', 'null', '{}', '{"version":"1.13.0","promptedAt":null}', '{"version":"1.13.0","promptedAt":-1}', '{"version":"1.13.0","promptedAt":"1"}'])('잘못된 저장 이력은 안내를 영구 억제하지 않는다: %s', async (raw) => {
  const h = setup(); h.values.set(UPDATE_GATE_STORAGE_KEY, raw);
  const config = h.makeConfig(); await config.fetch(target);
  expect(await config.shouldPrompt(config.gate())).toBe(true);
});

test('이력 읽기와 쓰기 실패도 SDK를 통해 처리한다', async () => {
  const h = setup(); h.storage.getItem.mockRejectedValue(new Error('read failed'));
  h.storage.setItem.mockRejectedValue(new Error('write failed'));
  const config = h.makeConfig(); await config.fetch(target);
  expect(await config.shouldPrompt(config.gate())).toBe(true);
  await expect(config.markPrompted(config.gate())).resolves.toBeUndefined();
});
