/// <reference types="jest" />

import { formatMultiplier, roiPercentToMultiplier } from '../i18n/formatters';

describe('formatMultiplier (#606)', () => {
  test('투자 효율 퍼센트를 수익 배수로 바꾼다', () => {
    expect(roiPercentToMultiplier(100)).toBe(2);
    expect(roiPercentToMultiplier(40)).toBeCloseTo(1.4);
    expect(roiPercentToMultiplier(-20)).toBeCloseTo(0.8);
  });

  test('배수는 소수 한 자리와 곱하기 기호로 보인다', () => {
    expect(formatMultiplier(2)).toBe('×2.0');
    expect(formatMultiplier(1.44)).toBe('×1.4');
    expect(formatMultiplier(12.36)).toBe('×12.4');
    expect(formatMultiplier(0.8)).toBe('×0.8');
    // 1.45는 이진 소수 오차로 1.4499…지만 ×1.5로 올린다.
    expect(formatMultiplier(roiPercentToMultiplier(45))).toBe('×1.5');
  });
});
