/// <reference types="jest" />

import {
  REWARD_BURST_COIN_COUNT,
  REWARD_COUNT_UP_DELAY_MS,
  REWARD_COUNT_UP_DURATION_MS,
  getBurstScatterOffsets,
  getCountUpValue,
  resolveBurstOrigin,
} from '../rewardBurst';

describe('보상 연출 계산 (#606 AC-3)', () => {
  test('카운트업은 코인이 도착할 때 시작해 정확히 실제 잔액에서 끝난다', () => {
    const run = { from: 100, to: 1_300, startedAt: 0 };
    expect(getCountUpValue(run, 0)).toBe(100);
    expect(getCountUpValue(run, REWARD_COUNT_UP_DELAY_MS)).toBe(100);
    const mid = getCountUpValue(run, REWARD_COUNT_UP_DELAY_MS + REWARD_COUNT_UP_DURATION_MS / 2);
    expect(mid).toBeGreaterThan(100);
    expect(mid).toBeLessThan(1_300);
    expect(getCountUpValue(run, REWARD_COUNT_UP_DELAY_MS + REWARD_COUNT_UP_DURATION_MS)).toBe(1_300);
    expect(getCountUpValue(run, 99_999)).toBe(1_300);
  });

  test('카운트업 중간값은 정수이고 되돌아가지 않는다', () => {
    const run = { from: 0, to: 57, startedAt: 0 };
    let previous = 0;
    for (let t = 0; t <= REWARD_COUNT_UP_DELAY_MS + REWARD_COUNT_UP_DURATION_MS; t += 16) {
      const value = getCountUpValue(run, t);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  test('코인은 정해진 개수만큼 원점 둘레로 고르게 흩어진다', () => {
    const offsets = getBurstScatterOffsets(REWARD_BURST_COIN_COUNT);
    expect(offsets).toHaveLength(REWARD_BURST_COIN_COUNT);
    for (const { x, y } of offsets) {
      const distance = Math.hypot(x, y);
      expect(distance).toBeGreaterThan(30);
      expect(distance).toBeLessThan(90);
    }
    // 같은 개수면 같은 배치(테스트와 캡처가 흔들리지 않게).
    expect(getBurstScatterOffsets(REWARD_BURST_COIN_COUNT)).toEqual(offsets);
  });

  test('최근 터치가 있으면 그 지점에서, 오래됐거나 없으면 화면 가운데에서 터진다', () => {
    const screen = { width: 440, height: 956 };
    expect(resolveBurstOrigin({ x: 300, y: 600, at: 1_000 }, 1_500, screen)).toEqual({ x: 300, y: 600 });
    expect(resolveBurstOrigin({ x: 300, y: 600, at: 1_000 }, 5_000, screen)).toEqual({ x: 220, y: 478 });
    expect(resolveBurstOrigin(null, 5_000, screen)).toEqual({ x: 220, y: 478 });
  });
});

describe('보상 연출 시간 예산 (#606)', () => {
  test('숫자가 실제 잔액에 닿기까지 1초를 넘기지 않는다', () => {
    expect(REWARD_COUNT_UP_DELAY_MS + REWARD_COUNT_UP_DURATION_MS).toBeLessThan(1_000);
  });
});
