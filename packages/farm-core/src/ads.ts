import type { RewardedAdType } from './constants';

export const REWARDED_AD_PLACEMENTS = {
  shopGoldReward: 'shop_gold_reward',
  shopPlotDiscount: 'shop_plot_discount',
  growthSkip: 'growth_ad_sheet',
  harvestBonus: 'harvest_bonus_sheet',
  returnOfflineBonus: 'return_offline_bonus',
  wheelBonusSpin: 'wheel_bonus_spin',
  cookingSpeedUp: 'cooking_speed_up',
} as const;

export type RewardedAdPlacement = (typeof REWARDED_AD_PLACEMENTS)[keyof typeof REWARDED_AD_PLACEMENTS];

// Single source of truth mapping each rewarded ad type to its surface, so every
// funnel event (impression → click → completed/failed/blocked) is tagged with a
// consistent placement and per-placement fill/completion rates stay computable.
export const REWARDED_AD_PLACEMENT_BY_TYPE: Record<RewardedAdType, RewardedAdPlacement> = {
  rewardedGold: REWARDED_AD_PLACEMENTS.shopGoldReward,
  plotDiscountAd: REWARDED_AD_PLACEMENTS.shopPlotDiscount,
  growthAd: REWARDED_AD_PLACEMENTS.growthSkip,
  harvestBonusAd: REWARDED_AD_PLACEMENTS.harvestBonus,
  offlineBonusAd: REWARDED_AD_PLACEMENTS.returnOfflineBonus,
  wheelBonusAd: REWARDED_AD_PLACEMENTS.wheelBonusSpin,
  cookingSpeedAd: REWARDED_AD_PLACEMENTS.cookingSpeedUp,
};

export function getRewardedAdPlacement(type: RewardedAdType): RewardedAdPlacement {
  return REWARDED_AD_PLACEMENT_BY_TYPE[type];
}

export type RewardedAdReward = {
  type: string;
  amount: number;
};

export type RewardedAdShowResult =
  | { status: 'earned'; reward?: RewardedAdReward }
  | { status: 'dismissed' }
  | { status: 'notReady' }
  | { status: 'unsupported' }
  | { status: 'failed'; error?: string };

export type RewardedAdRequest = {
  type: RewardedAdType;
  placement: RewardedAdPlacement;
};

export type RewardedAdController = {
  isAdReady: boolean;
  isAdSupported: boolean;
  showAd(): Promise<RewardedAdShowResult>;
  // 로드 완료 확인 없이 노출돼 실패하는 배치를 줄이기 위한 재로드 킥(#374).
  // 시트 오픈 시 프리로드·show 실패 후 1회 재시도에 사용한다. 로드가 끝나면
  // isAdReady가 다시 true로 뒤집힌다. 미지원 컨트롤러는 생략할 수 있어 optional.
  reloadAd?(): void | Promise<void>;
  // 상태 플래그만 확인하지 않고 SDK의 실제 loaded/error/timeout 결과를 기다린다.
  // 로드 경쟁 직후 즉시 재시도하는 문제를 막기 위한 optional 계약으로,
  // 구형 호스트/테스트 목은 그대로 동작한다.
  ensureAdReady?(timeoutMs?: number): Promise<boolean>;
};

export type AdFailureFamily =
  | 'not_ready'
  | 'unsupported'
  | 'dismissed'
  | 'timeout'
  | 'no_fill'
  | 'network'
  | 'sdk_error';

// getAdFailureReason·계측이 실제 SDK 에러를 못 얻었을 때만 남기는 최후 fallback.
// 이 값이 ad_reward_failed.reason의 81%를 차지하던 게 #374의 문제였다.
export const AD_FAILURE_REASON_FALLBACK = 'failed_to_show';

const AD_FAILURE_REASON_MAX_LENGTH = 120;

// SDK가 넘긴 임의 형태(문자열/Error/{code,message}/unknown)의 에러를 계측에 안전한
// reason 문자열로 정규화한다. code가 있으면 우선하고, 없으면 message를 쓰며, 아무
// 정보도 못 얻으면 fallback을 반환한다. 개행·중복 공백은 접고 길이를 제한해
// reason 카디널리티가 폭주하지 않게 한다(#374 AC4).
export function normalizeAdFailureReason(error: unknown): string {
  const sanitize = (raw: string): string => {
    const collapsed = raw.replace(/\s+/g, ' ').trim();
    if (collapsed.length === 0) {
      return AD_FAILURE_REASON_FALLBACK;
    }
    return collapsed.length > AD_FAILURE_REASON_MAX_LENGTH
      ? collapsed.slice(0, AD_FAILURE_REASON_MAX_LENGTH)
      : collapsed;
  };

  if (error == null) {
    return AD_FAILURE_REASON_FALLBACK;
  }
  if (typeof error === 'string') {
    return sanitize(error);
  }
  if (typeof error === 'number' || typeof error === 'boolean') {
    return sanitize(String(error));
  }
  if (typeof error === 'object') {
    const record = error as { code?: unknown; message?: unknown };
    const code =
      typeof record.code === 'string' || typeof record.code === 'number' ? String(record.code) : null;
    const message = typeof record.message === 'string' ? record.message : null;
    if (code != null && message != null) {
      return sanitize(`${code}: ${message}`);
    }
    if (code != null) {
      return sanitize(code);
    }
    if (message != null) {
      return sanitize(message);
    }
  }
  return AD_FAILURE_REASON_FALLBACK;
}

/**
 * SDK·마켓·로케일별 문구가 다른 실패 reason을 BigQuery에서 안정적으로
 * 집계할 수 있는 소수의 family로 압축한다. 원본 reason은 디버깅용으로 유지하고,
 * 대시보드/알림은 failure_family를 기준으로 삼는다.
 */
export function normalizeAdFailureFamily(
  value: RewardedAdShowResult | string | unknown
): AdFailureFamily {
  if (typeof value === 'object' && value != null && 'status' in value) {
    const result = value as RewardedAdShowResult;
    if (result.status === 'notReady') {
      return 'not_ready';
    }
    if (result.status === 'unsupported') {
      return 'unsupported';
    }
    if (result.status === 'dismissed') {
      return 'dismissed';
    }
    if (result.status === 'failed') {
      return normalizeAdFailureFamily(result.error);
    }
    return 'sdk_error';
  }

  const reason = normalizeAdFailureReason(value).toLowerCase();
  if (
    reason === 'not_ready' ||
    reason.includes('not ready') ||
    reason.includes('notready') ||
    reason.includes('1006')
  ) {
    return 'not_ready';
  }
  if (reason.includes('unsupported') || reason.includes('not supported')) {
    return 'unsupported';
  }
  if (reason.includes('dismissed') || reason.includes('cancelled') || reason.includes('canceled')) {
    return 'dismissed';
  }
  if (reason.includes('timeout') || reason.includes('timed out')) {
    return 'timeout';
  }
  if (
    reason.includes('no_fill') ||
    reason.includes('no fill') ||
    reason.includes('no-fill') ||
    /^3\s*:/.test(reason) ||
    reason.includes('error_code_no_fill')
  ) {
    return 'no_fill';
  }
  if (
    reason.includes('network') ||
    reason.includes('offline') ||
    reason.includes('connection')
  ) {
    return 'network';
  }
  return 'sdk_error';
}

// show 결과가 자동 재로드·재시도(1회) 대상인지 판정한다. 준비 안 됨(notReady)·
// 노출 실패(failed)만 재시도하고, 사용자가 닫은 dismissed·미지원 unsupported·성공
// earned는 재시도하지 않는다(무한/무의미 재시도 방지, #374 AC3).
export function shouldRetryRewardedShow(result: RewardedAdShowResult): boolean {
  return result.status === 'failed' || result.status === 'notReady';
}
