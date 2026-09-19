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
  /** 수확 부스트 광고: 일일 한도. null 이면 한도 없이 쿨다운만으로 조절한다 */
  harvestBonusAdDailyLimit: number | null;
  /** 수확 보너스 광고: 쿨다운(ms) */
  harvestBonusAdCooldownMs: number;
  /** 룰렛 보너스 스핀 광고: 일일 한도 */
  wheelBonusAdDailyLimit: number;
  /** 룰렛 보너스 스핀 광고: 쿨다운(ms) */
  wheelBonusAdCooldownMs: number;
  /** 요리 즉시 완성 광고: 일일 한도 */
  cookingSpeedAdDailyLimit: number;
  /** 요리 즉시 완성 광고: 쿨다운(ms) */
  cookingSpeedAdCooldownMs: number;
  /** 전면 광고: 이 횟수만큼 일괄 수확할 때까지는 띄우지 않는다(신규 플레이어 첫인상 보호) */
  interstitialHarvestGraceCount: number;
  /** 전면 광고: 세션 내 n번째 노출의 최소 간격(ms). 마지막 값이 이후 전부에 적용된다 */
  interstitialBackoffMs: number[];
  /** 전면 광고: 이 시간 이상 백그라운드에 있다 돌아오면 백오프 단계를 처음으로 되돌린다(ms) */
  interstitialSessionResetMs: number;
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
  cookingSpeedAdDailyLimit: balance.ads.cookingSpeedAdDailyLimit,
  cookingSpeedAdCooldownMs: balance.ads.cookingSpeedAdCooldownMs,
  interstitialHarvestGraceCount: balance.ads.interstitialHarvestGraceCount,
  interstitialBackoffMs: balance.ads.interstitialBackoffMs,
  interstitialSessionResetMs: balance.ads.interstitialSessionResetMs,
  returnInterstitialCooldownMs: balance.ads.returnInterstitialCooldownMs,
};

/**
 * 광고 빈도·cap 설정. balance.json이 정본이며 런타임에 바뀌지 않는다.
 *
 * 예전에는 Remote Config `ad_limits_overrides`로 이 값을 원격에서 덮어썼지만, 원격
 * 설정을 걷어내면서 오버라이드 경로도 함께 제거했다. 빈도를 바꾸려면 balance.json을
 * 고쳐 배포한다.
 */
export function getAdLimits(): AdLimitsConfig {
  return DEFAULT_AD_LIMITS;
}
