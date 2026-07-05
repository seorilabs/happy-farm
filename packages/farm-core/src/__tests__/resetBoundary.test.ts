/// <reference types="jest" />

import balance from '../balance.json';
import { RESET_OFFSET_MS, getResetDayIndex, getResetDayStart } from '../resetBoundary';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('reset boundary helper (#251)', () => {
  test('RESET_OFFSET_MS is data-driven and within [0, 24h)', () => {
    expect(RESET_OFFSET_MS).toBe(balance.resetOffset.offsetMs);
    expect(RESET_OFFSET_MS).toBeGreaterThanOrEqual(0);
    expect(RESET_OFFSET_MS).toBeLessThan(DAY_MS);
  });

  test('the day index increments exactly at offset past UTC midnight (KST 04:00 by default)', () => {
    // 임의의 UTC 자정(에포크 20000일)을 앵커로. 경계는 그 날 offset 시각에 발생한다.
    const utcMidnight = 20000 * DAY_MS;
    const boundary = utcMidnight + RESET_OFFSET_MS;
    // 경계 직전은 이전 리셋 일, 경계 시점부터 새 리셋 일.
    expect(getResetDayIndex(boundary - 1)).toBe(getResetDayIndex(boundary) - 1);
    expect(getResetDayIndex(boundary)).toBe(getResetDayIndex(boundary + DAY_MS - 1));
    // 다음 경계에서 다시 1 증가.
    expect(getResetDayIndex(boundary + DAY_MS)).toBe(getResetDayIndex(boundary) + 1);
  });

  test('getResetDayStart is the inverse of getResetDayIndex (round-trips)', () => {
    for (let k = 19990; k <= 20010; k += 1) {
      const start = getResetDayStart(k);
      expect(getResetDayIndex(start)).toBe(k);
      // 창 [start, start+24h)의 모든 순간이 같은 인덱스 k로 매핑된다.
      expect(getResetDayIndex(start + DAY_MS - 1)).toBe(k);
      expect(getResetDayIndex(start - 1)).toBe(k - 1);
    }
  });

  test('offset=0 reproduces plain UTC epoch-day (back-compat)', () => {
    const now = 20000 * DAY_MS + 5 * 3600_000;
    expect(getResetDayIndex(now, 0)).toBe(Math.floor(now / DAY_MS));
    expect(getResetDayStart(1234, 0)).toBe(1234 * DAY_MS);
  });

  test('no boundary strictly inside a reset day; index flips exactly at the next boundary', () => {
    const start = getResetDayStart(20000);
    const k = getResetDayIndex(start);
    // 하루 내부(start, start+DAY)에는 경계가 없다 — 모든 순간이 같은 인덱스 k.
    for (let ms = 1; ms < DAY_MS; ms += 37 * 60 * 1000) {
      expect(getResetDayIndex(start + ms)).toBe(k);
    }
    // 다음 경계(start+DAY)에서 정확히 +1.
    expect(getResetDayIndex(start + DAY_MS - 1)).toBe(k);
    expect(getResetDayIndex(start + DAY_MS)).toBe(k + 1);
  });

  test('non-finite now/offset fall back without throwing', () => {
    expect(() => getResetDayIndex(Number.NaN)).not.toThrow();
    expect(Number.isFinite(getResetDayIndex(Number.NaN))).toBe(true);
    // offset 비유한 → 0으로 폴백(UTC epoch-day와 동일).
    const now = 20000 * DAY_MS + 3600_000;
    expect(getResetDayIndex(now, Number.NaN)).toBe(Math.floor(now / DAY_MS));
    expect(Number.isFinite(getResetDayStart(Number.NaN))).toBe(true);
  });
});
