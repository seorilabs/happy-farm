import {
  accumulateAutoHarvestSummary,
  createAutoHarvestSummaryState,
  isAutoHarvestSummaryDue,
} from '../autoHarvestSummary';
import { createFarmAnalytics, getGameAnalyticsContext } from '../analytics';
import { createInitialState } from '../constants';

describe('auto harvest analytics summary (#437)', () => {
  test('10,000회 자동수확도 crop bucket summary 1건으로 압축한다', () => {
    const state = accumulateAutoHarvestSummary(
      createAutoHarvestSummaryState(),
      Array.from({ length: 10_000 }, () => ({
        cropKey: 'carrot' as const,
        areaKey: 'starter_field' as const,
        cropTier: 1,
        goldGained: 14,
        researchPointsGained: 0,
        replanted: true,
      })),
      1_000,
    );

    expect(state).toEqual({
      harvestedCount: 10_000,
      windowStartedAt: 1_000,
      buckets: [
        {
          cropKey: 'carrot',
          areaKey: 'starter_field',
          cropTier: 1,
          harvestedCount: 10_000,
          replantedCount: 10_000,
          totalGold: 140_000,
          totalResearchPoints: 0,
        },
      ],
    });
    expect(isAutoHarvestSummaryDue(state, 60_999, 60_000)).toBe(false);
    expect(isAutoHarvestSummaryDue(state, 61_000, 60_000)).toBe(true);

    const track = jest.fn();
    const analytics = createFarmAnalytics(track);
    const bucket = state.buckets[0]!;
    analytics.trackAutoHarvestSummary({
      ...bucket,
      windowSeconds: 60,
      context: getGameAnalyticsContext(createInitialState(), 0, 61_000),
    });
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith(
      'auto_harvest_summary',
      expect.objectContaining({
        crop: 'carrot',
        area: 'starter_field',
        harvested_count: 10_000,
        replanted_count: 10_000,
        total_gold: 140_000,
        schema_version: 2,
      }),
    );
  });

  test('crop/area/tier가 다른 결과는 별도 bucket으로 유지한다', () => {
    const state = accumulateAutoHarvestSummary(
      createAutoHarvestSummaryState(),
      [
        {
          cropKey: 'carrot',
          areaKey: 'starter_field',
          cropTier: 1,
          goldGained: 14,
          researchPointsGained: 0,
          replanted: true,
        },
        {
          cropKey: 'wheat',
          areaKey: 'starter_field',
          cropTier: 1,
          goldGained: 0,
          researchPointsGained: 3,
          replanted: false,
        },
      ],
      2_000,
    );

    expect(state.harvestedCount).toBe(2);
    expect(state.buckets).toHaveLength(2);
    expect(state.buckets[1]).toEqual(
      expect.objectContaining({
        cropKey: 'wheat',
        harvestedCount: 1,
        replantedCount: 0,
        totalGold: 0,
        totalResearchPoints: 3,
      }),
    );
  });
});
