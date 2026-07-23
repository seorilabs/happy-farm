/// <reference types="jest" />

import React from 'react';
import { AppState, Animated, Dimensions, StyleSheet, Vibration, type AppStateStatus } from 'react-native';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import {
  ACHIEVEMENT_TRACKS,
  ANIMALS,
  COLLECTION_AREA_REWARDS,
  COMBO_WINDOW_MS,
  CROPS,
  DECORATIONS,
  DEFAULT_LOCALE,
  FARM_AREAS,
  HARVEST_BONUS_AD_COOLDOWN_MS,
  HARVEST_BONUS_BOOST_DURATION_MS,
  HARVEST_BONUS_MULTIPLIER,
  OFFLINE_INCOME_CAP_MS,
  MAX_PLOTS,
  PLOT_DISCOUNT_AD_DAILY_LIMIT,
  REWARDED_GOLD_MAX_USES_PER_WINDOW,
  REWARDED_GOLD_WINDOW_MS,
  PRESTIGE_STARS_BASE,
  PRODUCTION_RECIPES,
  REGION_ARCHETYPES,
  claimAllAchievements,
  claimDailyBonus,
  createFarmAnalytics,
  createInitialState,
  getRewardedGoldAmount,
  formatDuration,
  formatHourlyGold,
  formatMoney,
  getProductionRecipeLabel,
  getActiveFarmOfflineGold,
  getActiveFarmOfflineGoldPerHour,
  getAreaCropKeys,
  getCropOfTheDayStatus,
  getFertilizerCost,
  previewFertilizeAll,
  getPlotCost,
  getWeeklyEventStatus,
  getEnvironmentTone,
  getLocalMinutesOfDay,
  getMasteryThresholds,
  getAchievementThreshold,
  getPrestigeCost,
  getRegionArchetypeLabel,
  getResetDayIndex,
  getResetDayStart,
  getSeasonalAmbience,
  getTitleLabel,
  getUpgradeCost,
  recordAdWatchProgress,
  recordWeeklyAdWatchProgress,
  sortCropKeysForStrip,
  startCraft,
  type AreaKey,
  type CropKey,
  type GameState,
  type MutationKey,
  type RewardedAdController,
  type RewardedAdShowResult,
} from '../../../../../packages/farm-core/src';
import {
  getFarmMessages,
  type FarmArt,
  type FarmGameNotifications,
} from '../../../../../packages/farm-ui/src';
import {
  MAIN_CONTENT_TOP_PADDING,
  MAIN_HORIZONTAL_PADDING,
  ONBOARDING_MAIN_CONTENT_TOP_PADDING,
  PLOT_COLUMNS,
  PLOT_GAP,
} from '../../../../../packages/farm-ui/src/farmGameLayout';

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
  CROP_READY_SUMMARY_INTERVAL_MS,
  MASTERY_RANK_UP_CELEBRATION_DURATION_MS,
  PRESTIGE_GRADUATION_CELEBRATION_DURATION_MS,
  FIRST_HARVEST_CELEBRATION_DURATION_MS,
  MUTATION_CELEBRATION_KEYS,
  ONBOARDING_STALL_MS,
  COMBO_GREAT_THRESHOLD,
  COMBO_LEGENDARY_THRESHOLD,
  UPGRADE_BURST_DURATION_MS,
  __setMutationFlashTestHook,
  selectRarestMutationFlash,
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

function createCropReadyBatchState(): GameState {
  const base = createInitialState();
  return {
    ...base,
    plots: base.plots.map((plot, index) => {
      if (index === 0 || index === 1) {
        return { ...plot, cropType: 'carrot' as const, startTime: NOW, state: 1 as const };
      }
      if (index === 2) {
        return { ...plot, cropType: 'wheat' as const, startTime: NOW, state: 1 as const };
      }
      return plot;
    }),
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
  options: { preserveOnboarding?: boolean; preserveDailyBonus?: boolean } = {}
) {
  const state = savedState ?? createInitialState();
  const withOnboarding = options.preserveOnboarding
    ? state
    : {
        ...state,
        onboardingCompleted: true,
        onboardingStep: null,
      };
  // #376 데일리 보너스는 열람(auto_popup 포함) 즉시 자동 수령되므로, 그냥 두면 거의
  // 모든 테스트가 마운트 시 auto_popup으로 보너스를 받아 골드 기준선이 흔들린다.
  // 데일리 보너스 플로우 자체를 검증하는 테스트만 preserveDailyBonus로 옵트인하고,
  // 그 외에는 오늘 이미 수령한 상태로 시작해 auto_popup·골드 변화를 배제한다.
  const normalizedState = options.preserveDailyBonus
    ? withOnboarding
    : {
        ...withOnboarding,
        // 현재 클록(가짜 타이머면 NOW, 실제 타이머면 real time) 기준으로 방금 수령한
        // 상태를 만들어, 타이머 설정과 무관하게 auto_popup이 뜨지 않게 한다.
        dailyBonusState: { lastClaimedAt: Date.now(), streak: withOnboarding.dailyBonusState?.streak ?? 0 },
      };
  mockPersistence.readPersistedGameState.mockResolvedValueOnce(normalizedState);
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

// showAd가 호출마다 큐의 다음 결과를 반환하는 컨트롤러(#374 재시도 검증용).
// reloadAd 스파이를 포함해 프리로드·재시도 킥을 관찰할 수 있다.
function createSequencedRewardedAd(results: RewardedAdShowResult[]): RewardedAdController {
  const queue = [...results];
  return {
    isAdReady: true,
    isAdSupported: true,
    reloadAd: jest.fn(),
    showAd: jest.fn(
      async (): Promise<RewardedAdShowResult> => queue.shift() ?? { status: 'failed', error: 'exhausted' }
    ),
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
    mockPersistence.writePersistedGameState.mockReset();
    mockPersistence.writePersistedGameState.mockResolvedValue(undefined);
    mockPersistence.removePersistedGameState.mockReset();
    mockPersistence.removePersistedGameState.mockResolvedValue(undefined);
    mockPersistence.readPersistedGameSettings.mockReset();
    mockPersistence.writePersistedGameSettings.mockReset();
    mockPersistence.writePersistedGameSettings.mockResolvedValue(undefined);
    mockPersistence.readLastSeenAt.mockReset();
    mockPersistence.readLastSeenAt.mockResolvedValue(null);
    mockPersistence.writeLastSeenAt.mockReset();
    mockPersistence.writeLastSeenAt.mockResolvedValue(undefined);
  });

  afterEach(() => {
    __setMutationFlashTestHook(undefined);
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
    expect(screen.UNSAFE_getByProps({ testID: 'environment-area-layer-meadow' })).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('farm-scroll').props.contentContainerStyle).paddingTop).toBe(
      MAIN_CONTENT_TOP_PADDING
    );

    // Area selection changes only the backdrop's area layer; the current time
    // phase/celestial presentation remains mounted and unchanged.
    fireEvent.press(screen.getByTestId('area-tab-vegetable_field'));
    expect(screen.UNSAFE_getByProps({ testID: 'environment-area-layer-furrows' })).toBeTruthy();
    expect(backdropNow()).toBeTruthy();

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

  test('keeps decorative ambience and hills behind farm content with navRow at three (#353, #361)', async () => {
    const screen = await renderGame({ ...createInitialState(), onboardingCompleted: true });
    await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

    // AC-5: 계절 연출로 상시 진입점이 늘지 않는다 — navRow는 정확히 3개.
    expect(within(screen.getByTestId('nav-row')).getAllByRole('button')).toHaveLength(3);

    // AC-4: 계절 파티클은 농장 스테이지의 '배경' backdrop 레이어(child[0])로만 전달된다
    //       (시트/헤더 아님). 전달 값은 현재 로컬 월의 결정론 계절 파티클과 일치한다.
    const farmStage = screen.getByTestId('farm-stage');
    const backdropChild = farmStage.children[0];
    const scrollChild = farmStage.children[1];
    if (
      backdropChild == null ||
      scrollChild == null ||
      typeof backdropChild === 'string' ||
      typeof scrollChild === 'string'
    ) {
      throw new Error('farm stage must render the backdrop as its first (background) child');
    }
    // 배경 backdrop이 먼저, 그 위에 farm-scroll(플롯 등 상호작용 레이어)이 온다.
    expect(scrollChild.props.testID).toBe('farm-scroll');
    expect(backdropChild.props.seasonalParticle).toBe(getSeasonalAmbience(new Date()).particle);
    expect(
      screen.UNSAFE_getByProps({
        testID: `environment-hills-${getEnvironmentTone(getLocalMinutesOfDay(new Date())).phase}`,
      })
    ).toBeTruthy();
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

  test('mounts one distinct full-screen flash layer for every mutation rarity', async () => {
    const screen = await renderGame(createInitialState());
    const colors = MUTATION_CELEBRATION_KEYS.map((mutationKey) => {
      const style = StyleSheet.flatten(screen.getByTestId(`mutation-flash-${mutationKey}`).props.style);
      return style.backgroundColor;
    });

    expect(MUTATION_CELEBRATION_KEYS).toEqual(['golden', 'rainbow', 'giant', 'prism']);
    expect(new Set(colors).size).toBe(MUTATION_CELEBRATION_KEYS.length);
  });

  test('batch mutation celebration selects the rarest key regardless of harvest order', () => {
    const forward = MUTATION_CELEBRATION_KEYS.reduce(
      (current, candidate) => selectRarestMutationFlash(current, candidate),
      null as ReturnType<typeof selectRarestMutationFlash>,
    );
    const reverse = [...MUTATION_CELEBRATION_KEYS].reverse().reduce(
      (current, candidate) => selectRarestMutationFlash(current, candidate),
      null as ReturnType<typeof selectRarestMutationFlash>,
    );

    expect(forward).toBe('prism');
    expect(reverse).toBe('prism');
    expect(selectRarestMutationFlash('giant', 'rainbow')).toBe('giant');
    expect(selectRarestMutationFlash(null, 'giant')).toBe('giant');
    expect(selectRarestMutationFlash(null, null)).toBeNull();
    expect(selectRarestMutationFlash('rainbow', undefined)).toBe('rainbow');
    expect(selectRarestMutationFlash('rainbow', 'future' as MutationKey)).toBe('rainbow');
    expect(selectRarestMutationFlash('prism', 'prism')).toBe('prism');
  });

  test('a consecutive mutation flash resets every layer and animates only the latest rarity', async () => {
    const base = createReadyHarvestState();
    const state: GameState = {
      ...base,
      onboardingCompleted: true,
      harvestedCropKeys: ['carrot'],
      harvestNotificationPromptSeen: true,
      harvestCounts: { carrot: getMasteryThresholds('carrot')[3]! },
    };
    const onMutationFlash = jest.fn();
    __setMutationFlashTestHook(onMutationFlash);
    const screen = await renderGame(state);
    await waitFor(() => expect(screen.getAllByText('GET')).toHaveLength(2));

    const stopSpy = jest.spyOn(Animated.Value.prototype, 'stopAnimation');
    const setValueSpy = jest.spyOn(Animated.Value.prototype, 'setValue');
    const timingSpy = jest.spyOn(Animated, 'timing');
    let randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.001);

    try {
      fireEvent.press(within(screen.getByTestId('plot-cell-0')).getByText('GET'));
      await waitFor(() => expect(onMutationFlash).toHaveBeenLastCalledWith('giant'));

      randomSpy.mockRestore();
      randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
      stopSpy.mockClear();
      setValueSpy.mockClear();
      timingSpy.mockClear();

      fireEvent.press(within(screen.getByTestId('plot-cell-1')).getByText('GET'));
      await waitFor(() => expect(onMutationFlash).toHaveBeenLastCalledWith('prism'));

      expect(stopSpy.mock.calls.length).toBeGreaterThanOrEqual(MUTATION_CELEBRATION_KEYS.length);
      expect(setValueSpy.mock.calls.filter(([value]) => value === 0).length).toBeGreaterThanOrEqual(
        MUTATION_CELEBRATION_KEYS.length,
      );

      const prismTimings = timingSpy.mock.calls
        .map(([, config]) => config)
        .filter((config) => config.duration === 260 || config.duration === 940);
      expect(prismTimings).toEqual([
        expect.objectContaining({ toValue: 0.6, duration: 260 }),
        expect.objectContaining({ toValue: 0, duration: 940 }),
      ]);
      expect(
        timingSpy.mock.calls.some(([, config]) =>
          [0.36, 0.45, 0.52].includes(Number(config.toValue)),
        ),
      ).toBe(false);
    } finally {
      randomSpy.mockRestore();
      timingSpy.mockRestore();
      stopSpy.mockRestore();
      setValueSpy.mockRestore();
    }
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
    const base = createInitialState();
    const state: GameState = {
      ...base,
      plots: base.plots.map((plot, index) =>
        index === 0 ? { ...plot, cropType: 'wheat', startTime: NOW, state: 1 as const } : plot
      ),
    };
    const expectedOfflinePerHour = getActiveFarmOfflineGoldPerHour(state);
    const screen = await renderGame(state, { preferredLocale: DEFAULT_LOCALE });
    await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

    // 상시 노출은 시간당 순수익 + 제목 행의 오늘의 작물 chip. 보조 지표(연구레벨·
    // 수익/성장 배수)는 메인 화면에 상시 노출되지 않는다.
    expect(within(screen.getByTestId('title-group')).getByTestId('cotd-chip')).toBeTruthy();
    expect(screen.queryByTestId('stats-sheet')).toBeNull();
    expect(screen.queryByText(/연구 Lv\./)).toBeNull();
    expect(screen.queryByText(messages.profitLabel)).toBeNull();
    expect(screen.queryByText(messages.growthLabel)).toBeNull();
    expect(screen.queryByText(messages.statsOfflineIncomeLabel)).toBeNull();

    // chip 탭 → '농장 현황' 시트가 열리고, 이동한 보조 지표가 시트에 노출된다.
    fireEvent.press(screen.getByTestId('cotd-chip'));
    await waitFor(() => expect(screen.getByTestId('stats-sheet')).toBeTruthy());
    expect(screen.getByText(messages.sheetTitleStats)).toBeTruthy();
    expect(screen.getByText(/연구 Lv\./)).toBeTruthy();
    expect(screen.getByText(messages.profitLabel)).toBeTruthy();
    expect(screen.getByText(messages.growthLabel)).toBeTruthy();
    expect(screen.getByTestId('stats-offline-income')).toHaveTextContent(
      formatHourlyGold(expectedOfflinePerHour, DEFAULT_LOCALE)
    );
    expect(screen.getByTestId('stats-offline-income-cap')).toHaveTextContent(
      messages.statsOfflineIncomeCap(formatDuration(OFFLINE_INCOME_CAP_MS, DEFAULT_LOCALE))
    );
  });

  test('demotes the active title, crop-of-the-day detail, and prestige star breakdown into the stats sheet (#355)', async () => {
    const base = createInitialState();
    const state: GameState = {
      ...base,
      onboardingCompleted: true,
      activeTitle: 'harvest_master',
      prestige: { ...base.prestige, stars: 2 },
    };
    const cotd = getCropOfTheDayStatus(NOW, state);
    const titleName = getTitleLabel('harvest_master', DEFAULT_LOCALE).name;
    const screen = await renderGame(state);
    await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

    // 헤더의 제목 행에는 활성 칭호 배지가 더 이상 상시 노출되지 않는다(단일 요약 chip만 유지).
    expect(within(screen.getByTestId('title-group')).queryByText(titleName)).toBeNull();
    // ★ 칩(#379)은 잔여 화폐 카운트/개척 지도 shortcut으로 헤더에 유지된다.
    expect(screen.getByTestId('prestige-stars-chip')).toBeTruthy();
    // 강등된 지표는 시트를 열기 전에는 노출되지 않는다.
    expect(screen.queryByTestId('stats-active-title')).toBeNull();

    // AC-2: 단일 요약 chip(openStats) 한 뎁스 뒤 '농장 현황' 시트에서 강등된 세 지표가
    // 모두 도달된다 — 오늘의 작물 상세(작물 + ⭐×배수)·활성 칭호·명성 별 분해(별 + 스킬).
    fireEvent.press(screen.getByTestId('cotd-chip'));
    await waitFor(() => expect(screen.getByTestId('stats-sheet')).toBeTruthy());
    expect(screen.getByTestId('stats-crop-of-the-day')).toBeTruthy();
    expect(screen.getByTestId('stats-crop-of-the-day-bonus')).toHaveTextContent(`⭐×${cotd.multiplier}`);
    expect(screen.getByTestId('stats-active-title')).toHaveTextContent(titleName);
    expect(screen.getByTestId('stats-prestige-stars')).toHaveTextContent('★ 2');
    expect(screen.getByTestId('stats-prestige-skills')).toBeTruthy();

    // AC-2: 강등 정보를 옮기며 신규 탭 타깃/HUD 진입점을 만들지 않았다 — navRow는 여전히 3개.
    expect(within(screen.getByTestId('nav-row')).getAllByRole('button')).toHaveLength(3);
  });

  test('reaches all three demoted metrics via the single openStats header tab with no new entry point (#355 AC-2)', async () => {
    const base = createInitialState();
    const state: GameState = {
      ...base,
      onboardingCompleted: true,
      activeTitle: 'harvest_master',
      prestige: { ...base.prestige, stars: 2 },
    };
    const cotd = getCropOfTheDayStatus(NOW, state);
    const titleName = getTitleLabel('harvest_master', DEFAULT_LOCALE).name;
    const screen = await renderGame(state);
    await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

    // 강등된 세 정보는 시트를 열기 전(=헤더 상시 노출 아님)에는 렌더 트리에 없다.
    expect(screen.queryByTestId('stats-crop-of-the-day')).toBeNull();
    expect(screen.queryByTestId('stats-prestige-stars')).toBeNull();
    expect(screen.queryByTestId('stats-active-title')).toBeNull();

    // 헤더의 단일 요약 탭(cotd-chip) '하나'만 눌러 openStats로 한 뎁스 뒤 시트에 도달한다.
    fireEvent.press(screen.getByTestId('cotd-chip'));
    await waitFor(() => expect(screen.getByTestId('stats-sheet')).toBeTruthy());

    // (a) 오늘의 작물 상세 — 작물 + ⭐×배수가 시트 안에 있다.
    expect(screen.getByTestId('stats-crop-of-the-day')).toBeTruthy();
    expect(screen.getByTestId('stats-crop-of-the-day-bonus')).toHaveTextContent(`⭐×${cotd.multiplier}`);
    // (b) 활성 칭호 — 장착 칭호명이 시트 안에 있다.
    expect(screen.getByTestId('stats-active-title')).toHaveTextContent(titleName);
    // (c) 프리스티지 별점 분해 — 보유 별 + 구매 가능 스킬이 시트 안에 있다.
    expect(screen.getByTestId('stats-prestige-stars')).toHaveTextContent('★ 2');
    expect(screen.getByTestId('stats-prestige-skills')).toBeTruthy();

    // 신규 탭 타깃/HUD 진입점 증가 없음 — navRow는 여전히 정확히 3개다.
    expect(within(screen.getByTestId('nav-row')).getAllByRole('button')).toHaveLength(3);
  });

  test('keeps the navRow at exactly three NavButtons after the header declutter (#355 AC-4)', async () => {
    const screen = await renderGame({ ...createInitialState(), onboardingCompleted: true });
    await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

    // navRow 진입점은 상점·미션·더보기 3개로 정확히 유지된다(#355로 늘거나 줄지 않음).
    expect(within(screen.getByTestId('nav-row')).getAllByRole('button')).toHaveLength(3);
    expect(screen.getByTestId('shop-nav-button')).toBeTruthy();
    expect(screen.getByTestId('more-nav-button')).toBeTruthy();
    expect(
      screen.getByLabelText(getFarmMessages(DEFAULT_LOCALE).missionsButtonAccessibilityLabel)
    ).toBeTruthy();
  });

  test('does not apply the mobile wrap fallback to the core header row on the mobile market (#355 AC-5)', async () => {
    // 밀도를 낮춰 제거한 mobile 전용 줄바꿈 fallback(mobileHeaderTop=space-between /
    // mobileTitleGroup)이 mobile market에서도 핵심 헤더 행에 적용되지 않음을 고정한다.
    // fallback이 되살아나면 아래 assertion이 깨진다 → '줄바꿈 fallback 의존 없음' 회귀 가드.
    const screen = await renderGame({ ...createInitialState(), onboardingCompleted: true }, {
      market: 'mobile',
    });
    await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

    const headerTopStyle = StyleSheet.flatten(screen.getByTestId('header-top').props.style);
    // 제거한 mobileHeaderTop fallback의 space-between이 mobile에서도 적용되지 않고, 기본
    // flex-start 레이아웃을 유지한다.
    expect(headerTopStyle.justifyContent).toBe('flex-start');
    expect(headerTopStyle.justifyContent).not.toBe('space-between');
    // 핵심 행은 줄바꿈(wrap)으로 넘치지 않는다.
    expect(headerTopStyle.flexWrap).not.toBe('wrap');
    // 제거한 mobileTitleGroup fallback 없이 title-group이 기본 flex 레이아웃을 유지한다.
    const titleGroupStyle = StyleSheet.flatten(screen.getByTestId('title-group').props.style);
    expect(titleGroupStyle.flex).toBe(1);

    // mobile에서도 핵심 상시 지표·단일 요약 chip·navRow 3개가 한 행 안에 유지된다.
    expect(screen.getByTestId('cotd-chip')).toBeTruthy();
    expect(within(screen.getByTestId('nav-row')).getAllByRole('button')).toHaveLength(3);
  });

  test('shows a placeholder in the stats sheet when no title is equipped (#355)', async () => {
    const base = createInitialState();
    const state: GameState = { ...base, onboardingCompleted: true, activeTitle: null };
    const screen = await renderGame(state);
    await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

    fireEvent.press(screen.getByTestId('cotd-chip'));
    await waitFor(() => expect(screen.getByTestId('stats-sheet')).toBeTruthy());
    expect(screen.getByTestId('stats-active-title')).toHaveTextContent('—');
  });

  test('wires saved farm records and the live research/collection totals into the stats sheet (#291)', async () => {
    const base = createInitialState();
    const discovered = getCropKeys().slice(0, 3);
    const state: GameState = {
      ...base,
      onboardingCompleted: true,
      harvestedCropKeys: discovered,
      research: { ...base.research, points: 123, totalPointsEarned: 76_543 },
      lifetimeStats: {
        totalHarvests: 1_234,
        totalGoldEarned: 9_876_543,
        mutationsFound: 45,
        prestigeCount: 6,
        researchPointsEarned: 1,
        breedsUnlocked: 7,
      },
    };
    const screen = await renderGame(state);

    fireEvent.press(screen.getByTestId('cotd-chip'));
    await waitFor(() => expect(screen.getByTestId('farm-records-section')).toBeTruthy());
    expect(screen.getByTestId('stats-record-total-harvests')).toHaveTextContent('1,234');
    expect(screen.getByTestId('stats-record-crop-idle-gold')).toHaveTextContent(
      `${formatMoney(state.lifetimeStats.totalGoldEarned, DEFAULT_LOCALE)}G`
    );
    expect(screen.getByTestId('stats-record-mutation-harvests')).toHaveTextContent('45');
    expect(screen.getByTestId('stats-record-prestige-count')).toHaveTextContent('6');
    expect(screen.getByTestId('stats-record-research-points')).toHaveTextContent(
      `${formatMoney(state.research.totalPointsEarned, DEFAULT_LOCALE)} RP`
    );
    expect(screen.getByTestId('stats-record-breeds-unlocked')).toHaveTextContent('7');
    expect(screen.getByTestId('stats-record-collection-discovered')).toHaveTextContent(
      `${discovered.length} / ${getCropKeys().length}`
    );
  });

  test('refreshes the visible harvest records after a crop is collected (#291)', async () => {
    const carrot = CROPS.carrot;
    if (carrot == null) {
      throw new Error('FarmGame tests require carrot balance data.');
    }
    const base = createReadyHarvestState();
    const state: GameState = {
      ...base,
      onboardingCompleted: true,
      harvestedCropKeys: ['wheat'],
      harvestCounts: { ...base.harvestCounts, wheat: 10 },
      lifetimeStats: { ...base.lifetimeStats, totalHarvests: 10, totalGoldEarned: 100 },
    };
    const screen = await renderGame(state);

    fireEvent.press(screen.getAllByText('GET')[0]!);
    fireEvent.press(screen.getByTestId('cotd-chip'));

    await waitFor(() => expect(screen.getByTestId('stats-record-total-harvests')).toHaveTextContent('11'));
    expect(screen.getByTestId('stats-record-crop-idle-gold')).toHaveTextContent(
      `${formatMoney(100 + carrot.sell, DEFAULT_LOCALE)}G`
    );
    expect(screen.getByTestId('stats-record-collection-discovered')).toHaveTextContent(
      `2 / ${getCropKeys().length}`
    );
  });

  describe('seed-strip event bonus badges (#226, #354)', () => {
    const FRIDAY = Date.parse('2026-05-29T12:00:00.000Z');
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const GOLDEN_HARVEST_FRIDAY = Array.from({ length: 520 }, (_, week) => FRIDAY + week * WEEK_MS)
      .find((now) => getWeeklyEventStatus(now, ['starter_field']).typeKey === 'golden_sale');
    if (GOLDEN_HARVEST_FRIDAY == null) {
      throw new Error('golden_sale must be reachable within 520 weekends');
    }
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
      // 이벤트 축에 따라 배지 아이콘이 달라진다: 판매=🎉, 변이=✨, 성장속도=⚡.
      const expectedBadge = `${status.axis === 'mutation' ? '✨' : status.axis === 'speed' ? '⚡' : '🎉'}×${status.multiplier}`;
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
      const expectedWeeklyBadge = `${status.axis === 'mutation' ? '✨' : status.axis === 'speed' ? '⚡' : '🎉'}×${status.multiplier}`;
      const screen = await renderGame(state);
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      expect(within(screen.getByTestId(`seed-bonus-cotd-${featuredKey}`)).getByText('⭐×2')).toBeTruthy();
      expect(within(screen.getByTestId(`seed-bonus-weekly-${featuredKey}`)).getByText(expectedWeeklyBadge)).toBeTruthy();
    });

    test('golden_sale exposes its mutation badge, accessibility label, and Stats copy', async () => {
      jest.setSystemTime(GOLDEN_HARVEST_FRIDAY);
      const state = badgeState();
      const status = getWeeklyEventStatus(GOLDEN_HARVEST_FRIDAY, state.unlockedAreas);
      expect(status.typeKey).toBe('golden_sale');
      expect(status.axis).toBe('mutation');

      const screen = await renderGame(state);
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
      for (const cropKey of status.cropKeys) {
        expect(
          within(screen.getByTestId(`seed-bonus-weekly-${cropKey}`)).getByText(`✨×${status.multiplier}`),
        ).toBeTruthy();
        expect(screen.getByTestId(`seed-tool-${cropKey}`).props.accessibilityLabel).toContain(
          getFarmMessages('ko-KR').weeklyEventGoldenLabel,
        );
      }

      fireEvent.press(screen.getByTestId('cotd-chip'));
      await waitFor(() => expect(screen.getByTestId('weekly-event-banner')).toBeTruthy());
      expect(screen.getByTestId('weekly-event-title')).toHaveTextContent(
        `✨ ${getFarmMessages('ko-KR').weeklyEventGoldenLabel}`,
      );
      expect(screen.getByTestId('weekly-event-banner')).toHaveTextContent(/돌연변이 확률/);
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

  describe('전체 비료 (#359)', () => {
    // 성장 중(state 1) 밭 여러 개 + 충분한 골드. 온보딩 완료로 자유 조작 상태.
    function createMultiGrowingState(gold: number, growingCount: number): GameState {
      const base = createInitialState();
      return {
        ...base,
        onboardingCompleted: true,
        gold,
        plots: base.plots.map((plot, index) =>
          index < growingCount
            ? { ...plot, cropType: 'carrot' as const, startTime: NOW, state: 1 as const }
            : plot
        ),
      };
    }

    test('성장 중 다수 밭에서 전체 비료 버튼이 노출되고, 2탭 확인 후 일괄 적용된다', async () => {
      const state = createMultiGrowingState(100_000, 3);
      // 컴포넌트와 같은 순수 함수·같은 NOW로 프리뷰를 계산해 정확한 차감액을 검증한다.
      const preview = previewFertilizeAll(state, NOW);
      expect(preview.affordableCount).toBe(3);
      expect(preview.totalCost).toBeGreaterThan(0);

      const screen = await renderGame(state);
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      // 조건부 버튼 노출(성장 중 + 지불 가능 3칸 ≥ 임계 2).
      const button = screen.getByTestId('fertilize-all-button');
      expect(button).toBeTruthy();

      // 1차 탭: 확인 단계 전환. 실행/차감/토스트 없음(골드 불변).
      fireEvent.press(button);
      expect(screen.queryByText(/곳을 비료로 바로 키웠어요/)).toBeNull();
      expect(screen.getByText(`${formatMoney(100_000, 'ko-KR')}G`)).toBeTruthy();
      expect(screen.queryByText('GET')).toBeNull();

      // 2차 탭: 실행 → 완료 토스트 + 정확한 골드 차감 + 성장 완료(GET) 3칸.
      fireEvent.press(screen.getByTestId('fertilize-all-button'));
      await waitFor(() => expect(screen.getByText(/곳을 비료로 바로 키웠어요/)).toBeTruthy());
      expect(screen.getByText(`${formatMoney(100_000 - preview.totalCost, 'ko-KR')}G`)).toBeTruthy();
      expect(screen.getAllByText('GET')).toHaveLength(3);
      // 대상이 사라져 버튼도 사라진다.
      expect(screen.queryByTestId('fertilize-all-button')).toBeNull();
    });

    test('한 번 탭만으로는 실행되지 않는다(확인 게이트)', async () => {
      const state = createMultiGrowingState(100_000, 3);
      const screen = await renderGame(state);
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      fireEvent.press(screen.getByTestId('fertilize-all-button'));
      // 단일 탭: 골드 차감·완료·토스트 어느 것도 발생하지 않는다.
      expect(screen.getByText(`${formatMoney(100_000, 'ko-KR')}G`)).toBeTruthy();
      expect(screen.queryByText('GET')).toBeNull();
      expect(screen.queryByText(/곳을 비료로 바로 키웠어요/)).toBeNull();
      // 버튼은 확인 라벨로 남아 있다(대상은 여전히 존재).
      expect(screen.getByTestId('fertilize-all-button')).toBeTruthy();
    });

    test('지불 가능 밭이 임계 미만이면 버튼이 나타나지 않는다', async () => {
      // 성장 중 1칸(임계 2 미만)이면 밭 시트 안 단일 비료로 충분하므로 노출하지 않는다.
      const state = createMultiGrowingState(100_000, 1);
      const screen = await renderGame(state);
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
      expect(screen.queryByTestId('fertilize-all-button')).toBeNull();
    });
  });

  describe('소유 동물 스트립 (#360)', () => {
    const messages = getFarmMessages(DEFAULT_LOCALE);

    test('소유 동물이 0마리면 스트립을 렌더하지 않는다', async () => {
      const screen = await renderGame({ ...createInitialState(), onboardingCompleted: true });
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
      expect(screen.queryByTestId('animal-strip')).toBeNull();
    });

    test('소유 동물을 노출하고, 탭하면 기존 동물 시트가 열린다(신규 nav 없이)', async () => {
      const chicken = ANIMALS[0]!; // 급여 안 한 idle 소유.
      const state: GameState = {
        ...createInitialState(),
        onboardingCompleted: true,
        animals: { owned: [chicken.key], feeding: {} },
      };
      const screen = await renderGame(state);
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      const strip = screen.getByTestId('animal-strip');
      expect(strip).toBeTruthy();
      // AC-4 거주 뎁스: 스트립은 농장 장면 스크롤(farm-scroll) 안에 있고, 플롯 그리드
      // 컨테이너(hit 영역) 밖의 형제로 렌더돼 플롯 탭을 덮지 않는다.
      expect(within(screen.getByTestId('farm-scroll')).getByTestId('animal-strip')).toBeTruthy();
      expect(within(screen.getByTestId('plot-grid-container')).queryByTestId('animal-strip')).toBeNull();
      // idle이므로 ready 강조 없음, 탭 라벨은 수확 준비 0.
      expect(screen.queryByTestId(`animal-strip-ready-${chicken.key}`)).toBeNull();
      expect(strip.props.accessibilityLabel).toBe(messages.animalStripAccessibilityLabel(0));

      // 스트립 탭 → 기존 동물 시트(openAnimals) 오픈. 탭 전에는 시트가 닫혀 있어,
      // 탭이 실제로 기존 동물 시트를 여는 실행 경로임을 before/after로 확정한다.
      expect(screen.queryByTestId('animals-sheet')).toBeNull();
      fireEvent.press(strip);
      expect(screen.getByTestId('animals-sheet')).toBeTruthy();
    });

    test('ready 동물에 강조 뱃지를 표시하고 탭 라벨에 수확 준비 수를 반영한다', async () => {
      const chicken = ANIMALS[0]!; // 급여 후 타이머 완료 → ready.
      const state: GameState = {
        ...createInitialState(),
        onboardingCompleted: true,
        animals: { owned: [chicken.key], feeding: { [chicken.key]: NOW - chicken.produceTimerMs } },
      };
      const screen = await renderGame(state);
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      const strip = screen.getByTestId('animal-strip');
      // 시각적 강조: ready 동물에 강조 뱃지가 스트립 안에 표시된다.
      expect(within(strip).getByTestId(`animal-strip-ready-${chicken.key}`)).toBeTruthy();
      // 요약만: 아이콘은 노출하되, 동물 시트의 카운트다운/급여 상세(animal-status 행)는
      // 홈 스트립에 표시하지 않는다.
      expect(within(strip).getByText(chicken.icon)).toBeTruthy();
      expect(within(strip).queryByTestId(`animal-status-${chicken.key}`)).toBeNull();
      expect(strip.props.accessibilityLabel).toBe(messages.animalStripAccessibilityLabel(1));
    });
  });

  describe('notification 스케줄 가드 (#363)', () => {
    // 익은 당근을 하나씩 수확하면 gameState(골드·플롯)가 바뀌어 알림 effect가 재실행된다.
    // 이 churn 위에서, 스케줄 타깃이 안 바뀌면 OS 등록·이벤트가 재발화하지 않음을 검증한다.
    // (성장 중 rice는 수확 대상이 아니므로 그 nextReadyAt은 고정으로 유지된다.)
    const notificationEvents = (track: jest.Mock, kind: string) =>
      track.mock.calls.filter(
        ([name, params]) => name === 'notification_scheduled' && params?.notification_kind === kind
      );

    async function harvestRipePlots(screen: Awaited<ReturnType<typeof renderGame>>, plotIndexes: number[]) {
      for (const plotIndex of plotIndexes) {
        // 수확 사이 한 틱 진행 → now(=floor 시 readyAtMs) 이동. 회귀 코드라면 여기서 재발화.
        await act(async () => {
          jest.advanceTimersByTime(GAME_TICK_INTERVAL_MS);
        });
        await act(async () => {
          fireEvent.press(screen.getByTestId(`plot-cell-${plotIndex}`));
        });
      }
    }

    test('nextReadyAt이 고정된 60초 floor 구간에서 gameState가 바뀌어도 harvest 스케줄·이벤트는 재발화하지 않는다', async () => {
      const track = jest.fn();
      const scheduleHarvestReady = jest.fn(async () => undefined);
      const notifications: FarmGameNotifications = {
        isSupported: true,
        requestPermission: jest.fn(async () => true),
        scheduleHarvestReady,
        cancelHarvestReady: jest.fn(async () => undefined),
        scheduleReminder: jest.fn(async () => undefined),
        cancelReminder: jest.fn(async () => undefined),
      };
      const base = createInitialState();
      const state: GameState = {
        ...base,
        onboardingCompleted: true,
        gold: 1_000,
        unlockedAreas: FARM_AREAS.map((area) => area.key),
        plots: base.plots.map((plot, index) => {
          if (index === 0) {
            // 성장 중 rice(50s): nextReadyAt = NOW+50s로 60초 floor 구간의 고정 타깃.
            return { ...plot, cropType: 'rice' as const, startTime: NOW, state: 1 as const };
          }
          if (index >= 1 && index <= 3) {
            // 익은 당근: 수확으로 gameState를 churn시키는 소스(효과 재실행 유발). rice와 무관.
            return { ...plot, cropType: 'carrot' as const, startTime: NOW - 10_000, state: 2 as const };
          }
          return plot;
        }),
      };
      const screen = await renderGame(
        state,
        { analytics: createFarmAnalytics(track), notifications },
        { harvestNotificationsEnabled: true, comebackRemindersEnabled: false }
      );

      await waitFor(() => expect(scheduleHarvestReady).toHaveBeenCalledTimes(1));
      expect(notificationEvents(track, 'harvest')).toHaveLength(1);

      await harvestRipePlots(screen, [1, 2, 3]);

      // 고정 타깃(rice) + 가드 안 이동 → OS 재등록·이벤트 재발화 없음(회귀 시 수확마다 폭증).
      expect(scheduleHarvestReady).toHaveBeenCalledTimes(1);
      expect(notificationEvents(track, 'harvest')).toHaveLength(1);
    });

    test('daily_bonus OS 등록이 가드 안으로 이동해 gameState churn에도 1회만 호출된다(crop_of_the_day 회귀 없음)', async () => {
      const track = jest.fn();
      const scheduleReminder = jest.fn(async () => undefined);
      const notifications: FarmGameNotifications = {
        isSupported: true,
        requestPermission: jest.fn(async () => true),
        scheduleHarvestReady: jest.fn(async () => undefined),
        cancelHarvestReady: jest.fn(async () => undefined),
        scheduleReminder,
        cancelReminder: jest.fn(async () => undefined),
      };
      const base = createInitialState();
      const state: GameState = {
        ...base,
        onboardingCompleted: true,
        gold: 1_000,
        // 방금 수령: 리마인더 target(=lastClaimedAt+쿨다운)이 미래에 고정된다.
        dailyBonusState: { lastClaimedAt: NOW - 1_000, streak: 1 },
        plots: base.plots.map((plot, index) =>
          index >= 0 && index <= 2
            ? { ...plot, cropType: 'carrot' as const, startTime: NOW - 10_000, state: 2 as const }
            : plot
        ),
      };
      const screen = await renderGame(
        state,
        { analytics: createFarmAnalytics(track), notifications },
        { harvestNotificationsEnabled: false, comebackRemindersEnabled: true }
      );

      const dailyCalls = () =>
        (scheduleReminder as jest.Mock).mock.calls.filter((call) => call[0] === 'dailyBonus');
      const cropCalls = () =>
        (scheduleReminder as jest.Mock).mock.calls.filter((call) => call[0] === 'cropOfTheDay');

      await waitFor(() => expect(dailyCalls()).toHaveLength(1));
      expect(cropCalls()).toHaveLength(1);

      // 익은 당근을 수확해 gameState를 여러 번 churn시킨다(comeback effect 재실행).
      await harvestRipePlots(screen, [0, 1, 2]);

      // daily_bonus OS 등록이 가드 안으로 이동 → churn에도 1회 유지(회귀 시 수확마다 폭증).
      expect(dailyCalls()).toHaveLength(1);
      expect(notificationEvents(track, 'daily_bonus')).toHaveLength(1);
      // crop_of_the_day는 기존 올바른 패턴 그대로 → 회귀 없이 1회 유지.
      expect(cropCalls()).toHaveLength(1);
      expect(notificationEvents(track, 'crop_of_the_day')).toHaveLength(1);
    });

    test('게임 틱 시뮬레이션: harvest 스케줄 호출 횟수가 실제 nextReadyAt 타깃 수를 따른다(고정 1 → 더 이른 작물 심으면 2)', async () => {
      const track = jest.fn();
      const scheduleHarvestReady = jest.fn(async () => undefined);
      const notifications: FarmGameNotifications = {
        isSupported: true,
        requestPermission: jest.fn(async () => true),
        scheduleHarvestReady,
        cancelHarvestReady: jest.fn(async () => undefined),
        scheduleReminder: jest.fn(async () => undefined),
        cancelReminder: jest.fn(async () => undefined),
      };
      const base = createInitialState();
      const state: GameState = {
        ...base,
        onboardingCompleted: true,
        gold: 1_000,
        unlockedAreas: FARM_AREAS.map((area) => area.key),
        // plot 0만 성장 중 rice(50s) — 고정 타깃. 나머지는 빈 밭(심기 가능).
        plots: base.plots.map((plot, index) =>
          index === 0 ? { ...plot, cropType: 'rice' as const, startTime: NOW, state: 1 as const } : plot
        ),
      };
      const screen = await renderGame(
        state,
        { analytics: createFarmAnalytics(track), notifications },
        { harvestNotificationsEnabled: true, comebackRemindersEnabled: false }
      );

      await waitFor(() => expect(scheduleHarvestReady).toHaveBeenCalledTimes(1));

      // 게임 틱 시뮬레이션: 타깃(rice)이 안 바뀌면 250ms 틱을 여러 번 진행해도 1회 유지.
      for (let i = 0; i < 10; i += 1) {
        await act(async () => {
          jest.advanceTimersByTime(GAME_TICK_INTERVAL_MS);
        });
      }
      expect(scheduleHarvestReady).toHaveBeenCalledTimes(1);

      // 더 이른 작물(당근 2s)을 빈 밭에 심어 nextReadyAt을 실제로 바꾸면 정확히 1회 더 발생.
      fireEvent.press(screen.getByText('당근'));
      await act(async () => {
        fireEvent.press(screen.getByTestId('plot-cell-1'));
      });
      await waitFor(() => expect(scheduleHarvestReady).toHaveBeenCalledTimes(2));
    });
  });

  describe('미션 시트 광고 미지원 watch_ad 제외 (#366)', () => {
    const messages = getFarmMessages(DEFAULT_LOCALE);

    // 신규 nav/HUD 없이 기존 '오늘의 미션' 진입점으로 기존 미션 시트를 연다. adSupported는
    // useRewardedAd의 isAdSupported로 결정된다(기본 false / createReadyRewardedAd true).
    async function openMissionsSheet(adSupported: boolean) {
      const props = adSupported ? { useRewardedAd: () => createReadyRewardedAd() } : {};
      const screen = await renderGame({ ...createInitialState(), onboardingCompleted: true }, props);
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
      fireEvent.press(screen.getByLabelText(messages.missionsButtonAccessibilityLabel));
      await waitFor(() => expect(screen.getByText(messages.missionsWeeklyTitle)).toBeTruthy());
      return screen;
    }

    // AC-6: 제외가 기존 미션 시트 내부에서 일어나며 신규 nav/HUD를 추가하지 않는다.
    test('광고 미지원 watch_ad 제외는 기존 미션 시트 안에서 일어난다(신규 nav/HUD 없음)', async () => {
      const screen = await openMissionsSheet(false);
      // 기존 미션 시트(주간 타이틀)가 열려 있고, 그 안에서 일일·주간 watch_ad가 빠진다.
      expect(screen.getByText(messages.missionsWeeklyTitle)).toBeTruthy();
      expect(screen.queryByText(messages.missionWatchAdLabel(1))).toBeNull();
      expect(screen.queryByText(messages.weeklyMissionWatchAdLabel(5))).toBeNull();
    });

    // AC-5: 제외 방식이라 신규 문구가 없고, 남은 미션은 기존 라벨로 렌더된다.
    test('광고 미지원 미션 시트는 신규 문구 없이 기존 라벨로 렌더된다', async () => {
      const screen = await openMissionsSheet(false);
      // 주간 수확(target 150 고정) 미션이 기존 라벨로 표시된다(신규 i18n 키 없이).
      expect(screen.getByText(messages.weeklyMissionHarvestLabel(150))).toBeTruthy();
      expect(screen.queryByText(messages.missionWatchAdLabel(1))).toBeNull();
    });

    test('광고 지원 시 watch_ad 미션이 표시된다(회귀)', async () => {
      const screen = await openMissionsSheet(true);
      expect(screen.getByText(messages.missionWatchAdLabel(1))).toBeTruthy();
      expect(screen.getByText(messages.weeklyMissionWatchAdLabel(5))).toBeTruthy();
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
      const metaRow = screen.getByTestId('seed-meta-row');
      expect(within(metaRow).getByText(messages.harvestHint)).toBeTruthy();
      expect(within(metaRow).getByTestId('seed-sort-toggle')).toBeTruthy();

      // A locked area renders no seed buttons, so there is nothing to sort.
      fireEvent.press(screen.getByTestId('area-tab-vegetable_field'));
      expect(screen.queryByTestId('seed-sort-toggle')).toBeNull();
      expect(screen.getByTestId('seed-meta-row')).toBeTruthy();
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

    // #376 데일리 보너스는 열람 즉시 auto_popup으로 자동 수령되므로, 더보기 메뉴에
    // 진입점이 남아 있으려면 복귀 recap이 auto_popup을 억제한 상태여야 한다. 오프라인
    // 체인 수익으로 recap을 띄우고 닫아, 데일리 보너스를 미수령·가용 상태로 유지한 채
    // 메뉴 구조를 검증한다.
    const renderMoreMenuWithDailyBonus = async (
      props: Partial<React.ComponentProps<typeof FarmGame>> = {}
    ) => {
      mockPersistence.readLastSeenAt.mockResolvedValueOnce(NOW - 2 * 60 * 60 * 1000);
      const state: GameState = {
        ...completedState(),
        chainFarms: [{ id: 1, archetype: 'plains', goldPerHour: 3600, lastCollectedAt: NOW - 2 * 60 * 60 * 1000 }],
      };
      const screen = await renderGame(state, props, null, { preserveDailyBonus: true });
      await waitFor(() => expect(screen.getByText('다시 오셨네요!')).toBeTruthy());
      fireEvent.press(screen.getByLabelText(messages.sheetCloseAccessibilityLabel));
      await waitFor(() => expect(screen.queryByText('다시 오셨네요!')).toBeNull());
      return screen;
    };

    test('상시 navRow는 상점·미션·더보기만 노출하고 나머지는 더보기 뒤로 숨긴다', async () => {
      const screen = await renderGame(completedState());
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      // 상시 노출 진입점: 상점·미션·더보기(3개, 기존 7개에서 감소).
      expect(screen.getByTestId('shop-nav-button')).toBeTruthy();
      expect(screen.getByTestId('more-nav-button')).toBeTruthy();
      expect(screen.getByLabelText(messages.missionsButtonAccessibilityLabel)).toBeTruthy();

      // 묶인 진입점은 더보기를 열기 전엔 렌더 트리에 없다.
      expect(screen.queryByLabelText(messages.wheelButtonAccessibilityLabel)).toBeNull();
      expect(screen.queryByLabelText(messages.dailyBonusButtonAccessibilityLabel)).toBeNull();
      expect(screen.queryByLabelText(messages.collectionButtonAccessibilityLabel)).toBeNull();
      expect(screen.queryByLabelText(messages.labButtonAccessibilityLabel)).toBeNull();
      expect(screen.queryByLabelText(messages.mapButtonAccessibilityLabel)).toBeNull();
      expect(screen.queryByLabelText(messages.achievementsButtonAccessibilityLabel)).toBeNull();
    });

    test('더보기 시트에서 출석 보너스·룰렛·도감·연구소·개척·업적에 모두 도달할 수 있다', async () => {
      const screen = await renderMoreMenuWithDailyBonus();

      fireEvent.press(screen.getByTestId('more-nav-button'));

      // 더보기 시트가 열리고 일일 보너스를 포함한 진입점이 모두 노출된다.
      expect(screen.getByText(messages.sheetTitleMore)).toBeTruthy();
      expect(screen.getByLabelText(messages.dailyBonusButtonAccessibilityLabel)).toBeTruthy();
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
      // 완료 상태에서 출석 보너스와 무료 룰렛이 준비돼 롤업 배지 = 2다.
      const screen = await renderMoreMenuWithDailyBonus();

      const moreButton = screen.getByTestId('more-nav-button');
      expect(within(moreButton).getByText('2')).toBeTruthy();

      // 더보기를 열면 출석 보너스와 룰렛이 각자의 배지(1)를 유지한다.
      fireEvent.press(moreButton);
      const dailyBonusEntry = screen.getByLabelText(messages.dailyBonusButtonAccessibilityLabel);
      const wheelEntry = screen.getByLabelText(messages.wheelButtonAccessibilityLabel);
      expect(within(dailyBonusEntry).getByText('1')).toBeTruthy();
      expect(within(wheelEntry).getByText('1')).toBeTruthy();
    });

    test('생산 진입점은 동물·공방 수령 수를 합산하고 탭에는 각 수를 유지한다 (#369)', async () => {
      const animal = ANIMALS[0]!;
      const recipe = PRODUCTION_RECIPES[0]!;
      const base = completedState();
      const state: GameState = {
        ...base,
        dailyBonusState: { lastClaimedAt: NOW, streak: 1 },
        animals: {
          owned: [animal.key],
          feeding: { [animal.key]: NOW - animal.produceTimerMs },
        },
        production: {
          ...base.production,
          crafting: { [recipe.key]: NOW - recipe.timerMs },
        },
      };
      const screen = await renderGame(state);

      // 무료 룰렛 1 + 통합 생산 2가 상단 더보기 배지에 롤업된다.
      const moreButton = screen.getByTestId('more-nav-button');
      expect(within(moreButton).getByText('3')).toBeTruthy();
      fireEvent.press(moreButton);

      const productionEntry = screen.getByLabelText(messages.productionButtonAccessibilityLabel);
      expect(within(productionEntry).getByText('2')).toBeTruthy();
      fireEvent.press(productionEntry);

      expect(within(screen.getByTestId('production-tab-animals-badge')).getByText('1')).toBeTruthy();
      expect(within(screen.getByTestId('production-tab-workshop-badge')).getByText('1')).toBeTruthy();
    });

    test('더보기 시트가 성격별 섹션 헤더로 그룹화되고 생산 통합 후 7개 진입점이 유지된다 (#270, #294, #369)', async () => {
      const screen = await renderMoreMenuWithDailyBonus();

      fireEvent.press(screen.getByTestId('more-nav-button'));

      // 3개 섹션 헤더가 모두 노출된다(평면 목록 → 명명된 섹션).
      expect(screen.getByText(messages.moreSectionDaily)).toBeTruthy();
      expect(screen.getByText(messages.moreSectionProduction)).toBeTruthy();
      expect(screen.getByText(messages.moreSectionGrowth)).toBeTruthy();

      // 기존 동물·공방 두 행은 생산 한 행으로 합쳐져 출석 보너스를 포함해 7개다.
      expect(screen.getByLabelText(messages.dailyBonusButtonAccessibilityLabel)).toBeTruthy();
      expect(screen.getByLabelText(messages.wheelButtonAccessibilityLabel)).toBeTruthy();
      expect(screen.getByLabelText(messages.collectionButtonAccessibilityLabel)).toBeTruthy();
      expect(screen.getByLabelText(messages.labButtonAccessibilityLabel)).toBeTruthy();
      expect(screen.getByLabelText(messages.productionButtonAccessibilityLabel)).toBeTruthy();
      expect(screen.queryByLabelText(messages.animalsButtonAccessibilityLabel)).toBeNull();
      expect(screen.queryByLabelText(messages.workshopButtonAccessibilityLabel)).toBeNull();
      expect(screen.getByLabelText(messages.mapButtonAccessibilityLabel)).toBeTruthy();
      expect(screen.getByLabelText(messages.achievementsButtonAccessibilityLabel)).toBeTruthy();

      // 통합 진입 후 동물 탭이 기본이고 공방 탭으로 전환할 수 있다.
      const wheelEntry = screen.getByLabelText(messages.wheelButtonAccessibilityLabel);
      expect(within(wheelEntry).getByText('1')).toBeTruthy();
      fireEvent.press(screen.getByLabelText(messages.productionButtonAccessibilityLabel));
      expect(screen.getByText(messages.sheetTitleProduction)).toBeTruthy();
      expect(screen.getByTestId('animals-sheet')).toBeTruthy();
      fireEvent.press(screen.getByTestId('production-tab-workshop'));
      expect(screen.getByTestId('workshop-sheet')).toBeTruthy();
    });

    test('더보기 growth의 개척 항목은 구매 가능한 명성 스킬 수를 배지로 표시한다 (#379)', async () => {
      const base = completedState();
      const state: GameState = {
        ...base,
        prestige: { ...base.prestige, stars: 2 },
      };
      const screen = await renderGame(state);

      fireEvent.press(screen.getByTestId('more-nav-button'));

      // ★2로는 starting_capital(1), global_profit(2), global_speed(2) 세 스킬을 살 수 있다.
      // 체인 수금/개척 준비는 없는 상태라 map 배지는 affordable skill 수와 정확히 같다.
      const mapEntry = screen.getByLabelText(messages.mapButtonAccessibilityLabel);
      expect(within(mapEntry).getByText('3')).toBeTruthy();
    });

    test('auto_popup 열람 즉시 자동 수령되고 배지가 정리된다 (#294/#376)', async () => {
      const track = jest.fn();
      const screen = await renderGame(completedState(), { analytics: createFarmAnalytics(track) }, null, {
        preserveDailyBonus: true,
      });

      await waitFor(() => expect(screen.getByText(messages.sheetTitleDailyBonus)).toBeTruthy());
      // #376 auto_popup 열람 즉시 자동 수령: opened·claimed(source auto_popup)가 각각 1회.
      expect(
        track.mock.calls.filter(([event, params]) =>
          event === 'daily_bonus_opened' && params?.source === 'auto_popup'
        )
      ).toHaveLength(1);
      await waitFor(() =>
        expect(
          track.mock.calls.filter(([event, params]) =>
            event === 'daily_bonus_claimed' && params?.source === 'auto_popup'
          )
        ).toHaveLength(1)
      );

      // AC-1: 추가 탭 없이 골드가 지급되고 dailyBonusState가 claimDailyBonus 결과로
      // 갱신된다(수령 완료 → lastClaimedAt 설정, 골드는 초기값보다 증가).
      await waitFor(() =>
        expect(getLatestPersistedState().dailyBonusState.lastClaimedAt).not.toBeNull()
      );
      expect(getLatestPersistedState().gold).toBeGreaterThan(completedState().gold);

      // 시트는 "수령 완료" 표시 + 확인 버튼만 남고, 탭-수령 버튼 경로는 사라진다.
      expect(screen.getByText(messages.dailyBonusConfirmAction)).toBeTruthy();
      expect(
        screen.queryByText(messages.dailyBonusClaimAction(formatMoney(50, DEFAULT_LOCALE)))
      ).toBeNull();

      // 틱/리렌더가 반복돼도 중복 수령·중복 발화가 없다(기존 멱등 보장 수준).
      await act(async () => {
        jest.advanceTimersByTime(GAME_TICK_INTERVAL_MS * 2);
      });
      expect(track.mock.calls.filter(([event]) => event === 'daily_bonus_opened')).toHaveLength(1);
      expect(track.mock.calls.filter(([event]) => event === 'daily_bonus_claimed')).toHaveLength(1);

      // 확인 버튼으로 닫으면 이미 수령돼 더보기 재진입점(출석 보너스)이 사라지고,
      // 룰렛 배지(1)만 남는다.
      fireEvent.press(screen.getByText(messages.dailyBonusConfirmAction));
      await act(async () => {
        jest.advanceTimersByTime(180);
      });
      fireEvent.press(screen.getByTestId('more-nav-button'));
      expect(screen.queryByLabelText(messages.dailyBonusButtonAccessibilityLabel)).toBeNull();
      expect(within(screen.getByTestId('more-nav-button')).getByText('1')).toBeTruthy();
    });

    test('더보기에서 데일리 보너스를 열면 추가 탭 없이 source=more로 자동 수령된다 (#376 AC-1 more)', async () => {
      const track = jest.fn();
      const screen = await renderMoreMenuWithDailyBonus({ analytics: createFarmAnalytics(track) });

      fireEvent.press(screen.getByTestId('more-nav-button'));
      const goldBefore = getLatestPersistedState().gold;

      // 더보기의 출석 보너스 진입점을 누르면 시트가 열리며(source=more) 추가 탭 없이 즉시 수령된다.
      fireEvent.press(screen.getByLabelText(messages.dailyBonusButtonAccessibilityLabel));
      await waitFor(() => expect(screen.getByText(messages.sheetTitleDailyBonus)).toBeTruthy());
      await waitFor(() =>
        expect(
          track.mock.calls.filter(([event, params]) => event === 'daily_bonus_claimed' && params?.source === 'more')
        ).toHaveLength(1)
      );
      // 골드 지급 + dailyBonusState 갱신 + 확인 버튼만(탭-수령 버튼 없음).
      expect(getLatestPersistedState().gold).toBeGreaterThan(goldBefore);
      expect(getLatestPersistedState().dailyBonusState.lastClaimedAt).not.toBeNull();
      expect(screen.getByText(messages.dailyBonusConfirmAction)).toBeTruthy();
    });

    test('자동 수령은 시트가 열려 있는 동안 틱·리렌더가 반복돼도 정확히 1회만 발화한다 (#376 AC-6 중복 방지)', async () => {
      const track = jest.fn();
      const screen = await renderGame(completedState(), { analytics: createFarmAnalytics(track) }, null, {
        preserveDailyBonus: true,
      });

      await waitFor(() => expect(screen.getByText(messages.sheetTitleDailyBonus)).toBeTruthy());
      await waitFor(() =>
        expect(track.mock.calls.filter(([event]) => event === 'daily_bonus_claimed')).toHaveLength(1)
      );
      // 시트를 연 채 게임 틱을 여러 번 진행해도(가짜 타이머) 자동 수령이 재발화되지 않는다.
      await act(async () => {
        jest.advanceTimersByTime(GAME_TICK_INTERVAL_MS * 5);
      });
      expect(track.mock.calls.filter(([event]) => event === 'daily_bonus_claimed')).toHaveLength(1);
    });

    test('열람 즉시 추가 탭 없이 골드가 지급되고 dailyBonusState가 claimDailyBonus 결과와 정확히 일치한다 (#376 AC-1)', async () => {
      const base = completedState();
      // 컴포넌트와 동일한 인자(NOW·getRewardedGoldAmount)로 기대 수령 결과를 미리 계산한다.
      const expected = claimDailyBonus(base.dailyBonusState, NOW, getRewardedGoldAmount(base));
      if (expected == null) {
        throw new Error('fixture는 NOW 시점에 수령 가능해야 한다');
      }

      const screen = await renderGame(base, {}, null, { preserveDailyBonus: true });
      await waitFor(() => expect(screen.getByText(messages.sheetTitleDailyBonus)).toBeTruthy());

      // 추가 탭(SheetAction 누름) 없이 자동 수령: 지속 상태의 dailyBonusState가
      // claimDailyBonus 결과(newState)와 정확히 일치하고, 골드는 수령 전 + goldAwarded와 같다.
      await waitFor(() => expect(getLatestPersistedState().dailyBonusState).toEqual(expected.newState));
      expect(getLatestPersistedState().gold).toBe(base.gold + expected.goldAwarded);
    });

    test('수령 불가일(claimDailyBonus=null)엔 시트·지급·발화 없이 안전 처리된다 (#376 AC-4)', async () => {
      const track = jest.fn();
      // 이미 오늘 수령한 상태(쿨다운 중) → claimDailyBonus는 null을 반환한다. 열람 경로가
      // 게이트로 막혀 시트가 열리지 않고, 골드 지급·이벤트 발화도 없어야 한다(AC-4의
      // 관측 가능한 보장: null 반환 시 무지급·무발화).
      const claimedState: GameState = {
        ...createInitialState(),
        gold: 1_000,
        dailyBonusState: { lastClaimedAt: NOW, streak: 3 },
      };
      const screen = await renderGame(claimedState, { analytics: createFarmAnalytics(track) });
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
      expect(screen.queryByText(messages.sheetTitleDailyBonus)).toBeNull();
      fireEvent.press(screen.getByTestId('more-nav-button'));
      expect(screen.queryByLabelText(messages.dailyBonusButtonAccessibilityLabel)).toBeNull();
      expect(track.mock.calls.filter(([event]) => event === 'daily_bonus_claimed')).toHaveLength(0);
      // 골드가 초기값 그대로 유지된다(무지급).
      expect(getLatestPersistedState().gold).toBe(1_000);
    });
  });

  describe('animal funnel analytics (#349)', () => {
    const messages = getFarmMessages(DEFAULT_LOCALE);
    const animalEvents = (track: jest.Mock, name: string) =>
      track.mock.calls.filter(([eventName]) => eventName === name);

    async function openAnimalsFromMore(
      state: GameState,
      track: jest.Mock,
      strictMode = false
    ) {
      if (!strictMode) {
        const screen = await renderGame(state, { analytics: createFarmAnalytics(track) });
        fireEvent.press(screen.getByTestId('more-nav-button'));
        fireEvent.press(screen.getByLabelText(messages.productionButtonAccessibilityLabel));
        await waitFor(() => expect(screen.getByTestId('animals-sheet')).toBeTruthy());
        return screen;
      }

      mockPersistence.readPersistedGameState.mockReset().mockResolvedValue({
        ...state,
        onboardingCompleted: true,
        onboardingStep: null,
        dailyBonusState: { lastClaimedAt: NOW, streak: 1 },
      });
      mockPersistence.readPersistedGameSettings.mockReset().mockResolvedValue(null);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const screen = render(
        <React.StrictMode>
          <FarmGame persistence={mockPersistence} analytics={createFarmAnalytics(track)} />
        </React.StrictMode>
      );
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      await waitFor(() => expect(screen.getByTestId('more-nav-button')).toBeTruthy());
      fireEvent.press(screen.getByTestId('more-nav-button'));
      fireEvent.press(screen.getByLabelText(messages.productionButtonAccessibilityLabel));
      await waitFor(() => expect(screen.getByTestId('animals-sheet')).toBeTruthy());
      consoleErrorSpy.mockRestore();
      return screen;
    }

    test('tracks one more-source screen impression across timer rerenders', async () => {
      const track = jest.fn();
      const animal = ANIMALS[0]!;
      const base = createInitialState();
      const state: GameState = {
        ...base,
        animals: {
          owned: [animal.key],
          feeding: { [animal.key]: NOW - animal.produceTimerMs },
        },
      };
      await openAnimalsFromMore(state, track);

      await waitFor(() => expect(animalEvents(track, 'animals_screen')).toHaveLength(1));
      expect(animalEvents(track, 'animals_screen')[0]![1]).toEqual(
        expect.objectContaining({
          source: 'more',
          owned_count: 1,
          feeding_count: 1,
          ready_count: 1,
          schema_version: 1,
        })
      );
      await act(async () => {
        jest.advanceTimersByTime(GAME_TICK_INTERVAL_MS * 4);
      });
      expect(animalEvents(track, 'animals_screen')).toHaveLength(1);
    });

    test('tracks purchase and feed once each on rapid double presses', async () => {
      const track = jest.fn();
      const animal = ANIMALS[0]!;
      const state: GameState = {
        ...createInitialState(),
        gold: animal.purchaseCost + animal.feedCost + 100,
      };
      const screen = await openAnimalsFromMore(state, track);
      const build = screen.getByText(messages.animalsBuildAction(formatMoney(animal.purchaseCost, DEFAULT_LOCALE)));

      await act(async () => {
        fireEvent.press(build);
        fireEvent.press(build);
      });
      await waitFor(() => expect(animalEvents(track, 'animal_purchased')).toHaveLength(1));
      expect(animalEvents(track, 'animal_purchased')[0]![1]).toEqual(
        expect.objectContaining({
          animal: animal.key,
          purchase_cost: animal.purchaseCost,
          owned_count_after: 1,
          schema_version: 1,
        })
      );

      const feed = await waitFor(() =>
        screen.getByText(messages.animalsFeedAction(formatMoney(animal.feedCost, DEFAULT_LOCALE)))
      );
      await act(async () => {
        fireEvent.press(feed);
        fireEvent.press(feed);
      });
      await waitFor(() => expect(animalEvents(track, 'animal_fed')).toHaveLength(1));
      expect(animalEvents(track, 'animal_fed')[0]![1]).toEqual(
        expect.objectContaining({
          animal: animal.key,
          feed_cost: animal.feedCost,
          produce_timer_ms: animal.produceTimerMs,
          owned_count: 1,
          schema_version: 1,
        })
      );
    });

    test('emits one canonical single-collection event under StrictMode and rapid double press', async () => {
      const track = jest.fn();
      const animal = ANIMALS[0]!;
      const base = createInitialState();
      const state: GameState = {
        ...base,
        animals: {
          owned: [animal.key],
          feeding: { [animal.key]: NOW - animal.produceTimerMs - 321 },
        },
      };
      const screen = await openAnimalsFromMore(state, track, true);
      const collect = screen.getByText(
        messages.animalsCollectAction(formatMoney(animal.producePrice, DEFAULT_LOCALE))
      );

      await act(async () => {
        fireEvent.press(collect);
        fireEvent.press(collect);
      });
      await waitFor(() => expect(animalEvents(track, 'animal_produce_collected')).toHaveLength(1));
      expect(animalEvents(track, 'animal_produce_collected')[0]![1]).toEqual(
        expect.objectContaining({
          animal: animal.key,
          collection_mode: 'single',
          base_revenue: animal.producePrice,
          final_revenue: animal.producePrice,
          is_rare: false,
          rare_multiplier: 1,
          ready_wait_ms: 321,
          schema_version: 1,
        })
      );
      expect(animalEvents(track, 'animal_produce_collect_all')).toHaveLength(0);

      // A stale callback after the committed collection is a no-op and must
      // not emit another success event.
      await act(async () => {
        fireEvent.press(collect);
      });
      expect(animalEvents(track, 'animal_produce_collected')).toHaveLength(1);
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
      const track = jest.fn();
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
      const screen = await renderGame(state, { analytics: createFarmAnalytics(track) });

      fireEvent.press(screen.getByTestId('more-nav-button'));
      fireEvent.press(screen.getByLabelText(messages.productionButtonAccessibilityLabel));
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
      const collectionCalls = track.mock.calls.filter(([eventName]) =>
        eventName === 'animal_produce_collected' || eventName === 'animal_produce_collect_all'
      );
      expect(collectionCalls.map(([eventName]) => eventName)).toEqual([
        'animal_produce_collected',
        'animal_produce_collected',
        'animal_produce_collect_all',
      ]);
      expect(collectionCalls.slice(0, 2).map(([, params]) => params)).toEqual(
        ready.map((animal) =>
          expect.objectContaining({
            animal: animal.key,
            collection_mode: 'collect_all',
            base_revenue: animal.producePrice,
            final_revenue: animal.producePrice,
            is_rare: false,
            rare_multiplier: 1,
          })
        )
      );
      expect(collectionCalls[2]![1]).toEqual(
        expect.objectContaining({
          collected_count: 2,
          base_revenue_total: totalGold,
          final_revenue_total: totalGold,
          rare_count: 0,
        })
      );
    });

    test('collects all completed workshop goods once with one English summary', async () => {
      const track = jest.fn();
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
      const screen = await renderGame(state, {
        preferredLocale: 'en-US',
        analytics: createFarmAnalytics(track),
      });

      fireEvent.press(screen.getByTestId('more-nav-button'));
      fireEvent.press(screen.getByLabelText(messages.productionButtonAccessibilityLabel));
      fireEvent.press(screen.getByTestId('production-tab-workshop'));
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
      expect(
        track.mock.calls.filter(([eventName]) => eventName.startsWith('animal_'))
      ).toHaveLength(0);
    });

    test('cancels an in-progress workshop craft once on a rapid double press and refunds inputs', async () => {
      const recipe = PRODUCTION_RECIPES[0]!;
      const base = createInitialState();
      const inventory = { ...base.production.inventory };
      for (const input of recipe.inputs) {
        inventory[input.crop] = (inventory[input.crop] ?? 0) + input.qty + 2;
      }
      const beforeStart: GameState = {
        ...base,
        production: { inventory, crafting: {} },
      };
      const afterStart = startCraft(beforeStart, recipe.key, NOW)!;
      const messages = getFarmMessages('en-US');
      const screen = await renderGame(afterStart, { preferredLocale: 'en-US' });

      fireEvent.press(screen.getByTestId('more-nav-button'));
      fireEvent.press(screen.getByLabelText(messages.productionButtonAccessibilityLabel));
      fireEvent.press(screen.getByTestId('production-tab-workshop'));
      const action = screen.getByTestId(`workshop-cancel-${recipe.key}`);
      await act(async () => {
        fireEvent.press(action);
        fireEvent.press(action);
      });

      await waitFor(() => {
        const persisted = getLatestPersistedState();
        expect(persisted.production.inventory).toEqual(beforeStart.production.inventory);
        expect(persisted.production.crafting[recipe.key]).toBeUndefined();
        expect(persisted.gold).toBe(afterStart.gold);
      });
      expect(
        screen.getByText(messages.workshopCanceledToast(getProductionRecipeLabel(recipe.key, 'en-US').name))
      ).toBeTruthy();
      expect(screen.queryByTestId(`workshop-cancel-${recipe.key}`)).toBeNull();
      expect(within(screen.getByTestId(`recipe-card-${recipe.key}`)).getByText(messages.workshopReadyToCraftLabel)).toBeTruthy();
      expect(onGoldPulse).not.toHaveBeenCalled();
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

    test('earned offline-bonus ad commits exactly one 2x payout, usage, missions, and analytics', async () => {
      const state = withGrowingPlot('wheat' as CropKey, createInitialState());
      mockPersistence.readLastSeenAt.mockResolvedValueOnce(NOW - TWO_HOURS_MS);
      const offlineGold = getActiveFarmOfflineGold(state, TWO_HOURS_MS);
      expect(offlineGold).toBeGreaterThan(0);

      let resolveAd!: (result: RewardedAdShowResult) => void;
      const rewardedAd: RewardedAdController = {
        isAdReady: true,
        isAdSupported: true,
        showAd: jest.fn(
          () =>
            new Promise<RewardedAdShowResult>((resolve) => {
              resolveAd = resolve;
            })
        ),
      };
      const track = jest.fn();
      const screen = await renderGame(state, {
        analytics: createFarmAnalytics(track),
        useRewardedAd: () => rewardedAd,
      });

      const action = await waitFor(() => screen.getByTestId('welcome-back-double-ad-action'));
      const collectLabel = messages.welcomeBackCollectAction(formatMoney(offlineGold, DEFAULT_LOCALE));
      await act(async () => {
        fireEvent.press(action);
        fireEvent.press(action);
        // Every other recap action is inert while the rewarded request owns the snapshot.
        fireEvent.press(screen.getByText(collectLabel));
        await Promise.resolve();
      });
      expect(rewardedAd.showAd).toHaveBeenCalledTimes(1);
      expect(screen.getByText(messages.sheetTitleWelcomeBack)).toBeTruthy();
      expect(screen.getByText(`${formatMoney(state.gold, DEFAULT_LOCALE)}G`)).toBeTruthy();

      // Backdrop/swipe/back all share this close animation. While the SDK owns
      // the snapshot, closing must be vetoed before the sheet animates offscreen.
      const { Animated } = jest.requireActual<typeof import('react-native')>('react-native');
      const timingSpy = jest.spyOn(Animated, 'timing');
      const timingCallCount = timingSpy.mock.calls.length;
      fireEvent.press(screen.getByLabelText(messages.sheetCloseAccessibilityLabel));
      expect(timingSpy).toHaveBeenCalledTimes(timingCallCount);
      expect(screen.getByText(messages.sheetTitleWelcomeBack)).toBeTruthy();
      timingSpy.mockRestore();

      await act(async () => {
        resolveAd({ status: 'earned' });
        await Promise.resolve();
      });

      await waitFor(() =>
        expect(screen.getByText(`${formatMoney(state.gold + offlineGold * 2, DEFAULT_LOCALE)}G`)).toBeTruthy()
      );
      expect(screen.queryByText(messages.sheetTitleWelcomeBack)).toBeNull();
      expect(screen.getByText(messages.welcomeBackDoubleAdToast(formatMoney(offlineGold, DEFAULT_LOCALE)))).toBeTruthy();

      const persisted = getLatestPersistedState();
      expect(persisted.gold).toBe(state.gold + offlineGold * 2);
      expect(persisted.lifetimeStats.totalGoldEarned).toBe(state.lifetimeStats.totalGoldEarned + offlineGold * 2);
      expect(persisted.adUsage.offlineBonusAd).toEqual({ lastUsedAt: NOW, dailyCount: 1 });
      expect(persisted.dailyMissionState).toEqual(
        recordAdWatchProgress(state.dailyMissionState, NOW, state.unlockedAreas)
      );
      expect(persisted.weeklyMissionState).toEqual(
        recordWeeklyAdWatchProgress(state.weeklyMissionState, NOW, state.unlockedAreas)
      );
      expect(
        track.mock.calls.filter(
          ([event, params]) => event === 'ad_reward_impression' && params.placement === 'return_offline_bonus'
        )
      ).toHaveLength(1);
      expect(track).toHaveBeenCalledWith(
        'ad_reward_completed',
        expect.objectContaining({
          ad_type: 'offlineBonusAd',
          placement: 'return_offline_bonus',
          reward_value: offlineGold * 2,
        })
      );
    });

    test.each([
      ['dismissed', { status: 'dismissed' } as RewardedAdShowResult],
      ['failed', { status: 'failed', error: 'network' } as RewardedAdShowResult],
      ['throw', null],
    ])('keeps the guaranteed 1x claim after a %s rewarded-ad outcome', async (kind, result) => {
      const state = withGrowingPlot('wheat' as CropKey, createInitialState());
      mockPersistence.readLastSeenAt.mockResolvedValueOnce(NOW - TWO_HOURS_MS);
      const offlineGold = getActiveFarmOfflineGold(state, TWO_HOURS_MS);
      const rewardedAd =
        kind === 'throw'
          ? createThrowingRewardedAd()
          : createRewardedAd(result ?? { status: 'failed', error: 'missing result' });
      const screen = await renderGame(state, { useRewardedAd: () => rewardedAd });

      fireEvent.press(await waitFor(() => screen.getByTestId('welcome-back-double-ad-action')));
      await waitFor(() => expect(rewardedAd.showAd).toHaveBeenCalledTimes(1));

      // Failure/cancel never consumes the recap or records a rewarded use.
      expect(screen.getByText(messages.sheetTitleWelcomeBack)).toBeTruthy();
      expect(screen.getByText(`${formatMoney(state.gold, DEFAULT_LOCALE)}G`)).toBeTruthy();
      const collectLabel = messages.welcomeBackCollectAction(formatMoney(offlineGold, DEFAULT_LOCALE));
      fireEvent.press(screen.getByText(collectLabel));

      await waitFor(() =>
        expect(screen.getByText(`${formatMoney(state.gold + offlineGold, DEFAULT_LOCALE)}G`)).toBeTruthy()
      );
      expect(getLatestPersistedState().adUsage.offlineBonusAd.dailyCount).toBe(0);
    });

    test('hides the 2x action when rewarded ads are unsupported', async () => {
      const state = withGrowingPlot('wheat' as CropKey, createInitialState());
      mockPersistence.readLastSeenAt.mockResolvedValueOnce(NOW - TWO_HOURS_MS);
      const unsupported = await renderGame(state);
      await waitFor(() => expect(unsupported.getByText(messages.sheetTitleWelcomeBack)).toBeTruthy());
      expect(unsupported.queryByTestId('welcome-back-double-ad-action')).toBeNull();
    });

    test('disables the 2x action while the rewarded ad is not ready', async () => {
      const state = withGrowingPlot('wheat' as CropKey, createInitialState());
      mockPersistence.readLastSeenAt.mockResolvedValueOnce(NOW - TWO_HOURS_MS);
      const notReadyAd: RewardedAdController = {
        isAdReady: false,
        isAdSupported: true,
        showAd: jest.fn(async () => ({ status: 'notReady' as const })),
      };
      const notReady = await renderGame(state, { useRewardedAd: () => notReadyAd });
      const notReadyAction = await waitFor(() => notReady.getByTestId('welcome-back-double-ad-action'));
      expect(notReadyAction.props.accessibilityState.disabled).toBe(true);
      fireEvent.press(notReadyAction);
      expect(notReadyAd.showAd).not.toHaveBeenCalled();
      const persisted = getLatestPersistedState();
      expect(persisted.adUsage.offlineBonusAd).toEqual(state.adUsage.offlineBonusAd);
      expect(persisted.dailyMissionState).toEqual(state.dailyMissionState);
      expect(persisted.weeklyMissionState).toEqual(state.weeklyMissionState);
    });

    test('disables the 2x action when its daily limit is exhausted', async () => {
      const state = withGrowingPlot('wheat' as CropKey, createInitialState());
      mockPersistence.readLastSeenAt.mockResolvedValueOnce(NOW - TWO_HOURS_MS);
      const cappedState: GameState = {
        ...state,
        adUsage: {
          ...state.adUsage,
          offlineBonusAd: { lastUsedAt: NOW - 1, dailyCount: 1 },
        },
      };
      const readyAd = createReadyRewardedAd();
      const capped = await renderGame(cappedState, { useRewardedAd: () => readyAd });
      const cappedAction = await waitFor(() => capped.getByTestId('welcome-back-double-ad-action'));
      expect(cappedAction.props.accessibilityState.disabled).toBe(true);
      fireEvent.press(cappedAction);
      expect(readyAd.showAd).not.toHaveBeenCalled();
      const persisted = getLatestPersistedState();
      expect(persisted.adUsage.offlineBonusAd).toEqual(cappedState.adUsage.offlineBonusAd);
      expect(persisted.dailyMissionState).toEqual(cappedState.dailyMissionState);
      expect(persisted.weeklyMissionState).toEqual(cappedState.weeklyMissionState);
    });

    test('implicit backdrop close settles the guaranteed 1x payout without stacking a return ad', async () => {
      const state = withGrowingPlot('wheat' as CropKey, createInitialState());
      mockPersistence.readLastSeenAt.mockResolvedValueOnce(NOW - TWO_HOURS_MS);
      const offlineGold = getActiveFarmOfflineGold(state, TWO_HOURS_MS);
      const interstitial = {
        isAdReady: true,
        isAdSupported: true,
        showAd: jest.fn(async () => ({ status: 'dismissed' as const })),
      };
      const screen = await renderGame(state, { useInterstitialAd: () => interstitial });

      await waitFor(() => expect(screen.getByText(messages.sheetTitleWelcomeBack)).toBeTruthy());
      fireEvent.press(screen.getByLabelText(messages.sheetCloseAccessibilityLabel));
      await waitFor(() => expect(screen.queryByText(messages.sheetTitleWelcomeBack)).toBeNull());
      await waitFor(() =>
        expect(screen.getByText(`${formatMoney(state.gold + offlineGold, DEFAULT_LOCALE)}G`)).toBeTruthy()
      );
      expect(interstitial.showAd).not.toHaveBeenCalled();
      expect(getLatestPersistedState().adUsage.returnInterstitialAt).toBe(state.adUsage.returnInterstitialAt);
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
      expect(screen.queryByTestId('welcome-back-double-ad-action')).toBeNull();

      fireEvent.press(screen.getByText(messages.welcomeBackConfirmAction));

      // Gold is unchanged: the close path settles nothing.
      expect(screen.getByText(`${formatMoney(state.gold, DEFAULT_LOCALE)}G`)).toBeTruthy();
    });

    test('ready animal row settles offline gold before opening the ranch sheet', async () => {
      const track = jest.fn();
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
      const screen = await renderGame(state, { analytics: createFarmAnalytics(track) });

      const animalRow = await waitFor(() => screen.getByTestId('welcome-back-animal-row'));
      expect(screen.getByText(messages.welcomeBackAnimalLabel)).toBeTruthy();
      expect(screen.getByText(messages.welcomeBackAnimalValue(1))).toBeTruthy();
      expect(screen.queryByTestId('welcome-back-craft-row')).toBeNull();

      fireEvent.press(animalRow);
      fireEvent.press(animalRow);

      await waitFor(() => expect(screen.getByText(messages.sheetTitleProduction)).toBeTruthy());
      await waitFor(() =>
        expect(screen.getByText(`${formatMoney(state.gold + offlineGold, DEFAULT_LOCALE)}G`)).toBeTruthy()
      );
      await waitFor(() =>
        expect(
          track.mock.calls.filter(([eventName, params]) =>
            eventName === 'animals_screen' && params?.source === 'welcome_back'
          )
        ).toHaveLength(1)
      );
      await act(async () => {
        jest.advanceTimersByTime(GAME_TICK_INTERVAL_MS * 2);
      });
      expect(track.mock.calls.filter(([eventName]) => eventName === 'animals_screen')).toHaveLength(1);
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

      await waitFor(() => expect(screen.getByText(englishMessages.sheetTitleProduction)).toBeTruthy());
    });
  });

  describe('first-session onboarding', () => {
    const messages = getFarmMessages(DEFAULT_LOCALE);
    const renderOnboardingGame = (
      savedState: GameState | null,
      props: Partial<React.ComponentProps<typeof FarmGame>> = {}
    ) =>
      // 온보딩 플로우는 신규 저장의 가용한 데일리 보너스가 온보딩 뒤로 유예됐다가
      // 완료 후 자동 수령되는 흐름을 검증하므로, 기본 수령 처리를 끄고 보존한다.
      renderGame(savedState, props, null, { preserveOnboarding: true, preserveDailyBonus: true });
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
      expect(track).not.toHaveBeenCalledWith('daily_bonus_opened', expect.anything());
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
      expect(track).toHaveBeenCalledWith(
        'daily_bonus_opened',
        expect.objectContaining({ source: 'auto_popup' })
      );
      expect(screen.queryByTestId('notification-prompt-card')).toBeNull();
      // #376 자동 수령 후엔 확인 버튼으로 시트를 닫으면 알림 권한 프롬프트가 뒤이어 뜬다.
      fireEvent.press(screen.getByText(messages.dailyBonusConfirmAction));
      await waitFor(() => expect(screen.getByTestId('notification-prompt-card')).toBeTruthy());
    });

    test('keeps four plot columns and compact top spacing through every onboarding step', async () => {
      const screen = await renderOnboardingGame(null);
      const initialGridStyle = StyleSheet.flatten(screen.getByTestId('plot-grid').props.style);
      const initialTileStyle = StyleSheet.flatten(screen.getByTestId('plot-cell-0').props.style);
      const tileSize = initialTileStyle.width;
      if (typeof tileSize !== 'number') {
        throw new Error('plot tile width must resolve to a number');
      }

      const contentStyle = StyleSheet.flatten(screen.getByTestId('farm-scroll').props.contentContainerStyle);
      expect(contentStyle.paddingHorizontal).toBe(MAIN_HORIZONTAL_PADDING);
      expect(contentStyle.paddingTop).toBe(ONBOARDING_MAIN_CONTENT_TOP_PADDING);
      expect(ONBOARDING_MAIN_CONTENT_TOP_PADDING).toBe(16);

      const availableContentWidth = Dimensions.get('window').width - MAIN_HORIZONTAL_PADDING * 2;
      const firstRowWidth = tileSize * PLOT_COLUMNS + PLOT_GAP * (PLOT_COLUMNS - 1);
      expect(firstRowWidth).toBeLessThanOrEqual(availableContentWidth);
      expect(availableContentWidth - firstRowWidth).toBeLessThan(PLOT_COLUMNS);
      expect(initialGridStyle.borderWidth).toBeUndefined();
      expect(initialGridStyle.padding).toBeUndefined();
      expect(screen.queryByTestId('onboarding-plot-highlight')).toBeNull();

      const expectStableGrid = () => {
        expect(StyleSheet.flatten(screen.getByTestId('plot-grid').props.style)).toEqual(initialGridStyle);
        for (let index = 0; index < PLOT_COLUMNS; index += 1) {
          expect(StyleSheet.flatten(screen.getByTestId(`plot-cell-${index}`).props.style).width).toBe(tileSize);
        }
      };
      const expectAbsoluteHighlight = () => {
        const highlight = screen.getByTestId('onboarding-plot-highlight');
        const highlightStyle = StyleSheet.flatten(highlight.props.style);
        const containerStyle = StyleSheet.flatten(screen.getByTestId('plot-grid-container').props.style);
        expect(highlight.props.pointerEvents).toBe('none');
        expect(containerStyle.backgroundColor).toBe('rgba(76, 175, 106, 0.08)');
        expect(highlightStyle.backgroundColor).toBeUndefined();
        expect(highlightStyle).toEqual(
          expect.objectContaining({
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            borderWidth: 2,
          })
        );
      };

      fireEvent.press(screen.getByText('당근'));
      await waitFor(() => expect(screen.getByText(messages.onboardingPlantTitle)).toBeTruthy());
      expectStableGrid();
      expectAbsoluteHighlight();

      fireEvent.press(screen.getByTestId('plot-cell-0'));
      await waitFor(() => expect(screen.getByText(messages.onboardingHarvestTitle)).toBeTruthy());
      expectStableGrid();
      expectAbsoluteHighlight();

      await act(async () => {
        jest.advanceTimersByTime(2500);
      });
      fireEvent.press(await screen.findByText('GET'));
      await waitFor(() => expect(screen.getByText(messages.onboardingRewardTitle)).toBeTruthy());
      expectStableGrid();
      expect(screen.queryByTestId('onboarding-plot-highlight')).toBeNull();
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
      // 이 테스트는 수확 보상 이중 지급만 검증하므로, 온보딩 완료 후 유예 데일리 보너스
      // 자동 수령이 골드를 흔들지 않도록 이미 수령한 상태로 고정한다(#376).
      const rewardSave: GameState = {
        ...createRewardStepState(),
        dailyBonusState: { lastClaimedAt: NOW, streak: 0 },
      };
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

  test('advances all four emoji fallback stages when no host art is provided', async () => {
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

    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await waitFor(() => expect(screen.getByTestId('growing-crop-fallback-budding')).toHaveTextContent('🥕'));

    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    await waitFor(() => expect(screen.getByTestId('growing-crop-fallback-mature')).toHaveTextContent('🥕'));
  });

  test('renders a dedicated host image for every growth stage and retries after each stage change', async () => {
    const stageArt: FarmArt = {
      stageIcon: (stage) => ({ uri: `https://example.com/art/stage_${stage}.png` }),
    };
    const screen = await renderGame(null, { art: stageArt });

    await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
    fireEvent.press(screen.getByText('초보 밭'));
    fireEvent.press(screen.getByText('당근'));
    fireEvent.press(screen.getAllByText('빈 밭')[0]!);

    const expectStageArt = (stage: 'sprout' | 'sapling' | 'budding' | 'mature') => {
      expect(screen.getByTestId(`growing-crop-art-${stage}`).props.source).toEqual({
        uri: `https://example.com/art/stage_${stage}.png`,
      });
    };

    expectStageArt('sprout');
    fireEvent(screen.getByTestId('growing-crop-art-sprout'), 'error');
    expect(screen.getByTestId('growing-crop-fallback-sprout')).toHaveTextContent('🌱');

    await act(async () => {
      jest.advanceTimersByTime(950);
    });
    await waitFor(() => expectStageArt('sapling'));

    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await waitFor(() => expectStageArt('budding'));

    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    await waitFor(() => expectStageArt('mature'));
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
    // 확장 탭(기본): 지역 해금 + 부지 확장.
    expect(screen.getByText('모든 구역 열기 완료')).toBeTruthy();
    expect(screen.getByText('현재 24칸 · 작물을 심을 공간을 1칸 늘려요')).toBeTruthy();
    // 업그레이드 탭: 연구 요약 (#372 탭 분리).
    fireEvent.press(screen.getByTestId('shop-tab-upgrade'));
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
    const track = jest.fn();
    const messages = getFarmMessages(DEFAULT_LOCALE);
    const screen = await renderGame(shopReadyState, { analytics: createFarmAnalytics(track) });

    await waitFor(() => expect(screen.getByText(`${formatMoney(shopReadyState.gold)}G`)).toBeTruthy());

    fireEvent.press(screen.getByText('🏪 상점'));

    fireEvent.press(screen.getByText('밭 개간하기'));
    expect(screen.getByText('현재 7칸 · 작물을 심을 공간을 1칸 늘려요')).toBeTruthy();

    // 연구(속도/수익) 업그레이드는 업그레이드 탭으로 이동(#372).
    fireEvent.press(screen.getByTestId('shop-tab-upgrade'));
    fireEvent.press(screen.getByText('🧪 고속 성장 비료'));
    expect(screen.getByText('현재 연구 Lv.1 · 성장속도 Lv.2 / 수익률 Lv.1')).toBeTruthy();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('upgrade-burst-speed', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText(messages.researchCompletedToast)).toBeTruthy();
    expect(
      screen.getByText(
        `${formatMoney(
          shopReadyState.gold -
            getPlotCost(shopReadyState.unlockedPlotCount) -
            getUpgradeCost('speed', shopReadyState.upgrades.speed)
        )}G`
      )
    ).toBeTruthy();
    expect(track.mock.calls.filter(([eventName]) => eventName === 'upgrade_purchased')).toEqual([
      [
        'upgrade_purchased',
        expect.objectContaining({
          upgrade_kind: 'speed',
          cost: getUpgradeCost('speed', shopReadyState.upgrades.speed),
          next_level: 2,
        }),
      ],
    ]);
    expect(UPGRADE_BURST_DURATION_MS).toBeLessThan(MASTERY_RANK_UP_CELEBRATION_DURATION_MS);

    await act(async () => {
      jest.advanceTimersByTime(UPGRADE_BURST_DURATION_MS);
    });
    expect(screen.queryByTestId('upgrade-burst-speed', { includeHiddenElements: true })).toBeNull();

    fireEvent.press(screen.getByText('🚛 판로 개척'));
    expect(screen.getByText('현재 연구 Lv.2 · 성장속도 Lv.2 / 수익률 Lv.2')).toBeTruthy();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('upgrade-burst-profit', { includeHiddenElements: true })).toBeTruthy();
    expect(track.mock.calls.filter(([eventName]) => eventName === 'upgrade_purchased')).toHaveLength(2);

    // 지역 해금은 확장 탭으로 돌아가서(#372).
    fireEvent.press(screen.getByTestId('shop-tab-expand'));
    fireEvent.press(screen.getByText('채소 밭 열기'));
    expect(screen.queryByText('채소 밭 열기')).toBeNull();
  });

  test('guards a same-frame rapid upgrade press from duplicate charges and analytics', async () => {
    const shopReadyState = createShopReadyState();
    const track = jest.fn();
    const screen = await renderGame(shopReadyState, { analytics: createFarmAnalytics(track) });

    await waitFor(() => expect(screen.getByText(`${formatMoney(shopReadyState.gold)}G`)).toBeTruthy());
    fireEvent.press(screen.getByText('🏪 상점'));
    fireEvent.press(screen.getByTestId('shop-tab-upgrade'));

    const speedUpgrade = screen.getByText('🧪 고속 성장 비료');
    act(() => {
      fireEvent.press(speedUpgrade);
      fireEvent.press(speedUpgrade);
    });

    expect(screen.getByText('현재 연구 Lv.1 · 성장속도 Lv.2 / 수익률 Lv.1')).toBeTruthy();
    expect(
      screen.getByText(
        `${formatMoney(shopReadyState.gold - getUpgradeCost('speed', shopReadyState.upgrades.speed))}G`
      )
    ).toBeTruthy();
    expect(track.mock.calls.filter(([eventName]) => eventName === 'upgrade_purchased')).toEqual([
      [
        'upgrade_purchased',
        expect.objectContaining({
          upgrade_kind: 'speed',
          cost: getUpgradeCost('speed', shopReadyState.upgrades.speed),
          next_level: 2,
        }),
      ],
    ]);
  });

  test('uses the next-level cost for another purchase while the previous burst is still visible', async () => {
    const shopReadyState = createShopReadyState();
    const firstCost = getUpgradeCost('speed', shopReadyState.upgrades.speed);
    const secondCost = getUpgradeCost('speed', shopReadyState.upgrades.speed + 1);
    const track = jest.fn();
    const screen = await renderGame(shopReadyState, { analytics: createFarmAnalytics(track) });

    await waitFor(() => expect(screen.getByText(`${formatMoney(shopReadyState.gold)}G`)).toBeTruthy());
    fireEvent.press(screen.getByText('🏪 상점'));
    fireEvent.press(screen.getByTestId('shop-tab-upgrade'));
    fireEvent.press(screen.getByText('🧪 고속 성장 비료'));
    await waitFor(() =>
      expect(screen.getByText('현재 연구 Lv.1 · 성장속도 Lv.2 / 수익률 Lv.1')).toBeTruthy()
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('upgrade-burst-speed', { includeHiddenElements: true })).toBeTruthy();

    fireEvent.press(screen.getByText('🧪 고속 성장 비료'));
    await waitFor(() =>
      expect(screen.getByText('현재 연구 Lv.1 · 성장속도 Lv.3 / 수익률 Lv.1')).toBeTruthy()
    );
    expect(screen.getByText(`${formatMoney(shopReadyState.gold - firstCost - secondCost)}G`)).toBeTruthy();
    expect(
      track.mock.calls
        .filter(([eventName]) => eventName === 'upgrade_purchased')
        .map(([, params]) => params?.cost)
    ).toEqual([firstCost, secondCost]);
  });

  test('keeps the purchase burst fully visible when the next upgrade becomes unaffordable', async () => {
    const shopReadyState = createShopReadyState();
    const speedCost = getUpgradeCost('speed', shopReadyState.upgrades.speed);
    const screen = await renderGame({ ...shopReadyState, gold: speedCost });

    await waitFor(() => expect(screen.getByText(`${formatMoney(speedCost)}G`)).toBeTruthy());
    fireEvent.press(screen.getByText('🏪 상점'));
    fireEvent.press(screen.getByTestId('shop-tab-upgrade'));
    fireEvent.press(screen.getByText('🧪 고속 성장 비료'));

    await act(async () => {
      await Promise.resolve();
    });
    const burst = screen.getByTestId('upgrade-burst-speed', { includeHiddenElements: true });
    expect(StyleSheet.flatten(burst.parent?.props.style).opacity).toBeUndefined();
    expect(screen.getByText('0G')).toBeTruthy();
  });

  test('cleans up an active purchase burst when the shop closes early', async () => {
    const shopReadyState = createShopReadyState();
    const messages = getFarmMessages(DEFAULT_LOCALE);
    const screen = await renderGame(shopReadyState);

    await waitFor(() => expect(screen.getByText(`${formatMoney(shopReadyState.gold)}G`)).toBeTruthy());
    fireEvent.press(screen.getByText('🏪 상점'));
    fireEvent.press(screen.getByTestId('shop-tab-upgrade'));
    fireEvent.press(screen.getByText('🧪 고속 성장 비료'));
    expect(screen.getByTestId('upgrade-burst-speed', { includeHiddenElements: true })).toBeTruthy();

    fireEvent.press(screen.getByLabelText(messages.sheetCloseAccessibilityLabel));
    await act(async () => {
      jest.advanceTimersByTime(180);
    });
    expect(screen.queryByTestId('upgrade-burst-speed', { includeHiddenElements: true })).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(UPGRADE_BURST_DURATION_MS);
    });
    expect(screen.queryByTestId('upgrade-burst-speed', { includeHiddenElements: true })).toBeNull();
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

  describe('상점 시트 탭 정리 (#372)', () => {
    test('상점 진입 시 확장 탭이 기본이고 다른 탭 섹션은 렌더되지 않는다', async () => {
      const screen = await renderGame(createShopReadyState());
      await waitFor(() => expect(screen.getByTestId('shop-nav-button')).toBeTruthy());
      fireEvent.press(screen.getByTestId('shop-nav-button'));

      // 확장 탭(기본): 영토 확장 + 새 구역 열기.
      expect(screen.getByText('영토 확장')).toBeTruthy();
      expect(screen.getByText('새 구역 열기')).toBeTruthy();
      // 다른 탭의 섹션은 렌더 트리에 없다.
      expect(screen.queryByText('농업 연구소')).toBeNull();
      expect(screen.queryByText('농장 꾸미기')).toBeNull();
    });

    test('각 탭으로 전환하면 해당 섹션만 렌더되고 모든 섹션에 회귀 없이 접근된다', async () => {
      const screen = await renderGame(createShopReadyState(), { useRewardedAd: () => createReadyRewardedAd() });
      await waitFor(() => expect(screen.getByTestId('shop-nav-button')).toBeTruthy());
      fireEvent.press(screen.getByTestId('shop-nav-button'));

      fireEvent.press(screen.getByTestId('shop-tab-upgrade'));
      expect(screen.getByText('농업 연구소')).toBeTruthy();
      expect(screen.queryByText('영토 확장')).toBeNull();

      fireEvent.press(screen.getByTestId('shop-tab-decorate'));
      expect(screen.getByText('농장 꾸미기')).toBeTruthy();
      expect(screen.queryByText('농업 연구소')).toBeNull();

      fireEvent.press(screen.getByTestId('shop-tab-rewards'));
      expect(screen.getByText('광고 보상')).toBeTruthy();
      expect(screen.queryByText('농장 꾸미기')).toBeNull();

      fireEvent.press(screen.getByTestId('shop-tab-expand'));
      expect(screen.getByText('영토 확장')).toBeTruthy();
      expect(screen.queryByText('광고 보상')).toBeNull();
    });

    test('광고 미지원 환경에서는 보상 탭을 노출하지 않고 나머지 3개 탭만 보인다', async () => {
      // 기본 useRewardedAd는 미지원(isAdSupported: false).
      const screen = await renderGame(createShopReadyState());
      await waitFor(() => expect(screen.getByTestId('shop-nav-button')).toBeTruthy());
      fireEvent.press(screen.getByTestId('shop-nav-button'));

      expect(screen.queryByTestId('shop-tab-rewards')).toBeNull();
      expect(screen.getByTestId('shop-tab-expand')).toBeTruthy();
      expect(screen.getByTestId('shop-tab-upgrade')).toBeTruthy();
      expect(screen.getByTestId('shop-tab-decorate')).toBeTruthy();
    });

    test('보상이 준비되면 보상 탭 버튼에 수령 가능 배지가 보존된다', async () => {
      const screen = await renderGame(null, { useRewardedAd: () => createReadyRewardedAd() });
      await waitFor(() => expect(screen.getByTestId('shop-nav-button')).toBeTruthy());
      fireEvent.press(screen.getByTestId('shop-nav-button'));

      expect(within(screen.getByTestId('shop-tab-rewards')).getByText('1')).toBeTruthy();
    });

    test('탭 바는 상점 시트 내부에만 있고 상시 navRow/HUD에 신규 진입점을 더하지 않는다', async () => {
      const screen = await renderGame(createShopReadyState());
      await waitFor(() => expect(screen.getByTestId('shop-nav-button')).toBeTruthy());

      // 시트를 열기 전에는 탭 바가 렌더 트리에 없다 → 상시 HUD/navRow가 아닌
      // 상점 시트 내부(한 뎁스 뒤)에 거주함을 보인다.
      expect(screen.queryByTestId('shop-tab-bar')).toBeNull();
      // 상시 navRow 진입점은 여전히 상점·더보기만(신규 상시 진입점 추가 없음).
      expect(screen.getByTestId('shop-nav-button')).toBeTruthy();
      expect(screen.getByTestId('more-nav-button')).toBeTruthy();

      // 상점 시트를 열어야 비로소 탭 바가 등장한다.
      fireEvent.press(screen.getByTestId('shop-nav-button'));
      expect(screen.getByTestId('shop-tab-bar')).toBeTruthy();
    });

    test('꾸미기 모드에서 고정 슬롯 배치·이동·회수 상태를 저장하고 플롯 히트 영역을 덮지 않는다 (#370)', async () => {
      const first = DECORATIONS[0]!;
      const second = DECORATIONS[1]!;
      const base = createInitialState();
      const state: GameState = {
        ...base,
        onboardingCompleted: true,
        dailyBonusState: { lastClaimedAt: NOW, streak: 1 },
        placedDecorations: [
          { key: first.key, slot: 0 },
          { key: second.key, slot: null },
        ],
      };
      const messages = getFarmMessages(DEFAULT_LOCALE);
      const screen = await renderGame(state);

      await waitFor(() =>
        expect(getLatestPersistedState().placedDecorations).toEqual([
          { key: first.key, slot: 0 },
          { key: second.key, slot: null },
        ])
      );
      const hiddenQuery = { includeHiddenElements: true };
      const farmGrid = screen.getByTestId('farm-decoration-grid', hiddenQuery);
      expect(within(screen.getByTestId('farm-scroll')).getByTestId('farm-decoration-grid', hiddenQuery)).toBeTruthy();
      expect(
        within(screen.getByTestId('plot-grid-container')).queryByTestId('farm-decoration-grid', hiddenQuery)
      ).toBeNull();
      expect(farmGrid.props.pointerEvents).toBe('none');
      expect(
        within(screen.getByTestId('farm-decoration-slot-0', hiddenQuery)).getByText(first.icon, hiddenQuery)
      ).toBeTruthy();

      fireEvent.press(screen.getByTestId('shop-nav-button'));
      fireEvent.press(screen.getByTestId('shop-tab-decorate'));
      fireEvent.press(screen.getByTestId('decoration-layout-open-action'));
      expect(screen.getByText(messages.sheetTitleDecorationLayout)).toBeTruthy();

      fireEvent.press(screen.getByTestId(`decoration-inventory-${second.key}`));
      fireEvent.press(screen.getByTestId('decoration-slot-1'));
      await waitFor(() =>
        expect(getLatestPersistedState().placedDecorations).toEqual([
          { key: first.key, slot: 0 },
          { key: second.key, slot: 1 },
        ])
      );

      fireEvent.press(screen.getByTestId('decoration-slot-0'));
      fireEvent.press(screen.getByTestId('decoration-store-action'));
      await waitFor(() =>
        expect(getLatestPersistedState().placedDecorations).toEqual([
          { key: first.key, slot: null },
          { key: second.key, slot: 1 },
        ])
      );

      fireEvent.press(screen.getByLabelText(messages.sheetCloseAccessibilityLabel));
      await waitFor(() => expect(screen.queryByText(messages.sheetTitleDecorationLayout)).toBeNull());
      expect(
        within(screen.getByTestId('farm-decoration-slot-0', hiddenQuery)).queryByText(first.icon, hiddenQuery)
      ).toBeNull();
      expect(
        within(screen.getByTestId('farm-decoration-slot-1', hiddenQuery)).getByText(second.icon, hiddenQuery)
      ).toBeTruthy();
    });
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
    // 광고 보상은 보상 탭으로 이동(#372).
    fireEvent.press(screen.getByTestId('shop-tab-rewards'));

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

    fireEvent.press(screen.getByTestId('shop-tab-rewards'));
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

    fireEvent.press(screen.getByTestId('shop-tab-rewards'));
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

    fireEvent.press(screen.getByTestId('shop-tab-rewards'));
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
    fireEvent.press(screen.getByTestId('shop-tab-rewards'));
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

  test('재시도로 첫 show 실패 후 두 번째에서 보상을 지급한다 (#374 AC3)', async () => {
    const rewardedAd = createSequencedRewardedAd([{ status: 'failed', error: 'no_fill' }, { status: 'earned' }]);
    const track = jest.fn();
    const screen = await renderGame(null, {
      analytics: createFarmAnalytics(track),
      useRewardedAd: () => rewardedAd,
    });

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    fireEvent.press(screen.getByText('🏪 상점'));
    fireEvent.press(screen.getByTestId('shop-tab-rewards'));
    fireEvent.press(screen.getByText('받기'));

    // 실패 → reloadAd → 재시도(성공)로 showAd가 정확히 2회 호출된다(무한 재시도 금지).
    await waitFor(() => expect(rewardedAd.showAd).toHaveBeenCalledTimes(2));
    expect(rewardedAd.reloadAd).toHaveBeenCalledTimes(1);

    expect(track).toHaveBeenCalledWith('ad_reward_completed', expect.objectContaining({ ad_type: 'rewardedGold' }));
    expect(track).not.toHaveBeenCalledWith('ad_reward_failed', expect.anything());
  }, 30_000);

  test('재시도 후에도 실패하면 구체 에러 reason을 1회만 기록한다 (#374 AC3·AC4)', async () => {
    const rewardedAd = createSequencedRewardedAd([
      { status: 'failed', error: 'no_fill' },
      { status: 'failed', error: 'no_fill' },
    ]);
    const track = jest.fn();
    const screen = await renderGame(null, {
      analytics: createFarmAnalytics(track),
      useRewardedAd: () => rewardedAd,
    });

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    fireEvent.press(screen.getByText('🏪 상점'));
    fireEvent.press(screen.getByTestId('shop-tab-rewards'));
    fireEvent.press(screen.getByText('받기'));

    await waitFor(() => expect(rewardedAd.showAd).toHaveBeenCalledTimes(2));
    expect(rewardedAd.reloadAd).toHaveBeenCalledTimes(1);

    const failedCalls = track.mock.calls.filter(([event]) => event === 'ad_reward_failed');
    expect(failedCalls).toHaveLength(1);
    expect(failedCalls[0][1]).toEqual(expect.objectContaining({ ad_type: 'rewardedGold', reason: 'no_fill' }));
  }, 30_000);

  test('미로드 상태로 CTA를 게이트하고 시트 오픈 시 프리로드를 킥한다 (#374 AC1·AC2)', async () => {
    const rewardedAd: RewardedAdController = {
      isAdReady: false,
      isAdSupported: true,
      reloadAd: jest.fn(),
      showAd: jest.fn(async (): Promise<RewardedAdShowResult> => ({ status: 'notReady' })),
    };
    const screen = await renderGame(null, { useRewardedAd: () => rewardedAd });

    await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());

    fireEvent.press(screen.getByText('🏪 상점'));

    // 광고 CTA 시트(상점) 오픈 시 미로드면 재로드를 킥한다(AC2).
    await waitFor(() => expect(rewardedAd.reloadAd).toHaveBeenCalled());

    // 미로드 상태에서는 보상 CTA(골드·개간 할인)가 모두 대기 문구로 게이트되고
    // show가 호출되지 않는다(AC1).
    fireEvent.press(screen.getByTestId('shop-tab-rewards'));
    expect(screen.getAllByText('대기').length).toBeGreaterThanOrEqual(2);
    expect(rewardedAd.showAd).not.toHaveBeenCalled();
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

  describe('crop-ready analytics batching', () => {
    test('flushes one summary per crop bucket after the rolling window', async () => {
      const track = jest.fn();
      await renderGame(createCropReadyBatchState(), { analytics: createFarmAnalytics(track) });

      await act(async () => {
        jest.advanceTimersByTime(4_250);
      });
      expect(track).not.toHaveBeenCalledWith('crop_ready', expect.anything());
      expect(track).not.toHaveBeenCalledWith('crop_ready_summary', expect.anything());

      await act(async () => {
        jest.advanceTimersByTime(CROP_READY_SUMMARY_INTERVAL_MS);
      });

      const summaries = track.mock.calls.filter(([name]) => name === 'crop_ready_summary');
      expect(summaries).toHaveLength(2);
      expect(summaries).toContainEqual([
        'crop_ready_summary',
        expect.objectContaining({
          crop: 'carrot',
          area: 'starter_field',
          crop_tier: 1,
          ready_count: 2,
          window_seconds: 60,
          schema_version: 1,
        }),
      ]);
      expect(summaries).toContainEqual([
        'crop_ready_summary',
        expect.objectContaining({
          crop: 'wheat',
          area: 'starter_field',
          crop_tier: 1,
          ready_count: 1,
          window_seconds: 60,
          schema_version: 1,
        }),
      ]);

      await act(async () => {
        jest.advanceTimersByTime(CROP_READY_SUMMARY_INTERVAL_MS);
      });
      expect(track.mock.calls.filter(([name]) => name === 'crop_ready_summary')).toHaveLength(2);
    });

    test('flushes a partial window exactly once on unmount', async () => {
      const track = jest.fn();
      const screen = await renderGame(createCropReadyBatchState(), { analytics: createFarmAnalytics(track) });

      await act(async () => {
        jest.advanceTimersByTime(4_250);
      });
      expect(track).not.toHaveBeenCalledWith('crop_ready_summary', expect.anything());

      await act(async () => {
        screen.unmount();
      });
      const summaries = track.mock.calls.filter(([name]) => name === 'crop_ready_summary');
      expect(summaries).toHaveLength(2);
      expect(summaries.every(([, params]) => params.window_seconds >= 1 && params.window_seconds < 60)).toBe(true);
    });

    test('flushes pending buckets with the old context before cloud restore', async () => {
      const track = jest.fn();
      const restoreFromCloud = jest.fn(async () => ({
        status: 'restored' as const,
        clientRevision: 2,
        gameState: createInitialState(),
      }));
      const screen = await renderGame(
        { ...createCropReadyBatchState(), gold: 777 },
        {
          analytics: createFarmAnalytics(track),
          cloudSave: {
            isSupported: true,
            backupNow: jest.fn(async () => ({ status: 'backed_up' as const, clientRevision: 1 })),
            restoreFromCloud,
          },
        }
      );

      await act(async () => {
        jest.advanceTimersByTime(4_250);
      });
      fireEvent.press(screen.getByLabelText(getFarmMessages().settingsAccessibilityLabel));
      fireEvent.press(screen.getByText(getFarmMessages().cloudRestoreAction));

      await waitFor(() => expect(restoreFromCloud).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(track.mock.calls.filter(([name]) => name === 'crop_ready_summary')).toHaveLength(2)
      );
      const summaries = track.mock.calls.filter(([name]) => name === 'crop_ready_summary');
      expect(summaries.every(([, params]) => params.gold === 777)).toBe(true);

      await act(async () => {
        jest.advanceTimersByTime(CROP_READY_SUMMARY_INTERVAL_MS);
      });
      expect(track.mock.calls.filter(([name]) => name === 'crop_ready_summary')).toHaveLength(2);
    });
  });

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

  describe('crop_harvested source and payout integrity (#396)', () => {
    function cropHarvestEvents(track: jest.Mock) {
      return track.mock.calls
        .filter(([name]) => name === 'crop_harvested')
        .map(([, params]) => params as Record<string, unknown>);
    }

    test('수동 정상 수확은 실제 골드 지급액을 manual revenue로 기록한다', async () => {
      const track = jest.fn();
      const screen = await renderGame(createReadyHarvestState(), { analytics: createFarmAnalytics(track) });

      fireEvent.press(within(screen.getByTestId('plot-cell-0')).getByText('GET'));

      await waitFor(() => expect(cropHarvestEvents(track)).toHaveLength(1));
      await waitFor(() => expect(screen.getByText(`${50 + CROPS.carrot!.sell}G`)).toBeTruthy());
      expect(cropHarvestEvents(track)).toEqual([
        expect.objectContaining({
          harvest_source: 'manual',
          reward_type: 'gold',
          revenue: CROPS.carrot!.sell,
          research_points_gained: 0,
          schema_version: 2,
        }),
      ]);
    });

    test('수동 기부 수확의 의도된 revenue=0은 RP 보상으로 명시 구분한다', async () => {
      const base = createReadyHarvestState();
      const state: GameState = {
        ...base,
        automationSettings: { ...base.automationSettings, donationModeEnabled: true },
      };
      const track = jest.fn();
      const screen = await renderGame(state, { analytics: createFarmAnalytics(track) });

      fireEvent.press(within(screen.getByTestId('plot-cell-0')).getByText('GET'));

      await waitFor(() => expect(cropHarvestEvents(track)).toHaveLength(1));
      expect(screen.getByText('50G')).toBeTruthy();
      expect(cropHarvestEvents(track)).toEqual([
        expect.objectContaining({
          harvest_source: 'manual',
          reward_type: 'research_points',
          revenue: 0,
          research_points_gained: expect.any(Number),
          schema_version: 2,
        }),
      ]);
      expect(Number(cropHarvestEvents(track)[0]!.research_points_gained)).toBeGreaterThan(0);
    });

    test('일괄 수확의 per-crop revenue 합계가 실제 batch 골드 지급액과 일치한다', async () => {
      const track = jest.fn();
      const screen = await renderGame(createReadyHarvestState(), { analytics: createFarmAnalytics(track) });

      fireEvent.press(screen.getByLabelText('🧺 모두 수확 2'));

      await waitFor(() => expect(cropHarvestEvents(track)).toHaveLength(2));
      await waitFor(() => expect(screen.getByText(`${50 + CROPS.carrot!.sell * 2}G`)).toBeTruthy());
      const events = cropHarvestEvents(track);
      expect(events).toEqual([
        expect.objectContaining({ harvest_source: 'batch', reward_type: 'gold' }),
        expect.objectContaining({ harvest_source: 'batch', reward_type: 'gold' }),
      ]);
      expect(events.reduce((total, event) => total + Number(event.revenue), 0)).toBe(CROPS.carrot!.sell * 2);
    });

    test('자동 수확의 per-crop revenue 합계가 실제 auto 골드 지급액과 일치한다', async () => {
      const base = createReadyHarvestState();
      const state: GameState = {
        ...base,
        research: { ...base.research, unlockedNodes: ['auto_harvest'] },
        automationSettings: { autoHarvestEnabled: true, autoReplantEnabled: false, donationModeEnabled: false },
      };
      const track = jest.fn();
      const screen = await renderGame(state, { analytics: createFarmAnalytics(track) });

      await act(async () => {
        jest.advanceTimersByTime(GAME_TICK_INTERVAL_MS + 50);
      });

      await waitFor(() => expect(cropHarvestEvents(track)).toHaveLength(2));
      await waitFor(() => expect(screen.getByText(`${50 + CROPS.carrot!.sell * 2}G`)).toBeTruthy());
      const events = cropHarvestEvents(track);
      expect(events).toEqual([
        expect.objectContaining({ harvest_source: 'auto', reward_type: 'gold' }),
        expect.objectContaining({ harvest_source: 'auto', reward_type: 'gold' }),
      ]);
      expect(events.reduce((total, event) => total + Number(event.revenue), 0)).toBe(CROPS.carrot!.sell * 2);
    });
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

  test('Harvest All flashes only the rarest mutation from a mixed batch', async () => {
    const base = createReadyHarvestState();
    const state: GameState = {
      ...base,
      onboardingCompleted: true,
      harvestCounts: { carrot: getMasteryThresholds('carrot')[3]! },
    };
    const onMutationFlash = jest.fn();
    __setMutationFlashTestHook(onMutationFlash);
    const screen = await renderGame(state);
    await waitFor(() => expect(screen.getByText('🧺 모두 수확 2')).toBeTruthy());

    // At prism rank 0.001 resolves to giant, while 0 resolves to prism.
    const randomSpy = jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0.001)
      .mockReturnValueOnce(0);
    try {
      fireEvent.press(screen.getByLabelText('🧺 모두 수확 2'));
    } finally {
      randomSpy.mockRestore();
    }

    await waitFor(() => expect(onMutationFlash).toHaveBeenCalledWith('prism'));
    expect(onMutationFlash).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('harvest-pop-giant')).toBeTruthy();
    expect(screen.getByTestId('harvest-pop-prism')).toBeTruthy();
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

  test('기존 ★ 칩은 접근 가능한 button이며 탭하면 기존 ChainMapSheet를 연다 (#379)', async () => {
    const messages = getFarmMessages(DEFAULT_LOCALE);
    const base = createInitialState();
    const state: GameState = {
      ...base,
      onboardingCompleted: true,
      prestige: { ...base.prestige, stars: 2 },
    };
    const screen = await renderGame(state);

    const starsChip = await waitFor(() => screen.getByTestId('prestige-stars-chip'));
    expect(starsChip.props.accessibilityRole).toBe('button');
    expect(starsChip.props.accessibilityLabel).toBe(
      messages.prestigeStarsChipAccessibilityLabel(2, 3)
    );

    fireEvent.press(starsChip);

    expect(screen.getByText(messages.sheetTitleMap)).toBeTruthy();
    expect(screen.getByText(messages.skillsSection)).toBeTruthy();
  });

  test('온보딩 중 명성 미해금 상태에서도 ★ 칩은 빈 ChainMapSheet를 안전하게 연다 (#379)', async () => {
    const messages = getFarmMessages(DEFAULT_LOCALE);
    const screen = await renderGame(createInitialState(), {}, null, { preserveOnboarding: true });
    const starsChip = await waitFor(() => screen.getByTestId('prestige-stars-chip'));

    fireEvent.press(starsChip);

    expect(screen.getByText(messages.sheetTitleMap)).toBeTruthy();
    expect(screen.getByText(messages.chainEmptyDesc)).toBeTruthy();
    expect(screen.getByText(messages.skillsSection)).toBeTruthy();
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

  test('keeps the harvest burst and gold pulse when sound and haptics are disabled (#368)', async () => {
    const playHarvest = jest.fn();
    const onGoldPulse = jest.fn();
    const vibrateSpy = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
    __setGoldPulseTestHook(onGoldPulse);
    try {
      const screen = await renderGame(
        createReadyHarvestState(),
        {
          audio: {
            isSupported: true,
            playHarvest,
            playComboMilestone: jest.fn(),
            playEffect: jest.fn(),
            setBackgroundMusicEnabled: jest.fn(),
          },
        },
        { soundEffectsEnabled: false, hapticsEnabled: false }
      );
      await waitFor(() => expect(screen.getByText('50G')).toBeTruthy());
      vibrateSpy.mockClear();

      fireEvent.press(within(screen.getByTestId('plot-cell-0')).getByText('GET'));

      await waitFor(() => {
        expect(screen.UNSAFE_getByProps({ testID: 'harvest-burst-1' })).toBeTruthy();
        expect(onGoldPulse).toHaveBeenCalledTimes(1);
      });
      expect(playHarvest).not.toHaveBeenCalled();
      expect(vibrateSpy).not.toHaveBeenCalled();
    } finally {
      __setGoldPulseTestHook(undefined);
      vibrateSpy.mockRestore();
    }
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
    const claimMessages = getFarmMessages();

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

    function createAchievementBatchClaimableState(): GameState {
      const base = createInitialState();
      const harvestTrack = getHarvestTrack();
      const prestigeTrack = ACHIEVEMENT_TRACKS.find((track) => track.key === 'prestige_pioneer');
      if (prestigeTrack == null) throw new Error('prestige_pioneer achievement track must exist');
      return {
        ...base,
        lifetimeStats: {
          ...base.lifetimeStats,
          totalHarvests: getAchievementThreshold(harvestTrack, 3),
          prestigeCount: getAchievementThreshold(prestigeTrack, 2),
        },
        prestige: { ...base.prestige, stars: 4, totalStarsEarned: 7 },
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

    test('claims every available achievement tier once on rapid batch and cross presses', async () => {
      const state = createAchievementBatchClaimableState();
      const expected = claimAllAchievements(state);
      const track = jest.fn();
      const playEffect = jest.fn();
      const screen = await renderGame(
        state,
        {
          analytics: createFarmAnalytics(track),
          audio: {
            isSupported: true,
            playHarvest: jest.fn(),
            playComboMilestone: jest.fn(),
            playEffect,
            setBackgroundMusicEnabled: jest.fn(),
          },
        },
        { soundEffectsEnabled: true },
      );

      fireEvent.press(screen.getByLabelText(claimMessages.moreButtonAccessibilityLabel));
      fireEvent.press(screen.getByLabelText(claimMessages.achievementsButtonAccessibilityLabel));
      const claimAllAction = await waitFor(() => screen.getByTestId('achievement-claim-all-action'));
      expect(claimAllAction.props.accessibilityLabel).toBe(
        claimMessages.achievementClaimAllAction(expected.totalStars),
      );
      vibrateSpy.mockClear();

      await act(async () => {
        fireEvent.press(claimAllAction);
        fireEvent.press(claimAllAction);
        fireEvent.press(screen.getByTestId(`achievement-claim-${getHarvestTrack().key}`));
      });

      await waitFor(() => {
        const persisted = getLatestPersistedState();
        expect(persisted.claimedAchievements).toEqual(expected.state.claimedAchievements);
        expect(persisted.prestige.stars).toBe(expected.state.prestige.stars);
        expect(persisted.prestige.totalStarsEarned).toBe(expected.state.prestige.totalStarsEarned);
      });
      expect(screen.getByText(claimMessages.achievementClaimedAllToast(expected.totalStars))).toBeTruthy();
      await waitFor(() => expect(playEffect).toHaveBeenCalledTimes(1));
      expect(playEffect).toHaveBeenCalledWith('reward');
      expect(vibrateSpy).toHaveBeenCalledTimes(1);
      expect(vibrateSpy).toHaveBeenCalledWith(50);
      await waitFor(() =>
        expect(screen.getByTestId('achievement-claim-all-action').props.accessibilityState.disabled).toBe(true),
      );

      const achievementEvents = track.mock.calls.filter(([event]) => event === 'achievement_claimed');
      expect(
        achievementEvents.map(([, params]) => ({
          trackKey: params?.track_key,
          tier: params?.tier,
          starsAwarded: params?.stars_awarded,
        })),
      ).toEqual(expected.claims);
    });

    test('an individual claim wins an individual-to-batch cross press without duplicate effects', async () => {
      const state = createAchievementBatchClaimableState();
      const track = jest.fn();
      const playEffect = jest.fn();
      const harvestTrack = getHarvestTrack();
      const screen = await renderGame(
        state,
        {
          analytics: createFarmAnalytics(track),
          audio: {
            isSupported: true,
            playHarvest: jest.fn(),
            playComboMilestone: jest.fn(),
            playEffect,
            setBackgroundMusicEnabled: jest.fn(),
          },
        },
        { soundEffectsEnabled: true },
      );

      fireEvent.press(screen.getByLabelText(claimMessages.moreButtonAccessibilityLabel));
      fireEvent.press(screen.getByLabelText(claimMessages.achievementsButtonAccessibilityLabel));
      const claimOneAction = await waitFor(() => screen.getByTestId(`achievement-claim-${harvestTrack.key}`));
      const claimAllAction = screen.getByTestId('achievement-claim-all-action');
      vibrateSpy.mockClear();

      await act(async () => {
        fireEvent.press(claimOneAction);
        fireEvent.press(claimAllAction);
      });

      await waitFor(() => {
        const persisted = getLatestPersistedState();
        expect(persisted.claimedAchievements).toEqual([`${harvestTrack.key}:1`]);
        expect(persisted.prestige.stars).toBe(state.prestige.stars + harvestTrack.starsPerTier);
      });
      expect(screen.getByText(claimMessages.achievementClaimedToast(harvestTrack.starsPerTier))).toBeTruthy();
      expect(track.mock.calls.filter(([event]) => event === 'achievement_claimed')).toHaveLength(1);
      expect(playEffect).toHaveBeenCalledTimes(1);
      expect(vibrateSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('achievement-claim-all-action').props.accessibilityState.disabled).toBe(false);
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

    test('무료 스핀 후 광고 earned에서만 보너스 스핀을 1회 지급하고 placement를 계측한다 (#298)', async () => {
      const base = createInitialState();
      const state: GameState = {
        ...base,
        onboardingCompleted: true,
        dailyBonusState: { lastClaimedAt: NOW, streak: 1 },
        wheelState: { ...base.wheelState, lastFreeSpinAt: NOW },
      };
      const track = jest.fn();
      const rewardedAd = createReadyRewardedAd();
      const screen = await renderGame(state, {
        analytics: createFarmAnalytics(track),
        useRewardedAd: () => rewardedAd,
      });
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      fireEvent.press(screen.getByTestId('more-nav-button'));
      fireEvent.press(screen.getByLabelText(messages.wheelButtonAccessibilityLabel));
      await waitFor(() => expect(screen.getByText(messages.wheelBonusSpinAction)).toBeTruthy());
      expect(
        track.mock.calls.filter(
          ([event, params]) =>
            event === 'ad_reward_impression' && params?.placement === 'wheel_bonus_spin'
        )
      ).toHaveLength(1);

      const action = screen.getByText(messages.wheelBonusSpinAction);
      // #365: 보너스 스핀의 실제 랜덤 결과에는 harvest_boost가 포함된다. 이 테스트는
      // 광고 배치의 earned·중복 탭 방지만 검증하므로 첫 gold 슬롯을 결정론적으로 골라,
      // 정상적인 harvest_boost 당첨을 상태 누수로 오인하는 간헐 실패를 막는다.
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
      try {
        fireEvent.press(action);
        fireEvent.press(action);
      } finally {
        randomSpy.mockRestore();
      }
      await waitFor(() => expect(rewardedAd.showAd).toHaveBeenCalledTimes(1));
      await waitFor(() => {
        const persisted = getLatestPersistedState();
        expect(persisted.gold).toBeGreaterThan(state.gold);
        expect(persisted.wheelState.bonusSpinsUsed).toBe(1);
        expect(persisted.wheelState.lastBonusSpinAt).toBe(NOW);
        expect(persisted.adUsage.harvestBonusAd).toEqual(state.adUsage.harvestBonusAd);
      });
      expect(screen.queryByText(messages.wheelBonusSpinAction)).toBeNull();
      expect(track).toHaveBeenCalledWith(
        'ad_reward_click',
        expect.objectContaining({ ad_type: 'wheelBonusAd', placement: 'wheel_bonus_spin' })
      );
      expect(track).toHaveBeenCalledWith(
        'ad_reward_completed',
        expect.objectContaining({
          ad_type: 'wheelBonusAd',
          placement: 'wheel_bonus_spin',
          reward_value: 1,
        })
      );
    });

    test('룰렛 광고 dismiss는 보너스 상태·보상을 바꾸지 않고 CTA를 유지한다 (#298)', async () => {
      const base = createInitialState();
      const state: GameState = {
        ...base,
        onboardingCompleted: true,
        dailyBonusState: { lastClaimedAt: NOW, streak: 1 },
        wheelState: { ...base.wheelState, lastFreeSpinAt: NOW },
      };
      const track = jest.fn();
      const rewardedAd = createRewardedAd({ status: 'dismissed' });
      const screen = await renderGame(state, {
        analytics: createFarmAnalytics(track),
        useRewardedAd: () => rewardedAd,
      });
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      fireEvent.press(screen.getByTestId('more-nav-button'));
      fireEvent.press(screen.getByLabelText(messages.wheelButtonAccessibilityLabel));
      fireEvent.press(await screen.findByText(messages.wheelBonusSpinAction));
      await waitFor(() => expect(rewardedAd.showAd).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getByText(messages.wheelBonusSpinAction)).toBeTruthy());
      expect(getLatestPersistedState().wheelState).toEqual(state.wheelState);
      expect(track).toHaveBeenCalledWith(
        'ad_reward_failed',
        expect.objectContaining({
          ad_type: 'wheelBonusAd',
          placement: 'wheel_bonus_spin',
          reason: 'dismissed',
        })
      );
      expect(
        track.mock.calls.filter(([event]) => event === 'ad_reward_completed')
      ).toHaveLength(0);
    });

    test('광고 응답 중 리셋 경계를 넘어도 예약한 보너스가 실제 상태에 지급된다 (#298)', async () => {
      const base = createInitialState();
      const state: GameState = {
        ...base,
        onboardingCompleted: true,
        dailyBonusState: { lastClaimedAt: NOW, streak: 1 },
        wheelState: { ...base.wheelState, lastFreeSpinAt: NOW },
      };
      let resolveAd: ((result: RewardedAdShowResult) => void) | null = null;
      const rewardedAd: RewardedAdController = {
        isAdReady: true,
        isAdSupported: true,
        showAd: jest.fn(
          () =>
            new Promise<RewardedAdShowResult>((resolve) => {
              resolveAd = resolve;
            })
        ),
      };
      const random = jest.spyOn(Math, 'random').mockReturnValue(0);
      const screen = await renderGame(state, { useRewardedAd: () => rewardedAd });
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      fireEvent.press(screen.getByTestId('more-nav-button'));
      fireEvent.press(screen.getByLabelText(messages.wheelButtonAccessibilityLabel));
      fireEvent.press(await screen.findByText(messages.wheelBonusSpinAction));
      await waitFor(() => expect(rewardedAd.showAd).toHaveBeenCalledTimes(1));

      const nextReset = getResetDayStart(getResetDayIndex(NOW) + 1) + 1;
      await act(async () => {
        jest.setSystemTime(nextReset);
        resolveAd?.({ status: 'earned' });
        await Promise.resolve();
      });

      await waitFor(() => {
        const persisted = getLatestPersistedState();
        expect(persisted.gold).toBeGreaterThan(state.gold);
        expect(persisted.wheelState.bonusSpinsUsed).toBe(1);
        expect(persisted.wheelState.bonusSpinDayIndex).toBe(getResetDayIndex(NOW));
        expect(persisted.wheelState.lastBonusSpinAt).toBe(nextReset);
      });
      expect(screen.getByText(messages.wheelSpinningLabel)).toBeTruthy();
      random.mockRestore();
    });

    test.each([
      ['golden', '황금', 0],
      ['rainbow', '무지개', 1],
      ['giant', '거대', 2],
      ['prism', '프리즘', 3],
    ] as const)('harvesting a %s-mutated crop plays its dedicated celebration', async (mutationKey, label, rankIndex) => {
      const playEffect = jest.fn();
      const onMutationFlash = jest.fn();
      const base = createReadyHarvestState();
      // rollMutation checks the rarest unlocked kind first. At each exact rank
      // threshold, a zero roll therefore selects that rank's newly unlocked kind.
      const state: GameState = {
        ...base,
        onboardingCompleted: true,
        harvestCounts: { carrot: getMasteryThresholds('carrot')[rankIndex]! },
      };
      const screen = await renderGame(
        state,
        { audio: createEffectAudio(playEffect) },
        { soundEffectsEnabled: true }
      );
      await waitFor(() => expect(screen.getAllByText('GET').length).toBeGreaterThan(0));

      __setMutationFlashTestHook(onMutationFlash);
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
      try {
        fireEvent.press(screen.getAllByText('GET')[0]!);
      } finally {
        randomSpy.mockRestore();
      }

      await waitFor(() => expect(playEffect).toHaveBeenCalledWith('mutation'));
      expect(onMutationFlash).toHaveBeenCalledTimes(1);
      expect(onMutationFlash).toHaveBeenCalledWith(mutationKey);
      expect(screen.getByText(new RegExp(`${label} 변이 수확`))).toBeTruthy();
      expect(screen.getByTestId(`harvest-pop-${mutationKey}`)).toBeTruthy();
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

  // Keep lifecycle boundary coverage in a focused block: all non-timeout
  // end_reason paths and StrictMode/unmount semantics are release-critical.
  describe('manual harvest combo lifecycle end reasons (#348)', () => {
    function comboEvents(track: jest.Mock) {
      return track.mock.calls
        .filter(([name]) => name === 'harvest_combo_completed')
        .map(([, params]) => params as Record<string, unknown>);
    }

    test('emits prestige before the farm layer is replaced', async () => {
      const track = jest.fn();
      const base = createPrestigeReadyState();
      const state: GameState = {
        ...base,
        harvestedCropKeys: [...new Set([...base.harvestedCropKeys, 'carrot' as const])],
        plots: base.plots.map((plot, index) =>
          index === 0
            ? { ...plot, cropType: 'carrot' as const, startTime: NOW - 10_000, state: 2 as const }
            : plot
        ),
      };
      const screen = await renderGame(state, { analytics: createFarmAnalytics(track) });

      fireEvent.press(screen.getByText('GET'));
      await waitFor(() => expect(track).toHaveBeenCalledWith('crop_harvested', expect.anything()));
      await triggerPrestige(screen);

      expect(comboEvents(track)).toEqual([
        expect.objectContaining({ manual_harvest_count: 1, end_reason: 'prestige' }),
      ]);
    });

    test('emits reset only after local persistence removal succeeds', async () => {
      const track = jest.fn();
      const messages = getFarmMessages(DEFAULT_LOCALE);
      const screen = await renderGame(createLateGameState(), { analytics: createFarmAnalytics(track) });

      fireEvent.press(screen.getAllByText('GET')[0]!);
      await waitFor(() => expect(track).toHaveBeenCalledWith('crop_harvested', expect.anything()));
      fireEvent.press(screen.getByLabelText(messages.settingsAccessibilityLabel));
      fireEvent.press(screen.getByText(messages.resetFarmAction));
      fireEvent.changeText(screen.getByLabelText(messages.resetInputAccessibilityLabel), messages.resetConfirmText);
      fireEvent.press(screen.getByText(messages.resetDeleteAction));

      await waitFor(() => expect(mockPersistence.removePersistedGameState).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(comboEvents(track)).toEqual([
          expect.objectContaining({ manual_harvest_count: 1, end_reason: 'reset' }),
        ])
      );
    });

    test('emits cloud_restore before a successful restore replaces state', async () => {
      const track = jest.fn();
      const messages = getFarmMessages(DEFAULT_LOCALE);
      const restoreFromCloud = jest.fn(async () => ({
        status: 'restored' as const,
        clientRevision: 2,
        gameState: createInitialState(),
      }));
      const screen = await renderGame(createLateGameState(), {
        analytics: createFarmAnalytics(track),
        cloudSave: {
          isSupported: true,
          backupNow: jest.fn(async () => ({ status: 'backed_up' as const, clientRevision: 1 })),
          restoreFromCloud,
        },
      });

      fireEvent.press(screen.getAllByText('GET')[0]!);
      await waitFor(() => expect(track).toHaveBeenCalledWith('crop_harvested', expect.anything()));
      fireEvent.press(screen.getByLabelText(messages.settingsAccessibilityLabel));
      fireEvent.press(screen.getByText(messages.cloudRestoreAction));

      await waitFor(() => expect(restoreFromCloud).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(comboEvents(track)).toEqual([
          expect.objectContaining({ manual_harvest_count: 1, end_reason: 'cloud_restore' }),
        ])
      );
    });

    test('does not emit from real unmount cleanup', async () => {
      const track = jest.fn();
      const screen = await renderGame(createLateGameState(), { analytics: createFarmAnalytics(track) });

      fireEvent.press(screen.getAllByText('GET')[0]!);
      await waitFor(() => expect(track).toHaveBeenCalledWith('crop_harvested', expect.anything()));
      screen.unmount();
      jest.advanceTimersByTime(COMBO_WINDOW_MS + 1);

      expect(comboEvents(track)).toHaveLength(0);
    });

    test('emits exactly one streak under React StrictMode effect replay', async () => {
      const track = jest.fn();
      const state: GameState = {
        ...createLateGameState(),
        onboardingCompleted: true,
        onboardingStep: null,
      };
      mockPersistence.readPersistedGameState.mockReset().mockResolvedValue(state);
      mockPersistence.readPersistedGameSettings.mockReset().mockResolvedValue(null);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        const screen = render(
          <React.StrictMode>
            <FarmGame persistence={mockPersistence} analytics={createFarmAnalytics(track)} />
          </React.StrictMode>
        );
        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });
        await waitFor(() => expect(screen.getAllByText('GET').length).toBeGreaterThan(0));

        fireEvent.press(screen.getAllByText('GET')[0]!);
        await waitFor(() => expect(track).toHaveBeenCalledWith('crop_harvested', expect.anything()));
        await act(async () => {
          jest.advanceTimersByTime(COMBO_WINDOW_MS + 1);
        });

        expect(comboEvents(track)).toEqual([
          expect.objectContaining({ manual_harvest_count: 1, end_reason: 'timeout' }),
        ]);
        expect(
          consoleErrorSpy.mock.calls.filter(
            ([message, deprecatedApi]) =>
              !(
                String(message).includes('%s is deprecated in StrictMode') &&
                deprecatedApi === 'findNodeHandle'
              )
          )
        ).toEqual([]);
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });
  });

  describe('manual harvest combo analytics (#348)', () => {
    function trackedParams(track: jest.Mock, eventName: string) {
      return track.mock.calls
        .filter(([name]) => name === eventName)
        .map(([, params]) => params as Record<string, unknown>);
    }

    test.each([
      [1, 'normal'],
      [COMBO_GREAT_THRESHOLD, 'great'],
      [COMBO_LEGENDARY_THRESHOLD, 'legendary'],
    ] as const)(
      'records %i manual harvests as the %s tier with the exact accumulated revenue',
      async (manualHarvestCount, comboTier) => {
        const track = jest.fn();
        const screen = await renderGame(createLateGameState(), { analytics: createFarmAnalytics(track) });

        await waitFor(() =>
          expect(screen.getAllByText('GET').length).toBeGreaterThanOrEqual(manualHarvestCount)
        );
        for (let index = 0; index < manualHarvestCount; index += 1) {
          fireEvent.press(screen.getAllByText('GET')[0]!);
        }
        await waitFor(() => expect(trackedParams(track, 'crop_harvested')).toHaveLength(manualHarvestCount));

        await act(async () => {
          jest.advanceTimersByTime(COMBO_WINDOW_MS + 1);
        });

        const cropRevenue = trackedParams(track, 'crop_harvested').reduce(
          (total, params) => total + Number(params.revenue),
          0
        );
        expect(trackedParams(track, 'harvest_combo_completed')).toEqual([
          expect.objectContaining({
            manual_harvest_count: manualHarvestCount,
            combo_tier: comboTier,
            duration_ms: 0,
            base_revenue_total: cropRevenue,
            end_reason: 'timeout',
            schema_version: 1,
          }),
        ]);
      }
    );

    test('measures duration from the first manual harvest to the last', async () => {
      const track = jest.fn();
      const screen = await renderGame(createLateGameState(), { analytics: createFarmAnalytics(track) });

      fireEvent.press(screen.getAllByText('GET')[0]!);
      await act(async () => {
        jest.advanceTimersByTime(400);
      });
      fireEvent.press(screen.getAllByText('GET')[0]!);
      await waitFor(() => expect(trackedParams(track, 'crop_harvested')).toHaveLength(2));
      await act(async () => {
        jest.advanceTimersByTime(COMBO_WINDOW_MS + 1);
      });

      expect(trackedParams(track, 'harvest_combo_completed')).toEqual([
        expect.objectContaining({ manual_harvest_count: 2, duration_ms: 400, end_reason: 'timeout' }),
      ]);
    });

    test('keeps a harvest exactly at the inclusive window boundary in the same streak', async () => {
      const track = jest.fn();
      const screen = await renderGame(createLateGameState(), { analytics: createFarmAnalytics(track) });

      fireEvent.press(screen.getAllByText('GET')[0]!);
      await waitFor(() => expect(trackedParams(track, 'crop_harvested')).toHaveLength(1));
      await act(async () => {
        jest.advanceTimersByTime(COMBO_WINDOW_MS);
      });
      expect(trackedParams(track, 'harvest_combo_completed')).toHaveLength(0);

      fireEvent.press(screen.getAllByText('GET')[0]!);
      await waitFor(() => expect(trackedParams(track, 'crop_harvested')).toHaveLength(2));
      await act(async () => {
        jest.advanceTimersByTime(COMBO_WINDOW_MS + 1);
      });

      expect(trackedParams(track, 'harvest_combo_completed')).toEqual([
        expect.objectContaining({
          manual_harvest_count: 2,
          duration_ms: COMBO_WINDOW_MS,
          end_reason: 'timeout',
        }),
      ]);
    });

    test('flushes an expired streak before a delayed timer can merge the next harvest', async () => {
      const track = jest.fn();
      const screen = await renderGame(createLateGameState(), { analytics: createFarmAnalytics(track) });

      fireEvent.press(screen.getAllByText('GET')[0]!);
      await waitFor(() => expect(trackedParams(track, 'crop_harvested')).toHaveLength(1));
      jest.setSystemTime(NOW + COMBO_WINDOW_MS + 1);
      fireEvent.press(screen.getAllByText('GET')[0]!);

      await waitFor(() =>
        expect(trackedParams(track, 'harvest_combo_completed')).toEqual([
          expect.objectContaining({ manual_harvest_count: 1, end_reason: 'timeout' }),
        ])
      );
      await act(async () => {
        jest.advanceTimersByTime(COMBO_WINDOW_MS + 1);
      });
      expect(trackedParams(track, 'harvest_combo_completed')).toEqual([
        expect.objectContaining({ manual_harvest_count: 1, end_reason: 'timeout' }),
        expect.objectContaining({ manual_harvest_count: 1, end_reason: 'timeout' }),
      ]);
    });

    test('retires a streak before duplicate inactive/background callbacks and its timer run', async () => {
      const track = jest.fn();
      let onAppStateChange: ((state: AppStateStatus) => void) | undefined;
      const addEventListenerMock = AppState.addEventListener as jest.MockedFunction<
        typeof AppState.addEventListener
      >;
      addEventListenerMock.mockImplementationOnce((_event, listener) => {
        onAppStateChange = listener;
        return { remove: jest.fn() };
      });

      const screen = await renderGame(createLateGameState(), { analytics: createFarmAnalytics(track) });
      fireEvent.press(screen.getAllByText('GET')[0]!);
      await waitFor(() => expect(trackedParams(track, 'crop_harvested')).toHaveLength(1));

      await act(async () => {
        onAppStateChange?.('inactive');
        onAppStateChange?.('background');
        jest.advanceTimersByTime(COMBO_WINDOW_MS);
      });

      expect(trackedParams(track, 'harvest_combo_completed')).toEqual([
        expect.objectContaining({ manual_harvest_count: 1, end_reason: 'background' }),
      ]);
    });

    test('keeps timeout attribution when AppState beats a delayed expired timer', async () => {
      const track = jest.fn();
      let onAppStateChange: ((state: AppStateStatus) => void) | undefined;
      const addEventListenerMock = AppState.addEventListener as jest.MockedFunction<
        typeof AppState.addEventListener
      >;
      addEventListenerMock.mockImplementationOnce((_event, listener) => {
        onAppStateChange = listener;
        return { remove: jest.fn() };
      });

      const screen = await renderGame(createLateGameState(), { analytics: createFarmAnalytics(track) });
      fireEvent.press(screen.getAllByText('GET')[0]!);
      await waitFor(() => expect(trackedParams(track, 'crop_harvested')).toHaveLength(1));
      // Move wall time past the deadline without running the queued timeout.
      jest.setSystemTime(NOW + COMBO_WINDOW_MS + 1);
      await act(async () => {
        onAppStateChange?.('background');
      });

      expect(trackedParams(track, 'harvest_combo_completed')).toEqual([
        expect.objectContaining({ manual_harvest_count: 1, end_reason: 'timeout' }),
      ]);
    });

    test('flushes a tap that commits after the background callback', async () => {
      const track = jest.fn();
      let onAppStateChange: ((state: AppStateStatus) => void) | undefined;
      const addEventListenerMock = AppState.addEventListener as jest.MockedFunction<
        typeof AppState.addEventListener
      >;
      addEventListenerMock.mockImplementationOnce((_event, listener) => {
        onAppStateChange = listener;
        return { remove: jest.fn() };
      });
      const screen = await renderGame(createLateGameState(), { analytics: createFarmAnalytics(track) });
      let plotNode = screen.getByTestId('plot-cell-0');
      while (typeof plotNode.props.onPress !== 'function' && plotNode.parent != null) {
        plotNode = plotNode.parent;
      }
      const pressPlot = plotNode.props.onPress as (() => void) | undefined;
      expect(pressPlot).toBeDefined();

      await act(async () => {
        pressPlot?.();
        onAppStateChange?.('background');
      });

      await waitFor(() => expect(trackedParams(track, 'crop_harvested')).toHaveLength(1));
      expect(trackedParams(track, 'harvest_combo_completed')).toEqual([
        expect.objectContaining({ manual_harvest_count: 1, end_reason: 'background' }),
      ]);
    });

    test('excludes Harvest All from the manual accumulator', async () => {
      const track = jest.fn();
      const screen = await renderGame(createReadyHarvestState(), { analytics: createFarmAnalytics(track) });

      await waitFor(() => expect(screen.getByText('🧺 모두 수확 2')).toBeTruthy());
      fireEvent.press(screen.getByLabelText('🧺 모두 수확 2'));
      await act(async () => {
        jest.advanceTimersByTime(COMBO_WINDOW_MS);
      });

      expect(trackedParams(track, 'harvest_combo_completed')).toHaveLength(0);
    });

    test('excludes automatic harvest from the manual accumulator', async () => {
      const track = jest.fn();
      const base = createReadyHarvestState();
      const state: GameState = {
        ...base,
        research: { ...base.research, unlockedNodes: ['auto_harvest'] },
        automationSettings: { autoHarvestEnabled: true, autoReplantEnabled: false, donationModeEnabled: false },
      };
      const screen = await renderGame(state, { analytics: createFarmAnalytics(track) });
      const expectedGold = state.gold + CROPS.carrot!.sell * 2;

      await act(async () => {
        jest.advanceTimersByTime(GAME_TICK_INTERVAL_MS + COMBO_WINDOW_MS + 50);
      });

      await waitFor(() => expect(screen.getByText(`${formatMoney(expectedGold)}G`)).toBeTruthy());
      expect(trackedParams(track, 'harvest_combo_completed')).toHaveLength(0);
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
    const track = jest.fn();
    // 오프라인 체인 수익만 있고 수확 작물은 없는 복귀 상태 → 데일리 클레임이 첫 행동 CTA.
    const chainState: GameState = {
      ...createInitialState(),
      chainFarms: [{ id: 1, archetype: 'plains', goldPerHour: 3600, lastCollectedAt: NOW - 2 * 60 * 60 * 1000 }],
    };
    // 복귀 recap이 auto_popup을 억제하므로 데일리 보너스가 welcome_back CTA로 열린다.
    const screen = await renderGame(chainState, { analytics: createFarmAnalytics(track) }, null, {
      preserveDailyBonus: true,
    });

    await waitFor(() => expect(screen.getByText('다시 오셨네요!')).toBeTruthy());
    fireEvent.press(screen.getByText('데일리 보너스 받기'));

    // 데일리 CTA에서도 오프라인 체인 수익이 수령된다(수금 토스트로 확인).
    await waitFor(() => expect(screen.getByText(/수금했어요/)).toBeTruthy());
    // 데일리 보너스 시트로 전환된다.
    await waitFor(() => expect(screen.getByText('오늘의 출석 보너스')).toBeTruthy());
    expect(track).toHaveBeenCalledWith(
      'daily_bonus_opened',
      expect.objectContaining({ source: 'welcome_back' })
    );
    // #376 AC-1(welcome_back): 시트가 열리며 추가 탭 없이 즉시 자동 수령되고
    // dailyBonusState가 갱신된다. daily_bonus_claimed도 source=welcome_back로 발화한다.
    await waitFor(() =>
      expect(
        track.mock.calls.filter(
          ([event, params]) => event === 'daily_bonus_claimed' && params?.source === 'welcome_back'
        )
      ).toHaveLength(1)
    );
    await waitFor(() =>
      expect(getLatestPersistedState().dailyBonusState.lastClaimedAt).not.toBeNull()
    );
    // 탭-수령 버튼 없이 확인 버튼만 남는다.
    expect(screen.getByText(getFarmMessages(DEFAULT_LOCALE).dailyBonusConfirmAction)).toBeTruthy();
  });

  test('does not show the recap after only a brief absence', async () => {
    mockPersistence.readLastSeenAt.mockResolvedValueOnce(NOW - 30_000);
    const screen = await renderGame(createReadyHarvestState());

    await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
    expect(screen.queryByText('다시 오셨네요!')).toBeNull();
  });

  // #356: 시트 impression·collection_screen이 시트 오픈(타입 전이)당 1회만 발화하는지
  // 검증한다. 회귀 대상: analyticsContext(=[gameState] 의존)를 effect deps로 두면 시트가
  // 열린 동안 gameState가 갱신될 때마다 impression이 재발화되던 GA4 과다 발화 버그.
  //
  // 인수조건 ↔ 테스트 매핑(각 test 이름에 AC-n 태그를 달아 근거를 명시):
  //   AC-1(같은 시트 열린 채 gameState 갱신돼도 추가 발화 없음):
  //     shop·collection은 인시트 액션(밭 개간/구역 보상 수령)으로 실제 gameState를 바꿔 검증,
  //     growthAd·harvestBonus는 열린 채 게임 틱 반복(방치형 재렌더)으로 검증.
  //   AC-2(오픈당 shop 2건 / growthAd·harvestBonus·collection 각 1건): 각 시트 오픈 직후 카운트 검증.
  //   AC-3(닫았다 다시 열면 다시 1회 발화): 각 시트 재오픈 후 누적 카운트 검증.
  //   AC-4(welcomeBack offlineBonus 가드 회귀 없음): 복귀 시트 오픈당 1건 + 열린 채 재렌더 불변 검증.
  //   AC-5(열림 중 gameState 업데이트 시 trackAdRewardImpression/trackCollectionScreen 추가 호출 없음):
  //     shop(trackAdRewardImpression)·collection(trackCollectionScreen)이 실제 mutation 후 불변임을 assert.
  describe('시트 impression 재발화 가드 (#356)', () => {
    const localMessages = getFarmMessages(DEFAULT_LOCALE);
    // 시트 닫힘 애니메이션(SHEET_ANIMATION_DURATION_MS=180)이 완료돼 activeSheet=null이
    // 커밋되기까지의 여유. 재오픈이 확실히 새 타입 전이가 되도록 넉넉히 진행한다.
    const SHEET_CLOSE_SETTLE_MS = 400;

    const impressionTypes = (track: jest.Mock): string[] =>
      track.mock.calls
        .filter(([eventName]) => eventName === 'ad_reward_impression')
        .map(([, params]) => params.ad_type);

    const collectionScreenCount = (track: jest.Mock): number =>
      track.mock.calls.filter(([eventName]) => eventName === 'collection_screen').length;

    // AC-1·AC-2·AC-3·AC-5 (shop): 오픈 직후 2건(AC-2) → 열린 채 밭 개간으로 실제 gameState
    // 변경해도 2건 유지(AC-1·AC-5, trackAdRewardImpression 불변) → 재오픈 시 다시 2건(AC-3).
    test('AC-1·AC-2·AC-3·AC-5 (shop): 상점 시트가 열린 동안 gameState가 갱신돼도 impression이 재발화되지 않고 재오픈 시 다시 2건 발화된다', async () => {
      const shopReadyState = createShopReadyState();
      const plotCost = getPlotCost(shopReadyState.unlockedPlotCount);
      const track = jest.fn();
      const screen = await renderGame(shopReadyState, { analytics: createFarmAnalytics(track) });

      await waitFor(() => expect(screen.getByText(`${formatMoney(shopReadyState.gold)}G`)).toBeTruthy());

      // 상점 열기: impression은 rewardedGold, plotDiscountAd 정확히 2건만 발화된다.
      fireEvent.press(screen.getByTestId('shop-nav-button'));
      expect(impressionTypes(track)).toEqual(['rewardedGold', 'plotDiscountAd']);

      // 상점이 열린 채 gameState를 바꾼다(밭 개간 구매 → 골드 감소로 커밋 확인).
      // 회귀 전에는 여기서 analyticsContext identity가 바뀌어 impression이 2건 더 발화됐다.
      fireEvent.press(screen.getByText('밭 개간하기'));
      expect(screen.getByText(`${formatMoney(shopReadyState.gold - plotCost)}G`)).toBeTruthy();
      expect(impressionTypes(track)).toEqual(['rewardedGold', 'plotDiscountAd']);

      // 닫았다가 다시 열면 impression이 다시 1회(2건) 발화된다. 시트 닫힘은 애니메이션
      // 완료 콜백에서 activeSheet=null로 커밋되므로, 재오픈 전에 타이머를 진행시킨다.
      fireEvent.press(screen.getByLabelText(localMessages.sheetCloseAccessibilityLabel));
      await act(async () => {
        jest.advanceTimersByTime(SHEET_CLOSE_SETTLE_MS);
      });
      fireEvent.press(screen.getByTestId('shop-nav-button'));
      expect(impressionTypes(track)).toEqual([
        'rewardedGold',
        'plotDiscountAd',
        'rewardedGold',
        'plotDiscountAd',
      ]);
    });

    // AC-1·AC-2·AC-3·AC-5 (collection): 진입 직후 1건(AC-2) → 열린 채 구역 보상 수령으로 실제
    // gameState 변경해도 1건 유지(AC-1·AC-5, trackCollectionScreen 불변) → 재오픈 시 다시 1건(AC-3).
    test('AC-1·AC-2·AC-3·AC-5 (collection): 도감 시트가 열린 동안 gameState가 갱신돼도 collection_screen이 재발화되지 않고 재오픈 시 다시 1건 발화된다', async () => {
      // 첫 구역 작물을 모두 발견해 도감에서 구역 보상 수령이 가능한 상태로 만든다.
      const area = FARM_AREAS[0]!;
      const base = createInitialState();
      const state: GameState = {
        ...base,
        onboardingCompleted: true,
        harvestedCropKeys: getAreaCropKeys(area.key),
      };
      const track = jest.fn();
      const screen = await renderGame(state, { analytics: createFarmAnalytics(track) });

      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      // 더보기 → 도감 진입: collection_screen 1건.
      fireEvent.press(screen.getByTestId('more-nav-button'));
      fireEvent.press(screen.getByLabelText(localMessages.collectionButtonAccessibilityLabel));
      expect(collectionScreenCount(track)).toBe(1);

      // 도감이 열린 채 gameState를 바꾼다(구역 보상 수령 → 골드 증가로 커밋).
      // 회귀 전에는 여기서 collection_screen이 추가 발화됐다.
      const claimLabel = localMessages.collectionClaimAction(
        formatMoney(COLLECTION_AREA_REWARDS[area.key]!, DEFAULT_LOCALE)
      );
      fireEvent.press(screen.getByText(claimLabel));
      expect(screen.queryByText(claimLabel)).toBeNull();
      expect(collectionScreenCount(track)).toBe(1);

      // 닫았다가 다시 열면 collection_screen이 다시 1건 발화된다.
      fireEvent.press(screen.getByLabelText(localMessages.sheetCloseAccessibilityLabel));
      await act(async () => {
        jest.advanceTimersByTime(SHEET_CLOSE_SETTLE_MS);
      });
      fireEvent.press(screen.getByTestId('more-nav-button'));
      fireEvent.press(screen.getByLabelText(localMessages.collectionButtonAccessibilityLabel));
      expect(collectionScreenCount(track)).toBe(2);
    });

    // AC-1·AC-2·AC-3 (growthAd): 성장 가속 시트도 타입 전이당 growthAd impression을 정확히
    // 1회만 발화(AC-2)하고, 열린 채 게임 틱이 반복돼도(방치형 재렌더) 추가 발화되지 않으며
    // (AC-1), 닫았다 다시 열면 다시 1회 발화(AC-3)한다. shop/collection과 동일한
    // sheetImpressionTypeRef 가드 경로를 growthAd 타입에 대해 직접 검증한다.
    test('AC-1·AC-2·AC-3 (growthAd): 성장 가속 시트도 타입 전이당 growthAd impression 1건만 발화하고 재오픈 시 다시 1건 발화된다', async () => {
      // 성장 중인 밭(state 1) + 넉넉한 골드로 성장 가속 시트가 확실히 열리게 한다.
      const state: GameState = { ...createGrowingCropState(), gold: 100_000 };
      const rewardedAd = createReadyRewardedAd();
      const track = jest.fn();
      const screen = await renderGame(state, {
        analytics: createFarmAnalytics(track),
        useRewardedAd: () => rewardedAd,
      });
      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());

      // 씨앗 도구를 선택해 밭 탭이 수확이 아닌 성장 가속으로 해석되게 한 뒤, 성장 중인
      // 밭을 눌러 시트를 연다: growthAd impression 1건.
      fireEvent.press(screen.getByText('당근'));
      fireEvent.press(screen.getByTestId('plot-cell-0'));
      expect(impressionTypes(track)).toEqual(['growthAd']);

      // 시트가 열린 채 게임 틱이 반복돼도 추가 발화되지 않는다.
      await act(async () => {
        jest.advanceTimersByTime(GAME_TICK_INTERVAL_MS * 4);
      });
      expect(impressionTypes(track)).toEqual(['growthAd']);

      // 닫았다가 같은(여전히 성장 중인) 밭을 다시 열면 growthAd impression이 다시 1건.
      fireEvent.press(screen.getByLabelText(localMessages.sheetCloseAccessibilityLabel));
      await act(async () => {
        jest.advanceTimersByTime(SHEET_CLOSE_SETTLE_MS);
      });
      fireEvent.press(screen.getByTestId('plot-cell-0'));
      expect(impressionTypes(track)).toEqual(['growthAd', 'growthAd']);
    });

    // AC-1·AC-2·AC-3 (harvestBonus): 수확 보너스 넛지 시트도 타입 전이당 harvestBonusAd
    // impression을 정확히 1회만 발화(AC-2)하고, 열린 채 게임 틱이 반복돼도 추가 발화되지
    // 않으며(AC-1), 쿨다운 경과 후 재노출되면 다시 1회 발화(AC-3)한다.
    test('AC-1·AC-2·AC-3 (harvestBonus): 수확 보너스 넛지도 타입 전이당 harvestBonusAd impression 1건만 발화하고 재노출 시 다시 1건 발화된다', async () => {
      const lateGame = createLateGameState();
      const rewardedAd = createReadyRewardedAd();
      const harvestBonusCta = `광고 보고 30분 동안 수확 ${HARVEST_BONUS_MULTIPLIER}배`;
      const track = jest.fn();
      const screen = await renderGame(lateGame, {
        analytics: createFarmAnalytics(track),
        useRewardedAd: () => rewardedAd,
      });
      await waitFor(() => expect(screen.getByText(`${formatMoney(lateGame.gold)}G`)).toBeTruthy());

      // 수확(GET)하면 수확 보너스 넛지 시트가 열린다: harvestBonusAd impression 1건.
      fireEvent.press(screen.getAllByText('GET')[0]!);
      expect(screen.getByText(harvestBonusCta)).toBeTruthy();
      expect(impressionTypes(track)).toEqual(['harvestBonusAd']);

      // 시트가 열린 채 게임 틱이 반복돼도 추가 발화되지 않는다.
      await act(async () => {
        jest.advanceTimersByTime(GAME_TICK_INTERVAL_MS * 4);
      });
      expect(impressionTypes(track)).toEqual(['harvestBonusAd']);

      // 닫고(괜찮아요) 쿨다운 경과 후 다시 수확하면 넛지가 재노출되어 impression 1건 추가.
      fireEvent.press(screen.getByText('괜찮아요'));
      await act(async () => {
        jest.advanceTimersByTime(SHEET_CLOSE_SETTLE_MS);
      });
      expect(screen.queryByText(harvestBonusCta)).toBeNull();
      jest.setSystemTime(NOW + HARVEST_BONUS_AD_COOLDOWN_MS + 1);
      fireEvent.press(screen.getAllByText('GET')[0]!);
      expect(screen.getByText(harvestBonusCta)).toBeTruthy();
      expect(impressionTypes(track)).toEqual(['harvestBonusAd', 'harvestBonusAd']);
    });

    // AC-4 (welcomeBack): welcomeBack(offlineBonus)의 기존 capturedAt 가드가 리팩터 후에도
    // 회귀 없이 유지되는지 직접 검증한다. 시트 오픈당 offlineBonus impression 1건만 발화하고,
    // 열린 채 게임 틱이 반복돼도 추가 발화되지 않는다.
    test('AC-4 (welcomeBack): 복귀 offlineBonus impression은 시트 오픈당 1건만 발화하고 열린 채 재렌더돼도 재발화되지 않는다', async () => {
      const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
      const state = createGrowingCropState();
      mockPersistence.readLastSeenAt.mockResolvedValueOnce(NOW - TWO_HOURS_MS);
      const offlineGold = getActiveFarmOfflineGold(state, TWO_HOURS_MS);
      expect(offlineGold).toBeGreaterThan(0);
      const rewardedAd = createReadyRewardedAd();
      const track = jest.fn();
      const screen = await renderGame(state, {
        analytics: createFarmAnalytics(track),
        useRewardedAd: () => rewardedAd,
      });
      await waitFor(() => expect(screen.getByTestId('welcome-back-double-ad-action')).toBeTruthy());

      const offlineImpressionCount = (): number =>
        track.mock.calls.filter(
          ([eventName, params]) =>
            eventName === 'ad_reward_impression' && params.placement === 'return_offline_bonus'
        ).length;

      // 복귀 시트 오픈당 offlineBonus impression 1건.
      expect(offlineImpressionCount()).toBe(1);

      // 시트가 열린 채 게임 틱이 반복돼도(capturedAt 가드) 추가 발화되지 않는다.
      await act(async () => {
        jest.advanceTimersByTime(GAME_TICK_INTERVAL_MS * 4);
      });
      expect(offlineImpressionCount()).toBe(1);
    });
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
      expect(screen.getByText(promptMessages.notificationPromptDesc)).toBeTruthy();
    });

    test('renders the combined farm-reminder consent copy in English', async () => {
      const notifications = createNotificationsMock();
      const englishMessages = getFarmMessages('en-US');
      const screen = await renderGame(createPostAhaState(), {
        notifications,
        preferredLocale: 'en-US',
      });

      await waitFor(() => expect(screen.getByTestId('notification-prompt-card')).toBeTruthy());
      expect(screen.getByText(englishMessages.notificationPromptTitle)).toBeTruthy();
      expect(screen.getByText(englishMessages.notificationPromptDesc)).toBeTruthy();
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

    test('handles queued accept events once and enables harvest + comeback reminders together', async () => {
      let resolvePermission: ((granted: boolean) => void) | undefined;
      const permission = new Promise<boolean>((resolve) => {
        resolvePermission = resolve;
      });
      const requestPermission = jest.fn(() => permission);
      const notifications = createNotificationsMock({ requestPermission });
      const screen = await renderGame(createPostAhaState(), { notifications });

      await waitFor(() => expect(screen.getByTestId('notification-prompt-card')).toBeTruthy());
      const accept = screen.getByTestId('notification-prompt-accept');
      await waitFor(() => expect(mockPersistence.writePersistedGameSettings).toHaveBeenCalled());
      mockPersistence.writePersistedGameSettings.mockClear();

      await act(async () => {
        fireEvent.press(accept);
        fireEvent.press(accept);
        await Promise.resolve();
      });

      await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByTestId('notification-prompt-card')).toBeNull());
      await act(async () => {
        resolvePermission?.(true);
        await permission;
      });
      // Simulate a native press event that was queued before unmount but reaches
      // the stale host node after the permission request has already settled.
      await act(async () => {
        fireEvent.press(accept);
        await Promise.resolve();
      });

      expect(requestPermission).toHaveBeenCalledTimes(1);
      await waitFor(() =>
        expect(mockPersistence.writePersistedGameSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            harvestNotificationsEnabled: true,
            comebackRemindersEnabled: true,
          })
        )
      );
      expect(mockPersistence.writePersistedGameSettings).toHaveBeenCalledTimes(1);
      await waitFor(() =>
        expect(notifications.scheduleReminder).toHaveBeenCalledWith(
          'dailyBonus',
          expect.objectContaining({ readyAtMs: expect.any(Number) })
        )
      );
      expect(notifications.scheduleReminder).toHaveBeenCalledWith(
        'cropOfTheDay',
        expect.objectContaining({ readyAtMs: expect.any(Number) })
      );
      expect(
        (notifications.scheduleReminder as jest.Mock).mock.calls.filter(([kind]) => kind === 'dailyBonus')
      ).toHaveLength(1);
      expect(
        (notifications.scheduleReminder as jest.Mock).mock.calls.filter(([kind]) => kind === 'cropOfTheDay')
      ).toHaveLength(1);
    });

    test('keeps both reminder settings off when OS permission is denied', async () => {
      const requestPermission = jest.fn(async () => false);
      const notifications = createNotificationsMock({ requestPermission });
      const screen = await renderGame(createPostAhaState(), { notifications });

      const accept = await waitFor(() => screen.getByTestId('notification-prompt-accept'));
      // Ignore the initial default-settings persistence. From the denied tap
      // onward, no settings write may enable either notification category.
      await waitFor(() => expect(mockPersistence.writePersistedGameSettings).toHaveBeenCalled());
      mockPersistence.writePersistedGameSettings.mockClear();
      fireEvent.press(accept);

      await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByTestId('notification-prompt-card')).toBeNull());
      expect(notifications.scheduleReminder).not.toHaveBeenCalled();
      expect(mockPersistence.writePersistedGameSettings).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(mockPersistence.writePersistedGameState).toHaveBeenCalledWith(
          expect.objectContaining({ harvestNotificationPromptSeen: true })
        )
      );
    });

    test('does not overwrite a previously enabled comeback reminder when permission is denied', async () => {
      const requestPermission = jest.fn(async () => false);
      const notifications = createNotificationsMock({ requestPermission });
      const screen = await renderGame(
        createPostAhaState(),
        { notifications },
        { harvestNotificationsEnabled: false, comebackRemindersEnabled: true }
      );

      const accept = await waitFor(() => screen.getByTestId('notification-prompt-accept'));
      await waitFor(() => expect(mockPersistence.writePersistedGameSettings).toHaveBeenCalled());
      mockPersistence.writePersistedGameSettings.mockClear();
      // comebackRemindersEnabled로 마운트되면 dailyBonus 리마인더가 한 번 예약된다.
      // (#363: 타깃 변경 시에만 예약하므로 재렌더로 재예약되지 않는다.)
      await waitFor(() =>
        expect(notifications.scheduleReminder).toHaveBeenCalledWith(
          'dailyBonus',
          expect.objectContaining({ readyAtMs: expect.any(Number) })
        )
      );
      fireEvent.press(accept);

      await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByTestId('notification-prompt-card')).toBeNull());
      // 권한 거부는 설정을 덮어쓰지 않고, 이미 예약된 리마인더도 취소하지 않는다.
      expect(mockPersistence.writePersistedGameSettings).not.toHaveBeenCalled();
      expect(notifications.cancelReminder).not.toHaveBeenCalled();
    });

    test('keeps harvest and comeback reminder settings independently reversible', async () => {
      const notifications = createNotificationsMock();
      const state = { ...createPostAhaState(), harvestNotificationPromptSeen: true };
      const screen = await renderGame(
        state,
        { notifications },
        { harvestNotificationsEnabled: true, comebackRemindersEnabled: true }
      );

      await waitFor(() => expect(screen.getByText('행복 농장')).toBeTruthy());
      fireEvent.press(screen.getByLabelText(promptMessages.settingsAccessibilityLabel));
      fireEvent.press(screen.getByText(promptMessages.harvestNotificationsLabel));
      await waitFor(() =>
        expect(mockPersistence.writePersistedGameSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            harvestNotificationsEnabled: false,
            comebackRemindersEnabled: true,
          })
        )
      );

      fireEvent.press(screen.getByText(promptMessages.comebackRemindersLabel));
      await waitFor(() =>
        expect(mockPersistence.writePersistedGameSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            harvestNotificationsEnabled: false,
            comebackRemindersEnabled: false,
          })
        )
      );
      expect(notifications.requestPermission).not.toHaveBeenCalled();
    });

    test('retires the prompt without asking permission on decline', async () => {
      const notifications = createNotificationsMock();
      const screen = await renderGame(createPostAhaState(), { notifications });

      await waitFor(() => expect(screen.getByTestId('notification-prompt-card')).toBeTruthy());
      const staleAccept = screen.getByTestId('notification-prompt-accept');
      await waitFor(() => expect(mockPersistence.writePersistedGameSettings).toHaveBeenCalled());
      mockPersistence.writePersistedGameSettings.mockClear();
      fireEvent.press(screen.getByTestId('notification-prompt-decline'));

      await waitFor(() => expect(screen.queryByTestId('notification-prompt-card')).toBeNull());
      await act(async () => {
        fireEvent.press(staleAccept);
        await Promise.resolve();
      });
      expect(notifications.requestPermission).not.toHaveBeenCalled();
      expect(mockPersistence.writePersistedGameSettings).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(mockPersistence.writePersistedGameState).toHaveBeenCalledWith(
          expect.objectContaining({ harvestNotificationPromptSeen: true })
        )
      );
    });

    test('accepts a new prompt generation after cloud restore and ignores the retired generation', async () => {
      const notifications = createNotificationsMock();
      const restoreFromCloud = jest.fn(async () => ({
        status: 'restored' as const,
        clientRevision: 2,
        gameState: createPostAhaState(),
      }));
      const screen = await renderGame(createPostAhaState(), {
        notifications,
        cloudSave: {
          isSupported: true,
          backupNow: jest.fn(async () => ({ status: 'backed_up' as const, clientRevision: 1 })),
          restoreFromCloud,
        },
      });

      const retiredAccept = await waitFor(() => screen.getByTestId('notification-prompt-accept'));
      fireEvent.press(screen.getByTestId('notification-prompt-decline'));
      await waitFor(() => expect(screen.queryByTestId('notification-prompt-card')).toBeNull());

      fireEvent.press(screen.getByLabelText(promptMessages.settingsAccessibilityLabel));
      fireEvent.press(screen.getByText(promptMessages.cloudRestoreAction));
      await waitFor(() => expect(restoreFromCloud).toHaveBeenCalledTimes(1));
      fireEvent.press(screen.getByLabelText(promptMessages.sheetCloseAccessibilityLabel));
      await waitFor(() => expect(screen.getByTestId('notification-prompt-card')).toBeTruthy());

      await act(async () => {
        fireEvent.press(retiredAccept);
        await Promise.resolve();
      });
      expect(notifications.requestPermission).not.toHaveBeenCalled();
      expect(screen.getByTestId('notification-prompt-card')).toBeTruthy();

      fireEvent.press(screen.getByTestId('notification-prompt-accept'));
      await waitFor(() => expect(notifications.requestPermission).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(mockPersistence.writePersistedGameSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            harvestNotificationsEnabled: true,
            comebackRemindersEnabled: true,
          })
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

  // #367: 딥 기능 최초 해금 시 1회성 발견성 코치마크(팝오버 오버레이).
  describe('딥 기능 발견성 코치마크', () => {
    // 가장 싼 축사(닭 600G)를 살 골드가 처음 생겨 '동물' 기능이 가용해진 상태. 데일리 보너스는
    // 오늘 이미 수령한 것으로 두어 로드 시 보너스 시트 자동 팝업이 코치마크를 가리지 않게 한다.
    function animalsUnlockedState(): GameState {
      return {
        ...createInitialState(),
        gold: 600,
        harvestNotificationPromptSeen: true,
        // 방금 수령한 것으로 두어(현재 활성 시계 기준) 로드 시 데일리 보너스 자동 팝업이
        // 코치마크를 가리지 않게 한다.
        dailyBonusState: { lastClaimedAt: Date.now(), streak: 1 },
      };
    }

    test('기능이 처음 가용해지면 코치마크가 1회 노출되고, 확인하면 저장 상태에 기록된다', async () => {
      const messages = getFarmMessages(DEFAULT_LOCALE);
      const screen = await renderGame(animalsUnlockedState());

      // 팝오버 오버레이가 '동물' 코치마크 문구로 노출된다.
      const card = await waitFor(() => screen.getByTestId('feature-coachmark-card'));
      expect(within(card).getByText(messages.featureCoachmarkAnimalsTitle)).toBeTruthy();

      // '나중에'로 확인 → 오버레이가 사라지고 저장 상태에 animals가 확인됨으로 기록된다.
      await act(async () => {
        fireEvent.press(screen.getByTestId('feature-coachmark-dismiss'));
      });
      await waitFor(() => expect(screen.queryByTestId('feature-coachmark-card')).toBeNull());
      await waitFor(() => expect(getLatestPersistedState().seenFeatureCoachmarks).toContain('animals'));
    });

    test('이미 확인한 코치마크는 저장 상태로 재개해도 재노출되지 않는다', async () => {
      // animals가 가용하지만 이미 확인된 저장 상태(재개 시나리오).
      const resumed = await renderGame({
        ...animalsUnlockedState(),
        seenFeatureCoachmarks: ['animals'],
      });
      await waitFor(() => expect(resumed.getByText('600G')).toBeTruthy());
      expect(resumed.queryByTestId('feature-coachmark-card')).toBeNull();
    });

    test("'보러가기'는 해당 기능 시트를 열고 코치마크를 확인 처리한다", async () => {
      const screen = await renderGame(animalsUnlockedState());
      await waitFor(() => screen.getByTestId('feature-coachmark-card'));

      await act(async () => {
        fireEvent.press(screen.getByTestId('feature-coachmark-open'));
      });

      // 동물 시트가 열리고, 코치마크는 확인됨으로 저장된다.
      await waitFor(() => expect(screen.getByTestId('animals-sheet')).toBeTruthy());
      await waitFor(() => expect(getLatestPersistedState().seenFeatureCoachmarks).toContain('animals'));
    });

    test('코치마크는 팝오버 오버레이로만 노출되고 상시 HUD/툴스트립에 상시 요소를 더하지 않는다 (AC-3)', async () => {
      const screen = await renderGame(animalsUnlockedState());

      // 팝오버 오버레이(Modal 백드롭)로 노출된다.
      await waitFor(() => expect(screen.getByTestId('feature-coachmark-overlay')).toBeTruthy());
      // 상시 툴스트립 안에는 코치마크 요소가 없다 — 오버레이는 화면 위 한 뎁스 뒤에 있다.
      expect(within(screen.getByTestId('tool-strip')).queryByTestId('feature-coachmark-card')).toBeNull();
      // 상시 내비 행(더보기 진입점 포함)에도 코치마크 요소가 없다.
      const navRow = screen.getByTestId('more-nav-button').parent!;
      expect(within(navRow).queryByTestId('feature-coachmark-card')).toBeNull();

      // 확인해 닫으면 화면 어디에도 코치마크 잔상이 남지 않는다(상시 요소가 아님).
      await act(async () => {
        fireEvent.press(screen.getByTestId('feature-coachmark-dismiss'));
      });
      await waitFor(() => expect(screen.queryByTestId('feature-coachmark-overlay')).toBeNull());
      expect(screen.queryByTestId('feature-coachmark-card')).toBeNull();
    });

    test('온보딩이 끝나지 않은 신규 플레이어에게는 코치마크가 뜨지 않는다', async () => {
      const screen = await renderGame(
        { ...animalsUnlockedState(), onboardingCompleted: false, onboardingStep: 'selectSeed' },
        {},
        null,
        { preserveOnboarding: true }
      );
      await waitFor(() => expect(screen.getByTestId('onboarding-coachmark')).toBeTruthy());
      expect(screen.queryByTestId('feature-coachmark-card')).toBeNull();
    });
  });
});
