/// <reference types="jest" />

import React from 'react';
import { StyleSheet, Vibration } from 'react-native';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import {
  ACHIEVEMENT_TRACKS,
  ANIMALS,
  COLLECTION_AREA_REWARDS,
  CROPS,
  DEFAULT_LOCALE,
  FARM_AREAS,
  HARVEST_BONUS_AD_COOLDOWN_MS,
  HARVEST_BONUS_BOOST_DURATION_MS,
  HARVEST_BONUS_MULTIPLIER,
  MAX_PLOTS,
  PLOT_DISCOUNT_AD_DAILY_LIMIT,
  REWARDED_GOLD_MAX_USES_PER_WINDOW,
  REWARDED_GOLD_WINDOW_MS,
  PRESTIGE_STARS_BASE,
  PRODUCTION_RECIPES,
  REGION_ARCHETYPES,
  createFarmAnalytics,
  createInitialState,
  formatMoney,
  getActiveFarmOfflineGold,
  getAreaCropKeys,
  getCropOfTheDayStatus,
  getFertilizerCost,
  getWeeklyEventStatus,
  getEnvironmentTone,
  getLocalMinutesOfDay,
  getMasteryThresholds,
  getPrestigeCost,
  getRegionArchetypeLabel,
  sortCropKeysForStrip,
  type AreaKey,
  type CropKey,
  type GameState,
  type RewardedAdController,
  type RewardedAdShowResult,
} from '../../../../../packages/farm-core/src';
import { getFarmMessages, type FarmGameNotifications } from '../../../../../packages/farm-ui/src';

const NOW = Date.parse('2026-05-27T03:00:00.000Z');

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const farmGameModule = jest.requireActual(
  '../../../../../packages/farm-ui/src/FarmGame'
) as typeof import('../../../../../packages/farm-ui/src/FarmGame');
const FarmGame = farmGameModule.default;
const {
  GAME_TICK_INTERVAL_MS,
  MASTERY_RANK_UP_CELEBRATION_DURATION_MS,
  PRESTIGE_GRADUATION_CELEBRATION_DURATION_MS,
  FIRST_HARVEST_CELEBRATION_DURATION_MS,
  ONBOARDING_STALL_MS,
  COMBO_GREAT_THRESHOLD,
  COMBO_LEGENDARY_THRESHOLD,
} = farmGameModule;
const { __setGoldPulseTestHook } = jest.requireActual<
  typeof import('../../../../../packages/farm-ui/src/farmGoldPulse')
>('../../../../../packages/farm-ui/src/farmGoldPulse');
const mockPersistence = {
  readPersistedGameState: jest.fn<Promise<GameState>, []>(),
  writePersistedGameState: jest.fn<Promise<void>, [GameState]>(),
  removePersistedGameState: jest.fn<Promise<void>, []>(),
  readPersistedGameSettings: jest.fn(),
  writePersistedGameSettings: jest.fn(),
  readLastSeenAt: jest.fn<Promise<number | null>, []>(),
  writeLastSeenAt: jest.fn<Promise<void>, [number]>(),
};

function getCropKeys() {
  return Object.keys(CROPS) as CropKey[];
}

function createLateGameState(): GameState {
  const base = createInitialState();
  const keys = getCropKeys();
  const firstCropKey = keys[0];
  if (firstCropKey == null) {
    throw new Error('FarmGame tests require at least one crop.');
  }

  return {
    ...base,
    gold: 9.876e20,
    unlockedPlotCount: MAX_PLOTS,
    unlockedAreas: FARM_AREAS.map((area) => area.key),
    harvestedCropKeys: keys,
    upgrades: { speed: 42, profit: 42 },
    plots: base.plots.map((plot, index) => ({
      ...plot,
      cropType: keys[index % keys.length] ?? firstCropKey,
      startTime: NOW - 10_000,
      state: 2,
    })),
  };
}

function createReadyHarvestState(): GameState {
  const base = createInitialState();

  return {
    ...base,
    plots: base.plots.map((plot, index) =>
      index < 2
        ? {
            ...plot,
            cropType: 'carrot',
            startTime: NOW - 10_000,
            state: 2 as const,
          }
        : plot
    ),
  };
}

function createGrowingCropState(): GameState {
  const base = createInitialState();

  return {
    ...base,
    gold: 100,
    plots: base.plots.map((plot, index) =>
      index === 0
        ? {
            ...plot,
            cropType: 'wheat',
            startTime: NOW,
            state: 1 as const,
          }
        : plot
    ),
  };
}

function createGrowingLongCropState(cropKey: CropKey): GameState {
  const base = createInitialState();

  return {
    ...base,
    unlockedAreas: FARM_AREAS.map((area) => area.key),
    upgrades: { speed: 42, profit: 42 },
    plots: base.plots.map((plot, index) =>
      index === 0
        ? {
            ...plot,
            cropType: cropKey,
            startTime: NOW,
            state: 1 as const,
          }
        : plot
    ),
  };
}

function createShopReadyState(): GameState {
  const base = createInitialState();

  return {
    ...base,
    gold: 10_000,
    harvestedCropKeys: getCropKeys().slice(0, 5),
  };
}

function createActiveBoostState(now = NOW): GameState {
  const base = createInitialState();
  return {
    ...base,
    adUsage: {
      ...base.adUsage,
      harvestBonusAd: {
        ...base.adUsage.harvestBonusAd,
        boostEndsAt: now + HARVEST_BONUS_BOOST_DURATION_MS,
      },
    },
  };
}

async function renderGame(
  savedState: GameState | null,
  props: Partial<React.ComponentProps<typeof FarmGame>> = {},
  savedSettings: unknown = null,
  options: { preserveOnboarding?: boolean } = {}
) {
  const state = savedState ?? createInitialState();
  mockPersistence.readPersistedGameState.mockResolvedValueOnce(
    options.preserveOnboarding
      ? state
      : {
          ...state,
          onboardingCompleted: true,
          onboardingStep: null,
        }
  );
  mockPersistence.readPersistedGameSettings.mockResolvedValueOnce(savedSettings);

  const view = render(<FarmGame persistence={mockPersistence} {...props} />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  return view;
}

function getLatestPersistedState(): GameState {
  const calls = mockPersistence.writePersistedGameState.mock.calls;
  const latest = calls[calls.length - 1]?.[0];
  if (latest == null) {
    throw new Error('FarmGame did not persist a game state.');
  }
  return latest;
}

function createRewardedAd(result: RewardedAdShowResult): RewardedAdController {
  return {
    isAdReady: true,
    isAdSupported: true,
    showAd: jest.fn(async () => result),
  };
}

function createReadyRewardedAd() {
  return createRewardedAd({ status: 'earned' });
}

function createThrowingRewardedAd(error = new Error('sdk dynamic failure message')): RewardedAdController {
  return {
    isAdReady: true,
    isAdSupported: true,
    showAd: jest.fn(async () => {
      throw error;
    }),
  };
}

// CI runners are typically 3-5× slower than local; 30 s gives enough headroom
// for the heaviest tests (first-run module warmup, rewarded ad flows) without
// letting a genuinely hung test pass unnoticed.
jest.setTimeout(30000);

describe('FarmGame UI flow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    mockPersistence.readPersistedGameState.mockReset();
    mockPersistence.writePersistedGameState.mockResolvedValue(undefined);
    mockPersistence.removePersistedGameState.mockResolvedValue(undefined);
    mockPersistence.readPersistedGameSettings.mockReset();
    mockPersistence.writePersistedGameSettings.mockResolvedValue(undefined);
    mockPersistence.readLastSeenAt.mockReset();
    mockPersistence.readLastSeenAt.mockResolvedValue(null);
    mockPersistence.writeLastSeenAt.mockReset();
    mockPersistence.writeLastSeenAt.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  test('applies the time-of-day environment tone to the top-level background', async () => {
    const screen = await renderGame(null);

    const rootBackground = () =>
      StyleSheet.flatten(screen.getByTestId('farm-root').props.style).backgroundColor;
    const expectedToneNow = () => getEnvironmentTone(getLocalMinutesOfDay(new Date())).backgroundColor;
    const expectedPhaseNow = () => getEnvironmentTone(getLocalMinutesOfDay(new Date())).phase;
    const backdropNow = () => screen.UNSAFE_getByProps({ testID: `environment-backdrop-${expectedPhaseNow()}` });

    // The backdrop reflects the current local time's tone (NOW from beforeEach).
    expect(rootBackground()).toBe(expectedToneNow());
    expect(backdropNow()).toBeTruthy();
    const firstBackground = rootBackground();
    const firstPhase = expectedPhaseNow();

    const farmStage = screen.getByTestId('farm-stage');
    const backdropChild = farmStage.children[0];
    const scrollChild = farmStage.children[1];
    if (
      backdropChild == null ||
      scrollChild == null ||
      typeof backdropChild === 'string' ||
      typeof scrollChild === 'string'
    ) {
      throw new Error('farm stage must render the absolute backdrop before the farm scroll view');
    }
    expect(backdropChild.props.phase).toBe(firstPhase);
    expect(scrollChild.props.testID).toBe('farm-scroll');
    expect(screen.getByTestId('plot-grid')).toBeTruthy();

    // Advancing 12h lands in a different phase; one game tick re-renders and the
    // backdrop tracks the new minute's tone (proves the wiring, not just the math).
    await act(async () => {
      jest.setSystemTime(NOW + 12 * 60 * 60 * 1000);
      jest.advanceTimersByTime(GAME_TICK_INTERVAL_MS);
      await Promise.resolve();
    });

    expect(rootBackground()).toBe(expectedToneNow());
    expect(rootBackground()).not.toBe(firstBackground);
    expect(expectedPhaseNow()).not.toBe(firstPhase);
    expect(backdropNow()).toBeTruthy();
  });

  test('renders initial farm and supports a plant-grow-harvest loop', async () => {
    const screen = await renderGame(null);

    await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
    expect(screen.getByText('50G')).toBeTruthy();
    // 연구레벨 배지는 '농장 현황' 시트로 이동(#233) — 메인 화면에 상시 노출되지 않는다.
    expect(screen.queryByText('연구 Lv.1')).toBeNull();
    expect(screen.getByText(/생산성 약 /)).toBeTruthy();
    expect(screen.queryByText('새 구역 조건')).toBeNull();
    expect(screen.getAllByText('빈 밭')).toHaveLength(6);
    expect(screen.getByText('당근')).toBeTruthy();
    expect(screen.getByText('효율 +40%')).toBeTruthy();

    // Use the stable testID added to each area tab so text duplication with the
    // next-goal bar in the header cannot cause a selector collision.
    fireEvent.press(screen.getByTestId('area-tab-vegetable_field'));
    expect(screen.getByText('채소 밭 열기 조건')).toBeTruthy();
    fireEvent.press(screen.getByTestId('area-tab-starter_field'));

    fireEvent.press(screen.getByText('당근'));
    expect(screen.getByText('당근 심기 · 10G · 투자효율 +40%')).toBeTruthy();

    const firstEmptyPlot = screen.getAllByText('빈 밭')[0];
    expect(firstEmptyPlot).toBeDefined();
    fireEvent.press(firstEmptyPlot!);

    expect(screen.getByText('40G')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(2500);
    });

    await waitFor(() => expect(screen.getByText('GET')).toBeTruthy());

    fireEvent.press(screen.getByText('GET'));

    expect(screen.getByText('54G')).toBeTruthy();
    expect(screen.getAllByText('빈 밭')).toHaveLength(6);
    // Harvesting spawns a floating "+gold" burst at the tapped plot (gained 14G).
    expect(screen.getByText('+14')).toBeTruthy();
  });

  test('plants every affordable empty plot at once via "Plant All"', async () => {
    // Past onboarding (the batch shortcut is intentionally hidden during the
    // guided tutorial), with the starter 50 gold and six empty plots.
    const state: GameState = { ...createInitialState(), onboardingCompleted: true };
    const screen = await renderGame(state);

    await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
    expect(screen.getByText('50G')).toBeTruthy();
    expect(screen.getAllByText('빈 밭')).toHaveLength(6);

    fireEvent.press(screen.getByText('당근'));
    // 50G ÷ 10G ⇒ 5 of the 6 empty plots are affordable.
    fireEvent.press(screen.getByText('🌱 모두 심기 5 · 50G'));

    // Gold is fully spent and only the one unaffordable plot remains empty.
    expect(screen.getByText('0G')).toBeTruthy();
    expect(screen.getAllByText('빈 밭')).toHaveLength(1);
    // With no gold left to fill the last plot, the shortcut disappears.
    expect(screen.queryByText('🌱 모두 심기 5 · 50G')).toBeNull();
  });

  test('plot-discount reward desc shows the original price before the discounted one', () => {
    // Locks the (percent, originalPrice, discountedPrice) arg order so a call-site
    // mismatch (which still type-checks) can't silently surface a wrong price.
    const ko = getFarmMessages('ko-KR').rewardedPlotReadyDesc(50, '1,200', '600');
    expect(ko).toContain('1,200');
    expect(ko).toContain('600');
    expect(ko).toContain('50');
    expect(ko.indexOf('1,200')).toBeLessThan(ko.indexOf('600'));

    const en = getFarmMessages('en-US').rewardedPlotReadyDesc(50, '1,200', '600');
    expect(en).toContain('50% off');
    expect(en.indexOf('1,200')).toBeLessThan(en.indexOf('600'));
  });

  test('shows the upcoming weekend-festival teaser in the stats sheet on a weekday (#233)', async () => {
    // Default NOW (set in beforeEach) is a Wednesday → festival inactive → teaser.
    // 주말 축제 정보는 이제 상단 HUD가 아니라 '농장 현황' 시트에 있다(#233): chip으로 진입.
    const screen = await renderGame(null);
    await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
    expect(screen.queryByTestId('weekly-event-teaser')).toBeNull();
    fireEvent.press(screen.getByTestId('cotd-chip'));
    await waitFor(() => expect(screen.getByTestId('weekly-event-teaser')).toBeTruthy());
    expect(screen.queryByTestId('weekly-event-banner')).toBeNull();
  });

  test('shows the live festival banner (not the teaser) in the stats sheet on the weekend (#233)', async () => {
    // Jump to a Friday (UTC) before rendering → festival live → banner, no teaser.
    jest.setSystemTime(Date.parse('2026-05-29T12:00:00.000Z'));
    const screen = await renderGame(null);
    await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
    fireEvent.press(screen.getByTestId('cotd-chip'));
    await waitFor(() => expect(screen.getByTestId('weekly-event-banner')).toBeTruthy());
    expect(screen.queryByTestId('weekly-event-teaser')).toBeNull();
  });

  test('slims the top HUD to gold + net/h + crop-of-the-day chip; secondary stats live behind the stats sheet (#233)', async () => {
    const messages = getFarmMessages(DEFAULT_LOCALE);
    const screen = await renderGame(null, { preferredLocale: DEFAULT_LOCALE });
    await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

    // 상시 노출은 시간당 순수익 + 오늘의 작물 chip. 보조 지표(연구레벨·수익/성장 배수)는
    // 메인 화면에 상시 노출되지 않는다.
    expect(screen.getByTestId('cotd-chip')).toBeTruthy();
    expect(screen.queryByTestId('stats-sheet')).toBeNull();
    expect(screen.queryByText(/연구 Lv\./)).toBeNull();
    expect(screen.queryByText(messages.profitLabel)).toBeNull();
    expect(screen.queryByText(messages.growthLabel)).toBeNull();

    // chip 탭 → '농장 현황' 시트가 열리고, 이동한 보조 지표가 시트에 노출된다.
    fireEvent.press(screen.getByTestId('cotd-chip'));
    await waitFor(() => expect(screen.getByTestId('stats-sheet')).toBeTruthy());
    expect(screen.getByText(messages.sheetTitleStats)).toBeTruthy();
    expect(screen.getByText(/연구 Lv\./)).toBeTruthy();
    expect(screen.getByText(messages.profitLabel)).toBeTruthy();
    expect(screen.getByText(messages.growthLabel)).toBeTruthy();
  });

  describe('seed-strip sell-bonus badges (#226)', () => {
    const FRIDAY = Date.parse('2026-05-29T12:00:00.000Z');
    // starter_field 하나만 해금해 두면 주말 축제 추첨 풀이 그 구역으로 고정되고,
    // 오늘의 작물 추첨 풀도 그 구역 작물로 좁혀져 배지 대상이 결정적이 된다.
    const badgeState = (): GameState => ({
      ...createInitialState(),
      onboardingCompleted: true,
      unlockedAreas: ['starter_field'] as AreaKey[],
      gold: 10_000,
    });

    test('marks only the crop-of-the-day seed with the sell-bonus badge (weekday: no festival)', async () => {
      // 기본 NOW(수요일)은 축제 비활성 → 오늘의 작물 배지만 떠야 한다.
      const state = badgeState();
      const featuredKey = getCropOfTheDayStatus(NOW, state).cropKey;
      const screen = await renderGame(state);
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      // 오늘의 작물 배지는 정확히 그 작물 하나에만, HUD 배너와 같은 ×2 로 노출된다.
      const cotdBadges = screen.getAllByTestId(/^seed-bonus-cotd-/);
      expect(cotdBadges).toHaveLength(1);
      expect(cotdBadges[0]!.props.testID).toBe(`seed-bonus-cotd-${featuredKey}`);
      expect(within(cotdBadges[0]!).getByText('⭐×2')).toBeTruthy();

      // 축제 비활성 요일이므로 주말 배지는 어떤 작물에도 없다.
      expect(screen.queryAllByTestId(/^seed-bonus-weekly-/)).toHaveLength(0);
    });

    test('marks every featured-area seed with the weekend-festival badge on the weekend', async () => {
      jest.setSystemTime(FRIDAY);
      const state = badgeState();
      const status = getWeeklyEventStatus(FRIDAY, state.unlockedAreas);
      const festivalCropKeys = status.cropKeys;
      expect(festivalCropKeys.length).toBeGreaterThan(1);
      // 축제 종류(#243)에 따라 배지 아이콘이 달라진다: 판매=🎉, 수확(성장속도)=⚡.
      const expectedBadge = `${status.axis === 'speed' ? '⚡' : '🎉'}×${status.multiplier}`;
      const screen = await renderGame(state);
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      // 축제 대상 구역(starter_field)의 모든 작물에 축제 배지가 붙는다.
      for (const cropKey of festivalCropKeys) {
        const badge = screen.getByTestId(`seed-bonus-weekly-${cropKey}`);
        expect(within(badge).getByText(expectedBadge)).toBeTruthy();
      }
      expect(screen.getAllByTestId(/^seed-bonus-weekly-/)).toHaveLength(festivalCropKeys.length);
    });

    test('shows both badges on a crop that is both the daily feature and in the festival area', async () => {
      jest.setSystemTime(FRIDAY);
      const state = badgeState();
      // 풀이 starter_field 로 좁혀져 있어 오늘의 작물도 축제 구역 작물이다 → 두 배지 공존.
      const featuredKey = getCropOfTheDayStatus(FRIDAY, state).cropKey;
      const status = getWeeklyEventStatus(FRIDAY, state.unlockedAreas);
      const expectedWeeklyBadge = `${status.axis === 'speed' ? '⚡' : '🎉'}×${status.multiplier}`;
      const screen = await renderGame(state);
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      expect(within(screen.getByTestId(`seed-bonus-cotd-${featuredKey}`)).getByText('⭐×2')).toBeTruthy();
      expect(within(screen.getByTestId(`seed-bonus-weekly-${featuredKey}`)).getByText(expectedWeeklyBadge)).toBeTruthy();
    });

    test('exposes the sell bonus in the seed button accessibility label (ko-KR)', async () => {
      const state = badgeState();
      const featuredKey = getCropOfTheDayStatus(NOW, state).cropKey;
      const screen = await renderGame(state);
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
      const label = screen.getByTestId(`seed-tool-${featuredKey}`).props.accessibilityLabel as string;
      expect(label).toContain(getFarmMessages('ko-KR').cropOfTheDayLabel);
    });

    test('exposes the sell bonus in the seed button accessibility label (en-US)', async () => {
      const state = badgeState();
      const featuredKey = getCropOfTheDayStatus(NOW, state).cropKey;
      const screen = await renderGame(state, {}, { locale: 'en-US' });
      await waitFor(() => expect(screen.getByText('Happy Farm')).toBeTruthy());
      const label = screen.getByTestId(`seed-tool-${featuredKey}`).props.accessibilityLabel as string;
      expect(label).toContain(getFarmMessages('en-US').cropOfTheDayLabel);
    });
  });

  describe('gold fertilizer (#227)', () => {
    test('tapping a growing plot offers the fertilizer action and applying it spends gold + completes growth', async () => {
      // A wheat plot mid-growth, plenty of gold, past onboarding so the plot is
      // freely interactive.
      const state: GameState = {
        ...createGrowingCropState(),
        onboardingCompleted: true,
        gold: 100_000,
      };
      // Exact cost the component will charge (same pure fn, same NOW), so we can
      // assert the precise post-fertilize gold rather than just "not 100,000".
      const expectedCost = getFertilizerCost(state, state.plots[0]!, NOW);
      expect(expectedCost).toBeGreaterThan(0);

      // Default useRewardedAd is unsupported (isAdSupported: false), so this also
      // covers the ad-unsupported (AIT) path: the sheet must open on fertilizer alone.
      const screen = await renderGame(state);
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      // Select a seed tool (so a plot tap isn't treated as a harvest), then tap
      // the growing plot to open the grow-faster sheet.
      fireEvent.press(screen.getByText('당근'));
      fireEvent.press(screen.getByTestId('plot-cell-0'));

      const fertilizerAction = screen.getByTestId('fertilizer-action');
      expect(fertilizerAction).toBeTruthy();
      expect(fertilizerAction.props.accessibilityLabel).toContain('비료로 바로 키우기');
      // Ad path is unsupported here, so only the fertilizer action is offered.
      expect(screen.queryByTestId('growth-ad-action')).toBeNull();

      fireEvent.press(fertilizerAction);

      // The gold-fertilizer toast confirms it applied, gold dropped by exactly the
      // fertilizer cost, and the plot transitioned to ripe (state 2 renders GET).
      await waitFor(() => expect(screen.getByText(/비료로 바로 키웠어요/)).toBeTruthy());
      expect(screen.getByText(`${formatMoney(100_000 - expectedCost, 'ko-KR')}G`)).toBeTruthy();
      expect(screen.queryByText('100,000G')).toBeNull();
      expect(screen.getByText('GET')).toBeTruthy();
    });

    test('disables the fertilizer action when gold is insufficient', async () => {
      // 1 gold can never cover the minimum fertilizer cost.
      const state: GameState = {
        ...createGrowingCropState(),
        onboardingCompleted: true,
        gold: 1,
      };
      const screen = await renderGame(state);
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      fireEvent.press(screen.getByText('당근'));
      fireEvent.press(screen.getByTestId('plot-cell-0'));

      const fertilizerAction = screen.getByTestId('fertilizer-action');
      expect(fertilizerAction.props.accessibilityState?.disabled).toBe(true);

      // 비활성 버튼의 onPress가 우회 호출되어도(a11y/testID) 상태를 바꾸지 않는다:
      // 골드 차감·성장 완료(GET)·성공 토스트 어느 것도 발생하지 않는다.
      fireEvent.press(fertilizerAction);
      expect(screen.queryByText('GET')).toBeNull();
      expect(screen.queryByText(/비료로 바로 키웠어요/)).toBeNull();
    });
  });

  describe('seed-strip sort toggle (#192)', () => {
    const messages = getFarmMessages(DEFAULT_LOCALE);
    // Past onboarding so the seed strip is fully interactive (no coachmark gate).
    const completedState = (): GameState => ({ ...createInitialState(), onboardingCompleted: true });
    const renderedSeedOrder = (screen: ReturnType<typeof render>) =>
      screen
        .getAllByTestId(/^seed-tool-/)
        .map((node) => (node.props.testID as string).replace('seed-tool-', ''));

    test('shows the toggle for an unlocked multi-crop area and hides it in a locked area', async () => {
      const screen = await renderGame(completedState());
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      // starter_field (default selection) is unlocked with 5 crops → toggle shown.
      expect(screen.getByTestId('seed-sort-toggle')).toBeTruthy();

      // A locked area renders no seed buttons, so there is nothing to sort.
      fireEvent.press(screen.getByTestId('area-tab-vegetable_field'));
      expect(screen.queryByTestId('seed-sort-toggle')).toBeNull();
    });

    test('cycles default → profit → growth → default on each press', async () => {
      const screen = await renderGame(completedState());
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      const toggle = () => screen.getByTestId('seed-sort-toggle');
      expect(screen.getByText(messages.seedSortLabel(messages.seedSortDefault))).toBeTruthy();
      fireEvent.press(toggle());
      expect(screen.getByText(messages.seedSortLabel(messages.seedSortProfit))).toBeTruthy();
      fireEvent.press(toggle());
      expect(screen.getByText(messages.seedSortLabel(messages.seedSortGrowth))).toBeTruthy();
      fireEvent.press(toggle());
      expect(screen.getByText(messages.seedSortLabel(messages.seedSortDefault))).toBeTruthy();
    });

    test('reorders the rendered seed buttons to match the pure sorter for the active mode', async () => {
      const screen = await renderGame(completedState());
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      // Default mode = catalog order; capture it as the source of truth.
      const defaultOrder = renderedSeedOrder(screen);
      expect(defaultOrder.length).toBeGreaterThan(1);
      expect(defaultOrder).toEqual(sortCropKeysForStrip(defaultOrder, 'default', () => 0));

      // Advance to 'growth' (default → profit → growth); growth ignores profit, so
      // the render must match a growTime-ascending sort of the same keys.
      fireEvent.press(screen.getByTestId('seed-sort-toggle'));
      fireEvent.press(screen.getByTestId('seed-sort-toggle'));
      expect(renderedSeedOrder(screen)).toEqual(
        sortCropKeysForStrip(defaultOrder, 'growth', () => 0)
      );
    });

    test('activates the horizontal scroll indicator on the seed strip', async () => {
      const screen = await renderGame(completedState());
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
      expect(screen.getByTestId('seed-strip-scroll').props.showsHorizontalScrollIndicator).toBe(true);
    });
  });

  describe("navRow '더보기' 진입점 통합 (#241)", () => {
    const messages = getFarmMessages(DEFAULT_LOCALE);
    // 온보딩 코치마크 게이트 없이 navRow가 온전히 상호작용되도록 완료 상태로 시작.
    const completedState = (): GameState => ({ ...createInitialState(), onboardingCompleted: true });

    test('상시 navRow는 상점·미션·더보기만 노출하고 나머지는 더보기 뒤로 숨긴다', async () => {
      const screen = await renderGame(completedState());
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      // 상시 노출 진입점: 상점·미션·더보기(3개, 기존 7개에서 감소).
      expect(screen.getByTestId('shop-nav-button')).toBeTruthy();
      expect(screen.getByTestId('more-nav-button')).toBeTruthy();
      expect(screen.getByLabelText(messages.missionsButtonAccessibilityLabel)).toBeTruthy();

      // 묶인 진입점은 더보기를 열기 전엔 렌더 트리에 없다.
      expect(screen.queryByLabelText(messages.wheelButtonAccessibilityLabel)).toBeNull();
      expect(screen.queryByLabelText(messages.collectionButtonAccessibilityLabel)).toBeNull();
      expect(screen.queryByLabelText(messages.labButtonAccessibilityLabel)).toBeNull();
      expect(screen.queryByLabelText(messages.mapButtonAccessibilityLabel)).toBeNull();
      expect(screen.queryByLabelText(messages.achievementsButtonAccessibilityLabel)).toBeNull();
    });

    test('더보기 시트에서 룰렛·도감·연구소·개척·업적에 모두 도달할 수 있다', async () => {
      const screen = await renderGame(completedState());
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      fireEvent.press(screen.getByTestId('more-nav-button'));

      // 더보기 시트가 열리고 묶인 5개 진입점이 모두 노출된다.
      expect(screen.getByText(messages.sheetTitleMore)).toBeTruthy();
      expect(screen.getByLabelText(messages.wheelButtonAccessibilityLabel)).toBeTruthy();
      expect(screen.getByLabelText(messages.collectionButtonAccessibilityLabel)).toBeTruthy();
      expect(screen.getByLabelText(messages.labButtonAccessibilityLabel)).toBeTruthy();
      expect(screen.getByLabelText(messages.mapButtonAccessibilityLabel)).toBeTruthy();
      expect(screen.getByLabelText(messages.achievementsButtonAccessibilityLabel)).toBeTruthy();

      // 항목 진입점을 누르면 해당 시트로 전환된다(개척 지도로 검증).
      fireEvent.press(screen.getByLabelText(messages.mapButtonAccessibilityLabel));
      expect(screen.getByText(messages.sheetTitleMap)).toBeTruthy();
    });

    test('묶인 항목의 배지가 더보기 버튼에 롤업 합산으로 노출되고 항목별로도 유지된다', async () => {
      // 신규 완료 상태에선 무료 룰렛 스핀만 준비돼 있어 롤업 배지 = 1로 결정적이다.
      const screen = await renderGame(completedState());
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      const moreButton = screen.getByTestId('more-nav-button');
      expect(within(moreButton).getByText('1')).toBeTruthy();

      // 더보기를 열면 룰렛 항목이 자신의 배지(1)를 그대로 유지한다(배지 유실 없음).
      fireEvent.press(moreButton);
      const wheelEntry = screen.getByLabelText(messages.wheelButtonAccessibilityLabel);
      expect(within(wheelEntry).getByText('1')).toBeTruthy();
    });

    test('더보기 시트가 성격별 섹션 헤더로 그룹화되고 7개 진입점이 모두 유지된다 (#270)', async () => {
      const screen = await renderGame(completedState());
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      fireEvent.press(screen.getByTestId('more-nav-button'));

      // 3개 섹션 헤더가 모두 노출된다(평면 목록 → 명명된 섹션).
      expect(screen.getByText(messages.moreSectionDaily)).toBeTruthy();
      expect(screen.getByText(messages.moreSectionProduction)).toBeTruthy();
      expect(screen.getByText(messages.moreSectionGrowth)).toBeTruthy();

      // 기존 7개 진입점(룰렛/도감/연구소/동물/공방/개척/업적)이 모두 그대로 존재한다.
      expect(screen.getByLabelText(messages.wheelButtonAccessibilityLabel)).toBeTruthy();
      expect(screen.getByLabelText(messages.collectionButtonAccessibilityLabel)).toBeTruthy();
      expect(screen.getByLabelText(messages.labButtonAccessibilityLabel)).toBeTruthy();
      expect(screen.getByLabelText(messages.animalsButtonAccessibilityLabel)).toBeTruthy();
      expect(screen.getByLabelText(messages.workshopButtonAccessibilityLabel)).toBeTruthy();
      expect(screen.getByLabelText(messages.mapButtonAccessibilityLabel)).toBeTruthy();
      expect(screen.getByLabelText(messages.achievementsButtonAccessibilityLabel)).toBeTruthy();

      // 그룹화 후에도 항목별 배지가 유지되고(룰렛=1), onPress 배선도 동일하다(공방 시트 전환).
      const wheelEntry = screen.getByLabelText(messages.wheelButtonAccessibilityLabel);
      expect(within(wheelEntry).getByText('1')).toBeTruthy();
      fireEvent.press(screen.getByLabelText(messages.workshopButtonAccessibilityLabel));
      expect(screen.getByText(messages.sheetTitleWorkshop)).toBeTruthy();
    });
  });

  describe('ready output collect-all', () => {
    let onGoldPulse: jest.Mock;

    beforeEach(() => {
      onGoldPulse = jest.fn();
      __setGoldPulseTestHook(onGoldPulse);
    });

    afterEach(() => {
      __setGoldPulseTestHook(undefined);
    });

    test('collects all ready animal produce once on a rapid double press', async () => {
      const ready = ANIMALS.slice(0, 2);
      expect(ready).toHaveLength(2);
      const base = createInitialState();
      const state: GameState = {
        ...base,
        animals: {
          owned: ready.map((animal) => animal.key),
          feeding: Object.fromEntries(ready.map((animal) => [animal.key, NOW - animal.produceTimerMs])),
        },
      };
      const totalGold = ready.reduce((sum, animal) => sum + animal.producePrice, 0);
      const messages = getFarmMessages(DEFAULT_LOCALE);
      const screen = await renderGame(state);

      fireEvent.press(screen.getByTestId('more-nav-button'));
      fireEvent.press(screen.getByLabelText(messages.animalsButtonAccessibilityLabel));
      const action = screen.getByTestId('animals-collect-all-action');
      await act(async () => {
        fireEvent.press(action);
        fireEvent.press(action);
      });

      await waitFor(() =>
        expect(screen.getByText(`${formatMoney(state.gold + totalGold, DEFAULT_LOCALE)}G`)).toBeTruthy()
      );
      expect(screen.getByText(messages.animalsCollectedAllToast(formatMoney(totalGold, DEFAULT_LOCALE), 2))).toBeTruthy();
      expect(screen.queryByTestId('animals-collect-all-action')).toBeNull();
      expect(screen.getAllByText(messages.animalsIdleLabel)).toHaveLength(2);
      expect(onGoldPulse).toHaveBeenCalledTimes(1);
    });

    test('collects all completed workshop goods once with one English summary', async () => {
      const ready = PRODUCTION_RECIPES.slice(0, 2);
      expect(ready).toHaveLength(2);
      const base = createInitialState();
      const state: GameState = {
        ...base,
        production: {
          ...base.production,
          crafting: Object.fromEntries(ready.map((recipe) => [recipe.key, NOW - recipe.timerMs])),
        },
      };
      const totalGold = ready.reduce((sum, recipe) => sum + recipe.sellPrice, 0);
      const messages = getFarmMessages('en-US');
      const screen = await renderGame(state, { preferredLocale: 'en-US' });

      fireEvent.press(screen.getByTestId('more-nav-button'));
      fireEvent.press(screen.getByLabelText(messages.workshopButtonAccessibilityLabel));
      const action = screen.getByTestId('workshop-collect-all-action');
      expect(action.props.accessibilityLabel).toBe(messages.workshopCollectAllAction(2));
      await act(async () => {
        fireEvent.press(action);
        fireEvent.press(action);
      });

      await waitFor(() =>
        expect(screen.getByText(`${formatMoney(state.gold + totalGold, 'en-US')}G`)).toBeTruthy()
      );
      expect(screen.getByText(messages.workshopCollectedAllToast(formatMoney(totalGold, 'en-US'), 2))).toBeTruthy();
      expect(screen.queryByTestId('workshop-collect-all-action')).toBeNull();
      for (const recipe of ready) {
        expect(within(screen.getByTestId(`recipe-card-${recipe.key}`)).getByText(messages.workshopNeedIngredientsLabel)).toBeTruthy();
      }
      expect(onGoldPulse).toHaveBeenCalledTimes(1);
    });
  });

  describe('welcome-back offline settlement', () => {
    const messages = getFarmMessages(DEFAULT_LOCALE);
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

    function withGrowingPlot(cropKey: CropKey, base: GameState, startTime = NOW): GameState {
      return {
        ...base,
        plots: base.plots.map((plot, index) =>
          index === 0 ? { ...plot, cropType: cropKey, startTime, state: 1 as const } : plot
        ),
      };
    }

    function withReadyPlot(cropKey: CropKey, base: GameState): GameState {
      return {
        ...base,
        plots: base.plots.map((plot, index) =>
          index === 0 ? { ...plot, cropType: cropKey, startTime: NOW - 60000, state: 2 as const } : plot
        ),
      };
    }

    function withReadyReturnLoops(
      base: GameState,
      options: { animal?: boolean; craft?: boolean } = { animal: true, craft: true }
    ): GameState {
      const animal = ANIMALS[0];
      const recipe = PRODUCTION_RECIPES[0];
      if (animal == null || recipe == null) {
        throw new Error('welcome-back tests require at least one animal and workshop recipe');
      }

      return {
        ...base,
        animals: options.animal
          ? { owned: [animal.key], feeding: { [animal.key]: NOW - animal.produceTimerMs } }
          : base.animals,
        production: options.craft
          ? {
              ...base.production,
              crafting: { [recipe.key]: NOW - recipe.timerMs },
            }
          : base.production,
      };
    }

    test('collect branch (collectOffline=true): grants the active-farm offline gold into the purse', async () => {
      const state = withGrowingPlot('wheat' as CropKey, createInitialState());
      mockPersistence.readLastSeenAt.mockResolvedValueOnce(NOW - TWO_HOURS_MS);

      const offlineGold = getActiveFarmOfflineGold(state, TWO_HOURS_MS);
      expect(offlineGold).toBeGreaterThan(0);

      const screen = await renderGame(state);

      const collectLabel = messages.welcomeBackCollectAction(formatMoney(offlineGold, DEFAULT_LOCALE));
      await waitFor(() => expect(screen.getByText(collectLabel)).toBeTruthy());
      // Starting gold is on display before collecting.
      expect(screen.getByText(`${formatMoney(state.gold, DEFAULT_LOCALE)}G`)).toBeTruthy();

      fireEvent.press(screen.getByText(collectLabel));

      // The offline gold was swept into the purse.
      await waitFor(() =>
        expect(screen.getByText(`${formatMoney(state.gold + offlineGold, DEFAULT_LOCALE)}G`)).toBeTruthy()
      );
    });

    test('close branch (collectOffline=false): pressing confirm with no offline gold grants nothing', async () => {
      // Ready crop but no growing plots → offlineGold 0, so the bottom button is
      // the plain confirm ("농장으로 가기") and settlement must not run.
      const state = withReadyPlot('carrot' as CropKey, createInitialState());
      mockPersistence.readLastSeenAt.mockResolvedValueOnce(NOW - TWO_HOURS_MS);

      const screen = await renderGame(state);

      await waitFor(() => expect(screen.getByText(messages.welcomeBackConfirmAction)).toBeTruthy());
      // No offline-earnings row when nothing accrued.
      expect(screen.queryByText(messages.welcomeBackOfflineLabel)).toBeNull();
      expect(screen.queryByTestId('welcome-back-animal-row')).toBeNull();
      expect(screen.queryByTestId('welcome-back-craft-row')).toBeNull();

      fireEvent.press(screen.getByText(messages.welcomeBackConfirmAction));

      // Gold is unchanged: the close path settles nothing.
      expect(screen.getByText(`${formatMoney(state.gold, DEFAULT_LOCALE)}G`)).toBeTruthy();
    });

    test('ready animal row settles offline gold before opening the ranch sheet', async () => {
      const state = withReadyReturnLoops(
        // This crop matured while the player was away. The load-time tick will
        // reconcile state 1 → 2 before the CTA is tapped, so the card snapshot
        // (not live plot phase) must remain the settlement source.
        withGrowingPlot('wheat' as CropKey, createInitialState(), NOW - TWO_HOURS_MS),
        { animal: true, craft: false }
      );
      mockPersistence.readLastSeenAt.mockResolvedValueOnce(NOW - TWO_HOURS_MS);

      const offlineGold = getActiveFarmOfflineGold(state, TWO_HOURS_MS);
      expect(offlineGold).toBeGreaterThan(0);
      const screen = await renderGame(state);

      const animalRow = await waitFor(() => screen.getByTestId('welcome-back-animal-row'));
      expect(screen.getByText(messages.welcomeBackAnimalLabel)).toBeTruthy();
      expect(screen.getByText(messages.welcomeBackAnimalValue(1))).toBeTruthy();
      expect(screen.queryByTestId('welcome-back-craft-row')).toBeNull();

      fireEvent.press(animalRow);
      fireEvent.press(animalRow);

      await waitFor(() => expect(screen.getByText(messages.sheetTitleAnimals)).toBeTruthy());
      await waitFor(() =>
        expect(screen.getByText(`${formatMoney(state.gold + offlineGold, DEFAULT_LOCALE)}G`)).toBeTruthy()
      );
    });

    test('ready workshop row opens the workshop and keeps long English copy on one line', async () => {
      const state = withReadyReturnLoops(withReadyPlot('carrot' as CropKey, createInitialState()), {
        animal: false,
        craft: true,
      });
      mockPersistence.readLastSeenAt.mockResolvedValueOnce(NOW - TWO_HOURS_MS);
      const englishMessages = getFarmMessages('en-US');

      const screen = await renderGame(state, { preferredLocale: 'en-US' });

      const craftRow = await waitFor(() => screen.getByTestId('welcome-back-craft-row'));
      expect(screen.getByText(englishMessages.welcomeBackCraftLabel)).toBeTruthy();
      const craftValue = screen.getByText(englishMessages.welcomeBackCraftValue(1));
      expect(craftValue.props.numberOfLines).toBe(1);
      expect(screen.queryByTestId('welcome-back-animal-row')).toBeNull();

      fireEvent.press(craftRow);

      await waitFor(() => expect(screen.getByText(englishMessages.sheetTitleWorkshop)).toBeTruthy());
    });
  });

  describe('first-session onboarding', () => {
    const messages = getFarmMessages(DEFAULT_LOCALE);
    const renderOnboardingGame = (
      savedState: GameState | null,
      props: Partial<React.ComponentProps<typeof FarmGame>> = {}
    ) => renderGame(savedState, props, null, { preserveOnboarding: true });
    const createRewardStepState = (): GameState => {
      const base = createInitialState();
      return {
        ...base,
        gold: 104,
        harvestedCropKeys: ['carrot'],
        harvestCounts: { ...base.harvestCounts, carrot: 1 },
        lifetimeStats: {
          ...base.lifetimeStats,
          totalHarvests: 1,
          totalGoldEarned: 54,
        },
        onboardingCompleted: false,
        onboardingStep: 'reward',
      };
    };

    test('guides a brand-new player through seed → plant → harvest → reward without a competing sheet', async () => {
      const track = jest.fn();
      const notifications: FarmGameNotifications = {
        isSupported: true,
        requestPermission: jest.fn(async () => false),
        scheduleHarvestReady: jest.fn(async () => undefined),
        cancelHarvestReady: jest.fn(async () => undefined),
        scheduleReminder: jest.fn(async () => undefined),
        cancelReminder: jest.fn(async () => undefined),
      };
      const rewardedAd = createReadyRewardedAd();
      const screen = await renderOnboardingGame(null, {
        analytics: createFarmAnalytics(track),
        notifications,
        useRewardedAd: () => rewardedAd,
      });

      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      // Step 1: pick a seed.
      expect(screen.getByTestId('onboarding-coachmark')).toBeTruthy();
      expect(screen.getByText(messages.onboardingSelectSeedTitle)).toBeTruthy();
      expect(screen.getByText(messages.onboardingProgress(1, 4))).toBeTruthy();
      // Fresh saves have an available daily bonus, but onboarding must own the
      // foreground until the first loop is complete.
      expect(screen.queryByText(messages.sheetTitleDailyBonus)).toBeNull();
      fireEvent.press(screen.getByText('당근'));

      // Step 2: plant it.
      await waitFor(() => expect(screen.getByText(messages.onboardingPlantTitle)).toBeTruthy());
      fireEvent.press(screen.getAllByText('빈 밭')[0]!);

      // Step 3: harvest when ready.
      await waitFor(() => expect(screen.getByText(messages.onboardingHarvestTitle)).toBeTruthy());
      await act(async () => {
        jest.advanceTimersByTime(2500);
      });
      await waitFor(() => expect(screen.getByText('GET')).toBeTruthy());
      fireEvent.press(screen.getByText('GET'));

      // Step 4: the credited first-harvest reward is made explicit, then the
      // player confirms it instead of being blocked by a 300G expansion.
      await waitFor(() => expect(screen.getByTestId('first-harvest-card')).toBeTruthy());
      await waitFor(() => expect(screen.getByText(messages.onboardingRewardTitle)).toBeTruthy());
      // Even when an ad is ready, its harvest-bonus sheet must not cover the
      // activation reward step.
      expect(screen.queryByText(messages.sheetTitleHarvestBonus)).toBeNull();
      expect(screen.getByText(messages.onboardingProgress(4, 4))).toBeTruthy();
      expect(track).toHaveBeenCalledWith('first_meaningful_harvest', expect.anything());
      await waitFor(() => expect(getLatestPersistedState().onboardingStep).toBe('reward'));
      expect(getLatestPersistedState().onboardingCompleted).toBe(false);

      fireEvent.press(screen.getByTestId('first-harvest-overlay'));
      const rewardConfirm = screen.getByTestId('onboarding-reward-confirm');
      fireEvent.press(rewardConfirm);
      fireEvent.press(rewardConfirm);
      await waitFor(() => expect(screen.queryByTestId('onboarding-coachmark')).toBeNull());
      await waitFor(() => {
        expect(getLatestPersistedState()).toEqual(
          expect.objectContaining({ onboardingCompleted: true, onboardingStep: null })
        );
      });
      expect(track.mock.calls.filter(([event]) => event === 'onboarding_complete')).toHaveLength(1);
      // The deferred daily bonus becomes visible only after onboarding closes,
      // and the notification permission prompt waits behind that sheet.
      await waitFor(() => expect(screen.getByText(messages.sheetTitleDailyBonus)).toBeTruthy());
      expect(screen.queryByTestId('notification-prompt-card')).toBeNull();
      fireEvent.press(screen.getByText(messages.dailyBonusClaimAction(formatMoney(50, DEFAULT_LOCALE))));
      await waitFor(() => expect(screen.getByTestId('notification-prompt-card')).toBeTruthy());
    });

    test('resumes a persisted plant step with a deterministic seed selection', async () => {
      const plantSave: GameState = {
        ...createInitialState(),
        onboardingCompleted: false,
        onboardingStep: 'plant',
      };
      const resumedPlant = await renderOnboardingGame(plantSave);

      await waitFor(() => expect(resumedPlant.getByText(messages.onboardingPlantTitle)).toBeTruthy());
      expect(resumedPlant.queryByText(messages.sheetTitleDailyBonus)).toBeNull();
      // selectedTool is UI-only state. A resumed plant step still restores a
      // deterministic valid seed and remains actionable.
      fireEvent.press(resumedPlant.getAllByText('빈 밭')[0]!);
      await waitFor(() => expect(resumedPlant.getByText(messages.onboardingHarvestTitle)).toBeTruthy());
      await waitFor(() => expect(getLatestPersistedState().onboardingStep).toBe('harvest'));
    });

    test('resumes a persisted harvest step without showing a competing sheet', async () => {
      const harvestSave: GameState = {
        ...createGrowingCropState(),
        onboardingCompleted: false,
        onboardingStep: 'harvest',
      };
      const resumedHarvest = await renderOnboardingGame(harvestSave);

      await waitFor(() => expect(resumedHarvest.getByText(messages.onboardingHarvestTitle)).toBeTruthy());
      expect(resumedHarvest.getByText(messages.onboardingProgress(3, 4))).toBeTruthy();
      expect(resumedHarvest.queryByText(messages.sheetTitleDailyBonus)).toBeNull();
    });

    test('settles return gold before advancing lastSeen while an unfinished guide owns the foreground', async () => {
      const returningSave: GameState = {
        ...createGrowingCropState(),
        onboardingCompleted: false,
        onboardingStep: 'harvest',
      };
      const awayMs = 2 * 60 * 60 * 1000;
      const expectedOfflineGold = getActiveFarmOfflineGold(returningSave, awayMs);
      expect(expectedOfflineGold).toBeGreaterThan(0);
      mockPersistence.writePersistedGameState.mockClear();
      mockPersistence.writeLastSeenAt.mockClear();
      mockPersistence.readLastSeenAt.mockResolvedValueOnce(NOW - awayMs);

      const screen = await renderOnboardingGame(returningSave);

      await waitFor(() => expect(screen.getByText(messages.onboardingHarvestTitle)).toBeTruthy());
      expect(screen.queryByText(messages.sheetTitleWelcomeBack)).toBeNull();
      await waitFor(() =>
        expect(mockPersistence.writePersistedGameState).toHaveBeenCalledWith(
          expect.objectContaining({
            gold: returningSave.gold + expectedOfflineGold,
            onboardingReturnSettledAt: NOW - awayMs,
          })
        )
      );
      await waitFor(() => expect(mockPersistence.writeLastSeenAt).toHaveBeenCalledWith(NOW));
      expect(mockPersistence.writePersistedGameState.mock.invocationCallOrder[0]).toBeLessThan(
        mockPersistence.writeLastSeenAt.mock.invocationCallOrder[0]!
      );
    });

    test('does not credit the same onboarding return window twice after a remount', async () => {
      const returningSave: GameState = {
        ...createGrowingCropState(),
        onboardingCompleted: false,
        onboardingStep: 'harvest',
      };
      const awayMs = 2 * 60 * 60 * 1000;
      const sourceSeenAt = NOW - awayMs;
      const offlineGold = getActiveFarmOfflineGold(returningSave, awayMs);
      const alreadySettled: GameState = {
        ...returningSave,
        gold: returningSave.gold + offlineGold,
        lifetimeStats: {
          ...returningSave.lifetimeStats,
          totalGoldEarned: returningSave.lifetimeStats.totalGoldEarned + offlineGold,
        },
        onboardingReturnSettledAt: sourceSeenAt,
      };
      mockPersistence.writePersistedGameState.mockClear();
      mockPersistence.writeLastSeenAt.mockClear();
      mockPersistence.readLastSeenAt.mockResolvedValueOnce(sourceSeenAt);

      await renderOnboardingGame(alreadySettled);

      await waitFor(() => expect(mockPersistence.writeLastSeenAt).toHaveBeenCalledWith(NOW));
      await waitFor(() => expect(mockPersistence.writePersistedGameState).toHaveBeenCalled());
      expect(
        mockPersistence.writePersistedGameState.mock.calls.every(([state]) => state.gold === alreadySettled.gold)
      ).toBe(true);
    });

    test('resumes reward confirmation without paying or tracking the harvest twice', async () => {
      const rewardSave = createRewardStepState();
      const creditedGold = rewardSave.gold;
      const resumedTrack = jest.fn();
      const resumed = await renderOnboardingGame(rewardSave, { analytics: createFarmAnalytics(resumedTrack) });

      await waitFor(() => expect(resumed.getByText(messages.onboardingRewardTitle)).toBeTruthy());
      expect(resumed.queryByTestId('first-harvest-card')).toBeNull();
      expect(resumedTrack).not.toHaveBeenCalledWith('first_meaningful_harvest', expect.anything());

      fireEvent.press(resumed.getByTestId('onboarding-reward-confirm'));
      await waitFor(() => expect(resumed.queryByTestId('onboarding-coachmark')).toBeNull());
      expect(getLatestPersistedState().gold).toBe(creditedGold);
    });

    test('resets local and persisted onboarding progress together', async () => {
      const screen = await renderOnboardingGame(createRewardStepState());
      await waitFor(() => expect(screen.getByText(messages.onboardingRewardTitle)).toBeTruthy());

      fireEvent.press(screen.getByLabelText('설정'));
      fireEvent.press(screen.getByText(messages.resetFarmAction));
      fireEvent.changeText(screen.getByLabelText(messages.resetInputAccessibilityLabel), messages.resetConfirmText);
      fireEvent.press(screen.getByText(messages.resetDeleteAction));

      await waitFor(() => expect(screen.getByText(messages.onboardingSelectSeedTitle)).toBeTruthy());
      expect(screen.queryByText(messages.onboardingRewardTitle)).toBeNull();
      await waitFor(() =>
        expect(getLatestPersistedState()).toEqual(
          expect.objectContaining({ onboardingCompleted: false, onboardingStep: 'selectSeed' })
        )
      );

      fireEvent.press(screen.getByTestId('onboarding-quick-start'));
      await waitFor(() => expect(screen.getByText(messages.onboardingPlantTitle)).toBeTruthy());
      fireEvent.press(screen.getAllByText('빈 밭')[0]!);
      await act(async () => {
        jest.advanceTimersByTime(2500);
      });
      fireEvent.press(await screen.findByText('GET'));
      await waitFor(() => expect(screen.getByText(messages.onboardingRewardTitle)).toBeTruthy());
      fireEvent.press(screen.getByTestId('first-harvest-overlay'));
      fireEvent.press(screen.getByTestId('onboarding-reward-confirm'));
      await waitFor(() => expect(screen.getByText(messages.sheetTitleDailyBonus)).toBeTruthy());
    });

    test('replaces the local onboarding step when an incomplete cloud save is restored', async () => {
      const restoredState: GameState = {
        ...createInitialState(),
        onboardingCompleted: false,
        onboardingStep: 'plant',
      };
      const restoreFromCloud = jest.fn(async () => ({
        status: 'restored' as const,
        clientRevision: 2,
        gameState: restoredState,
      }));
      const screen = await renderOnboardingGame(createRewardStepState(), {
        cloudSave: {
          isSupported: true,
          backupNow: jest.fn(async () => ({ status: 'backed_up' as const, clientRevision: 1 })),
          restoreFromCloud,
        },
      });
      await waitFor(() => expect(screen.getByText(messages.onboardingRewardTitle)).toBeTruthy());

      fireEvent.press(screen.getByLabelText('설정'));
      fireEvent.press(screen.getByText(messages.cloudRestoreAction));

      await waitFor(() => expect(restoreFromCloud).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getByText(messages.onboardingPlantTitle)).toBeTruthy());
      expect(screen.queryByText(messages.onboardingRewardTitle)).toBeNull();
      fireEvent.press(screen.getAllByText('빈 밭')[0]!);
      await waitFor(() => expect(screen.getByText(messages.onboardingHarvestTitle)).toBeTruthy());
      await act(async () => {
        jest.advanceTimersByTime(2500);
      });
      fireEvent.press(await screen.findByText('GET'));
      await waitFor(() => expect(screen.getByText(messages.onboardingRewardTitle)).toBeTruthy());
      fireEvent.press(screen.getByTestId('first-harvest-overlay'));
      fireEvent.press(screen.getByTestId('onboarding-reward-confirm'));
      await waitFor(() => expect(screen.getByText(messages.sheetTitleDailyBonus)).toBeTruthy());
    });

    test('keeps skip hidden until harvest and requires explicit confirmation', async () => {
      // #159: 신규 사용자 다수가 첫 파종 전에 코치마크를 건너뛰고 이탈하므로,
      // selectSeed·plant 단계에서는 건너뛰기를 숨기고 첫 파종 이후에만 노출한다.
      const track = jest.fn();
      const screen = await renderOnboardingGame(null, {
        analytics: createFarmAnalytics(track),
        useRewardedAd: () => createReadyRewardedAd(),
      });

      await waitFor(() => expect(screen.getByTestId('onboarding-coachmark')).toBeTruthy());
      // selectSeed 단계: 건너뛰기 없음.
      expect(screen.queryByTestId('onboarding-skip')).toBeNull();

      fireEvent.press(screen.getByText('당근'));
      await waitFor(() => expect(screen.getByText(messages.onboardingPlantTitle)).toBeTruthy());
      // plant 단계: 여전히 건너뛰기 없음.
      expect(screen.queryByTestId('onboarding-skip')).toBeNull();

      fireEvent.press(screen.getAllByText('빈 밭')[0]!);
      await waitFor(() => expect(screen.getByText(messages.onboardingHarvestTitle)).toBeTruthy());
      // harvest 단계: 첫 파종을 마쳤으니 건너뛰기가 나타난다.
      const skip = await screen.findByTestId('onboarding-skip');
      fireEvent.press(skip);

      expect(screen.getByTestId('onboarding-skip-confirm')).toBeTruthy();
      expect(getLatestPersistedState().onboardingCompleted).toBe(false);
      expect(track).not.toHaveBeenCalledWith('onboarding_skip', expect.anything());
      fireEvent.press(screen.getByTestId('onboarding-skip-cancel'));
      expect(screen.queryByTestId('onboarding-skip-confirm')).toBeNull();
      expect(screen.getByText(messages.onboardingHarvestTitle)).toBeTruthy();

      fireEvent.press(screen.getByTestId('onboarding-skip'));
      const skipConfirmAction = screen.getByTestId('onboarding-skip-confirm-action');
      fireEvent.press(skipConfirmAction);
      fireEvent.press(skipConfirmAction);

      await waitFor(() => expect(screen.queryByTestId('onboarding-coachmark')).toBeNull());
      await waitFor(() => {
        expect(getLatestPersistedState()).toEqual(
          expect.objectContaining({ onboardingCompleted: true, onboardingStep: null })
        );
      });
      // 건너뛴 단계가 onboarding_skip으로 계측된다(완료가 아닌 이탈로 분리).
      expect(track).toHaveBeenCalledWith('onboarding_skip', expect.objectContaining({ skipped_step: 'harvest' }));
      expect(track.mock.calls.filter(([event]) => event === 'onboarding_skip')).toHaveLength(1);
      expect(track).not.toHaveBeenCalledWith('onboarding_complete', expect.anything());

      // A skipped guide can still reach its first harvest later. Preserve that
      // aha moment instead of stacking the harvest-bonus ad sheet over it.
      await act(async () => {
        jest.advanceTimersByTime(2500);
      });
      fireEvent.press(await screen.findByText('GET'));
      await waitFor(() => expect(screen.getByTestId('first-harvest-card')).toBeTruthy());
      expect(screen.queryByText(messages.sheetTitleHarvestBonus)).toBeNull();
    });

    test('emits the step-view funnel and a complete (not skip) event through the full flow', async () => {
      // #159: 어느 단계에서 막히는지 GA4로 특정할 수 있도록 단계별 노출/완료를 계측한다.
      const track = jest.fn();
      const screen = await renderOnboardingGame(null, { analytics: createFarmAnalytics(track) });

      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
      expect(track).toHaveBeenCalledWith(
        'onboarding_step_view',
        expect.objectContaining({ step: 'selectSeed', step_index: 1 })
      );

      fireEvent.press(screen.getByText('당근'));
      await waitFor(() => expect(screen.getByText(messages.onboardingPlantTitle)).toBeTruthy());
      expect(track).toHaveBeenCalledWith(
        'onboarding_step_view',
        expect.objectContaining({ step: 'plant', step_index: 2 })
      );

      fireEvent.press(screen.getAllByText('빈 밭')[0]!);
      await waitFor(() => expect(screen.getByText(messages.onboardingHarvestTitle)).toBeTruthy());
      expect(track).toHaveBeenCalledWith(
        'onboarding_step_view',
        expect.objectContaining({ step: 'harvest', step_index: 3 })
      );
      await act(async () => {
        jest.advanceTimersByTime(2500);
      });
      await waitFor(() => expect(screen.getByText('GET')).toBeTruthy());
      fireEvent.press(screen.getByText('GET'));
      await waitFor(() => expect(screen.getByText(messages.onboardingRewardTitle)).toBeTruthy());
      expect(track).toHaveBeenCalledWith(
        'onboarding_step_view',
        expect.objectContaining({ step: 'reward', step_index: 4 })
      );
      expect(track).toHaveBeenCalledWith('first_meaningful_harvest', expect.anything());

      fireEvent.press(screen.getByTestId('first-harvest-overlay'));
      fireEvent.press(screen.getByTestId('onboarding-reward-confirm'));
      await waitFor(() => expect(screen.queryByTestId('onboarding-coachmark')).toBeNull());
      expect(track).toHaveBeenCalledWith('onboarding_complete', expect.anything());
      expect(track).not.toHaveBeenCalledWith('onboarding_skip', expect.anything());

      const viewedSteps = track.mock.calls
        .filter(([event]) => event === 'onboarding_step_view')
        .map(([, params]) => ({ step: params?.step, stepIndex: params?.step_index }));
      expect(viewedSteps).toEqual([
        { step: 'selectSeed', stepIndex: 1 },
        { step: 'plant', stepIndex: 2 },
        { step: 'harvest', stepIndex: 3 },
        { step: 'reward', stepIndex: 4 },
      ]);
    });

    test('quick-start CTA auto-picks a seed and advances to plant with the funnel intact (#274)', async () => {
      const track = jest.fn();
      const screen = await renderOnboardingGame(null, { analytics: createFarmAnalytics(track) });

      await waitFor(() => expect(screen.getByTestId('onboarding-coachmark')).toBeTruthy());
      // selectSeed 단계: 직접 씨앗 탭 없이 "바로 시작" 한 번으로 진행한다.
      expect(screen.getByText(messages.onboardingSelectSeedTitle)).toBeTruthy();
      fireEvent.press(screen.getByTestId('onboarding-quick-start'));

      // plant 단계까지 한 번에 진입한다.
      await waitFor(() => expect(screen.getByText(messages.onboardingPlantTitle)).toBeTruthy());
      // 자동 선택 경로에서도 first_seed_selected 와 onboarding_step_view(step=plant)가
      // 기존 계약대로 발화한다.
      expect(track).toHaveBeenCalledWith('first_seed_selected', expect.anything());
      expect(track).toHaveBeenCalledWith(
        'onboarding_step_view',
        expect.objectContaining({ step: 'plant', step_index: 2 })
      );
      // CTA는 selectSeed 전용이라 plant 단계에서는 사라진다.
      expect(screen.queryByTestId('onboarding-quick-start')).toBeNull();
    });

    test('does not advance when the first selected seed is unaffordable', async () => {
      const track = jest.fn();
      const screen = await renderOnboardingGame(null, { analytics: createFarmAnalytics(track) });

      await waitFor(() => expect(screen.getByText(messages.onboardingSelectSeedTitle)).toBeTruthy());
      // Onion costs more than the 50G first-session purse. Normal play permits
      // preselection, but onboarding must not lead into an impossible plant.
      fireEvent.press(screen.getByTestId('seed-tool-onion'));

      expect(screen.getByText(messages.onboardingSelectSeedTitle)).toBeTruthy();
      expect(screen.getByText(messages.insufficientGoldToast)).toBeTruthy();
      expect(track).not.toHaveBeenCalledWith('first_seed_selected', expect.anything());
    });

    test('emits onboarding_stall once when the player lingers without acting (#274)', async () => {
      const track = jest.fn();
      const screen = await renderOnboardingGame(null, { analytics: createFarmAnalytics(track) });

      await waitFor(() => expect(screen.getByTestId('onboarding-coachmark')).toBeTruthy());
      // 임계 이전에는 정체 이벤트가 없다.
      expect(track).not.toHaveBeenCalledWith('onboarding_stall', expect.anything());

      // selectSeed에서 무행동으로 임계(15s)를 넘기면 stall이 1회 발화한다.
      await act(async () => {
        jest.advanceTimersByTime(ONBOARDING_STALL_MS);
      });
      await waitFor(() =>
        expect(track).toHaveBeenCalledWith(
          'onboarding_stall',
          expect.objectContaining({ step: 'selectSeed', step_index: 1, dwell_seconds: 15 })
        )
      );
      const stallCalls = track.mock.calls.filter(([event]) => event === 'onboarding_stall');
      expect(stallCalls).toHaveLength(1);
    });

    test('does not stall the step the player acts on before the threshold (#274)', async () => {
      const track = jest.fn();
      const screen = await renderOnboardingGame(null, { analytics: createFarmAnalytics(track) });

      await waitFor(() => expect(screen.getByTestId('onboarding-coachmark')).toBeTruthy());
      // 임계 전에 "바로 시작"으로 행동하면 selectSeed는 정체로 잡히지 않는다.
      await act(async () => {
        jest.advanceTimersByTime(ONBOARDING_STALL_MS - 1000);
      });
      fireEvent.press(screen.getByTestId('onboarding-quick-start'));
      await waitFor(() => expect(screen.getByText(messages.onboardingPlantTitle)).toBeTruthy());
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
      // 이미 plant로 넘어갔으므로 selectSeed stall은 발화하지 않는다.
      expect(track).not.toHaveBeenCalledWith(
        'onboarding_stall',
        expect.objectContaining({ step: 'selectSeed' })
      );
    });

    test('never shows for a returning player whose save is already complete', async () => {
      const screen = await renderOnboardingGame({ ...createInitialState(), onboardingCompleted: true });

      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
      expect(screen.queryByTestId('onboarding-coachmark')).toBeNull();
    });
  });

  test('pops a sprout and buzzes when a seed is planted on an empty plot', async () => {
    const vibrateSpy = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
    try {
      const screen = await renderGame(null);

      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
      expect(screen.getAllByText('빈 밭')).toHaveLength(6);
      // No sprout exists before the first plant.
      expect(screen.queryByText('🌱')).toBeNull();

      fireEvent.press(screen.getByText('초보 밭'));
      fireEvent.press(screen.getByText('당근'));
      fireEvent.press(screen.getAllByText('빈 밭')[0]!);

      // The freshly planted plot now shows the growing sprout, and planting
      // fires a light haptic so the action feels tactile.
      expect(screen.getByText('🌱')).toBeTruthy();
      expect(screen.getAllByText('빈 밭')).toHaveLength(5);
      expect(vibrateSpy).toHaveBeenCalled();
    } finally {
      vibrateSpy.mockRestore();
    }
  });

  test('advances the growth-stage glyph as a crop matures (sprout → leaf)', async () => {
    const screen = await renderGame(null);

    await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
    fireEvent.press(screen.getByText('초보 밭'));
    fireEvent.press(screen.getByText('당근'));
    fireEvent.press(screen.getAllByText('빈 밭')[0]!);

    // Freshly planted (~0% of the 2s carrot grow time): earliest stage = sprout.
    expect(screen.getByText('🌱')).toBeTruthy();
    expect(screen.queryByText('🌿')).toBeNull();

    // ~45% grown crosses the sapling threshold (0.25) → leaf glyph, no more sprout.
    await act(async () => {
      jest.advanceTimersByTime(950);
    });
    await waitFor(() => expect(screen.getByText('🌿')).toBeTruthy());
    expect(screen.queryByText('🌱')).toBeNull();
  });

  test('keeps rapid harvest state updates from overwriting each other', async () => {
    const screen = await renderGame(createReadyHarvestState());

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    const readyPlots = screen.getAllByText('GET');
    await act(async () => {
      fireEvent.press(readyPlots[0]!);
      fireEvent.press(readyPlots[1]!);
    });

    await waitFor(() => expect(screen.getByText('78G')).toBeTruthy());
    expect(screen.getAllByText('빈 밭')).toHaveLength(6);
  });

  test('exposes accessibility labels on plant, harvest, and locked plots', async () => {
    const messages = getFarmMessages(DEFAULT_LOCALE);
    const screen = await renderGame(createReadyHarvestState());

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    // The two ripe carrot tiles announce a harvest call-to-action with the crop name.
    expect(screen.getAllByLabelText(messages.plotReadyAccessibilityLabel('당근'))).toHaveLength(2);
    // Plots 1-2 hold ripe carrots, so plot #3 is the first unlocked empty tile.
    expect(screen.getByLabelText(messages.plotEmptyAccessibilityLabel(3))).toBeTruthy();
    // Tiles past the unlocked count expose a locked label that points at the shop.
    expect(screen.getByLabelText(messages.plotLockedAccessibilityLabel(7))).toBeTruthy();
  });

  test('renders the shared farm UI in English when the saved locale is en-US', async () => {
    const screen = await renderGame(null, {}, { locale: 'en-US' });

    await waitFor(() => expect(screen.getByText('Happy Farm')).toBeTruthy());
    expect(screen.getByText(/About /)).toBeTruthy();
    expect(screen.getAllByText('Empty')).toHaveLength(6);
    expect(screen.getByText('Carrot')).toBeTruthy();

    // Use the stable testID on each area tab to avoid colliding with the
    // next-goal bar in the header that also shows the area name.
    fireEvent.press(screen.getByTestId('area-tab-vegetable_field'));
    expect(screen.getByText('Vegetable Field requirements')).toBeTruthy();
    fireEvent.press(screen.getByTestId('area-tab-starter_field'));

    fireEvent.press(screen.getByText('Carrot'));
    expect(screen.getByText('Plant Carrot · 10G · ROI +40%')).toBeTruthy();
  });

  test('uses the preferred locale when no saved locale exists', async () => {
    const screen = await renderGame(null, { preferredLocale: 'en-US' }, null);

    await waitFor(() => expect(screen.getByText('Happy Farm')).toBeTruthy());
    expect(screen.getByText(/About /)).toBeTruthy();
  });

  test('uses the preferred locale when legacy settings do not include a locale', async () => {
    const screen = await renderGame(null, { preferredLocale: 'en-US' }, { soundEffectsEnabled: false });

    await waitFor(() => expect(screen.getByText('Happy Farm')).toBeTruthy());
    expect(screen.getByText(/About /)).toBeTruthy();
  });

  test('renders a late-game save without overflowing critical one-line UI text', async () => {
    const lateGame = createLateGameState();
    const screen = await renderGame(lateGame);
    const lateMoney = `${formatMoney(lateGame.gold)}G`;

    await waitFor(() => expect(screen.getByText(lateMoney)).toBeTruthy());

    expect(screen.getByText(lateMoney).props.numberOfLines).toBe(1);
    expect(screen.getAllByText('GET')).toHaveLength(MAX_PLOTS);
    expect(screen.getByText('전설 구역')).toBeTruthy();

    fireEvent.press(screen.getByText('전설 구역'));

    expect(screen.getByText('세계수')).toBeTruthy();
  });

  test('keeps the shop usable when every plot and area is unlocked', async () => {
    const lateGame = createLateGameState();
    const screen = await renderGame(lateGame);

    await waitFor(() => expect(screen.getByText(`${formatMoney(lateGame.gold)}G`)).toBeTruthy());

    fireEvent.press(screen.getByText('🏪 상점'));

    expect(screen.getByText('농장 관리소')).toBeTruthy();
    expect(screen.getByText('모든 구역 열기 완료')).toBeTruthy();
    expect(screen.getByText('현재 24칸 · 작물을 심을 공간을 1칸 늘려요')).toBeTruthy();
    expect(screen.getByText('현재 연구 Lv.42 · 성장속도 Lv.42 / 수익률 Lv.42')).toBeTruthy();
  });

  test('anchors sheet drag gestures to the visible handle hit target', async () => {
    const screen = await renderGame(null);

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    fireEvent.press(screen.getByText('🏪 상점'));

    const dragHandle = screen.getByTestId('sheet-drag-handle');
    expect(dragHandle.props.style).toEqual(
      expect.objectContaining({
        height: 36,
        justifyContent: 'flex-start',
        paddingTop: 10,
      })
    );
    expect(typeof dragHandle.props.onStartShouldSetResponder).toBe('function');
    expect(typeof dragHandle.props.onMoveShouldSetResponder).toBe('function');
  });

  test('supports core shop management purchases', async () => {
    const shopReadyState = createShopReadyState();
    const screen = await renderGame(shopReadyState);

    await waitFor(() => expect(screen.getByText(`${formatMoney(shopReadyState.gold)}G`)).toBeTruthy());

    fireEvent.press(screen.getByText('🏪 상점'));

    fireEvent.press(screen.getByText('밭 개간하기'));
    expect(screen.getByText('현재 7칸 · 작물을 심을 공간을 1칸 늘려요')).toBeTruthy();

    fireEvent.press(screen.getByText('🧪 고속 성장 비료'));
    expect(screen.getByText('현재 연구 Lv.1 · 성장속도 Lv.2 / 수익률 Lv.1')).toBeTruthy();

    fireEvent.press(screen.getByText('🚛 판로 개척'));
    expect(screen.getByText('현재 연구 Lv.2 · 성장속도 Lv.2 / 수익률 Lv.2')).toBeTruthy();

    fireEvent.press(screen.getByText('채소 밭 열기'));
    expect(screen.queryByText('채소 밭 열기')).toBeNull();
  });

  test('shows a badge on the shop nav button when a rewarded ad is ready to claim', async () => {
    const rewardedAd = createReadyRewardedAd();
    const screen = await renderGame(null, { useRewardedAd: () => rewardedAd });

    await waitFor(() => expect(screen.getByTestId('shop-nav-button')).toBeTruthy());
    expect(within(screen.getByTestId('shop-nav-button')).getByText('1')).toBeTruthy();
  });

  test('shows no badge on the shop nav button when ads are not supported', async () => {
    // Default useRewardedAd is useUnsupportedAd (isAdSupported: false, isAdReady: false)
    const screen = await renderGame(null);

    await waitFor(() => expect(screen.getByTestId('shop-nav-button')).toBeTruthy());
    expect(within(screen.getByTestId('shop-nav-button')).queryByText('1')).toBeNull();
  });

  test('hides the shop badge when the rewarded ad rate limit is exhausted', async () => {
    // The badge lights up when either shop reward is available: the gold reward
    // (gated by the rewardedGold sliding window) or the plot discount (gated by
    // its own daily limit). Exhaust both so the badge is suppressed.
    const base = createInitialState();
    const exhaustedState: GameState = {
      ...base,
      adUsage: {
        ...base.adUsage,
        rewardedGoldTimestamps: Array.from({ length: REWARDED_GOLD_MAX_USES_PER_WINDOW }, (_, i) => NOW - i * 10),
        plotDiscountAd: { lastUsedAt: NOW, dailyCount: PLOT_DISCOUNT_AD_DAILY_LIMIT },
      },
    };
    const rewardedAd = createReadyRewardedAd();
    const screen = await renderGame(exhaustedState, { useRewardedAd: () => rewardedAd });

    await waitFor(() => expect(screen.getByTestId('shop-nav-button')).toBeTruthy());
    expect(within(screen.getByTestId('shop-nav-button')).queryByText('1')).toBeNull();
  });

  test('REWARDED_GOLD_WINDOW_MS is a whole number of minutes so the description divides without rounding', () => {
    expect(REWARDED_GOLD_WINDOW_MS % 60000).toBe(0);
  });

  test('shows the correct window duration and max uses in the rewarded gold ad description', async () => {
    const messages = getFarmMessages(DEFAULT_LOCALE);
    const rewardedAd = createReadyRewardedAd();
    const screen = await renderGame(null, { useRewardedAd: () => rewardedAd });

    await waitFor(() => expect(screen.getByText('🏪 상점')).toBeTruthy());
    fireEvent.press(screen.getByText('🏪 상점'));

    // Use direct division — the invariant test above guarantees no remainder.
    const expectedDesc = messages.rewardedGoldReadyDesc(
      REWARDED_GOLD_WINDOW_MS / 60000,
      REWARDED_GOLD_MAX_USES_PER_WINDOW
    );
    expect(screen.getByText(expectedDesc)).toBeTruthy();
  });

  test('closes the shop sheet after a rewarded gold ad so the farm remains tappable', async () => {
    const rewardedAd = createReadyRewardedAd();
    const screen = await renderGame(null, { useRewardedAd: () => rewardedAd });

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    fireEvent.press(screen.getByText('🏪 상점'));
    expect(screen.getByText('농장 관리소')).toBeTruthy();

    fireEvent.press(screen.getByText('받기'));

    await waitFor(() => expect(rewardedAd.showAd).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('농장 관리소')).toBeNull());
    await waitFor(() => expect(screen.getByText(`${formatMoney(50 + 100)}G`)).toBeTruthy());

    fireEvent.press(screen.getByText('당근'));
    expect(screen.getByText('당근 심기 · 10G · 투자효율 +40%')).toBeTruthy();
  }, 30_000);

  test('buys a discounted plot after the plot-discount ad and closes the shop', async () => {
    const rewardedAd = createReadyRewardedAd();
    // Enough gold to afford the discounted plot (the ad no longer gives it free).
    const screen = await renderGame({ ...createInitialState(), gold: 1000 }, { useRewardedAd: () => rewardedAd });

    await waitFor(() => expect(screen.getByText('🏪 상점')).toBeTruthy());

    fireEvent.press(screen.getByText('🏪 상점'));
    expect(screen.getByText('농장 관리소')).toBeTruthy();

    fireEvent.press(screen.getByText('열기'));

    await waitFor(() => expect(rewardedAd.showAd).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('농장 관리소')).toBeNull());

    // The discounted gold was charged (sink preserved) and a plot was unlocked.
    fireEvent.press(screen.getByText('🏪 상점'));
    expect(screen.getByText('현재 7칸 · 작물을 심을 공간을 1칸 늘려요')).toBeTruthy();
  }, 30_000);

  test('closes the current sheet when a rewarded ad is dismissed without reward', async () => {
    const rewardedAd = createRewardedAd({ status: 'dismissed' });
    const screen = await renderGame(null, { useRewardedAd: () => rewardedAd });

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    fireEvent.press(screen.getByText('🏪 상점'));

    fireEvent.press(screen.getByText('받기'));

    await waitFor(() => expect(rewardedAd.showAd).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('농장 관리소')).toBeNull());
    expect(screen.getByText('50G')).toBeTruthy();

    fireEvent.press(screen.getByText('당근'));
    expect(screen.getByText('당근 심기 · 10G · 투자효율 +40%')).toBeTruthy();
  }, 30_000);

  test('normalizes thrown rewarded ad failures and closes the active sheet', async () => {
    const rewardedAd = createThrowingRewardedAd(new Error('sdk request failed with dynamic token 123'));
    const track = jest.fn();
    const screen = await renderGame(null, {
      analytics: createFarmAnalytics(track),
      useRewardedAd: () => rewardedAd,
    });

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    fireEvent.press(screen.getByText('🏪 상점'));
    fireEvent.press(screen.getByText('받기'));

    await waitFor(() => expect(rewardedAd.showAd).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('농장 관리소')).toBeNull());

    expect(track).toHaveBeenCalledWith(
      'ad_reward_failed',
      expect.objectContaining({
        ad_type: 'rewardedGold',
        reason: 'show_ad_threw',
      })
    );
    expect(screen.getByText('50G')).toBeTruthy();
  }, 30_000);

  test('closes the growth ad sheet after completing crop growth', async () => {
    const rewardedAd = createReadyRewardedAd();
    const screen = await renderGame(createGrowingCropState(), { useRewardedAd: () => rewardedAd });

    await waitFor(() => expect(screen.getByText('100G')).toBeTruthy());

    fireEvent.press(screen.getByText('당근'));
    fireEvent.press(screen.getByText('🌱'));

    expect(screen.getByText('즉시 성장')).toBeTruthy();

    fireEvent.press(screen.getByText('광고 보고 바로 성장시키기'));

    await waitFor(() => expect(rewardedAd.showAd).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('즉시 성장')).toBeNull());
    await waitFor(() => expect(screen.getByText('GET')).toBeTruthy());
  }, 30_000);

  test('never drives the growth bar with a full-grow-time animation (legend crops crashed iOS)', async () => {
    // Regression: GrowthProgressBar used to run a single Animated.timing spanning
    // the entire remaining grow time. React Native precomputes one frame per 60fps
    // step of an animation's duration, so a freshly planted 세계수 (growTime 5 days)
    // produced ~7.4M frames, froze the JS thread and crashed the app on iOS the
    // moment the crop was planted or its save was reloaded. The bar must instead
    // step forward each game tick, keeping every animation short.
    const reactNative = jest.requireActual('react-native') as typeof import('react-native');
    const { Animated, Easing } = reactNative;
    const timingSpy = jest.spyOn(Animated, 'timing');

    try {
      await renderGame(createGrowingLongCropState('world_tree'));

      // Only inspect the growth bar's own timings (linear easing toward a [0,1]
      // ratio). Other animations like sheet transitions are intentionally ignored
      // so this stays specific to the fix and won't break if they change.
      const growthBarDurations = timingSpy.mock.calls
        .map((call) => call[1])
        .filter((config) => config?.easing === Easing.linear && Number(config?.toValue) <= 1)
        .map((config) => config?.duration ?? 0);

      expect(growthBarDurations.length).toBeGreaterThan(0);
      // 세계수 spanned ~1.23e8 ms before the fix; now every animation is tick-sized.
      expect(Math.max(...growthBarDurations)).toBeLessThanOrEqual(GAME_TICK_INTERVAL_MS);
    } finally {
      timingSpy.mockRestore();
    }
  });

  test('announces mastery rank-ups and shows mastery progress in the collection', async () => {
    const thresholds = getMasteryThresholds('carrot');
    const firstThreshold = thresholds[0]!;
    const base = createReadyHarvestState();
    const state: GameState = {
      ...base,
      harvestedCropKeys: ['carrot'],
      harvestCounts: { carrot: firstThreshold - 1 },
    };
    const screen = await renderGame(state);

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    fireEvent.press(within(screen.getByTestId('plot-cell-0')).getByText('GET'));

    expect(screen.getByText('숙련도 달성!')).toBeTruthy();
    expect(screen.getByText(/브론즈/)).toBeTruthy();

    // 도감 진입점은 navRow 과밀 정리(#241) 이후 '더보기' 시트 뒤에 있다.
    fireEvent.press(screen.getByTestId('more-nav-button'));
    fireEvent.press(screen.getByLabelText('작물 도감'));

    expect(screen.getByText(`${firstThreshold}/${thresholds[1]}`)).toBeTruthy();
    // Scope to the collection sheet so the seed-picker badge (which also shows
    // 🥉 for mastered crops) doesn't mask a regression in the collection view.
    expect(within(screen.getByTestId('collection-sheet')).getByText('🥉')).toBeTruthy();
  });

  test('mastery rank-up overlay auto-dismisses after the celebration duration', async () => {
    const thresholds = getMasteryThresholds('carrot');
    const firstThreshold = thresholds[0]!;
    const state: GameState = {
      ...createReadyHarvestState(),
      harvestedCropKeys: ['carrot'],
      harvestCounts: { carrot: firstThreshold - 1 },
    };
    const screen = await renderGame(state);

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());
    fireEvent.press(within(screen.getByTestId('plot-cell-0')).getByText('GET'));

    expect(screen.getByText('숙련도 달성!')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(MASTERY_RANK_UP_CELEBRATION_DURATION_MS);
    });

    expect(screen.queryByText('숙련도 달성!')).toBeNull();
  });

  test('mastery rank-up overlay dismisses immediately on backdrop tap', async () => {
    const thresholds = getMasteryThresholds('carrot');
    const firstThreshold = thresholds[0]!;
    const state: GameState = {
      ...createReadyHarvestState(),
      harvestedCropKeys: ['carrot'],
      harvestCounts: { carrot: firstThreshold - 1 },
    };
    const screen = await renderGame(state);

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());
    fireEvent.press(within(screen.getByTestId('plot-cell-0')).getByText('GET'));

    expect(screen.getByText('숙련도 달성!')).toBeTruthy();

    fireEvent.press(screen.getByTestId('mastery-rank-up-overlay'));

    expect(screen.queryByText('숙련도 달성!')).toBeNull();
  });

  test('consecutive rank-ups replace the overlay notice and reset the auto-dismiss timer', async () => {
    const thresholds = getMasteryThresholds('carrot');
    const firstThreshold = thresholds[0]!;
    const wheatThresholds = getMasteryThresholds('wheat');
    const wheatFirstThreshold = wheatThresholds[0]!;
    const base = createInitialState();
    // Plot 0 = carrot (rank-up on next harvest), plot 1 = wheat (rank-up on next harvest)
    const state: GameState = {
      ...base,
      plots: [
        { ...base.plots[0]!, cropType: 'carrot', startTime: NOW - 10_000, state: 2 },
        { ...base.plots[1]!, cropType: 'wheat', startTime: NOW - 10_000, state: 2 },
        ...base.plots.slice(2),
      ],
      unlockedAreas: base.unlockedAreas,
      harvestedCropKeys: ['carrot', 'wheat'],
      harvestCounts: {
        carrot: firstThreshold - 1,
        wheat: wheatFirstThreshold - 1,
      },
    };
    const screen = await renderGame(state);

    await waitFor(() => expect(screen.getAllByText('GET').length).toBeGreaterThanOrEqual(2));

    // First rank-up: explicitly press plot 0 (carrot) — overlay shows carrot's name
    fireEvent.press(within(screen.getByTestId('plot-cell-0')).getByText('GET'));
    const cardAfterFirst = screen.getByTestId('mastery-rank-up-card');
    expect(within(cardAfterFirst).getByText('당근')).toBeTruthy();
    expect(within(cardAfterFirst).getByText(/브론즈/)).toBeTruthy();

    // Advance partway through the first timer — overlay still showing
    await act(async () => {
      jest.advanceTimersByTime(MASTERY_RANK_UP_CELEBRATION_DURATION_MS - 500);
    });
    expect(screen.getByText('숙련도 달성!')).toBeTruthy();

    // Second rank-up: target plot-cell-1 (wheat) directly, independent of DOM order.
    fireEvent.press(within(screen.getByTestId('plot-cell-1')).getByText('GET'));
    const cardAfterSecond = screen.getByTestId('mastery-rank-up-card');
    expect(within(cardAfterSecond).getByText('밀')).toBeTruthy();
    expect(within(cardAfterSecond).getByText(/브론즈/)).toBeTruthy();

    // Old timer would have expired by now but the reset timer is still running
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(screen.getByText('숙련도 달성!')).toBeTruthy();

    // Full duration from the second rank-up elapses — overlay gone
    await act(async () => {
      jest.advanceTimersByTime(MASTERY_RANK_UP_CELEBRATION_DURATION_MS);
    });
    expect(screen.queryByText('숙련도 달성!')).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // First harvest celebration overlay
  // ---------------------------------------------------------------------------

  test('shows first-harvest celebration card when harvesting for the very first time', async () => {
    // createReadyHarvestState has harvestedCropKeys: [] → qualifies as first harvest
    const screen = await renderGame(createReadyHarvestState());
    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    fireEvent.press(within(screen.getByTestId('plot-cell-0')).getByText('GET'));

    expect(screen.getByTestId('first-harvest-card')).toBeTruthy();
    expect(screen.getByText('첫 수확 완료! 🎉')).toBeTruthy();
    expect(screen.getByText('농부의 길이 시작됐어요!')).toBeTruthy();
  });

  test('does not show first-harvest celebration for subsequent harvests', async () => {
    // harvestedCropKeys: ['carrot'] → no longer the first harvest
    const state: GameState = {
      ...createReadyHarvestState(),
      harvestedCropKeys: ['carrot'],
    };
    const screen = await renderGame(state);
    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    fireEvent.press(within(screen.getByTestId('plot-cell-0')).getByText('GET'));

    expect(screen.queryByTestId('first-harvest-card')).toBeNull();
    expect(screen.queryByText('첫 수확 완료! 🎉')).toBeNull();
  });

  test('first-harvest overlay auto-dismisses after the celebration duration', async () => {
    const screen = await renderGame(createReadyHarvestState());
    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    fireEvent.press(within(screen.getByTestId('plot-cell-0')).getByText('GET'));
    expect(screen.getByText('첫 수확 완료! 🎉')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(FIRST_HARVEST_CELEBRATION_DURATION_MS);
    });

    expect(screen.queryByText('첫 수확 완료! 🎉')).toBeNull();
  });

  test('first-harvest overlay dismisses immediately on tap', async () => {
    const screen = await renderGame(createReadyHarvestState());
    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    fireEvent.press(within(screen.getByTestId('plot-cell-0')).getByText('GET'));
    expect(screen.getByText('첫 수확 완료! 🎉')).toBeTruthy();

    fireEvent.press(screen.getByTestId('first-harvest-overlay'));

    expect(screen.queryByText('첫 수확 완료! 🎉')).toBeNull();
  });

  test('collects every ripe plot in one tap via the Harvest All shortcut', async () => {
    const screen = await renderGame(createReadyHarvestState());

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    // Two ripe carrots surface the batch shortcut in place of the tool hint.
    expect(screen.getByText('🧺 모두 수확 2')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('🧺 모두 수확 2'));

    // Both plots collected at once: +14G each, with a single batch toast.
    await waitFor(() => expect(screen.getByText('78G')).toBeTruthy());
    expect(screen.getByText(/한 번에 수확했어요/)).toBeTruthy();
    // No ripe plots remain, so neither the GET badge nor the shortcut shows.
    expect(screen.queryByText('GET')).toBeNull();
    expect(screen.queryByText(/모두 수확/)).toBeNull();
  });

  test('harvests then replants in one tap via the Harvest-then-Replant shortcut (#252)', async () => {
    // 익은 밭 2곳(readyPlotCount >= HARVEST_ALL_MIN_COUNT)에서 결합 버튼이 '전체 수확'
    // 옆에 함께 노출된다. 기본 도구는 'harvest'이므로 재심 작물은 첫 익은 밭 작물(당근)로
    // 폴백한다.
    const screen = await renderGame(createReadyHarvestState());
    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    expect(screen.getByText('🧺 모두 수확 2')).toBeTruthy();
    const replantButton = screen.getByTestId('harvest-replant-button');
    expect(replantButton).toBeTruthy();

    fireEvent.press(replantButton);

    // 당근 2곳 수확(+14G×2 → 78G) 후, 빈 밭 전체(방금 비운 2곳 + 기존 빈 4곳 = 6곳)에
    // 당근 재심(−10G×6=60G) → 18G. 모든 밭이 성장 중이라 '빈 밭'이 사라지고, 익은 밭이
    // 없어 수확 단축 버튼도 사라진다.
    await waitFor(() => expect(screen.getByText('18G')).toBeTruthy());
    // 결과 토스트가 수확·재심 수를 함께 알린다(부분/전체 인지).
    expect(screen.getByText(/2곳 수확하고 6곳 다시 심었어요/)).toBeTruthy();
    expect(screen.queryByText('GET')).toBeNull();
    expect(screen.queryByText(/모두 수확/)).toBeNull();
    expect(screen.queryAllByText('빈 밭')).toHaveLength(0);
  });

  test('auto-harvests and replants through the game tick when automation is unlocked', async () => {
    const base = createReadyHarvestState();
    const state: GameState = {
      ...base,
      research: { ...base.research, unlockedNodes: ['auto_harvest', 'auto_replant'] },
      automationSettings: { autoHarvestEnabled: true, autoReplantEnabled: true, donationModeEnabled: false },
    };
    const carrot = CROPS.carrot!;
    // Two ready carrots are harvested and replanted by the automation tick.
    const expectedGold = state.gold + carrot.sell * 2 - carrot.cost * 2;
    const screen = await renderGame(state);

    await act(async () => {
      jest.advanceTimersByTime(GAME_TICK_INTERVAL_MS + 50);
    });

    await waitFor(() => expect(screen.getByText(`${formatMoney(expectedGold)}G`)).toBeTruthy());
    expect(screen.queryByText('GET')).toBeNull();
  });

  test('pioneers a new region, resets the farm layer, and starts a chain farm', async () => {
    const base = createInitialState();
    const legendCrops = getAreaCropKeys('legend_field');
    const state: GameState = {
      ...base,
      gold: getPrestigeCost(0),
      harvestedCropKeys: [...legendCrops],
      harvestCounts: Object.fromEntries(legendCrops.map((cropKey) => [cropKey, 2])),
    };
    const screen = await renderGame(state);

    await waitFor(() => expect(screen.getByText('★ 0')).toBeTruthy());

    // 개척(지도) 진입점은 navRow 과밀 정리(#241) 이후 '더보기' 시트 뒤에 있다.
    fireEvent.press(screen.getByTestId('more-nav-button'));
    fireEvent.press(screen.getByText('🗺️ 개척'));
    expect(screen.getByText(/1호 농장/)).toBeTruthy();

    fireEvent.press(screen.getByText(/개척 준비하기/));
    expect(screen.getByText('지역 선택')).toBeTruthy();

    fireEvent.press(screen.getByText(/설원/));
    fireEvent.press(screen.getByText(/개척하고 ★3 받기/));

    await waitFor(() => expect(screen.getByText('★ 3')).toBeTruthy());
    expect(screen.getByText('50G')).toBeTruthy();

    fireEvent.press(screen.getByTestId('more-nav-button'));
    fireEvent.press(screen.getByText('🗺️ 개척'));
    // The graduated farm is now part of the chain; the active farm is #2.
    expect(screen.getByText(/2호 농장/)).toBeTruthy();
    expect(screen.getByText(/1호 농장 · 평원/)).toBeTruthy();
  });

  const prestigeMessages = getFarmMessages();
  let tundra!: (typeof REGION_ARCHETYPES)[number];
  let tundraName!: string;

  beforeAll(() => {
    const found = REGION_ARCHETYPES.find((a) => a.key === 'tundra');
    expect(found).toBeDefined();
    if (found == null) throw new Error('tundra archetype missing from REGION_ARCHETYPES');
    tundra = found;
    tundraName = getRegionArchetypeLabel(found.key, DEFAULT_LOCALE).name;
  });

  function createPrestigeReadyState(): GameState {
    const base = createInitialState();
    const legendCrops = getAreaCropKeys('legend_field');
    return {
      ...base,
      gold: getPrestigeCost(0),
      harvestedCropKeys: [...legendCrops],
      harvestCounts: Object.fromEntries(legendCrops.map((cropKey) => [cropKey, 2])),
    };
  }

  async function triggerPrestige(screen: ReturnType<typeof render>) {
    await waitFor(() => expect(screen.getByTestId('prestige-stars-chip')).toBeTruthy());
    // 개척(지도) 진입점은 navRow 과밀 정리(#241) 이후 '더보기' 시트 뒤에 있다.
    fireEvent.press(screen.getByLabelText(prestigeMessages.moreButtonAccessibilityLabel));
    fireEvent.press(screen.getByLabelText(prestigeMessages.mapButtonAccessibilityLabel));
    fireEvent.press(screen.getByText(prestigeMessages.prestigeAction(PRESTIGE_STARS_BASE)));
    fireEvent.press(screen.getByText(`${tundra.icon} ${tundraName}`));
    fireEvent.press(screen.getByText(prestigeMessages.prestigeConfirmAction(PRESTIGE_STARS_BASE)));
  }

  test('shows prestige graduation overlay on region pioneer', async () => {
    const screen = await renderGame(createPrestigeReadyState());

    await triggerPrestige(screen);

    const card = await waitFor(() => screen.getByTestId('prestige-graduation-card'));
    expect(within(card).getByText(prestigeMessages.prestigeGraduationTitle)).toBeTruthy();
    expect(within(card).getByText(tundra.icon)).toBeTruthy();
    expect(within(card).getByText(tundraName)).toBeTruthy();
    expect(within(card).getByText(prestigeMessages.prestigeGraduationStarsLabel(PRESTIGE_STARS_BASE))).toBeTruthy();
  });

  test('prestige graduation overlay auto-dismisses after the celebration duration', async () => {
    const screen = await renderGame(createPrestigeReadyState());

    await triggerPrestige(screen);
    await waitFor(() => expect(screen.getByTestId('prestige-graduation-overlay')).toBeTruthy());

    await act(async () => {
      jest.advanceTimersByTime(PRESTIGE_GRADUATION_CELEBRATION_DURATION_MS);
    });

    await waitFor(() => expect(screen.queryByTestId('prestige-graduation-overlay')).toBeNull());
  });

  test('prestige graduation overlay dismisses immediately on backdrop tap', async () => {
    const screen = await renderGame(createPrestigeReadyState());

    await triggerPrestige(screen);
    await waitFor(() => expect(screen.getByTestId('prestige-graduation-overlay')).toBeTruthy());

    fireEvent.press(screen.getByTestId('prestige-graduation-overlay'));

    await waitFor(() => expect(screen.queryByTestId('prestige-graduation-overlay')).toBeNull());
  });

  test('shows the chain-income guide once after the first graduation and persists dismissal', async () => {
    const screen = await renderGame(createPrestigeReadyState());

    await triggerPrestige(screen);
    // 졸업 축하가 끝난 뒤에 가이드가 노출된다(겹치지 않음).
    await waitFor(() => expect(screen.getByTestId('prestige-graduation-overlay')).toBeTruthy());
    await act(async () => {
      jest.advanceTimersByTime(PRESTIGE_GRADUATION_CELEBRATION_DURATION_MS);
    });

    await waitFor(() => expect(screen.getByTestId('prestige-guide-overlay')).toBeTruthy());
    expect(screen.getByText(prestigeMessages.prestigeGuideTitle)).toBeTruthy();

    // 확인하면 닫히고 플래그가 저장되어 재노출되지 않는다.
    fireEvent.press(screen.getByTestId('prestige-guide-confirm'));
    await waitFor(() => expect(screen.queryByTestId('prestige-guide-overlay')).toBeNull());
    await waitFor(() =>
      expect(mockPersistence.writePersistedGameState).toHaveBeenCalledWith(
        expect.objectContaining({ prestigeGuideSeen: true })
      )
    );
  });

  test('does not show the chain-income guide when it was already seen', async () => {
    const screen = await renderGame({ ...createPrestigeReadyState(), prestigeGuideSeen: true });

    await triggerPrestige(screen);
    await waitFor(() => expect(screen.getByTestId('prestige-graduation-overlay')).toBeTruthy());
    await act(async () => {
      jest.advanceTimersByTime(PRESTIGE_GRADUATION_CELEBRATION_DURATION_MS);
    });

    await waitFor(() => expect(screen.queryByTestId('prestige-graduation-overlay')).toBeNull());
    expect(screen.queryByTestId('prestige-guide-overlay')).toBeNull();
  });

  test('keeps reset behind the settings sheet', async () => {
    const screen = await renderGame(null);

    await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

    expect(screen.queryByText('농장 기록 초기화')).toBeNull();

    fireEvent.press(screen.getByLabelText('설정'));

    expect(screen.getByText('설정')).toBeTruthy();
    expect(screen.getByText('농장 기록 초기화')).toBeTruthy();

    fireEvent.press(screen.getByText('농장 기록 초기화'));

    expect(screen.getByText('새로 시작하기')).toBeTruthy();
  });

  test('switches and persists the UI language from the settings language selector', async () => {
    const screen = await renderGame(null);

    await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('설정'));
    // 언어 섹션과 두 언어 옵션(한국어/English)이 노출된다.
    expect(screen.getByText('언어')).toBeTruthy();
    expect(screen.getByTestId('language-option-ko-KR')).toBeTruthy();
    expect(screen.getByTestId('language-option-en-US')).toBeTruthy();

    // 영어 옵션을 선택하면 UI가 즉시 영어로 전환된다.
    fireEvent.press(screen.getByTestId('language-option-en-US'));

    await waitFor(() => expect(screen.getByText('Happy Farm')).toBeTruthy());
    expect(screen.queryByText('행복 농장')).toBeNull();

    // 선택한 언어가 설정 저장소에 반영(저장)된다.
    await waitFor(() =>
      expect(mockPersistence.writePersistedGameSettings).toHaveBeenCalledWith(
        expect.objectContaining({ locale: 'en-US' })
      )
    );
  });

  test('plays the harvest sound when audio is supported', async () => {
    const lateGame = createLateGameState();
    const playHarvest = jest.fn();
    const screen = await renderGame(lateGame, {
      audio: {
        isSupported: true,
        playHarvest,
        playComboMilestone: jest.fn(),
        playEffect: jest.fn(),
        setBackgroundMusicEnabled: jest.fn(),
      },
    });

    await waitFor(() => expect(screen.getByText(`${formatMoney(lateGame.gold)}G`)).toBeTruthy());

    fireEvent.press(screen.getAllByText('GET')[0]!);

    expect(playHarvest).toHaveBeenCalledTimes(1);
  });

  describe('collection reward claim side-effects', () => {
    // Constants derived from balance data — safe to compute once at describe scope.
    const claimMessages = getFarmMessages();
    const firstArea = FARM_AREAS[0];
    if (firstArea == null) throw new Error('Test requires at least one area in FARM_AREAS');
    const firstAreaKey = firstArea.key;
    const firstAreaReward = COLLECTION_AREA_REWARDS[firstAreaKey];
    if (firstAreaReward == null) throw new Error(`No collection reward defined for area ${firstAreaKey}`);
    const claimButtonLabel = claimMessages.collectionClaimAction(formatMoney(firstAreaReward, DEFAULT_LOCALE));

    // createLateGameState() discovers all crops, making all area collection rewards
    // claimable. A fresh instance is created per test to prevent state bleed if
    // renderGame or the component ever mutates the input object.
    let lateGame: GameState;
    let onGoldPulse: jest.Mock;
    let vibrateSpy: jest.SpyInstance;
    beforeEach(() => {
      lateGame = createLateGameState();
      onGoldPulse = jest.fn();
      __setGoldPulseTestHook(onGoldPulse);
      vibrateSpy = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
    });
    afterEach(() => {
      __setGoldPulseTestHook(undefined);
      vibrateSpy.mockRestore();
    });

    async function renderAndClaim(playEffect: jest.Mock, savedSettings: unknown) {
      const screen = await renderGame(
        lateGame,
        {
          audio: {
            isSupported: true,
            playHarvest: jest.fn(),
            playComboMilestone: jest.fn(),
            playEffect,
            setBackgroundMusicEnabled: jest.fn(),
          },
        },
        savedSettings
      );
      await waitFor(() => expect(screen.getByText(`${formatMoney(lateGame.gold)}G`)).toBeTruthy());
      // 도감 진입점은 navRow 과밀 정리(#241) 이후 '더보기' 시트 뒤에 있다.
      fireEvent.press(screen.getByLabelText(claimMessages.moreButtonAccessibilityLabel));
      fireEvent.press(screen.getByLabelText(claimMessages.collectionButtonAccessibilityLabel));
      await waitFor(() => expect(screen.getByText(claimButtonLabel)).toBeTruthy());
      vibrateSpy.mockClear(); // reset count so only the claim press is counted
      fireEvent.press(screen.getByText(claimButtonLabel));
      return screen;
    }

    test('plays the reward sting, pulses gold, and vibrates when sound effects are enabled', async () => {
      const playEffect = jest.fn();
      const screen = await renderAndClaim(playEffect, { soundEffectsEnabled: true });
      await waitFor(() => expect(playEffect).toHaveBeenCalledTimes(1));
      expect(playEffect).toHaveBeenCalledWith('reward');
      await waitFor(() => expect(onGoldPulse).toHaveBeenCalledTimes(1));
      await waitFor(() => {
        expect(vibrateSpy).toHaveBeenCalledTimes(1);
        expect(vibrateSpy).toHaveBeenLastCalledWith(50);
      });
      await waitFor(() => expect(screen.getByText(claimMessages.collectionClaimedLabel)).toBeTruthy());
    });

    test('pulses gold and vibrates but skips the reward sting when sound effects are disabled', async () => {
      const playEffect = jest.fn();
      const screen = await renderAndClaim(playEffect, { soundEffectsEnabled: false });
      await waitFor(() => expect(screen.getByText(claimMessages.collectionClaimedLabel)).toBeTruthy());
      await waitFor(() => expect(onGoldPulse).toHaveBeenCalledTimes(1));
      await waitFor(() => {
        expect(vibrateSpy).toHaveBeenCalledTimes(1);
        expect(vibrateSpy).toHaveBeenLastCalledWith(50);
      });
      expect(playEffect).not.toHaveBeenCalled();
    });

    test('pulses gold but skips the reward sting when audio is unsupported', async () => {
      const playEffect = jest.fn();
      const screen = await renderGame(
        lateGame,
        {
          audio: {
            isSupported: false,
            playHarvest: jest.fn(),
            playComboMilestone: jest.fn(),
            playEffect,
            setBackgroundMusicEnabled: jest.fn(),
          },
        },
        { soundEffectsEnabled: true }
      );
      await waitFor(() => expect(screen.getByText(`${formatMoney(lateGame.gold)}G`)).toBeTruthy());
      // 도감 진입점은 navRow 과밀 정리(#241) 이후 '더보기' 시트 뒤에 있다.
      fireEvent.press(screen.getByLabelText(claimMessages.moreButtonAccessibilityLabel));
      fireEvent.press(screen.getByLabelText(claimMessages.collectionButtonAccessibilityLabel));
      await waitFor(() => expect(screen.getByText(claimButtonLabel)).toBeTruthy());
      fireEvent.press(screen.getByText(claimButtonLabel));
      await waitFor(() => expect(screen.getByText(claimMessages.collectionClaimedLabel)).toBeTruthy());
      await waitFor(() => expect(onGoldPulse).toHaveBeenCalledTimes(1));
      expect(playEffect).not.toHaveBeenCalled();
    });

    test('claim flow completes when playEffect throws synchronously', async () => {
      const playEffect = jest.fn(() => {
        throw new Error('audio error');
      });
      const screen = await renderAndClaim(playEffect, { soundEffectsEnabled: true });
      await waitFor(() => expect(screen.getByText(claimMessages.collectionClaimedLabel)).toBeTruthy());
      await waitFor(() => expect(onGoldPulse).toHaveBeenCalledTimes(1));
    });

    test('claim flow completes when playEffect returns a rejected Promise', async () => {
      const playEffect = jest.fn(() => Promise.reject(new Error('audio error')));
      const screen = await renderAndClaim(playEffect, { soundEffectsEnabled: true });
      await waitFor(() => expect(screen.getByText(claimMessages.collectionClaimedLabel)).toBeTruthy());
      await waitFor(() => expect(onGoldPulse).toHaveBeenCalledTimes(1));
    });
  });

  describe('achievement claim side-effects', () => {
    function getHarvestTrack() {
      const track = ACHIEVEMENT_TRACKS.find((t) => t.key === 'harvest_total');
      if (track == null) throw new Error('harvest_total achievement track must exist');
      return track;
    }

    function createAchievementClaimableState(): GameState {
      const base = createInitialState();
      const track = getHarvestTrack();
      return {
        ...base,
        lifetimeStats: { ...base.lifetimeStats, totalHarvests: track.base },
      };
    }

    let vibrateSpy: jest.SpyInstance;
    beforeEach(() => {
      vibrateSpy = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
    });
    afterEach(() => {
      vibrateSpy.mockRestore();
    });

    async function renderAndClaimAchievement(playEffect: jest.Mock, savedSettings: unknown) {
      const claimMessages = getFarmMessages();
      const track = getHarvestTrack();
      const claimLabel = claimMessages.achievementClaimAction(track.starsPerTier);
      const screen = await renderGame(
        createAchievementClaimableState(),
        {
          audio: {
            isSupported: true,
            playHarvest: jest.fn(),
            playComboMilestone: jest.fn(),
            playEffect,
            setBackgroundMusicEnabled: jest.fn(),
          },
        },
        savedSettings
      );
      // 업적 진입점은 navRow 과밀 정리(#241) 이후 '더보기' 시트 뒤에 있다.
      fireEvent.press(screen.getByLabelText(claimMessages.moreButtonAccessibilityLabel));
      fireEvent.press(screen.getByLabelText(claimMessages.achievementsButtonAccessibilityLabel));
      await waitFor(() => expect(screen.getByText(claimLabel)).toBeTruthy());
      vibrateSpy.mockClear(); // reset count so only the claim press is counted
      fireEvent.press(screen.getByText(claimLabel));
      return screen;
    }

    test('plays the reward sting and vibrates when an achievement tier is claimed', async () => {
      const playEffect = jest.fn();
      await renderAndClaimAchievement(playEffect, { soundEffectsEnabled: true });
      await waitFor(() => expect(playEffect).toHaveBeenCalledTimes(1));
      expect(playEffect).toHaveBeenCalledWith('reward');
      await waitFor(() => {
        expect(vibrateSpy).toHaveBeenCalledTimes(1);
        expect(vibrateSpy).toHaveBeenLastCalledWith(50);
      });
    });

    test('vibrates but skips the reward sting when sound effects are disabled', async () => {
      const playEffect = jest.fn();
      const claimMessages = getFarmMessages();
      const screen = await renderAndClaimAchievement(playEffect, {
        soundEffectsEnabled: false,
      });
      await waitFor(() =>
        expect(screen.getByText(claimMessages.achievementClaimedToast(getHarvestTrack().starsPerTier))).toBeTruthy()
      );
      await waitFor(() => {
        expect(vibrateSpy).toHaveBeenCalledTimes(1);
        expect(vibrateSpy).toHaveBeenLastCalledWith(50);
      });
      expect(playEffect).not.toHaveBeenCalled();
    });
  });

  describe('new sound effect hook points (playEffect)', () => {
    const messages = getFarmMessages(DEFAULT_LOCALE);

    function createEffectAudio(playEffect: jest.Mock) {
      return {
        isSupported: true,
        playHarvest: jest.fn(),
        playComboMilestone: jest.fn(),
        playEffect,
        setBackgroundMusicEnabled: jest.fn(),
      };
    }

    test('planting a crop plays the plant effect once', async () => {
      const playEffect = jest.fn();
      const state: GameState = { ...createInitialState(), onboardingCompleted: true };
      const screen = await renderGame(
        state,
        { audio: createEffectAudio(playEffect) },
        { soundEffectsEnabled: true }
      );
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      fireEvent.press(screen.getByText('당근'));
      fireEvent.press(screen.getByTestId('plot-cell-0'));

      await waitFor(() => expect(playEffect).toHaveBeenCalledWith('plant'));
      expect(playEffect).toHaveBeenCalledTimes(1);
    });

    test('planting stays silent when sound effects are disabled', async () => {
      const playEffect = jest.fn();
      const base = createInitialState();
      const state: GameState = { ...base, onboardingCompleted: true };
      const carrotCost = CROPS.carrot!.cost;
      const screen = await renderGame(
        state,
        { audio: createEffectAudio(playEffect) },
        { soundEffectsEnabled: false }
      );
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      fireEvent.press(screen.getByText('당근'));
      fireEvent.press(screen.getByTestId('plot-cell-0'));

      // The plant itself lands (gold drops by the seed cost)…
      await waitFor(() =>
        expect(screen.getByText(`${formatMoney(state.gold - carrotCost)}G`)).toBeTruthy()
      );
      // …but no effect sound is requested.
      expect(playEffect).not.toHaveBeenCalled();
    });

    test('spinning the daily wheel plays the wheelSpin effect', async () => {
      const playEffect = jest.fn();
      const state: GameState = { ...createInitialState(), onboardingCompleted: true };
      const screen = await renderGame(
        state,
        { audio: createEffectAudio(playEffect) },
        { soundEffectsEnabled: true }
      );
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      fireEvent.press(screen.getByTestId('more-nav-button'));
      fireEvent.press(screen.getByLabelText(messages.wheelButtonAccessibilityLabel));
      await waitFor(() => expect(screen.getByText(messages.wheelSpinAction)).toBeTruthy());
      fireEvent.press(screen.getByText(messages.wheelSpinAction));

      await waitFor(() => expect(playEffect).toHaveBeenCalledWith('wheelSpin'));
      expect(playEffect).toHaveBeenCalledTimes(1);
    });

    test('harvesting a golden-mutated crop plays the mutation effect', async () => {
      const playEffect = jest.fn();
      const base = createReadyHarvestState();
      // Carrot(tier 1) reaches bronze mastery at 10 harvests; at bronze, only
      // the golden band is open, so a 0 roll deterministically lands golden.
      const state: GameState = {
        ...base,
        onboardingCompleted: true,
        harvestCounts: { carrot: 10 },
      };
      const screen = await renderGame(
        state,
        { audio: createEffectAudio(playEffect) },
        { soundEffectsEnabled: true }
      );
      await waitFor(() => expect(screen.getAllByText('GET').length).toBeGreaterThan(0));

      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
      try {
        fireEvent.press(screen.getAllByText('GET')[0]!);
      } finally {
        randomSpy.mockRestore();
      }

      await waitFor(() => expect(playEffect).toHaveBeenCalledWith('mutation'));
    });

    test('unlocking a research node plays the unlock effect', async () => {
      const playEffect = jest.fn();
      const base = createInitialState();
      const state: GameState = {
        ...base,
        onboardingCompleted: true,
        research: { ...base.research, points: 50_000, totalPointsEarned: 50_000 },
      };
      const screen = await renderGame(
        state,
        { audio: createEffectAudio(playEffect) },
        { soundEffectsEnabled: true }
      );
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      fireEvent.press(screen.getByTestId('more-nav-button'));
      fireEvent.press(screen.getByLabelText(messages.labButtonAccessibilityLabel));
      // '자동 수확' 라벨은 자동화 토글에도 쓰이므로, 노드 ShopCard는 고유한
      // 설명 문구로 특정해 누른다(press는 상위 Pressable로 전파된다).
      const nodeDesc = '다 자란 작물을 자동으로 수확해요.';
      await waitFor(() => expect(screen.getByText(nodeDesc)).toBeTruthy());
      fireEvent.press(screen.getByText(nodeDesc));

      await waitFor(() => expect(playEffect).toHaveBeenCalledWith('unlock'));
      expect(playEffect).toHaveBeenCalledTimes(1);
    });
  });

  test('fires combo great milestone audio when combo crosses the great tier threshold', async () => {
    const lateGame = createLateGameState();
    const playComboMilestone = jest.fn();
    const screen = await renderGame(lateGame, {
      audio: {
        isSupported: true,
        playHarvest: jest.fn(),
        playComboMilestone,
        playEffect: jest.fn(),
        setBackgroundMusicEnabled: jest.fn(),
      },
    });

    await waitFor(() => expect(screen.getAllByText('GET').length).toBeGreaterThanOrEqual(COMBO_GREAT_THRESHOLD));

    for (let i = 0; i < COMBO_GREAT_THRESHOLD; i++) {
      fireEvent.press(screen.getAllByText('GET')[0]!);
    }

    await waitFor(() => {
      expect(playComboMilestone).toHaveBeenCalledWith('great');
      expect(playComboMilestone).toHaveBeenCalledTimes(1);
    });
  });

  test('fires combo legendary milestone audio when combo crosses the legendary tier threshold', async () => {
    const lateGame = createLateGameState();
    const playComboMilestone = jest.fn();
    const screen = await renderGame(lateGame, {
      audio: {
        isSupported: true,
        playHarvest: jest.fn(),
        playComboMilestone,
        playEffect: jest.fn(),
        setBackgroundMusicEnabled: jest.fn(),
      },
    });

    await waitFor(() => expect(screen.getAllByText('GET').length).toBeGreaterThanOrEqual(COMBO_LEGENDARY_THRESHOLD));

    for (let i = 0; i < COMBO_LEGENDARY_THRESHOLD; i++) {
      fireEvent.press(screen.getAllByText('GET')[0]!);
    }

    await waitFor(() => {
      expect(playComboMilestone).toHaveBeenNthCalledWith(1, 'great');
      expect(playComboMilestone).toHaveBeenNthCalledWith(2, 'legendary');
      expect(playComboMilestone).toHaveBeenCalledTimes(2);
    });
  });

  test('batch harvest fires only legendary when combo jumps past great in one action', async () => {
    // Intentional design: a single harvestAll action that pushes combo past both
    // thresholds at once triggers only the highest milestone reached, not great+legendary.
    const lateGame = createLateGameState();
    const playComboMilestone = jest.fn();
    const harvestAllLabel = getFarmMessages().harvestAllButton(MAX_PLOTS);
    const screen = await renderGame(lateGame, {
      audio: {
        isSupported: true,
        playHarvest: jest.fn(),
        playComboMilestone,
        playEffect: jest.fn(),
        setBackgroundMusicEnabled: jest.fn(),
      },
    });

    await waitFor(() => expect(screen.getByText(harvestAllLabel)).toBeTruthy());
    fireEvent.press(screen.getByText(harvestAllLabel));

    await waitFor(() => {
      expect(playComboMilestone).toHaveBeenCalledWith('legendary');
      expect(playComboMilestone).not.toHaveBeenCalledWith('great');
      expect(playComboMilestone).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Combo tier visual icons — lock in the icon/label at each threshold
  // ---------------------------------------------------------------------------

  test('combo display shows fire icon at the great tier threshold', async () => {
    const lateGame = createLateGameState();
    const screen = await renderGame(lateGame);

    await waitFor(() => expect(screen.getAllByText('GET').length).toBeGreaterThanOrEqual(COMBO_GREAT_THRESHOLD));

    for (let i = 0; i < COMBO_GREAT_THRESHOLD; i++) {
      fireEvent.press(screen.getAllByText('GET')[0]!);
    }

    // At exactly COMBO_GREAT_THRESHOLD harvests the combo enters the great tier
    await waitFor(() => expect(screen.getByText(`🔥 ×${COMBO_GREAT_THRESHOLD} 콤보!`)).toBeTruthy());
  });

  test('combo display shows lightning icon at the legendary tier threshold', async () => {
    const lateGame = createLateGameState();
    const screen = await renderGame(lateGame);

    await waitFor(() => expect(screen.getAllByText('GET').length).toBeGreaterThanOrEqual(COMBO_LEGENDARY_THRESHOLD));

    for (let i = 0; i < COMBO_LEGENDARY_THRESHOLD; i++) {
      fireEvent.press(screen.getAllByText('GET')[0]!);
    }

    await waitFor(() => expect(screen.getByText(`⚡ ×${COMBO_LEGENDARY_THRESHOLD} 콤보!`)).toBeTruthy());
  });

  test('spaces out harvest bonus nudges by time after the player declines one', async () => {
    const lateGame = createLateGameState();
    const rewardedAd = createReadyRewardedAd();
    const harvestBonusCta = `광고 보고 30분 동안 수확 ${HARVEST_BONUS_MULTIPLIER}배`;
    const screen = await renderGame(lateGame, { useRewardedAd: () => rewardedAd });

    await waitFor(() => expect(screen.getByText(`${formatMoney(lateGame.gold)}G`)).toBeTruthy());

    fireEvent.press(screen.getAllByText('GET')[0]!);

    expect(screen.getByText(harvestBonusCta)).toBeTruthy();

    fireEvent.press(screen.getByText('괜찮아요'));

    expect(screen.queryByText(harvestBonusCta)).toBeNull();

    fireEvent.press(screen.getAllByText('GET')[0]!);

    expect(screen.queryByText(harvestBonusCta)).toBeNull();

    jest.setSystemTime(NOW + HARVEST_BONUS_AD_COOLDOWN_MS + 1);

    fireEvent.press(screen.getAllByText('GET')[0]!);

    expect(screen.getByText(harvestBonusCta)).toBeTruthy();
  });

  test('turns the harvest bonus ad into a 30 minute reward boost', async () => {
    const readyBase = createReadyHarvestState();
    // The first meaningful harvest is reserved for its aha celebration. Ad
    // nudges begin with a later harvest, which is what this test exercises.
    const readyHarvestState: GameState = {
      ...readyBase,
      harvestedCropKeys: ['carrot'],
      harvestCounts: { ...readyBase.harvestCounts, carrot: 1 },
      lifetimeStats: { ...readyBase.lifetimeStats, totalHarvests: 1 },
    };
    const rewardedAd = createReadyRewardedAd();
    const harvestBonusCta = `광고 보고 30분 동안 수확 ${HARVEST_BONUS_MULTIPLIER}배`;
    const carrot = CROPS.carrot;
    if (carrot == null) {
      throw new Error('FarmGame tests require carrot balance data.');
    }
    const carrotRevenue = carrot.sell;
    const screen = await renderGame(readyHarvestState, { useRewardedAd: () => rewardedAd });

    await waitFor(() => expect(screen.getByText(`${formatMoney(readyHarvestState.gold)}G`)).toBeTruthy());

    fireEvent.press(screen.getAllByText('GET')[0]!);

    expect(screen.getByText(`${formatMoney(readyHarvestState.gold + carrotRevenue)}G`)).toBeTruthy();
    expect(screen.getByText(harvestBonusCta)).toBeTruthy();

    fireEvent.press(screen.getByText(harvestBonusCta));

    await waitFor(() => expect(rewardedAd.showAd).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('수확 보너스')).toBeNull());

    // 부스트가 실제로 다음 수확 골드에 적용되는지(핵심 동작) 먼저 확인한다.
    fireEvent.press(screen.getAllByText('GET')[0]!);
    expect(screen.getByText(`${formatMoney(readyHarvestState.gold + carrotRevenue * 3)}G`)).toBeTruthy();

    // 부스트 지표 표기는 상단 HUD가 아니라 '농장 현황' 시트로 이동했다(#233).
    fireEvent.press(screen.getByTestId('cotd-chip'));
    await waitFor(() => expect(screen.getByText('부스트')).toBeTruthy());
    expect(screen.getByText(`×${HARVEST_BONUS_MULTIPLIER.toFixed(1)}`)).toBeTruthy();
  });

  test('shows boost multiplier and remaining time in the stats sheet when boost is active (#233)', async () => {
    const messages = getFarmMessages(DEFAULT_LOCALE);
    const screen = await renderGame(createActiveBoostState(NOW), { preferredLocale: DEFAULT_LOCALE });

    await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
    // 부스트 배수·잔여시간은 '농장 현황' 시트로 이동(#233): chip으로 시트를 연다.
    fireEvent.press(screen.getByTestId('cotd-chip'));
    await waitFor(() => expect(screen.getByText(messages.boostLabel)).toBeTruthy());
    expect(screen.getByText(`×${HARVEST_BONUS_MULTIPLIER.toFixed(1)}`)).toBeTruthy();
    // Assert the remaining-time element has a non-zero time value.
    // boostEndsAt = NOW + HARVEST_BONUS_BOOST_DURATION_MS and Date.now() = NOW
    // (beforeEach freezes the clock), so safeBoostRemainingMs = BOOST_DURATION > 0.
    // The regex /^[1-9]/ ensures the displayed string starts with a non-zero digit
    // (e.g. "30분"), catching any regression where the display collapses to "0초".
    // toHaveTextContent is registered globally via jest.setup.ts.
    const remaining = screen.getByTestId('boost-remaining');
    expect(remaining).toBeTruthy();
    expect(remaining).toHaveTextContent(/^[1-9]/);
  });

  test('greets a returning player with an offline progress recap', async () => {
    mockPersistence.readLastSeenAt.mockResolvedValueOnce(NOW - 2 * 60 * 60 * 1000);
    const screen = await renderGame(createReadyHarvestState());

    await waitFor(() => expect(screen.getByText('다시 오셨네요!')).toBeTruthy());
    expect(screen.getByText('수확을 기다리는 작물')).toBeTruthy();
    expect(screen.getByText('2칸')).toBeTruthy();
    // The recap is marked as seen immediately so a quick reload won't replay it.
    expect(mockPersistence.writeLastSeenAt).toHaveBeenCalled();

    fireEvent.press(screen.getByText('농장으로 가기'));
    await waitFor(() => expect(screen.queryByText('다시 오셨네요!')).toBeNull());
  });

  test('recap offers a harvest CTA that harvests ready crops immediately', async () => {
    mockPersistence.readLastSeenAt.mockResolvedValueOnce(NOW - 2 * 60 * 60 * 1000);
    const screen = await renderGame(createReadyHarvestState());

    await waitFor(() => expect(screen.getByText('다시 오셨네요!')).toBeTruthy());
    fireEvent.press(screen.getByText('바로 수확하기'));

    await waitFor(() => expect(screen.queryByText('다시 오셨네요!')).toBeNull());
    // 첫 행동 CTA가 즉시 수확을 실행해 준비 작물(GET)이 남지 않는다.
    await waitFor(() => expect(screen.queryAllByText('GET')).toHaveLength(0));
  });

  test('recap offers a daily-bonus CTA that opens the daily sheet', async () => {
    mockPersistence.readLastSeenAt.mockResolvedValueOnce(NOW - 2 * 60 * 60 * 1000);
    // 오프라인 체인 수익만 있고 수확 작물은 없는 복귀 상태 → 데일리 클레임이 첫 행동 CTA.
    const chainState: GameState = {
      ...createInitialState(),
      chainFarms: [{ id: 1, archetype: 'plains', goldPerHour: 3600, lastCollectedAt: NOW - 2 * 60 * 60 * 1000 }],
    };
    const screen = await renderGame(chainState);

    await waitFor(() => expect(screen.getByText('다시 오셨네요!')).toBeTruthy());
    fireEvent.press(screen.getByText('데일리 보너스 받기'));

    // 데일리 CTA에서도 오프라인 체인 수익이 수령된다(수금 토스트로 확인).
    await waitFor(() => expect(screen.getByText(/수금했어요/)).toBeTruthy());
    // 데일리 보너스 시트로 전환된다.
    await waitFor(() => expect(screen.getByText('오늘의 출석 보너스')).toBeTruthy());
  });

  test('does not show the recap after only a brief absence', async () => {
    mockPersistence.readLastSeenAt.mockResolvedValueOnce(NOW - 30_000);
    const screen = await renderGame(createReadyHarvestState());

    await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
    expect(screen.queryByText('다시 오셨네요!')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Unit tests for getNextAreaGoal – pure function, no RN rendering needed.
// ---------------------------------------------------------------------------
describe('getNextAreaGoal', () => {
  const { getNextAreaGoal } = farmGameModule;

  // Helpers for building targeted game states.
  const withGold = (state: GameState, gold: number): GameState => ({ ...state, gold });
  const withHarvested = (state: GameState, keys: readonly CropKey[]): GameState => ({
    ...state,
    harvestedCropKeys: [...keys],
  });
  const withUpgrades = (state: GameState, level: number): GameState => ({
    ...state,
    upgrades: { speed: level, profit: level },
  });
  const withUnlocked = (state: GameState, areaKeys: readonly AreaKey[]): GameState => ({
    ...state,
    unlockedAreas: [...areaKeys],
  });

  // getNextAreaGoal uses FARM_AREAS.find() and relies on sequential (non-gated)
  // areas being ordered by ascending unlock cost so find() returns the correct
  // next milestone. This test locks in that invariant so a reordering in
  // balance.json is caught before it silently breaks the goal logic.
  test('sequential areas in FARM_AREAS are ordered by ascending unlock cost', () => {
    const sequential = FARM_AREAS.filter((a) => a.unlock.gate == null);
    for (let i = 1; i < sequential.length; i++) {
      expect(sequential[i]!.unlock.cost).toBeGreaterThanOrEqual(sequential[i - 1]!.unlock.cost);
    }
  });

  // Four distinct crop keys that satisfy the vegetable_field harvest requirement (4).
  const FOUR_CROPS = ['carrot', 'wheat', 'potato', 'onion'] as const satisfies readonly CropKey[];

  test('returns null when all sequential areas are unlocked, even if gated areas remain locked', () => {
    // Unlock every area that has no gate. Gated areas (e.g. hybrid_greenhouse with
    // gate='breeding_lab') must be excluded from the sequential scan so they never
    // become the returned goal — verified here by leaving them locked.
    const sequentialAreaKeys = FARM_AREAS.filter((a) => a.unlock.gate == null).map((a) => a.key);
    const hasGatedArea = FARM_AREAS.some((a) => a.unlock.gate != null);
    expect(hasGatedArea).toBe(true); // guard: test only makes sense when gated areas exist
    const state = withUnlocked(createInitialState(), sequentialAreaKeys);
    expect(getNextAreaGoal(state)).toBeNull();
  });

  test('returns harvest kind when harvest ratio is the worst bottleneck', () => {
    // Initial state: gold=50 (ratio≈0.17 vs 300 needed), harvested=0 (ratio=0 vs 4 needed).
    // Harvest ratio (0) < gold ratio (~0.17) → harvest is the bottleneck.
    const state = createInitialState();
    const result = getNextAreaGoal(state);
    expect(result).toMatchObject({ kind: 'harvest', areaKey: 'vegetable_field', current: 0, total: 4 });
  });

  test('returns gold kind when harvest is met but gold is the bottleneck', () => {
    // harvest=4/4 (ok), gold=100/300 (not ok), upgrade=1/1 (ok) → gold.
    const state = withHarvested(withGold(createInitialState(), 100), [...FOUR_CROPS]);
    const result = getNextAreaGoal(state);
    expect(result).toMatchObject({ kind: 'gold', areaKey: 'vegetable_field', current: 100, total: 300 });
  });

  test('returns upgrade kind when both gold and harvest are met but upgrade level is too low', () => {
    // fruit_field needs upgradeLevel 3. We unlock vegetable_field and set gold/harvest
    // to satisfy fruit_field's gold (9000) and harvest (10) requirements but keep
    // the upgrade level at 1 (min of speed/profit).
    const tenCrops = [
      'carrot',
      'wheat',
      'potato',
      'onion',
      'corn',
      'tomato',
      'pepper',
      'mushroom',
      'rice',
      'strawberry',
    ] as const satisfies readonly CropKey[];
    const state = withUpgrades(
      withHarvested(
        withGold(withUnlocked(createInitialState(), ['starter_field', 'vegetable_field']), 20_000),
        tenCrops
      ),
      1 // minUpgradeLevel=1 < 3 required
    );
    const result = getNextAreaGoal(state);
    expect(result).toMatchObject({ kind: 'upgrade', areaKey: 'fruit_field', current: 1, total: 3 });
  });

  test('returns ready kind when every requirement for the next area is met', () => {
    // vegetable_field: 300G, 4 crops, Lv.1 – all satisfied.
    const state = withHarvested(withGold(createInitialState(), 300), [...FOUR_CROPS]);
    const result = getNextAreaGoal(state);
    expect(result).toMatchObject({ kind: 'ready', areaKey: 'vegetable_field' });
  });

  test('gold wins the tie when goldRatio equals harvestRatio', () => {
    // gold=150 → ratio 0.5 (150/300); harvested=2 → ratio 0.5 (2/4).
    // When ratios are equal the gold branch fires first because its condition
    // uses <=, giving gold priority over harvest in ties.
    const state = withHarvested(withGold(createInitialState(), 150), ['carrot', 'wheat']);
    const result = getNextAreaGoal(state);
    expect(result).toMatchObject({ kind: 'gold', areaKey: 'vegetable_field' });
  });

  test('boundary: reaching the exact gold threshold switches to ready', () => {
    const state = withHarvested(withGold(createInitialState(), 300), [...FOUR_CROPS]);
    expect(getNextAreaGoal(state)).toMatchObject({ kind: 'ready' });
  });

  test('boundary: one gold short of the threshold stays as gold', () => {
    const state = withHarvested(withGold(createInitialState(), 299), [...FOUR_CROPS]);
    const result = getNextAreaGoal(state);
    expect(result).toMatchObject({ kind: 'gold', current: 299, total: 300 });
  });

  test('upgrade bottleneck is detected even when requiredUpgradeLevel is 1', () => {
    // Prior bug: upgradeRatio used `> 1` guard so level-1 requirements always got
    // ratio=1 (treated as "satisfied"). With the fix (`> 0`) a current level of 0
    // now correctly computes ratio=0 and surfaces the upgrade bottleneck.
    // This state is hypothetical (initial saves start at Lv.1) but validates the
    // formula is safe across all non-negative upgrade levels.
    const state = {
      ...withHarvested(withGold(createInitialState(), 100), [...FOUR_CROPS]),
      upgrades: { speed: 0, profit: 0 }, // getMinUpgradeLevel → 0
    };
    // vegetable_field needs Lv.1; current is 0 → upgradeOk=false, upgradeRatio=0.
    // gold: 100/300≈0.33. harvest: 4/4=1 (ok). upgrade: 0/1=0.
    // upgrade ratio (0) < gold ratio (0.33) → kind=upgrade.
    const result = getNextAreaGoal(state);
    expect(result).toMatchObject({ kind: 'upgrade', areaKey: 'vegetable_field', current: 0, total: 1 });
  });
});

// ---------------------------------------------------------------------------
// UI tests for NextGoalBar component
// ---------------------------------------------------------------------------
describe('NextGoalBar', () => {
  test('shows the ready state bar and opens the shop when tapped', async () => {
    // vegetable_field requirements: 300G + 4 crop types + Lv.1 upgrade (already met at start).
    const readyAreaState: GameState = {
      ...createInitialState(),
      gold: 300,
      harvestedCropKeys: ['carrot', 'wheat', 'potato', 'onion'] satisfies CropKey[],
    };
    const screen = await renderGame(readyAreaState);

    // The ready bar should appear once the game loads.
    await waitFor(() => expect(screen.getByText('🔓 채소 밭 해금 준비 완료! 상점에서 열기')).toBeTruthy());

    // Shop must be closed before the tap (guard against false positive).
    expect(screen.queryByText('농장 관리소')).toBeNull();

    // Press the Pressable directly via testID so we validate the onPress wiring,
    // not just that a Text node exists inside the component.
    fireEvent.press(screen.getByTestId('next-goal-bar'));

    expect(screen.getByText('농장 관리소')).toBeTruthy();
  });

  test('harvest-kind bar opens the shop when tapped', async () => {
    // Initial state: gold=50, no crops harvested → harvest is the bottleneck.
    const screen = await renderGame(null);

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    expect(screen.queryByText('농장 관리소')).toBeNull();
    fireEvent.press(screen.getByTestId('next-goal-bar'));
    expect(screen.getByText('농장 관리소')).toBeTruthy();
  });

  test('gold-kind bar opens the shop when tapped', async () => {
    // harvest=4/4 (ok), gold=100/300 (not ok) → gold kind.
    const goldState: GameState = {
      ...createInitialState(),
      gold: 100,
      harvestedCropKeys: ['carrot', 'wheat', 'potato', 'onion'] satisfies CropKey[],
    };
    const screen = await renderGame(goldState);

    await waitFor(() => expect(screen.getByText('100G')).toBeTruthy());

    expect(screen.queryByText('농장 관리소')).toBeNull();
    fireEvent.press(screen.getByTestId('next-goal-bar'));
    expect(screen.getByText('농장 관리소')).toBeTruthy();
  });

  test('upgrade-kind bar opens the shop when tapped', async () => {
    // gold=300/300 (ok), harvest=4/4 (ok), upgrade=0/1 (not ok) → upgrade kind.
    const upgradeState: GameState = {
      ...createInitialState(),
      gold: 300,
      harvestedCropKeys: ['carrot', 'wheat', 'potato', 'onion'] satisfies CropKey[],
      upgrades: { speed: 0, profit: 0 },
    };
    const screen = await renderGame(upgradeState);

    await waitFor(() => expect(screen.getByText('300G')).toBeTruthy());

    expect(screen.queryByText('농장 관리소')).toBeNull();
    fireEvent.press(screen.getByTestId('next-goal-bar'));
    expect(screen.getByText('농장 관리소')).toBeTruthy();
  });

  describe('harvest notification permission prompt', () => {
    const promptMessages = getFarmMessages();

    function createNotificationsMock(overrides: Partial<FarmGameNotifications> = {}): FarmGameNotifications {
      return {
        isSupported: true,
        requestPermission: jest.fn(async () => true),
        scheduleHarvestReady: jest.fn(async () => undefined),
        cancelHarvestReady: jest.fn(async () => undefined),
        scheduleReminder: jest.fn(async () => undefined),
        cancelReminder: jest.fn(async () => undefined),
        ...overrides,
      };
    }

    // A player who has just had their first harvest and finished onboarding, but
    // has never been shown the notification prompt — the exact aha window.
    function createPostAhaState(): GameState {
      return {
        ...createInitialState(),
        onboardingCompleted: true,
        harvestedCropKeys: ['carrot'] satisfies CropKey[],
        dailyBonusState: { lastClaimedAt: Date.now(), streak: 1 },
        harvestNotificationPromptSeen: false,
      };
    }

    test('surfaces the prompt after the first harvest once onboarding is done', async () => {
      const notifications = createNotificationsMock();
      const screen = await renderGame(createPostAhaState(), { notifications });

      await waitFor(() => expect(screen.getByTestId('notification-prompt-card')).toBeTruthy());
      expect(screen.getByText(promptMessages.notificationPromptTitle)).toBeTruthy();
    });

    test('waits for saved settings before deciding whether to show the prompt', async () => {
      const notifications = createNotificationsMock();
      let resolveSettings: ((settings: { harvestNotificationsEnabled: boolean }) => void) | undefined;
      const pendingSettings = new Promise<{ harvestNotificationsEnabled: boolean }>((resolve) => {
        resolveSettings = resolve;
      });
      const screen = await renderGame(createPostAhaState(), { notifications }, pendingSettings);

      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
      expect(screen.queryByTestId('notification-prompt-card')).toBeNull();
      await act(async () => {
        resolveSettings?.({ harvestNotificationsEnabled: true });
        await pendingSettings;
      });

      await waitFor(() =>
        expect(mockPersistence.writePersistedGameState).toHaveBeenCalledWith(
          expect.objectContaining({ harvestNotificationPromptSeen: true })
        )
      );
      expect(screen.queryByTestId('notification-prompt-card')).toBeNull();
      expect(notifications.requestPermission).not.toHaveBeenCalled();
    });

    test('requests permission and enables harvest notifications on accept', async () => {
      const notifications = createNotificationsMock();
      const screen = await renderGame(createPostAhaState(), { notifications });

      await waitFor(() => expect(screen.getByTestId('notification-prompt-card')).toBeTruthy());
      fireEvent.press(screen.getByTestId('notification-prompt-accept'));

      await waitFor(() => expect(notifications.requestPermission).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByTestId('notification-prompt-card')).toBeNull());
      await waitFor(() =>
        expect(mockPersistence.writePersistedGameSettings).toHaveBeenCalledWith(
          expect.objectContaining({ harvestNotificationsEnabled: true })
        )
      );
    });

    test('retires the prompt without asking permission on decline', async () => {
      const notifications = createNotificationsMock();
      const screen = await renderGame(createPostAhaState(), { notifications });

      await waitFor(() => expect(screen.getByTestId('notification-prompt-card')).toBeTruthy());
      fireEvent.press(screen.getByTestId('notification-prompt-decline'));

      await waitFor(() => expect(screen.queryByTestId('notification-prompt-card')).toBeNull());
      expect(notifications.requestPermission).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(mockPersistence.writePersistedGameState).toHaveBeenCalledWith(
          expect.objectContaining({ harvestNotificationPromptSeen: true })
        )
      );
    });

    test('never re-asks once the prompt has been seen', async () => {
      const notifications = createNotificationsMock();
      const screen = await renderGame(
        { ...createPostAhaState(), harvestNotificationPromptSeen: true },
        { notifications }
      );

      await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());
      expect(screen.queryByTestId('notification-prompt-card')).toBeNull();
    });

    test('does not surface the prompt while onboarding is still in progress', async () => {
      const notifications = createNotificationsMock();
      const screen = await renderGame(
        { ...createPostAhaState(), onboardingCompleted: false },
        { notifications },
        null,
        { preserveOnboarding: true }
      );

      await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());
      expect(screen.queryByTestId('notification-prompt-card')).toBeNull();
    });

    test('skips the prompt when the platform does not support notifications', async () => {
      const notifications = createNotificationsMock({ isSupported: false });
      const screen = await renderGame(createPostAhaState(), { notifications });

      await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());
      expect(screen.queryByTestId('notification-prompt-card')).toBeNull();
    });
  });
});

// #236: 하단 시스템 UI(백버튼/제스처 바) 겹침 방지 인셋이 하단 콘텐츠에 실제로
// 적용되는지 회귀 방지. safe-area 모킹이 bottom:0을 반환하므로(위 jest.mock),
// bottomSafeInset은 최소 확보 인셋(MIN_BOTTOM_SAFE_INSET=24)으로 폴백한다.
// 보정이 빠지면 raw 0이 쓰여 값이 각각 10/136이 되어야 하므로, 34/160 검증으로
// bottomSafeInset 배선을 확인할 수 있다.
describe('하단 safe-area 인셋 적용 (#236)', () => {
  test('툴 스트립 하단 여백이 보정된 bottomSafeInset(=24)+10 으로 적용된다', async () => {
    const screen = await renderGame(null);

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());
    const toolStrip = StyleSheet.flatten(screen.getByTestId('tool-strip').props.style);
    expect(toolStrip.paddingBottom).toBe(34);
  });

  test('발견 배너 bottom 오프셋이 보정된 bottomSafeInset(=24)+136 으로 적용된다', async () => {
    const screen = await renderGame(null);

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());
    const banner = StyleSheet.flatten(screen.getByTestId('discovery-banner').props.style);
    expect(banner.bottom).toBe(160);
  });
});
