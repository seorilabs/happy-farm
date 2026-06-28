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
  });

  test('리텐션 계측 이벤트를 계약대로 emit한다', () => {
    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const context = getGameAnalyticsContext(
      createInitialState(),
      Date.parse('2026-05-27T03:00:00.000Z'),
      Date.parse('2026-05-27T03:00:05.000Z')
    );

    analytics.trackDailyBonusClaimed({ streak: 3, rewardValue: 90, context });
    analytics.trackReturnSummaryShown({ awayMs: 3600000, offlineGold: 1200, readyCropCount: 4, context });
    analytics.trackReturnSummaryCollected({ awayMs: 3600000, offlineGold: 1200, readyCropCount: 4, context });
    analytics.trackCropOfTheDayHarvested({ cropKey: 'carrot', multiplier: 2, context });
    analytics.trackNotificationScheduled({ kind: 'harvest', leadTimeMs: 600000, context });
    analytics.trackNotificationOpened({ kind: 'harvest' });

    expect(track).toHaveBeenCalledWith(
      'daily_bonus_claimed',
      expect.objectContaining({ streak: 3, reward_value: 90, gold: context.gold })
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
