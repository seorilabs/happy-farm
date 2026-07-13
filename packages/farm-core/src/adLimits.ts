import balance from './balance.json';

/**
 * 런타임에 조정 가능한 광고 빈도·cap 설정. 각 필드는 balance.json 기본값에서 출발하며,
 * 운영(Remote Config)에서 일부만 덮어쓸 수 있다. 미수신/무효값은 항상 기본값으로 폴백한다.
 * 모든 값은 0 이상의 정수다(횟수 또는 ms). 0은 "해당 지면을 사실상 비활성화하는 매우 강한
 * cap"으로 유효한 운영 선택지다.
 */
export type AdLimitsConfig = {
  /** 보상형 골드: 롤링 윈도 내 최대 시청 횟수 */
  rewardedGoldMaxUsesPerWindow: number;
  /** 보상형 골드: 일일 한도 */
  rewardedGoldDailyLimit: number;
  /** 성장 가속 광고: 일일 한도 */
  growthAdDailyLimit: number;
  /** 성장 가속 광고: 쿨다운(ms) */
  growthAdCooldownMs: number;
  /** 밭 할인 광고: 일일 한도 */
  plotDiscountAdDailyLimit: number;
  /** 밭 할인 광고: 쿨다운(ms) */
  plotDiscountAdCooldownMs: number;
  /** 복귀 오프라인 골드 2배 광고: 일일 한도 */
  offlineBonusAdDailyLimit: number;
  /** 복귀 오프라인 골드 2배 광고: 쿨다운(ms) */
  offlineBonusAdCooldownMs: number;
  /** 수확 보너스 광고: 일일 한도 */
  harvestBonusAdDailyLimit: number;
  /** 수확 보너스 광고: 쿨다운(ms) */
  harvestBonusAdCooldownMs: number;
  /** 룰렛 보너스 스핀 광고: 일일 한도 */
  wheelBonusAdDailyLimit: number;
  /** 룰렛 보너스 스핀 광고: 쿨다운(ms) */
  wheelBonusAdCooldownMs: number;
  /** 마일스톤 전면 광고: 최소 노출 간격(ms) */
  interstitialMilestoneCooldownMs: number;
  /** 복귀(welcome-back) 전면 광고: 최소 노출 간격(ms) */
  returnInterstitialCooldownMs: number;
};

export const DEFAULT_AD_LIMITS: AdLimitsConfig = {
  rewardedGoldMaxUsesPerWindow: balance.ads.rewardedGoldMaxUsesPerWindow,
  rewardedGoldDailyLimit: balance.ads.rewardedGoldDailyLimit,
  growthAdDailyLimit: balance.ads.growthAdDailyLimit,
  growthAdCooldownMs: balance.ads.growthAdCooldownMs,
  plotDiscountAdDailyLimit: balance.ads.plotDiscountAdDailyLimit,
  plotDiscountAdCooldownMs: balance.ads.plotDiscountAdCooldownMs,
  offlineBonusAdDailyLimit: balance.ads.offlineBonusAdDailyLimit,
  offlineBonusAdCooldownMs: balance.ads.offlineBonusAdCooldownMs,
  harvestBonusAdDailyLimit: balance.ads.harvestBonusAdDailyLimit,
  harvestBonusAdCooldownMs: balance.ads.harvestBonusAdCooldownMs,
  wheelBonusAdDailyLimit: balance.ads.wheelBonusAdDailyLimit,
  wheelBonusAdCooldownMs: balance.ads.wheelBonusAdCooldownMs,
  interstitialMilestoneCooldownMs: balance.ads.interstitialMilestoneCooldownMs,
  returnInterstitialCooldownMs: balance.ads.returnInterstitialCooldownMs,
};

export type AdLimitsOverrides = Partial<Record<keyof AdLimitsConfig, unknown>>;

let activeAdLimits: AdLimitsConfig = { ...DEFAULT_AD_LIMITS };

// 0 이상의 유한 정수만 유효한 오버라이드로 인정하고, 그 외(타입 불일치/음수/소수/NaN)는
// 해당 필드 기본값으로 폴백한다.
function resolveField(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return fallback;
  }
  return value;
}

/**
 * 현재 적용 중인 광고 빈도·cap 설정. applyAdLimitsOverrides 호출 전에는 기본값을 반환한다.
 */
export function getAdLimits(): AdLimitsConfig {
  return activeAdLimits;
}

/**
 * 부분 오버라이드를 기본값 위에 병합해 적용한다. 누락/무효 필드는 기본값으로 폴백하며,
 * 반환값은 적용 후의 전체 설정이다.
 */
export function applyAdLimitsOverrides(overrides?: AdLimitsOverrides | null): AdLimitsConfig {
  const source = overrides ?? {};
  const next = {} as AdLimitsConfig;
  (Object.keys(DEFAULT_AD_LIMITS) as Array<keyof AdLimitsConfig>).forEach((key) => {
    next[key] = resolveField(source[key], DEFAULT_AD_LIMITS[key]);
  });
  activeAdLimits = next;
  return activeAdLimits;
}

/**
 * Remote Config 문자열(JSON 오브젝트)을 오버라이드 맵으로 파싱한다. 빈 문자열/비오브젝트/
 * 배열/파싱 실패 시 빈 맵을 반환해 모든 필드가 기본값으로 폴백되게 한다.
 */
export function parseAdLimitsOverrides(raw?: string | null): AdLimitsOverrides {
  if (raw == null) {
    return {};
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as AdLimitsOverrides;
  } catch {
    return {};
  }
}

/**
 * 적용 설정을 기본값으로 되돌린다(테스트/세션 리셋용).
 */
export function resetAdLimits(): AdLimitsConfig {
  activeAdLimits = { ...DEFAULT_AD_LIMITS };
  return activeAdLimits;
}
