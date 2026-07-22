import {
  AD_FAILURE_REASON_FALLBACK,
  normalizeAdFailureReason,
  shouldRetryRewardedShow,
  type RewardedAdShowResult,
} from '../ads';

describe('normalizeAdFailureReason (#374 AC4)', () => {
  test('정보가 없는 에러는 fallback으로 정규화한다', () => {
    expect(normalizeAdFailureReason(null)).toBe(AD_FAILURE_REASON_FALLBACK);
    expect(normalizeAdFailureReason(undefined)).toBe(AD_FAILURE_REASON_FALLBACK);
    expect(normalizeAdFailureReason('')).toBe(AD_FAILURE_REASON_FALLBACK);
    expect(normalizeAdFailureReason('   ')).toBe(AD_FAILURE_REASON_FALLBACK);
    expect(normalizeAdFailureReason({})).toBe(AD_FAILURE_REASON_FALLBACK);
    expect(normalizeAdFailureReason({ type: 'failedToShow' })).toBe(AD_FAILURE_REASON_FALLBACK);
  });

  test('문자열 에러는 그대로 reason이 된다', () => {
    expect(normalizeAdFailureReason('no_fill')).toBe('no_fill');
  });

  test('Error 인스턴스는 message를 reason으로 쓴다', () => {
    expect(normalizeAdFailureReason(new Error('ad server timeout'))).toBe('ad server timeout');
  });

  test('code가 있으면 우선하고 message가 함께 있으면 결합한다', () => {
    expect(normalizeAdFailureReason({ code: 3, message: 'No ad to show' })).toBe('3: No ad to show');
    expect(normalizeAdFailureReason({ code: 'ERR_NO_FILL' })).toBe('ERR_NO_FILL');
    expect(normalizeAdFailureReason({ message: 'network error' })).toBe('network error');
  });

  test('개행·중복 공백은 접고 길이를 제한한다', () => {
    expect(normalizeAdFailureReason('line1\n  line2\t line3')).toBe('line1 line2 line3');
    const long = 'x'.repeat(500);
    expect(normalizeAdFailureReason(long).length).toBe(120);
  });
});

describe('shouldRetryRewardedShow (#374 AC3)', () => {
  test('notReady·failed만 재시도 대상이다', () => {
    expect(shouldRetryRewardedShow({ status: 'failed', error: 'x' })).toBe(true);
    expect(shouldRetryRewardedShow({ status: 'notReady' })).toBe(true);
  });

  test('earned·dismissed·unsupported는 재시도하지 않는다', () => {
    const nonRetry: RewardedAdShowResult[] = [
      { status: 'earned' },
      { status: 'dismissed' },
      { status: 'unsupported' },
    ];
    for (const result of nonRetry) {
      expect(shouldRetryRewardedShow(result)).toBe(false);
    }
  });
});
