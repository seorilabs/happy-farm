/// <reference types="jest" />

import { getRewardedAdPlacement } from '../ads';
import {
  createFarmAnalytics,
  getGameAnalyticsContext,
  toFirebaseAnalyticsParams,
  toFirebaseAnalyticsValue,
} from '../analytics';
import { createInitialState } from '../constants';

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
    analytics.trackOnboardingStepView({ step: 'selectSeed', stepIndex: 1, context });
    analytics.trackOnboardingComplete({ context });
    analytics.trackSeedSelected('carrot', 'starter_field', true, context);
    analytics.trackCropPlanted('carrot', 'starter_field', 1, 10, context);
    analytics.trackCropHarvested({
      cropKey: 'carrot',
      areaKey: 'starter_field',
      cropTier: 1,
      revenue: 20,
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

    const contextKeys = Object.keys(context);
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
      for (const key of contextKeys) {
        expect(params).toHaveProperty(key);
      }
    }
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

    analytics.trackOnboardingStepView({ step: 'selectSeed', stepIndex: 1, context });
    analytics.trackOnboardingSkip({ skippedStep: 'harvest', stepIndex: 3, context });
    analytics.trackOnboardingComplete({ context });

    expect(track).toHaveBeenCalledWith(
      'onboarding_step_view',
      expect.objectContaining({ step: 'selectSeed', step_index: 1, gold: context.gold })
    );
    expect(track).toHaveBeenCalledWith(
      'onboarding_skip',
      expect.objectContaining({ skipped_step: 'harvest', step_index: 3, gold: context.gold })
    );
    expect(track).toHaveBeenCalledWith('onboarding_complete', expect.objectContaining({ gold: context.gold }));
  });
});

describe('Firebase 애널리틱스 값 정규화(공유 어댑터 헬퍼)', () => {
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
