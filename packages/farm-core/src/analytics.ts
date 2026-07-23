import type {
  AchievementTrackKey,
  AnimalKey,
  AreaKey,
  CollectionRewardKey,
  CropKey,
  GameState,
  OnboardingStep,
  PrestigeSkillKey,
  RegionArchetypeKey,
  ResearchNodeKey,
} from './types';
import type { RewardedAdType } from './constants';

export type AnalyticsValue = string | number | boolean;

export type TrackGameEvent = (name: string, params?: Record<string, AnalyticsValue>) => void;

// Firebase 애널리틱스(웹 SDK·RN SDK 공통)는 파라미터 값으로 string·number만 받고,
// boolean이나 NaN/Infinity는 그대로 넣으면 누락·거부된다. ait(웹)·mobile(RN) 어댑터가
// 각자 같은 변환을 중복 구현하던 것을 공유 레이어로 모아 동작을 일치시킨다.
export function toFirebaseAnalyticsValue(value: AnalyticsValue): string | number {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  return value;
}

// 파라미터 레코드 전체를 Firebase가 받을 수 있는 스칼라로 정규화한다. 플랫폼별
// 추가 필드(app_market, release_version 등)는 호출부에서 합치면 된다.
export function toFirebaseAnalyticsParams(
  params: Record<string, AnalyticsValue> = {}
): Record<string, string | number> {
  const normalized: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    normalized[key] = toFirebaseAnalyticsValue(value);
  }
  return normalized;
}

// 복귀 넛지 알림의 종류. 현재 'harvest'만 발송되며, 데일리/오늘의 작물 알림(#76)
// 도입 시 같은 계약으로 확장할 수 있도록 종류를 미리 정의해 둔다.
export type FarmNotificationKind = 'harvest' | 'daily_bonus' | 'crop_of_the_day';

// Stable acquisition path for the daily-bonus impression → claim funnel.
// Keep these values untranslated so BigQuery cohorts remain joinable.
export type DailyBonusSource = 'auto_popup' | 'more' | 'welcome_back';

// Stable values for the manual-only harvest-combo summary. Keep these keys
// untranslated so BigQuery cohorts stay joinable across every market.
export type HarvestComboTier = 'normal' | 'great' | 'legendary';
export type HarvestComboEndReason = 'timeout' | 'background' | 'prestige' | 'reset' | 'cloud_restore';

// Stable source/reward dimensions for crop_harvested. Offline settlement only
// advances time and leaves crops ripe, while combo is a summary over manual
// harvests, so neither is a separate harvest source.
export type HarvestSource = 'manual' | 'batch' | 'auto';
export type HarvestRewardType = 'gold' | 'research_points';
export type AnimalsScreenSource = 'more' | 'welcome_back';
export type AnimalProduceCollectionMode = 'single' | 'collect_all';

export type GameAnalyticsContext = {
  gold: number;
  plot_count: number;
  speed_level: number;
  profit_level: number;
  unlocked_area_count: number;
  harvested_crop_count: number;
  session_elapsed_sec: number;
  prestige_level: number;
  prestige_stars: number;
  research_points: number;
  lifetime_harvests: number;
};

export function getGameAnalyticsContext(
  gameState: GameState,
  sessionStartedAt: number,
  now = Date.now()
): GameAnalyticsContext {
  return {
    gold: Math.floor(gameState.gold),
    plot_count: gameState.unlockedPlotCount,
    speed_level: gameState.upgrades.speed,
    profit_level: gameState.upgrades.profit,
    unlocked_area_count: gameState.unlockedAreas.length,
    harvested_crop_count: gameState.harvestedCropKeys.length,
    session_elapsed_sec: Math.max(0, Math.floor((now - sessionStartedAt) / 1000)),
    prestige_level: gameState.prestige.level,
    prestige_stars: gameState.prestige.stars,
    research_points: Math.floor(gameState.research.points),
    lifetime_harvests: gameState.lifetimeStats.totalHarvests,
  };
}

const noopTrackGameEvent: TrackGameEvent = (_name, _params = {}) => {
  void _name;
  void _params;
};

export function createFarmAnalytics(track: TrackGameEvent = noopTrackGameEvent) {
  return {
    trackFarmScreen: (context: GameAnalyticsContext) => {
      track('farm_main_screen', context);
    },

    trackGameStart: (context: GameAnalyticsContext) => {
      track('game_start', context);
    },

    trackSeedSelected: (
      cropKey: CropKey,
      areaKey: AreaKey,
      isFirstSeedSelection: boolean,
      context: GameAnalyticsContext
    ) => {
      track(isFirstSeedSelection ? 'first_seed_selected' : 'seed_selected', {
        crop: cropKey,
        area: areaKey,
        ...context,
      });
    },

    trackCropPlanted: (
      cropKey: CropKey,
      areaKey: AreaKey,
      cropTier: number,
      cropCost: number,
      context: GameAnalyticsContext
    ) => {
      track('crop_planted', {
        crop: cropKey,
        area: areaKey,
        crop_tier: cropTier,
        crop_cost: cropCost,
        ...context,
      });
    },

    // One event per non-empty crop/area/tier bucket in a caller-owned rolling
    // window. ready_count replaces plot-level crop_ready event counts while
    // preserving the dimensions used by content analytics.
    trackCropReadySummary: (params: {
      cropKey: CropKey;
      areaKey: AreaKey;
      cropTier: number;
      readyCount: number;
      windowSeconds: number;
      context: GameAnalyticsContext;
    }) => {
      track('crop_ready_summary', {
        crop: params.cropKey,
        area: params.areaKey,
        crop_tier: params.cropTier,
        ready_count: params.readyCount,
        window_seconds: params.windowSeconds,
        schema_version: 1,
        ...params.context,
      });
    },

    trackCropHarvested: (params: {
      cropKey: CropKey;
      areaKey: AreaKey;
      cropTier: number;
      goldGained: number;
      researchPointsGained: number;
      donated: boolean;
      harvestSource: HarvestSource;
      isFirstMeaningfulHarvest: boolean;
      isFirstCropHarvest: boolean;
      context: GameAnalyticsContext;
    }) => {
      // revenue is the exact gold credited by the canonical harvest outcome.
      // Donation mode intentionally credits RP instead, so its zero revenue is
      // explicitly distinguishable rather than looking like a logging defect.
      const rewardType: HarvestRewardType = params.donated ? 'research_points' : 'gold';
      track('crop_harvested', {
        crop: params.cropKey,
        area: params.areaKey,
        crop_tier: params.cropTier,
        revenue: params.goldGained,
        research_points_gained: params.researchPointsGained,
        reward_type: rewardType,
        harvest_source: params.harvestSource,
        is_first_meaningful_harvest: params.isFirstMeaningfulHarvest,
        is_first_crop_harvest: params.isFirstCropHarvest,
        schema_version: 2,
        ...params.context,
      });

      if (params.isFirstMeaningfulHarvest) {
        track('first_meaningful_harvest', {
          crop: params.cropKey,
          area: params.areaKey,
          crop_tier: params.cropTier,
          revenue: params.goldGained,
          research_points_gained: params.researchPointsGained,
          reward_type: rewardType,
          harvest_source: params.harvestSource,
          ...params.context,
        });
      }
    },

    trackPlotUnlocked: (params: {
      method: 'gold' | 'ad';
      cost: number;
      nextPlotCount: number;
      context: GameAnalyticsContext;
    }) => {
      track('plot_unlocked', {
        method: params.method,
        cost: params.cost,
        next_plot_count: params.nextPlotCount,
        ...params.context,
      });
    },

    trackUpgradePurchased: (params: {
      kind: 'speed' | 'profit';
      cost: number;
      nextLevel: number;
      context: GameAnalyticsContext;
    }) => {
      track('upgrade_purchased', {
        upgrade_kind: params.kind,
        cost: params.cost,
        next_level: params.nextLevel,
        ...params.context,
      });
    },

    trackAreaUnlockClicked: (areaKey: AreaKey, context: GameAnalyticsContext) => {
      track('area_unlock_clicked', {
        area: areaKey,
        ...context,
      });
    },

    trackAreaUnlocked: (params: { areaKey: AreaKey; cost: number; context: GameAnalyticsContext }) => {
      track('area_unlocked', {
        area: params.areaKey,
        cost: params.cost,
        ...params.context,
      });
    },

    // Every rewarded-ad funnel stage carries both ad_type and placement, so a
    // placement can be tracked end to end (impression → click → completed/failed,
    // plus blocked) and per-placement fill/completion rates and ARPDAU break down
    // cleanly. See docs/04-work/ad-analytics.md for the metric definitions.
    trackAdRewardClick: (type: RewardedAdType, placement: string, context: GameAnalyticsContext) => {
      track('ad_reward_click', {
        ad_type: type,
        placement,
        ...context,
      });
    },

    trackAdRewardImpression: (type: RewardedAdType, placement: string, context: GameAnalyticsContext) => {
      track('ad_reward_impression', {
        ad_type: type,
        placement,
        ...context,
      });
    },

    trackAdRewardCompleted: (params: {
      type: RewardedAdType;
      placement: string;
      rewardValue: number;
      context: GameAnalyticsContext;
    }) => {
      track('ad_reward_completed', {
        ad_type: params.type,
        placement: params.placement,
        reward_value: params.rewardValue,
        ...params.context,
      });
    },

    trackAdRewardFailed: (type: RewardedAdType, placement: string, reason: string, context: GameAnalyticsContext) => {
      track('ad_reward_failed', {
        ad_type: type,
        placement,
        reason,
        ...context,
      });
    },

    trackAdLimitBlocked: (type: RewardedAdType, placement: string, reason: string, context: GameAnalyticsContext) => {
      track('ad_limit_blocked', {
        ad_type: type,
        placement,
        blocked_reason: reason,
        ...context,
      });
    },

    trackInterstitialShown: (placement: string, context: GameAnalyticsContext) => {
      track('interstitial_shown', {
        placement,
        ...context,
      });
    },

    trackCollectionScreen: (context: GameAnalyticsContext) => {
      track('collection_screen', context);
    },

    trackCollectionRewardClaimed: (params: {
      rewardKey: CollectionRewardKey;
      rewardValue: number;
      context: GameAnalyticsContext;
    }) => {
      track('collection_reward_claimed', {
        reward_key: params.rewardKey,
        reward_value: params.rewardValue,
        ...params.context,
      });
    },

    trackPrestige: (params: {
      archetype: RegionArchetypeKey;
      starsAwarded: number;
      chainGoldPerHour: number;
      context: GameAnalyticsContext;
    }) => {
      track('prestige', {
        region_archetype: params.archetype,
        stars_awarded: params.starsAwarded,
        chain_gold_per_hour: params.chainGoldPerHour,
        ...params.context,
      });
    },

    trackChainCollected: (params: { collectedGold: number; farmCount: number; context: GameAnalyticsContext }) => {
      track('chain_collected', {
        collected_gold: params.collectedGold,
        farm_count: params.farmCount,
        ...params.context,
      });
    },

    trackPrestigeSkillPurchased: (params: {
      skillKey: PrestigeSkillKey;
      nextLevel: number;
      context: GameAnalyticsContext;
    }) => {
      track('prestige_skill_purchased', {
        skill_key: params.skillKey,
        next_level: params.nextLevel,
        ...params.context,
      });
    },

    trackResearchNodeUnlocked: (params: {
      nodeKey: ResearchNodeKey;
      nextLevel: number;
      context: GameAnalyticsContext;
    }) => {
      track('research_node_unlocked', {
        node_key: params.nodeKey,
        next_level: params.nextLevel,
        ...params.context,
      });
    },

    trackBreedUnlocked: (params: { cropKey: CropKey; context: GameAnalyticsContext }) => {
      track('breed_unlocked', {
        crop: params.cropKey,
        ...params.context,
      });
    },

    trackAchievementClaimed: (params: {
      trackKey: AchievementTrackKey;
      tier: number;
      starsAwarded: number;
      context: GameAnalyticsContext;
    }) => {
      track('achievement_claimed', {
        track_key: params.trackKey,
        tier: params.tier,
        stars_awarded: params.starsAwarded,
        ...params.context,
      });
    },

    // Ranch funnel baseline. Every event carries schema_version=1 and the
    // shared game context so purchase, feeding, and collection cohorts remain
    // joinable across markets without localized labels.
    trackAnimalsScreen: (params: {
      source: AnimalsScreenSource;
      ownedCount: number;
      feedingCount: number;
      readyCount: number;
      context: GameAnalyticsContext;
    }) => {
      track('animals_screen', {
        source: params.source,
        owned_count: params.ownedCount,
        feeding_count: params.feedingCount,
        ready_count: params.readyCount,
        schema_version: 1,
        ...params.context,
      });
    },

    trackAnimalPurchased: (params: {
      animalKey: AnimalKey;
      purchaseCost: number;
      ownedCountAfter: number;
      context: GameAnalyticsContext;
    }) => {
      track('animal_purchased', {
        animal: params.animalKey,
        purchase_cost: params.purchaseCost,
        owned_count_after: params.ownedCountAfter,
        schema_version: 1,
        ...params.context,
      });
    },

    trackAnimalFed: (params: {
      animalKey: AnimalKey;
      feedCost: number;
      produceTimerMs: number;
      ownedCount: number;
      context: GameAnalyticsContext;
    }) => {
      track('animal_fed', {
        animal: params.animalKey,
        feed_cost: params.feedCost,
        produce_timer_ms: params.produceTimerMs,
        owned_count: params.ownedCount,
        schema_version: 1,
        ...params.context,
      });
    },

    trackAnimalProduceCollected: (params: {
      animalKey: AnimalKey;
      collectionMode: AnimalProduceCollectionMode;
      baseRevenue: number;
      finalRevenue: number;
      isRare: boolean;
      rareMultiplier: number;
      readyWaitMs: number;
      context: GameAnalyticsContext;
    }) => {
      track('animal_produce_collected', {
        animal: params.animalKey,
        collection_mode: params.collectionMode,
        base_revenue: params.baseRevenue,
        final_revenue: params.finalRevenue,
        is_rare: params.isRare,
        rare_multiplier: params.rareMultiplier,
        ready_wait_ms: params.readyWaitMs,
        schema_version: 1,
        ...params.context,
      });
    },

    trackAnimalProduceCollectAll: (params: {
      collectedCount: number;
      baseRevenueTotal: number;
      finalRevenueTotal: number;
      rareCount: number;
      context: GameAnalyticsContext;
    }) => {
      track('animal_produce_collect_all', {
        collected_count: params.collectedCount,
        base_revenue_total: params.baseRevenueTotal,
        final_revenue_total: params.finalRevenueTotal,
        rare_count: params.rareCount,
        schema_version: 1,
        ...params.context,
      });
    },

    // Aggregated automation report; callers throttle it (e.g. once a minute)
    // instead of emitting one event per auto-harvested crop.
    trackAutoHarvestSummary: (params: {
      harvestedCount: number;
      replantedCount: number;
      context: GameAnalyticsContext;
    }) => {
      track('auto_harvest_summary', {
        harvested_count: params.harvestedCount,
        replanted_count: params.replantedCount,
        ...params.context,
      });
    },
    // One event per manual "Harvest All" tap (not per crop), so a single
    // batched action reads as a single funnel step.
    trackHarvestAll: (params: {
      harvestedCount: number;
      totalGold: number;
      specialCount: number;
      context: GameAnalyticsContext;
    }) => {
      track('harvest_all', {
        harvested_count: params.harvestedCount,
        total_gold: params.totalGold,
        special_count: params.specialCount,
        ...params.context,
      });
    },

    // One event per completed manual-only harvest streak. Harvest All and
    // automation are deliberately excluded by the caller so this summary can
    // measure the exact baseline population eligible for a future combo reward.
    trackHarvestComboCompleted: (params: {
      manualHarvestCount: number;
      comboTier: HarvestComboTier;
      durationMs: number;
      baseRevenueTotal: number;
      endReason: HarvestComboEndReason;
      context: GameAnalyticsContext;
    }) => {
      track('harvest_combo_completed', {
        manual_harvest_count: params.manualHarvestCount,
        combo_tier: params.comboTier,
        duration_ms: params.durationMs,
        base_revenue_total: params.baseRevenueTotal,
        end_reason: params.endReason,
        schema_version: 1,
        ...params.context,
      });
    },

    // === 리텐션 계측 (행동 변경 없는 emit 배선) ===

    // 데일리 보너스 노출. 자동 노출과 사용자의 명시적 재진입을 분리해
    // "못 봄"과 "봤지만 미수령"을 BigQuery에서 구분한다(#294).
    trackDailyBonusOpened: (params: {
      source: DailyBonusSource;
      context: GameAnalyticsContext;
    }) => {
      track('daily_bonus_opened', {
        source: params.source,
        ...params.context,
      });
    },

    // 데일리 보너스 수령. streak/보상값으로 H2(데일리 보너스 미스케일) 검증.
    // is_first_claim은 활성화 퍼널의 "첫 데일리 클레임" 단계를 특정하기 위한 플래그이며,
    // 첫 수령이면 first_meaningful_harvest와 동일한 패턴으로 전용 이벤트도 함께 발화한다.
    trackDailyBonusClaimed: (params: {
      streak: number;
      rewardValue: number;
      isFirstClaim: boolean;
      source: DailyBonusSource;
      context: GameAnalyticsContext;
    }) => {
      track('daily_bonus_claimed', {
        streak: params.streak,
        reward_value: params.rewardValue,
        is_first_claim: params.isFirstClaim,
        source: params.source,
        ...params.context,
      });

      if (params.isFirstClaim) {
        track('first_daily_bonus_claimed', {
          streak: params.streak,
          reward_value: params.rewardValue,
          source: params.source,
          ...params.context,
        });
      }
    },

    // 복귀 요약(welcome back) 노출. 이탈 시간/오프라인 골드/수확 대기 작물 수로
    // 복귀 동기 부여 효과를 측정.
    trackReturnSummaryShown: (params: {
      awayMs: number;
      offlineGold: number;
      readyCropCount: number;
      context: GameAnalyticsContext;
    }) => {
      track('return_summary_shown', {
        away_ms: params.awayMs,
        offline_gold: params.offlineGold,
        ready_crop_count: params.readyCropCount,
        ...params.context,
      });
    },

    // 복귀 요약에서 보상을 수령(확인)한 경우. shown 대비 collected 비율로 전환율 측정.
    trackReturnSummaryCollected: (params: {
      awayMs: number;
      offlineGold: number;
      readyCropCount: number;
      context: GameAnalyticsContext;
    }) => {
      track('return_summary_collected', {
        away_ms: params.awayMs,
        offline_gold: params.offlineGold,
        ready_crop_count: params.readyCropCount,
        ...params.context,
      });
    },

    // 오늘의 작물 수확. 배수 보너스 작물의 실제 수확 빈도를 측정(H4: 첫 수확→리텐션).
    trackCropOfTheDayHarvested: (params: { cropKey: CropKey; multiplier: number; context: GameAnalyticsContext }) => {
      track('crop_of_the_day_harvested', {
        crop: params.cropKey,
        multiplier: params.multiplier,
        ...params.context,
      });
    },

    // 복귀 넛지 알림 예약. context는 알림 예약 시점의 게임 상태(없을 수도 있음).
    trackNotificationScheduled: (params: {
      kind: FarmNotificationKind;
      leadTimeMs?: number;
      context?: GameAnalyticsContext;
    }) => {
      track('notification_scheduled', {
        notification_kind: params.kind,
        ...(params.leadTimeMs != null ? { lead_time_ms: params.leadTimeMs } : {}),
        ...(params.context ?? {}),
      });
    },

    // 복귀 넛지 알림 열림. 앱 로드 이전/직후에 발생할 수 있어 게임 상태 context를 요구하지 않는다.
    trackNotificationOpened: (params: { kind: FarmNotificationKind }) => {
      track('notification_opened', {
        notification_kind: params.kind,
      });
    },

    // === 첫 세션 온보딩 단계 퍼널 (#159) ===
    // 4단계 코치마크(selectSeed→plant→harvest→reward)의 단계별 진입/이탈을 GA4로
    // 특정하기 위한 계측. step은 단계 키, step_index는 1부터 시작하는 진행 번호다.

    // 온보딩 단계 진입(노출). 어느 단계에서 막히는지 단계별 도달률을 산출한다.
    trackOnboardingStepView: (params: {
      step: OnboardingStep;
      stepIndex: number;
      context: GameAnalyticsContext;
    }) => {
      track('onboarding_step_view', {
        step: params.step,
        step_index: params.stepIndex,
        ...params.context,
      });
    },

    // 온보딩 건너뛰기. 어느 단계에서 사용자가 코치마크를 포기했는지 측정한다.
    trackOnboardingSkip: (params: {
      skippedStep: OnboardingStep;
      stepIndex: number;
      context: GameAnalyticsContext;
    }) => {
      track('onboarding_skip', {
        skipped_step: params.skippedStep,
        step_index: params.stepIndex,
        ...params.context,
      });
    },

    // 온보딩 완료(첫 수확 뒤 reward 단계의 계속하기를 명시적으로 확인).
    // 건너뛰기로 끝난 경우는 trackOnboardingSkip만 발생하고 이 이벤트는 발생하지 않는다.
    trackOnboardingComplete: (params: { context: GameAnalyticsContext }) => {
      track('onboarding_complete', {
        ...params.context,
      });
    },

    // 온보딩 단계 무행동 정체(#274). 단계 진입 후 dwellSeconds 동안 다음 행동이
    // 없으면 발생시켜, 어느 단계에서 얼마나 머물다 정체/이탈하는지 특정한다.
    // (특히 selectSeed에서 씨앗 선택도 skip도 없이 정체하는 구간을 계측)
    trackOnboardingStall: (params: {
      step: OnboardingStep;
      stepIndex: number;
      dwellSeconds: number;
      context: GameAnalyticsContext;
    }) => {
      track('onboarding_stall', {
        step: params.step,
        step_index: params.stepIndex,
        dwell_seconds: params.dwellSeconds,
        ...params.context,
      });
    },
  };
}
