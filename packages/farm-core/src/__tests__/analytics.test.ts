/// <reference types="jest" />

import { getRewardedAdPlacement } from '../ads';
import {
  createFarmAnalytics,
  getGameAnalyticsContext,
  toAnalyticsScientificParts,
  toFirebaseAnalyticsParams,
  toFirebaseAnalyticsValue,
} from '../analytics';
import { createInitialState } from '../constants';

function getLegacyEventContext(context: ReturnType<typeof getGameAnalyticsContext>) {
  const legacy = { ...context } as Record<string, number>;
  delete legacy.gold_is_saturated;
  delete legacy.research_points_mantissa;
  delete legacy.research_points_exponent;
  delete legacy.research_points_is_saturated;
  return legacy;
}

describe('farm analytics adapter contract', () => {
  test('emits platform-neutral event names and payloads through an injected tracker', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const context = getGameAnalyticsContext(
      createInitialState(),
      Date.parse('2026-05-27T03:00:00.000Z'),
      Date.parse('2026-05-27T03:00:05.000Z')
    );

    analytics.trackGameStart(context);
    analytics.trackSeedSelected('carrot', 'starter_field', true, context);
    analytics.trackAdRewardFailed('rewardedGold', 'shop_gold_reward', 'unsupported', context);

    expect(track).toHaveBeenCalledWith('game_start', context);
    expect(track).toHaveBeenCalledWith('first_seed_selected', expect.objectContaining({ crop: 'carrot' }));
    expect(track).toHaveBeenCalledWith(
      'ad_reward_failed',
      expect.objectContaining({ ad_type: 'rewardedGold', placement: 'shop_gold_reward', reason: 'unsupported' })
    );
  });

  test('crop_ready_summary는 bucket count와 window 계약을 context와 함께 emit한다', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const context = getGameAnalyticsContext(
      createInitialState(),
      Date.parse('2026-05-27T03:00:00.000Z'),
      Date.parse('2026-05-27T03:00:05.000Z')
    );

    analytics.trackCropReadySummary({
      cropKey: 'carrot',
      areaKey: 'starter_field',
      cropTier: 1,
      readyCount: 6,
      windowSeconds: 60,
      context,
    });

    expect(track).toHaveBeenCalledWith(
      'crop_ready_summary',
      expect.objectContaining({
        crop: 'carrot',
        area: 'starter_field',
        crop_tier: 1,
        ready_count: 6,
        window_seconds: 60,
        schema_version: 1,
        gold: context.gold,
      })
    );
  });

  test('crop_harvested는 실제 골드 지급액과 기부 RP를 source·reward_type으로 구분한다 (#396)', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const context = getGameAnalyticsContext(createInitialState(), 0, 5_000);

    analytics.trackCropHarvested({
      cropKey: 'carrot',
      areaKey: 'starter_field',
      cropTier: 1,
      goldGained: 20,
      researchPointsGained: 0,
      donated: false,
      harvestSource: 'manual',
      isFirstMeaningfulHarvest: false,
      isFirstCropHarvest: false,
      context,
    });
    analytics.trackCropHarvested({
      cropKey: 'carrot',
      areaKey: 'starter_field',
      cropTier: 1,
      goldGained: 0,
      researchPointsGained: 3,
      donated: true,
      harvestSource: 'auto',
      isFirstMeaningfulHarvest: false,
      isFirstCropHarvest: false,
      context,
    });

    expect(track.mock.calls).toEqual([
      [
        'crop_harvested',
        {
          crop: 'carrot',
          area: 'starter_field',
          crop_tier: 1,
          revenue: 20,
          research_points_gained: 0,
          reward_type: 'gold',
          harvest_source: 'manual',
          is_first_meaningful_harvest: false,
          is_first_crop_harvest: false,
          schema_version: 2,
          ...getLegacyEventContext(context),
        },
      ],
      [
        'crop_harvested',
        {
          crop: 'carrot',
          area: 'starter_field',
          crop_tier: 1,
          revenue: 0,
          research_points_gained: 3,
          reward_type: 'research_points',
          harvest_source: 'auto',
          is_first_meaningful_harvest: false,
          is_first_crop_harvest: false,
          schema_version: 2,
          ...getLegacyEventContext(context),
        },
      ],
    ]);
  });

  test('mutation_discovered는 최초 발견 경로와 천장 발동 여부를 기록한다 (#464)', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const context = getGameAnalyticsContext(createInitialState(), 0, 5_000);

    analytics.trackMutationDiscovered({
      cropKey: 'starfruit',
      areaKey: 'legend_field',
      cropTier: 8,
      mutationKey: 'prism',
      harvestSource: 'auto',
      pityTriggered: true,
      context,
    });

    expect(track).toHaveBeenCalledWith(
      'mutation_discovered',
      expect.objectContaining({
        crop: 'starfruit',
        area: 'legend_field',
        crop_tier: 8,
        mutation: 'prism',
        harvest_source: 'auto',
        pity_triggered: true,
        schema_version: 1,
      })
    );
  });

  test('경제·컨텍스트 숫자는 GA4 집계를 오염시키지 않도록 안전 범위로 제한한다 (#437)', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const state = createInitialState();
    state.gold = Number.MAX_VALUE;
    state.research.points = Number.POSITIVE_INFINITY;
    const context = getGameAnalyticsContext(state, 0, 5_000);

    analytics.trackCropHarvested({
      cropKey: 'carrot',
      areaKey: 'starter_field',
      cropTier: 1,
      goldGained: Number.MAX_VALUE,
      researchPointsGained: Number.POSITIVE_INFINITY,
      donated: false,
      harvestSource: 'manual',
      isFirstMeaningfulHarvest: false,
      isFirstCropHarvest: false,
      context,
    });
    analytics.trackHarvestAll({
      harvestedCount: 2,
      totalGold: Number.MAX_VALUE,
      specialCount: 0,
      context,
    });
    analytics.trackAutoHarvestSummary({
      cropKey: 'carrot',
      areaKey: 'starter_field',
      cropTier: 1,
      harvestedCount: 10_000,
      replantedCount: 10_000,
      totalGold: Number.MAX_VALUE,
      totalResearchPoints: Number.POSITIVE_INFINITY,
      windowSeconds: 60,
      context,
    });

    expect(context.gold).toBe(Number.MAX_SAFE_INTEGER);
    expect(context.gold_mantissa).toBeGreaterThanOrEqual(1);
    expect(context.gold_mantissa).toBeLessThan(10);
    expect(context.gold_exponent).toBe(308);
    expect(context.gold_is_saturated).toBe(1);
    expect(context.research_points).toBe(0);
    expect(context.research_points_mantissa).toBe(0);
    expect(context.research_points_exponent).toBe(0);
    expect(context.research_points_is_saturated).toBe(0);
    expect(track).toHaveBeenCalledWith(
      'crop_harvested',
      expect.objectContaining({
        revenue: Number.MAX_SAFE_INTEGER,
        research_points_gained: 0,
        gold: Number.MAX_SAFE_INTEGER,
      }),
    );
    expect(track).toHaveBeenCalledWith(
      'harvest_all',
      expect.objectContaining({ total_gold: Number.MAX_SAFE_INTEGER }),
    );
    expect(track).toHaveBeenCalledWith(
      'auto_harvest_summary',
      expect.objectContaining({
        total_gold: Number.MAX_SAFE_INTEGER,
        total_research_points: 0,
      }),
    );
  });

  test('후반 경제 값은 raw clamp와 지수·포화 차원으로 함께 기록한다 (#455)', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const state = createInitialState();
    state.gold = 3.5e100;
    state.research.points = 7.25e80;
    const context = getGameAnalyticsContext(state, 0, 5_000);

    expect(context).toEqual(
      expect.objectContaining({
        gold: Number.MAX_SAFE_INTEGER,
        gold_mantissa: 3.5,
        gold_exponent: 100,
        gold_is_saturated: 1,
        research_points: Number.MAX_SAFE_INTEGER,
        research_points_mantissa: 7.25,
        research_points_exponent: 80,
        research_points_is_saturated: 1,
      })
    );

    analytics.trackResearchNodeUnlocked({
      nodeKey: 'market_studies',
      cost: 1e50,
      nextLevel: 1e20,
      context,
    });
    analytics.trackResearchNodeBatchUnlocked({
      nodeKey: 'market_studies',
      levelsPurchased: 10,
      totalCost: 2.5e70,
      fromLevel: 10,
      toLevel: 20,
      context,
    });
    analytics.trackResearchScalingBulkUnlocked({
      nodeKeys: ['market_studies', 'growth_studies'],
      levelsPurchased: 20,
      totalCost: 4e75,
      context,
    });
    analytics.trackAdRewardFailed(
      'rewardedGold',
      'shop_gold_reward',
      'no_fill',
      context,
      {
        attemptId: 'late-game-attempt',
        adReady: false,
        eligible: true,
        adSupported: true,
        rewardKind: 'gold',
        rewardKey: 'rewarded_gold',
        rewardValue: 1,
        ctaPosition: 'shop_rewards_primary',
        retryCount: 1,
        failureFamily: 'no_fill',
      }
    );

    expect(track).toHaveBeenCalledWith(
      'research_node_unlocked',
      expect.objectContaining({
        next_level: Number.MAX_SAFE_INTEGER,
        next_level_exponent: 20,
        next_level_is_saturated: 1,
        research_points_exponent: 80,
        research_points_is_saturated: 1,
      })
    );
    expect(track).toHaveBeenCalledWith(
      'research_node_batch_unlocked',
      expect.objectContaining({
        total_cost: Number.MAX_SAFE_INTEGER,
        total_cost_exponent: 70,
        total_cost_is_saturated: 1,
      })
    );
    expect(track).toHaveBeenCalledWith(
      'research_scaling_bulk_unlocked',
      expect.objectContaining({
        total_cost: Number.MAX_SAFE_INTEGER,
        total_cost_exponent: 75,
        total_cost_is_saturated: 1,
      })
    );
    expect(track).toHaveBeenCalledWith(
      'ad_reward_failed',
      expect.objectContaining({ economy_stage_bucket: 'gold_and_research_saturated' })
    );

    const adParams = track.mock.calls.find(([event]) => event === 'ad_reward_failed')![1] as Record<
      string,
      unknown
    >;
    expect(Object.keys(adParams)).toHaveLength(20);
    expect(Object.keys(adParams).length + 5).toBeLessThanOrEqual(25);
  });

  test('harvest_combo_completed는 수동 콤보 종료 계약을 exact payload로 emit한다 (#348)', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const context = getGameAnalyticsContext(
      createInitialState(),
      Date.parse('2026-05-27T03:00:00.000Z'),
      Date.parse('2026-05-27T03:00:05.000Z')
    );

    analytics.trackHarvestComboCompleted({
      manualHarvestCount: 10,
      comboTier: 'legendary',
      durationMs: 1350,
      baseRevenueTotal: 1234,
      endReason: 'background',
      context,
    });

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('harvest_combo_completed', {
      manual_harvest_count: 10,
      combo_tier: 'legendary',
      duration_ms: 1350,
      base_revenue_total: 1234,
      end_reason: 'background',
      schema_version: 1,
      ...getLegacyEventContext(context),
    });
  });

  test('rewarded-ad funnel events all carry ad_type and placement for per-placement aggregation', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const context = getGameAnalyticsContext(
      createInitialState(),
      Date.parse('2026-05-27T03:00:00.000Z'),
      Date.parse('2026-05-27T03:00:05.000Z')
    );

    analytics.trackAdRewardImpression('growthAd', getRewardedAdPlacement('growthAd'), context);
    analytics.trackAdRewardClick('growthAd', getRewardedAdPlacement('growthAd'), context);
    analytics.trackAdRewardCompleted({
      type: 'growthAd',
      placement: getRewardedAdPlacement('growthAd'),
      rewardValue: 1,
      context,
    });
    analytics.trackAdLimitBlocked('growthAd', getRewardedAdPlacement('growthAd'), 'daily_limit', context);

    for (const event of ['ad_reward_impression', 'ad_reward_click', 'ad_reward_completed', 'ad_limit_blocked']) {
      expect(track).toHaveBeenCalledWith(
        event,
        expect.objectContaining({ ad_type: 'growthAd', placement: 'growth_ad_sheet' })
      );
    }
    expect(getRewardedAdPlacement('plotDiscountAd')).toBe('shop_plot_discount');
    expect(getRewardedAdPlacement('offlineBonusAd')).toBe('return_offline_bonus');
    expect(getRewardedAdPlacement('wheelBonusAd')).toBe('wheel_bonus_spin');
  });

  test('랜드마크 열람·단계 펀딩 이벤트를 계약대로 emit한다', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const context = getGameAnalyticsContext(createInitialState(), 0, 5_000);

    analytics.trackLandmarkProjectViewed({ tier: 3, stageKey: 'festival', completedStages: 2, context });
    analytics.trackLandmarkStageFunded({
      tier: 3,
      stageKey: 'festival',
      stageIndex: 2,
      goldCost: 1e50,
      cropUnits: 40,
      animalProducts: 5,
      festivalPoints: 1,
      tierCompleted: true,
      context,
    });

    expect(track).toHaveBeenCalledWith(
      'landmark_project_viewed',
      expect.objectContaining({ tier: 3, stage_key: 'festival', completed_stages: 2 })
    );
    expect(track).toHaveBeenCalledWith(
      'landmark_stage_funded',
      expect.objectContaining({
        tier: 3,
        stage_key: 'festival',
        stage_index: 2,
        gold_cost: Number.MAX_SAFE_INTEGER,
        gold_cost_mantissa: 1,
        gold_cost_exponent: 50,
        crop_units: 40,
        animal_products: 5,
        festival_points: 1,
        tier_completed: true,
      })
    );
  });

  test('economy_transaction은 큰 수의 amount·before·after를 가수·지수로 보존한다', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);

    analytics.trackEconomyTransaction({
      flow: 'sink',
      currency: 'gold',
      reason: 'landmark_stage',
      amount: 1e15,
      balanceBefore: 1e100,
      balanceAfter: 1e50,
      prestigeLevel: 7,
      landmarkTier: 8,
      landmarkStage: 'foundation',
    });

    expect(track).toHaveBeenCalledWith('economy_transaction', {
      flow: 'sink',
      currency: 'gold',
      reason: 'landmark_stage',
      amount_mantissa: 1,
      amount_exponent: 15,
      balance_before_mantissa: 1,
      balance_before_exponent: 100,
      balance_after_mantissa: 1,
      balance_after_exponent: 50,
      prestige_level: 7,
      landmark_tier: 8,
      landmark_stage: 'foundation',
    });
  });

  test('rewarded-ad funnel metadata는 attempt·준비·보상·실패 family를 같은 키로 emit한다', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const context = getGameAnalyticsContext(createInitialState(), 0, 5_000);
    const metadata = {
      attemptId: 'session-1',
      adReady: true,
      eligible: true,
      adSupported: true,
      rewardKind: 'festival_delivery_points',
      rewardKey: 'festival_delivery_point',
      rewardValue: 1,
      ctaPosition: 'shop_rewards_primary',
      retryCount: 1,
    } as const;

    analytics.trackAdRewardImpression('rewardedGold', 'shop_gold_reward', context, metadata);
    analytics.trackAdRewardClick('rewardedGold', 'shop_gold_reward', context, metadata);
    analytics.trackAdRewardCompleted({
      type: 'rewardedGold',
      placement: 'shop_gold_reward',
      rewardValue: 1,
      context,
      metadata,
    });
    analytics.trackAdRewardFailed(
      'rewardedGold',
      'shop_gold_reward',
      '1006: 광고가 준비되지 않았습니다',
      context,
      metadata
    );
    analytics.trackAdLimitBlocked('rewardedGold', 'shop_gold_reward', 'daily_limit', context, metadata);

    for (const event of [
      'ad_reward_impression',
      'ad_reward_click',
      'ad_reward_completed',
      'ad_reward_failed',
      'ad_limit_blocked',
    ]) {
      expect(track).toHaveBeenCalledWith(
        event,
        expect.objectContaining({
          attempt_id: 'session-1',
          ad_ready: true,
          eligible: true,
          ad_supported: true,
          reward_kind: 'festival_delivery_points',
          reward_key: 'festival_delivery_point',
          reward_value: 1,
          cta_position: 'shop_rewards_primary',
          retry_count: 1,
        })
      );
    }
    expect(track).toHaveBeenCalledWith(
      'ad_reward_failed',
      expect.objectContaining({ failure_family: 'not_ready' })
    );

    const failedParams = track.mock.calls.find(([event]) => event === 'ad_reward_failed')![1] as Record<
      string,
      unknown
    >;
    expect(failedParams).toEqual(
      expect.objectContaining({
        gold: context.gold,
        gold_mantissa: context.gold_mantissa,
        gold_exponent: context.gold_exponent,
        economy_stage_bucket: 'standard',
        plot_count: context.plot_count,
        session_elapsed_sec: context.session_elapsed_sec,
        prestige_level: context.prestige_level,
      })
    );
    expect(failedParams).not.toHaveProperty('speed_level');
    expect(failedParams).not.toHaveProperty('lifetime_harvests');
    // AppsInToss MP의 시장·세션 필드 5개를 더하면 정확히 25개다.
    // 최대 payload의 dev build는 이벤트 계약을 보존하고 debug_mode만 생략한다.
    expect(Object.keys(failedParams)).toHaveLength(20);
    expect(Object.keys(failedParams).length + 5).toBeLessThanOrEqual(25);

    analytics.trackAdRewardCompleted({
      type: 'rewardedGold',
      placement: 'shop_gold_reward',
      rewardValue: 2,
      context,
      metadata: { ...metadata, rewardValue: 999 },
    });
    expect(track).toHaveBeenLastCalledWith(
      'ad_reward_completed',
      expect.objectContaining({ reward_value: 2 })
    );
  });

  test('rewarded-ad failed는 metadata가 없어도 reason에서 failure_family를 자동 파생한다', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const context = getGameAnalyticsContext(createInitialState(), 0, 5_000);

    analytics.trackAdRewardFailed('rewardedGold', 'shop_gold_reward', 'no_fill', context);

    expect(track).toHaveBeenCalledWith(
      'ad_reward_failed',
      expect.objectContaining({ failure_family: 'no_fill' })
    );
  });

  test('리텐션 계측 이벤트를 계약대로 emit한다', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const context = getGameAnalyticsContext(
      createInitialState(),
      Date.parse('2026-05-27T03:00:00.000Z'),
      Date.parse('2026-05-27T03:00:05.000Z')
    );

    analytics.trackDailyBonusOpened({ source: 'more', context });
    analytics.trackDailyBonusClaimed({
      streak: 3,
      rewardValue: 90,
      isFirstClaim: false,
      source: 'more',
      context,
    });
    analytics.trackReturnSummaryShown({ awayMs: 3600000, offlineGold: 1200, readyCropCount: 4, context });
    analytics.trackReturnSummaryCollected({ awayMs: 3600000, offlineGold: 1200, readyCropCount: 4, context });
    analytics.trackCropOfTheDayHarvested({ cropKey: 'carrot', multiplier: 2, context });
    analytics.trackNotificationScheduled({ kind: 'harvest', leadTimeMs: 600000, context });
    analytics.trackNotificationOpened({ kind: 'harvest' });

    expect(track).toHaveBeenCalledWith(
      'daily_bonus_opened',
      expect.objectContaining({ source: 'more', gold: context.gold })
    );
    expect(track).toHaveBeenCalledWith(
      'daily_bonus_claimed',
      expect.objectContaining({
        streak: 3,
        reward_value: 90,
        is_first_claim: false,
        source: 'more',
        gold: context.gold,
      })
    );
    expect(track).toHaveBeenCalledWith(
      'return_summary_shown',
      expect.objectContaining({ away_ms: 3600000, offline_gold: 1200, ready_crop_count: 4 })
    );
    expect(track).toHaveBeenCalledWith(
      'return_summary_collected',
      expect.objectContaining({ away_ms: 3600000, offline_gold: 1200, ready_crop_count: 4 })
    );
    expect(track).toHaveBeenCalledWith(
      'crop_of_the_day_harvested',
      expect.objectContaining({ crop: 'carrot', multiplier: 2 })
    );
    expect(track).toHaveBeenCalledWith(
      'notification_scheduled',
      expect.objectContaining({ notification_kind: 'harvest', lead_time_ms: 600000 })
    );
    // notification_opened은 앱 로드 이전에도 발생할 수 있어 게임 상태 context 없이 emit한다.
    expect(track).toHaveBeenCalledWith('notification_opened', { notification_kind: 'harvest' });
  });

  // #428: 강제 업데이트 게이트 계측(모바일 전용)은 앱 기동 직후 게임 상태 context 이전에
  // 발생할 수 있어 context 없이 정확한 이벤트명·파라미터로 emit한다.
  test('update_gate_shown / update_gate_store_click를 context 없이 정확히 emit한다 (#428)', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);

    analytics.trackUpdateGateShown({ buildNumber: 42, minimumSupportedVersionCode: 50, platform: 'android' });
    analytics.trackUpdateGateStoreClick({ buildNumber: 42, minimumSupportedVersionCode: 50, platform: 'ios' });

    expect(track).toHaveBeenCalledWith('update_gate_shown', {
      build_number: 42,
      minimum_supported_version_code: 50,
      platform: 'android',
    });
    expect(track).toHaveBeenCalledWith('update_gate_store_click', {
      build_number: 42,
      minimum_supported_version_code: 50,
      platform: 'ios',
    });
  });

  // #426: 배치 업그레이드 구매 계측은 단일(upgrade_purchased)과 구분되는 전용 이벤트로
  // levels_purchased/total_cost/from_level/to_level을 context와 함께 emit한다.
  test('upgrade_batch_purchased를 upgrade_kind·levels·비용·from/to_level과 함께 emit한다 (#426)', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const context = getGameAnalyticsContext(createInitialState(), 0, 5_000);

    analytics.trackUpgradeBatchPurchased({
      kind: 'speed',
      levelsPurchased: 10,
      totalCost: 123_456,
      fromLevel: 3,
      toLevel: 13,
      context,
    });

    expect(track).toHaveBeenCalledWith(
      'upgrade_batch_purchased',
      expect.objectContaining({
        upgrade_kind: 'speed',
        levels_purchased: 10,
        total_cost: 123_456,
        from_level: 3,
        to_level: 13,
        gold: context.gold,
      })
    );
  });

  test('경제·업적 custom event와 GA4 권장 game event mirror를 행동당 1회 emit한다 (#453)', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const context = getGameAnalyticsContext(createInitialState(), 0, 5_000);

    analytics.trackUpgradePurchased({ kind: 'speed', cost: 100, nextLevel: 2, context });
    analytics.trackUpgradeBatchPurchased({
      kind: 'profit',
      levelsPurchased: 10,
      totalCost: 250,
      fromLevel: 3,
      toLevel: 13,
      context,
    });
    analytics.trackResearchNodeUnlocked({
      nodeKey: 'market_studies',
      cost: 300,
      nextLevel: 1,
      context,
    });
    analytics.trackResearchNodeBatchUnlocked({
      nodeKey: 'market_studies',
      levelsPurchased: 10,
      totalCost: 450,
      fromLevel: 1,
      toLevel: 11,
      context,
    });
    analytics.trackResearchScalingBulkUnlocked({
      nodeKeys: ['market_studies', 'growth_studies'],
      levelsPurchased: 3,
      totalCost: 500,
      context,
    });
    analytics.trackAchievementClaimed({
      trackKey: 'harvest_total',
      tier: 3,
      starsAwarded: 1,
      context,
    });

    expect(track.mock.calls.filter(([name]) => name === 'spend_virtual_currency')).toEqual([
      ['spend_virtual_currency', {
        value: 100,
        virtual_currency_name: 'gold',
        item_name: 'upgrade:speed',
      }],
      ['spend_virtual_currency', {
        value: 250,
        virtual_currency_name: 'gold',
        item_name: 'upgrade_batch:profit',
      }],
      ['spend_virtual_currency', {
        value: 300,
        virtual_currency_name: 'research_points',
        item_name: 'research:market_studies',
      }],
      ['spend_virtual_currency', {
        value: 450,
        virtual_currency_name: 'research_points',
        item_name: 'research:market_studies',
      }],
      ['spend_virtual_currency', {
        value: 500,
        virtual_currency_name: 'research_points',
        item_name: 'research_scaling_bulk',
      }],
    ]);
    expect(track.mock.calls.filter(([name]) => name === 'unlock_achievement')).toEqual([
      ['unlock_achievement', { achievement_id: 'harvest_total:3' }],
    ]);
    expect(track.mock.calls).toHaveLength(12);

    for (const customEvent of [
      'upgrade_purchased',
      'upgrade_batch_purchased',
      'research_node_unlocked',
      'research_node_batch_unlocked',
      'research_scaling_bulk_unlocked',
      'achievement_claimed',
    ]) {
      expect(track.mock.calls.filter(([name]) => name === customEvent)).toHaveLength(1);
    }
  });

  test('cook_resolved에 광고 성공 보장 적용 여부를 기록한다 (#462)', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const context = getGameAnalyticsContext(createInitialState(), 0, 5_000);

    analytics.trackCookResolved({
      outcome: 'success',
      dishKey: 'carrot_soup',
      grade: 'common',
      isNew: true,
      discoveredCount: 1,
      rewardedAdBoosted: true,
      context,
    });

    expect(track).toHaveBeenCalledWith(
      'cook_resolved',
      expect.objectContaining({
        outcome: 'success',
        dish: 'carrot_soup',
        grade: 'common',
        is_new: true,
        rewarded_ad_boosted: true,
        schema_version: 2,
      })
    );
  });

  test('research_node_batch_unlocked를 node·levels·비용·from/to_level과 함께 emit한다 (#438)', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const context = getGameAnalyticsContext(createInitialState(), 0, 5_000);

    analytics.trackResearchNodeBatchUnlocked({
      nodeKey: 'market_studies',
      levelsPurchased: 10,
      totalCost: 123_456,
      fromLevel: 3,
      toLevel: 13,
      context,
    });

    expect(track).toHaveBeenCalledWith(
      'research_node_batch_unlocked',
      expect.objectContaining({
        node_key: 'market_studies',
        levels_purchased: 10,
        total_cost: 123_456,
        from_level: 3,
        to_level: 13,
        research_points: context.research_points,
      }),
    );
  });

  test('첫 데일리 클레임은 daily_bonus_claimed(is_first_claim=true)와 전용 first_daily_bonus_claimed를 함께 emit한다 (#107)', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const context = getGameAnalyticsContext(
      createInitialState(),
      Date.parse('2026-05-27T03:00:00.000Z'),
      Date.parse('2026-05-27T03:00:05.000Z')
    );

    analytics.trackDailyBonusClaimed({
      streak: 1,
      rewardValue: 50,
      isFirstClaim: true,
      source: 'auto_popup',
      context,
    });

    expect(track).toHaveBeenCalledWith(
      'daily_bonus_claimed',
      expect.objectContaining({ streak: 1, reward_value: 50, is_first_claim: true, source: 'auto_popup' })
    );
    expect(track).toHaveBeenCalledWith(
      'first_daily_bonus_claimed',
      expect.objectContaining({ streak: 1, reward_value: 50, source: 'auto_popup', gold: context.gold })
    );
  });

  test('첫 클레임이 아니면 first_daily_bonus_claimed는 emit되지 않는다 (#107)', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const context = getGameAnalyticsContext(
      createInitialState(),
      Date.parse('2026-05-27T03:00:00.000Z'),
      Date.parse('2026-05-27T03:00:05.000Z')
    );

    analytics.trackDailyBonusClaimed({
      streak: 5,
      rewardValue: 90,
      isFirstClaim: false,
      source: 'welcome_back',
      context,
    });

    expect(track).not.toHaveBeenCalledWith('first_daily_bonus_claimed', expect.anything());
  });

  test('핵심 활성화·리텐션 퍼널 이벤트는 모두 GameAnalyticsContext를 함께 싣는다 (#107 정합성)', () => {
    // 퍼널 코호트 분해가 가능하도록, 게임 상태를 아는 지점에서 발화하는 모든
    // 핵심 퍼널 이벤트에는 context(gold/plot_count/lifetime_harvests 등)가 실려야 한다.
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const context = getGameAnalyticsContext(
      createInitialState(),
      Date.parse('2026-05-27T03:00:00.000Z'),
      Date.parse('2026-05-27T03:00:05.000Z')
    );

    analytics.trackGameStart(context);
    analytics.trackOnboardingStepView({ step: 'plant', stepIndex: 1, context });
    analytics.trackOnboardingComplete({ context });
    analytics.trackSeedSelected('carrot', 'starter_field', true, context);
    analytics.trackCropPlanted('carrot', 'starter_field', 1, 10, context);
    analytics.trackCropHarvested({
      cropKey: 'carrot',
      areaKey: 'starter_field',
      cropTier: 1,
      goldGained: 20,
      researchPointsGained: 0,
      donated: false,
      harvestSource: 'manual',
      isFirstMeaningfulHarvest: true,
      isFirstCropHarvest: true,
      context,
    });
    analytics.trackDailyBonusOpened({ source: 'auto_popup', context });
    analytics.trackDailyBonusClaimed({
      streak: 1,
      rewardValue: 50,
      isFirstClaim: true,
      source: 'auto_popup',
      context,
    });
    analytics.trackReturnSummaryShown({ awayMs: 3600000, offlineGold: 1200, readyCropCount: 4, context });

    const baseContextKeys = Object.keys(getLegacyEventContext(context));
    const funnelEvents = [
      'game_start',
      'onboarding_step_view',
      'onboarding_complete',
      'first_seed_selected',
      'crop_planted',
      'crop_harvested',
      'first_meaningful_harvest',
      'daily_bonus_opened',
      'daily_bonus_claimed',
      'first_daily_bonus_claimed',
      'return_summary_shown',
    ];

    for (const eventName of funnelEvents) {
      const call = track.mock.calls.find(([name]) => name === eventName);
      expect(call).toBeDefined();
      const params = call![1] as Record<string, unknown>;
      for (const key of baseContextKeys) {
        expect(params).toHaveProperty(key);
      }
    }

    const gameStartParams = track.mock.calls.find(([name]) => name === 'game_start')![1] as Record<
      string,
      unknown
    >;
    expect(gameStartParams).toEqual(
      expect.objectContaining({
        gold_is_saturated: context.gold_is_saturated,
        research_points_mantissa: context.research_points_mantissa,
        research_points_exponent: context.research_points_exponent,
        research_points_is_saturated: context.research_points_is_saturated,
      })
    );
  });

  test('notification_scheduled는 context/leadTime 없이도 emit된다', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);

    analytics.trackNotificationScheduled({ kind: 'daily_bonus' });

    expect(track).toHaveBeenCalledWith('notification_scheduled', { notification_kind: 'daily_bonus' });
  });

  test('온보딩 퍼널 이벤트(step_view·skip·complete)를 계약대로 emit한다 (#159)', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const context = getGameAnalyticsContext(
      createInitialState(),
      Date.parse('2026-05-27T03:00:00.000Z'),
      Date.parse('2026-05-27T03:00:05.000Z')
    );

    analytics.trackOnboardingStepView({ step: 'plant', stepIndex: 1, context });
    analytics.trackOnboardingSkip({ skippedStep: 'harvest', stepIndex: 3, context });
    analytics.trackOnboardingComplete({ context });

    expect(track).toHaveBeenCalledWith(
      'onboarding_step_view',
      expect.objectContaining({ step: 'plant', step_index: 1, gold: context.gold })
    );
    expect(track).toHaveBeenCalledWith(
      'onboarding_skip',
      expect.objectContaining({ skipped_step: 'harvest', step_index: 3, gold: context.gold })
    );
    expect(track).toHaveBeenCalledWith('onboarding_complete', expect.objectContaining({ gold: context.gold }));
  });

  test('동물 퍼널 5개 이벤트를 exact payload로 emit하고 AIT 파라미터 예산을 지킨다 (#349)', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const context = getGameAnalyticsContext(createInitialState(), 0, 5_000);

    analytics.trackAnimalsScreen({
      source: 'welcome_back',
      ownedCount: 3,
      feedingCount: 2,
      readyCount: 1,
      context,
    });
    analytics.trackAnimalPurchased({ animalKey: 'chicken', purchaseCost: 600, ownedCountAfter: 4, context });
    analytics.trackAnimalFed({
      animalKey: 'chicken',
      feedCost: 20,
      produceTimerMs: 60_000,
      ownedCount: 4,
      context,
    });
    analytics.trackAnimalProduceCollected({
      animalKey: 'chicken',
      collectionMode: 'single',
      baseRevenue: 35,
      finalRevenue: 35,
      isRare: false,
      rareMultiplier: 1,
      readyWaitMs: 321,
      context,
    });
    analytics.trackAnimalProduceCollectAll({
      collectedCount: 2,
      baseRevenueTotal: 100,
      finalRevenueTotal: 100,
      rareCount: 0,
      context,
    });

    expect(track.mock.calls).toEqual([
      ['animals_screen', {
        source: 'welcome_back',
        owned_count: 3,
        feeding_count: 2,
        ready_count: 1,
        schema_version: 1,
        ...getLegacyEventContext(context),
      }],
      ['animal_purchased', {
        animal: 'chicken',
        purchase_cost: 600,
        owned_count_after: 4,
        schema_version: 1,
        ...getLegacyEventContext(context),
      }],
      ['animal_fed', {
        animal: 'chicken',
        feed_cost: 20,
        produce_timer_ms: 60_000,
        owned_count: 4,
        schema_version: 1,
        ...getLegacyEventContext(context),
      }],
      ['animal_produce_collected', {
        animal: 'chicken',
        collection_mode: 'single',
        base_revenue: 35,
        final_revenue: 35,
        is_rare: false,
        rare_multiplier: 1,
        ready_wait_ms: 321,
        schema_version: 1,
        ...getLegacyEventContext(context),
      }],
      ['animal_produce_collect_all', {
        collected_count: 2,
        base_revenue_total: 100,
        final_revenue_total: 100,
        rare_count: 0,
        schema_version: 1,
        ...getLegacyEventContext(context),
      }],
    ]);

    for (const [, params] of track.mock.calls) {
      expect(Object.keys(params as Record<string, unknown>).length).toBeLessThanOrEqual(25);
    }
    expect(toFirebaseAnalyticsParams(track.mock.calls[3]![1])).toEqual(
      expect.objectContaining({ is_rare: 0, rare_multiplier: 1 })
    );
  });

  test('공방(가공) 퍼널 5개 이벤트를 exact payload로 emit하고 AIT 파라미터 예산을 지킨다 (#421)', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const context = getGameAnalyticsContext(createInitialState(), 0, 5_000);

    analytics.trackProductionScreen({ source: 'more', craftingCount: 2, readyCount: 1, context });
    analytics.trackCraftStarted({ recipeKey: 'bread', context });
    analytics.trackCraftCollected({ recipeKey: 'bread', revenue: 300, context });
    analytics.trackCraftCanceled({ recipeKey: 'bread', refundedCount: 3, context });
    analytics.trackCraftCollectAll({ collectedCount: 4, totalGold: 1200, context });

    expect(track.mock.calls).toEqual([
      ['production_screen', {
        source: 'more',
        crafting_count: 2,
        ready_count: 1,
        schema_version: 1,
        ...getLegacyEventContext(context),
      }],
      ['craft_started', {
        recipe: 'bread',
        schema_version: 1,
        ...getLegacyEventContext(context),
      }],
      ['craft_collected', {
        recipe: 'bread',
        revenue: 300,
        schema_version: 1,
        ...getLegacyEventContext(context),
      }],
      ['craft_canceled', {
        recipe: 'bread',
        refunded_count: 3,
        schema_version: 1,
        ...getLegacyEventContext(context),
      }],
      ['craft_collect_all', {
        collected_count: 4,
        total_gold: 1200,
        schema_version: 1,
        ...getLegacyEventContext(context),
      }],
    ]);

    // GA4 이벤트당 25개 파라미터 예산(context 12 + 이벤트 필드)을 넘지 않는다.
    for (const [, params] of track.mock.calls) {
      expect(Object.keys(params as Record<string, unknown>).length).toBeLessThanOrEqual(25);
    }
    // 컨텍스트의 gold(보유 골드)와 수집 수익이 충돌하지 않도록 craft_collected는 revenue로 기록한다.
    expect(track.mock.calls[2]![1]).not.toHaveProperty('gold', 300);
    expect(track.mock.calls[2]![1]).toHaveProperty('gold', context.gold);
  });

  test('AC-1: analytics.ts에 trackCraftStarted/trackCraftCollected/trackCraftCanceled/trackCraftCollectAll/trackProductionScreen 추가 (recipe key·수량·GameAnalyticsContext 파라미터) (#421)', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const context = getGameAnalyticsContext(createInitialState(), 0, 5_000);
    const contextKeys = Object.keys(getLegacyEventContext(context));

    // 다섯 트래커가 analytics.ts에 실제로 추가돼 함수로 존재한다.
    expect(typeof analytics.trackProductionScreen).toBe('function');
    expect(typeof analytics.trackCraftStarted).toBe('function');
    expect(typeof analytics.trackCraftCollected).toBe('function');
    expect(typeof analytics.trackCraftCanceled).toBe('function');
    expect(typeof analytics.trackCraftCollectAll).toBe('function');

    // 호출 시 각 이벤트가 계약된 파라미터로 발화된다.
    analytics.trackProductionScreen({ source: 'more', craftingCount: 2, readyCount: 1, context });
    analytics.trackCraftStarted({ recipeKey: 'bread', context });
    analytics.trackCraftCollected({ recipeKey: 'bread', revenue: 300, context });
    analytics.trackCraftCanceled({ recipeKey: 'bread', refundedCount: 3, context });
    analytics.trackCraftCollectAll({ collectedCount: 4, totalGold: 1200, context });

    const byName = Object.fromEntries(track.mock.calls.map(([name, params]) => [name, params]));

    // recipe key 파라미터(시작/수집/취소).
    expect(byName.craft_started).toEqual(expect.objectContaining({ recipe: 'bread' }));
    expect(byName.craft_collected).toEqual(expect.objectContaining({ recipe: 'bread' }));
    expect(byName.craft_canceled).toEqual(expect.objectContaining({ recipe: 'bread' }));

    // 수량 파라미터(수집 수익·환불량·일괄 건수·시트 오픈 카운트).
    expect(byName.craft_collected).toEqual(expect.objectContaining({ revenue: 300 }));
    expect(byName.craft_canceled).toEqual(expect.objectContaining({ refunded_count: 3 }));
    expect(byName.craft_collect_all).toEqual(expect.objectContaining({ collected_count: 4, total_gold: 1200 }));
    expect(byName.production_screen).toEqual(expect.objectContaining({ crafting_count: 2, ready_count: 1 }));

    // 모든 공방 이벤트가 파라미터 예산 내의 기존 GameAnalyticsContext 키를 포함한다.
    for (const name of ['production_screen', 'craft_started', 'craft_collected', 'craft_canceled', 'craft_collect_all']) {
      for (const key of contextKeys) {
        expect(byName[name]).toHaveProperty(key);
      }
    }
  });
});

describe('Firebase 애널리틱스 값 정규화(공유 어댑터 헬퍼)', () => {
  test('후반 골드를 가수·지수로 분해하고 비유한값은 0으로 정규화한다', () => {
    expect(toAnalyticsScientificParts(1e15)).toEqual({ mantissa: 1, exponent: 15 });
    expect(toAnalyticsScientificParts(1e50)).toEqual({ mantissa: 1, exponent: 50 });
    expect(toAnalyticsScientificParts(1e100)).toEqual({ mantissa: 1, exponent: 100 });
    expect(toAnalyticsScientificParts(0)).toEqual({ mantissa: 0, exponent: 0 });
    expect(toAnalyticsScientificParts(Number.NaN)).toEqual({ mantissa: 0, exponent: 0 });
    expect(toAnalyticsScientificParts(Number.POSITIVE_INFINITY)).toEqual({ mantissa: 0, exponent: 0 });
  });

  test('boolean은 1/0으로, 비유한 number는 0으로, 그 외는 그대로 변환한다', () => {
    expect(toFirebaseAnalyticsValue(true)).toBe(1);
    expect(toFirebaseAnalyticsValue(false)).toBe(0);
    expect(toFirebaseAnalyticsValue(42)).toBe(42);
    expect(toFirebaseAnalyticsValue(Number.NaN)).toBe(0);
    expect(toFirebaseAnalyticsValue(Number.POSITIVE_INFINITY)).toBe(0);
    expect(toFirebaseAnalyticsValue('carrot')).toBe('carrot');
  });

  test('파라미터 레코드의 모든 값을 Firebase가 받을 수 있는 스칼라로 정규화한다', () => {
    expect(toFirebaseAnalyticsParams({ enabled: true, count: 3, label: 'shop' })).toEqual({
      enabled: 1,
      count: 3,
      label: 'shop',
    });
    // 빈 입력은 빈 객체를 돌려준다(호출부에서 플랫폼 공통 필드와 합칠 수 있도록).
    expect(toFirebaseAnalyticsParams()).toEqual({});
  });
});
