/// <reference types="jest" />

import React from 'react';
import { StyleSheet } from 'react-native';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react-native';

import {
  ACHIEVEMENT_TRACKS,
  ANIMALS,
  COLLECTION_AREA_REWARDS,
  DEFAULT_LOCALE,
  FARM_AREAS,
  MASTERY_RANKS,
  PRESTIGE_STARS_BASE,
  PRESTIGE_SKILLS,
  PRODUCTION_RECIPES,
  claimAllAchievements,
  createInitialState,
  formatMoney,
  formatHourlyGold,
  formatRemainingTime,
  formatSignedPercent,
  getAreaCropKeys,
  getAreaUnlockRequirementText,
  getAchievementThreshold,
  getCollectionSummary,
  getMasteryRankLabel,
  getMasteryThresholds,
  getMutationCollectionSummary,
  getMutationLabel,
  getCropLabel,
  getChainIncome,
  isAreaUnlocked,
  getPrestigeSkillLabel,
  getResearchNodeLabel,
  getPrestigeCost,
  getRewardedGoldAmount,
  getSkillLevel,
  getWheelSlotGold,
  getWheelSlotReward,
  getResetDayIndex,
  getResetDayStart,
  MUTATION_KINDS,
  prestigeFarm,
  WHEEL_SLOTS,
  type GameState,
} from '../../../../../packages/farm-core/src';
import { getFarmMessages } from '../../../../../packages/farm-ui/src';
import {
  CollectionSheet,
  COLLECTION_CELL_WIDTH,
  styles as collectionStyles,
} from '../../../../../packages/farm-ui/src/components/CollectionSheet';
import { StatsSheet } from '../../../../../packages/farm-ui/src/components/StatsSheet';
import { AchievementsSheet } from '../../../../../packages/farm-ui/src/components/AchievementsSheet';
import { LabSheet } from '../../../../../packages/farm-ui/src/components/LabSheet';
import { ChainMapSheet, PrestigeConfirmSheet } from '../../../../../packages/farm-ui/src/components/ChainMapSheet';
import { WheelSheet } from '../../../../../packages/farm-ui/src/components/WheelSheet';
import { AnimalsSheet } from '../../../../../packages/farm-ui/src/components/AnimalsSheet';
import { WorkshopSheet } from '../../../../../packages/farm-ui/src/components/WorkshopSheet';
import { MissionsSheet } from '../../../../../packages/farm-ui/src/components/MissionsSheet';

const LOCALE = DEFAULT_LOCALE;
const messages = getFarmMessages(LOCALE);
const NOW = Date.parse('2026-05-27T03:00:00.000Z');

afterEach(cleanup);

describe('diversified mission availability (#378)', () => {
  const renderMissions = (gameState: GameState) => (
    <MissionsSheet
      gameState={gameState}
      locale={LOCALE}
      messages={messages}
      now={NOW}
      adSupported
      onClaim={jest.fn()}
      onClaimWeekly={jest.fn()}
    />
  );

  test('기존 MissionsSheet에서만 해금된 동물·공방·교배 목표를 노출한다', () => {
    const base = createInitialState();
    const screen = render(renderMissions(base));

    expect(screen.getAllByText(/골드 .*G 사용하기/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/동물 산출물/)).toBeNull();
    expect(screen.queryByText(/가공품/)).toBeNull();
    expect(screen.queryByText(/새 품종/)).toBeNull();

    const unlocked: GameState = {
      ...base,
      lifetimeStats: { ...base.lifetimeStats, totalHarvests: 1 },
      animals: { ...base.animals, owned: [ANIMALS[0]!.key] },
      research: { ...base.research, unlockedNodes: ['breeding_lab'] },
    };
    screen.rerender(renderMissions(unlocked));

    expect(screen.getAllByText(/동물 산출물/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/가공품/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/새 품종/).length).toBeGreaterThan(0);
  });
});

describe('ready output batch actions', () => {
  function withReadyAnimals(count: number): GameState {
    const base = createInitialState();
    const ready = ANIMALS.slice(0, count);
    return {
      ...base,
      animals: {
        owned: ready.map((animal) => animal.key),
        feeding: Object.fromEntries(ready.map((animal) => [animal.key, NOW - animal.produceTimerMs])),
      },
    };
  }

  function withReadyCrafts(count: number): GameState {
    const base = createInitialState();
    const ready = PRODUCTION_RECIPES.slice(0, count);
    return {
      ...base,
      production: {
        ...base.production,
        crafting: Object.fromEntries(ready.map((recipe) => [recipe.key, NOW - recipe.timerMs])),
      },
    };
  }

  test('ranch shows collect-all only for at least two ready animals', () => {
    const onCollect = jest.fn();
    const onCollectAll = jest.fn();
    const renderSheet = (state: GameState) => (
      <AnimalsSheet
        gameState={state}
        locale={LOCALE}
        messages={messages}
        now={NOW}
        onPurchase={jest.fn()}
        onFeed={jest.fn()}
        onCollect={onCollect}
        onCollectAll={onCollectAll}
      />
    );
    const screen = render(renderSheet(withReadyAnimals(1)));

    expect(screen.queryByTestId('animals-collect-all-action')).toBeNull();
    expect(screen.getByText(messages.animalsCollectAction(formatMoney(ANIMALS[0]!.producePrice, LOCALE)))).toBeTruthy();

    screen.rerender(renderSheet(withReadyAnimals(2)));
    const action = screen.getByTestId('animals-collect-all-action');
    expect(action.props.accessibilityLabel).toBe(messages.animalsCollectAllAction(2));
    fireEvent.press(action);
    expect(onCollectAll).toHaveBeenCalledTimes(1);
  });

  test('workshop shows collect-all only for at least two completed crafts', () => {
    const onCollectAll = jest.fn();
    const renderSheet = (state: GameState) => (
      <WorkshopSheet
        gameState={state}
        locale={LOCALE}
        messages={messages}
        now={NOW}
        getCropName={(cropKey) => getCropLabel(cropKey, LOCALE).name}
        onStart={jest.fn()}
        onCancel={jest.fn()}
        onCollect={jest.fn()}
        onCollectAll={onCollectAll}
      />
    );
    const screen = render(renderSheet(withReadyCrafts(1)));

    expect(screen.queryByTestId('workshop-collect-all-action')).toBeNull();
    expect(
      screen.getByText(messages.workshopCollectAction(formatMoney(PRODUCTION_RECIPES[0]!.sellPrice, LOCALE)))
    ).toBeTruthy();

    screen.rerender(renderSheet(withReadyCrafts(2)));
    const action = screen.getByTestId('workshop-collect-all-action');
    expect(action.props.accessibilityLabel).toBe(messages.workshopCollectAllAction(2));
    fireEvent.press(action);
    expect(onCollectAll).toHaveBeenCalledTimes(1);
  });

  test('workshop shows a secondary cancel action only while crafting', () => {
    const recipe = PRODUCTION_RECIPES[0]!;
    const base = createInitialState();
    const onCancel = jest.fn();
    const renderSheet = (startedAt: number) => (
      <WorkshopSheet
        gameState={{
          ...base,
          production: { ...base.production, crafting: { [recipe.key]: startedAt } },
        }}
        locale={LOCALE}
        messages={messages}
        now={NOW}
        getCropName={(cropKey) => getCropLabel(cropKey, LOCALE).name}
        onStart={jest.fn()}
        onCancel={onCancel}
        onCollect={jest.fn()}
        onCollectAll={jest.fn()}
      />
    );
    const screen = render(renderSheet(NOW));

    const cancel = screen.getByTestId(`workshop-cancel-${recipe.key}`);
    expect(cancel.props.accessibilityLabel).toBe(messages.workshopCancelAction);
    expect(StyleSheet.flatten(cancel.props.style).backgroundColor).toBe('#edf2f7');
    fireEvent.press(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledWith(recipe.key);

    screen.rerender(renderSheet(NOW - recipe.timerMs));
    expect(screen.queryByTestId(`workshop-cancel-${recipe.key}`)).toBeNull();
    expect(screen.getByText(messages.workshopCollectAction(formatMoney(recipe.sellPrice, LOCALE)))).toBeTruthy();
  });
});

describe('CollectionSheet', () => {
  test('renders areas and shows undiscovered crops as locked placeholders', () => {
    const state = createInitialState();
    const screen = render(
      <CollectionSheet
        gameState={state}
        locale={LOCALE}
        messages={messages}
        collectionSummary={getCollectionSummary(state)}
        onClaimReward={jest.fn()}
      />
    );

    expect(screen.getByTestId('collection-sheet')).toBeTruthy();
    // 초기 상태에서는 발견한 작물이 없어 ??? 플레이스홀더만 노출된다.
    expect(screen.getAllByText('???').length).toBeGreaterThan(0);
  });

  test.each(['ko-KR', 'en-US'] as const)(
    'shows the mutation collection total from the core summary in %s',
    (locale) => {
      const base = createInitialState();
      const state: GameState = {
        ...base,
        mutationsDiscovered: {
          carrot: ['golden', 'rainbow'],
          wheat: ['giant'],
        },
      };
      const localeMessages = getFarmMessages(locale);
      const mutationSummary = getMutationCollectionSummary(state);
      const screen = render(
        <CollectionSheet
          gameState={state}
          locale={locale}
          messages={localeMessages}
          collectionSummary={getCollectionSummary(state)}
          onClaimReward={jest.fn()}
        />
      );

      expect(screen.getByTestId('collection-mutation-progress')).toHaveTextContent(
        localeMessages.collectionMutationProgress(
          mutationSummary.discoveredCount,
          mutationSummary.totalCount,
        )
      );
    }
  );

  test('mutation badge row fits inside the crop card and the card clips overflow (UI 깨짐 회귀 방지)', () => {
    // 각 작물 카드 하단 돌연변이 배지 행(MUTATION_KINDS 슬롯)이 카드 폭을 넘어 UI가
    // 깨지던 문제의 회귀 방지. 시각 렌더는 헤드리스로 검증 못 하므로 레이아웃 불변식을 고정한다.
    const cell = StyleSheet.flatten(collectionStyles.collectionCell);
    const mutationRow = StyleSheet.flatten(collectionStyles.mutationRow);
    const mutationCell = StyleSheet.flatten(collectionStyles.mutationCell);
    const mutationIcon = StyleSheet.flatten(collectionStyles.mutationCellIcon);

    const paddingH = cell.paddingHorizontal as number;
    const gap = mutationRow.gap as number;
    const cellSize = mutationCell.width as number;
    const contentWidth = COLLECTION_CELL_WIDTH - paddingH * 2;

    // 4개(현재) 배지 + 갭이 카드 가용폭 안에 들어와야 한다.
    const rowWidth = MUTATION_KINDS.length * cellSize + (MUTATION_KINDS.length - 1) * gap;
    expect(rowWidth).toBeLessThanOrEqual(contentWidth);

    // 카드가 초과분을 클리핑해 어떤 경우에도 박스 밖으로 튀어나가지 않는다(안전망).
    expect(cell.overflow).toBe('hidden');

    // 배지 글리프가 셀 안에서 세로로 넘치지 않도록 lineHeight >= fontSize, 셀 높이 이하.
    const fontSize = mutationIcon.fontSize as number;
    const lineHeight = mutationIcon.lineHeight as number;
    expect(lineHeight).toBeGreaterThanOrEqual(fontSize);
    expect(lineHeight).toBeLessThanOrEqual(mutationCell.height as number);
  });

  test('shows an unlock-condition hint on locked areas and none on unlocked ones (#228)', () => {
    const state = createInitialState();
    const lockedArea = FARM_AREAS.find((area) => !isAreaUnlocked(state, area.key))!;
    const unlockedArea = FARM_AREAS.find((area) => isAreaUnlocked(state, area.key))!;
    expect(lockedArea).toBeDefined();
    expect(unlockedArea).toBeDefined();

    const screen = render(
      <CollectionSheet
        gameState={state}
        locale={LOCALE}
        messages={messages}
        collectionSummary={getCollectionSummary(state)}
        onClaimReward={jest.fn()}
      />
    );

    // 잠긴 구역: 힌트가 노출되고, 문구는 씨앗 스트립과 동일한 순수 함수 결과를 담는다.
    const hint = screen.getByTestId(`collection-unlock-hint-${lockedArea.key}`);
    expect(hint).toBeTruthy();
    const expectedText = messages.collectionUnlockHint(getAreaUnlockRequirementText(state, lockedArea.key, LOCALE));
    expect(screen.getByText(expectedText)).toBeTruthy();

    // 해금된 구역: 힌트가 노출되지 않는다.
    expect(screen.queryByTestId(`collection-unlock-hint-${unlockedArea.key}`)).toBeNull();
  });

  test('renders the unlock hint in en-US too (#228)', () => {
    const enMessages = getFarmMessages('en-US');
    const state = createInitialState();
    const lockedArea = FARM_AREAS.find((area) => !isAreaUnlocked(state, area.key))!;

    const screen = render(
      <CollectionSheet
        gameState={state}
        locale="en-US"
        messages={enMessages}
        collectionSummary={getCollectionSummary(state)}
        onClaimReward={jest.fn()}
      />
    );

    const expectedText = enMessages.collectionUnlockHint(getAreaUnlockRequirementText(state, lockedArea.key, 'en-US'));
    expect(screen.getByText(expectedText)).toBeTruthy();
    expect(expectedText).toContain('Unlock');
  });

  // #253: 발견한 작물 셀 탭 → 플레이버 상세 팝업. Pressable+Modal 분기(셀 탭, 미발견
  // 비활성, 닫기 경로)를 데이터가 아닌 UI 동작으로 회귀 고정한다.
  function renderDiscovered(
    locale: typeof LOCALE | 'en-US',
    localeMessages = getFarmMessages(locale),
    overrides: Partial<GameState> = {},
  ) {
    const base = createInitialState();
    // carrot을 발견 상태로 만들어 상시 해금된 초보 밭 셀이 활성화되도록 한다.
    const state: GameState = { ...base, harvestedCropKeys: ['carrot'], ...overrides };
    return render(
      <CollectionSheet
        gameState={state}
        locale={locale}
        messages={localeMessages}
        collectionSummary={getCollectionSummary(state)}
        onClaimReward={jest.fn()}
      />
    );
  }

  test('발견 셀을 탭하면 아이콘·이름·판매가·설명 상세 팝업이 열린다 (#253)', () => {
    const screen = renderDiscovered(LOCALE);
    // 탭 전에는 팝업이 없다.
    expect(screen.queryByTestId('collection-detail-card')).toBeNull();

    fireEvent.press(screen.getByTestId('collection-cell-carrot'));

    expect(screen.getByTestId('collection-detail-card')).toBeTruthy();
    // 설명은 데이터 계약과 동일한 카탈로그 값이 노출된다.
    expect(screen.getByText(getCropLabel('carrot', LOCALE).description)).toBeTruthy();
  });

  test('미발견 셀은 disabled라 탭해도 팝업이 열리지 않는다 (#253)', () => {
    const screen = renderDiscovered(LOCALE);
    // 초기 미발견 작물 하나를 골라(예: wheat) 잠금·비활성 상태를 확인한다.
    const lockedCell = screen.getByTestId('collection-cell-wheat');
    expect(lockedCell).toBeDisabled();

    fireEvent.press(lockedCell);
    expect(screen.queryByTestId('collection-detail-card')).toBeNull();
  });

  test('상세 팝업은 닫기 액션과 배경 탭으로 닫힌다 (#253)', () => {
    const screen = renderDiscovered(LOCALE);

    // 닫기 SheetAction 경로.
    fireEvent.press(screen.getByTestId('collection-cell-carrot'));
    expect(screen.getByTestId('collection-detail-card')).toBeTruthy();
    fireEvent.press(screen.getByText(messages.collectionDetailCloseAction));
    expect(screen.queryByTestId('collection-detail-card')).toBeNull();

    // 배경(백드롭) 탭 경로.
    fireEvent.press(screen.getByTestId('collection-cell-carrot'));
    expect(screen.getByTestId('collection-detail-card')).toBeTruthy();
    fireEvent.press(screen.getByTestId('collection-detail-backdrop'));
    expect(screen.queryByTestId('collection-detail-card')).toBeNull();
  });

  test('상세 팝업 설명이 en-US로 현지화된다 (#253)', () => {
    const enMessages = getFarmMessages('en-US');
    const screen = renderDiscovered('en-US', enMessages);
    fireEvent.press(screen.getByTestId('collection-cell-carrot'));
    expect(screen.getByText(getCropLabel('carrot', 'en-US').description)).toBeTruthy();
  });

  test.each(['ko-KR', 'en-US'] as const)(
    '상세 팝업에 마스터리 혜택과 돌연변이 도감을 상태와 함께 표시한다 (%s) (#307)',
    (locale) => {
      const localeMessages = getFarmMessages(locale);
      const goldRankIndex = MASTERY_RANKS.findIndex((rank) => rank.key === 'gold');
      const goldThreshold = getMasteryThresholds('carrot')[goldRankIndex]!;
      const screen = renderDiscovered(locale, localeMessages, {
        harvestCounts: { carrot: goldThreshold },
        mutationsDiscovered: { carrot: ['golden', 'giant'] },
      });

      fireEvent.press(screen.getByTestId('collection-cell-carrot'));

      expect(screen.getByTestId('collection-detail-scroll')).toBeTruthy();
      expect(screen.getByText(localeMessages.collectionMasteryBenefitsTitle)).toBeTruthy();
      expect(screen.getByText(localeMessages.collectionMutationCatalogTitle)).toBeTruthy();

      for (const rank of MASTERY_RANKS) {
        const row = screen.getByTestId(`collection-mastery-rank-${rank.key}`);
        const rankName = getMasteryRankLabel(rank.key, locale).name;
        const benefit = localeMessages.collectionMasteryBenefit(
          formatSignedPercent(rank.sellBonus * 100, locale),
          formatSignedPercent(rank.speedBonus * 100, locale),
        );
        expect(within(row).getByText(rankName)).toBeTruthy();
        expect(within(row).getByText(benefit).props.numberOfLines).toBe(2);
        expect(row.props.accessible).toBe(true);
        expect(row.props.accessibilityState.selected).toBe(rank.key === 'gold');
      }

      for (const kind of MUTATION_KINDS) {
        const row = screen.getByTestId(`collection-mutation-kind-${kind.key}`);
        const mutationName = getMutationLabel(kind.key, locale).name;
        const benefit = localeMessages.collectionMutationBenefit(
          kind.sellMultiplier.toLocaleString(locale),
          getMasteryRankLabel(kind.minRank, locale).name,
        );
        const discovered = kind.key === 'golden' || kind.key === 'giant';
        expect(within(row).getByText(mutationName)).toBeTruthy();
        expect(within(row).getByText(benefit).props.numberOfLines).toBe(2);
        expect(row.props.accessible).toBe(true);
        expect(
          within(row).getByText(
            discovered
              ? localeMessages.collectionMutationDiscoveredBadge
              : localeMessages.collectionMutationUndiscoveredBadge,
          ),
        ).toBeTruthy();
      }
    },
  );

  test('랭크 미달 작물은 어떤 마스터리 행도 현재로 표시하지 않는다 (#307)', () => {
    const screen = renderDiscovered(LOCALE, messages, { harvestCounts: { carrot: 1 } });
    fireEvent.press(screen.getByTestId('collection-cell-carrot'));

    for (const rank of MASTERY_RANKS) {
      expect(screen.getByTestId(`collection-mastery-rank-${rank.key}`).props.accessibilityState.selected).toBe(false);
    }
  });

  test('상세 카드는 작은 화면에서 높이를 제한하고 내부 정보를 스크롤한다 (#307)', () => {
    const card = StyleSheet.flatten(collectionStyles.detailCard);
    const scroll = StyleSheet.flatten(collectionStyles.detailScroll);

    expect(card.maxHeight).toBe('86%');
    expect(scroll.width).toBe('100%');
    expect(scroll.flexShrink).toBe(1);
  });

  test('claims an area reward once every crop in that area is discovered', () => {
    const area = FARM_AREAS[0]!;
    const state: GameState = { ...createInitialState(), harvestedCropKeys: getAreaCropKeys(area.key) };
    const onClaimReward = jest.fn();
    const screen = render(
      <CollectionSheet
        gameState={state}
        locale={LOCALE}
        messages={messages}
        collectionSummary={getCollectionSummary(state)}
        onClaimReward={onClaimReward}
      />
    );

    const claimLabel = messages.collectionClaimAction(formatMoney(COLLECTION_AREA_REWARDS[area.key]!, LOCALE));
    fireEvent.press(screen.getByText(claimLabel));
    expect(onClaimReward).toHaveBeenCalledWith(area.key);
  });
});

// #233: 상단 HUD에서 옮겨온 보조 지표 시트. 부스트 활성/비활성, 주말 축제 라이브/티저
// 분기와 배수 표기를 표시 전용 계약으로 고정한다.
describe('StatsSheet', () => {
  const HOUR_MS = 60 * 60 * 1000;
  const offlineIncomeProps = {
    offlineGoldPerHour: 0,
    offlineIncomeCapMs: 24 * HOUR_MS,
  };
  // 헤더에서 강등해 온 보조 지표(#355) 기본값. 개별 케이스가 필요 시 override 한다.
  const demotedHeaderProps = {
    cropOfTheDayIcon: '🥕',
    cropOfTheDayName: '당근',
    cropOfTheDayMultiplier: 2,
    activeTitleName: null,
    prestigeStars: 0,
    purchasableSkillCount: 0,
  };
  const initialState = createInitialState();
  const initialCollection = getCollectionSummary(initialState);
  const emptyFarmRecords = {
    totalHarvests: initialState.lifetimeStats.totalHarvests,
    cropAndIdleGoldEarned: initialState.lifetimeStats.totalGoldEarned,
    mutationHarvests: initialState.lifetimeStats.mutationsFound,
    prestigeCount: initialState.lifetimeStats.prestigeCount,
    researchPointsEarned: initialState.research.totalPointsEarned,
    breedsUnlocked: initialState.lifetimeStats.breedsUnlocked,
    collectionDiscoveredCount: initialCollection.discoveredCount,
    collectionTotalCount: initialCollection.totalCount,
  };

  test('renders research/profit/growth stats and the boost as active with a remaining time', () => {
    const screen = render(
      <StatsSheet
        {...demotedHeaderProps}
        {...offlineIncomeProps}
        offlineGoldPerHour={1_234_567}
        messages={messages}
        locale={LOCALE}
        researchLevel={4}
        profitMultiplier={1.3}
        speedMultiplier={1.7}
        boostActive
        boostMultiplier={1.5}
        boostRemainingMs={30 * 60 * 1000}
        weeklyEventActive={false}
        weeklyEventAreaName={'초보 농장'}
        weeklyEventMultiplier={1}
        weeklyEventAxis={'sell'}
        weeklyEventTypeKey="sale"
        weeklyEventRemainingMs={2 * HOUR_MS}
        farmRecords={emptyFarmRecords}
      />
    );

    expect(screen.getByTestId('stats-sheet')).toBeTruthy();
    // 연구 배지는 헤더에서 쓰던 것과 동일한 키를 재사용한다.
    expect(screen.getByText(messages.researchBadge(4))).toBeTruthy();
    expect(screen.getByText(messages.profitLabel)).toBeTruthy();
    expect(screen.getByText('×1.3')).toBeTruthy();
    expect(screen.getByText(messages.growthLabel)).toBeTruthy();
    expect(screen.getByText('×1.7')).toBeTruthy();
    // 부스트 배수는 별도 값으로 표기된다.
    expect(screen.getByText('×1.5')).toBeTruthy();
    // 부스트 활성: 배수 + 잔여시간 표기(잔여시간 testID는 헤더에서 옮겨온 것과 동일).
    expect(screen.getByText(messages.boostLabel)).toBeTruthy();
    expect(screen.getByTestId('boost-remaining')).toHaveTextContent(/^[1-9]/);
    expect(screen.getByText(messages.statsOfflineIncomeLabel)).toBeTruthy();
    expect(screen.getByTestId('stats-offline-income')).toHaveTextContent(
      formatHourlyGold(1_234_567, LOCALE)
    );
    expect(screen.getByTestId('stats-offline-income-cap')).toHaveTextContent(
      messages.statsOfflineIncomeCap('24시간')
    );
    // 축제 비활성 요일: 티저가 노출되고 라이브 배너는 없다.
    expect(screen.getByTestId('weekly-event-teaser')).toBeTruthy();
    expect(screen.queryByTestId('weekly-event-banner')).toBeNull();
    expect(screen.getByTestId('farm-records-section')).toBeTruthy();
    expect(screen.getByText(messages.statsRecordsSection).props.accessibilityRole).toBe('header');
    expect(screen.getByTestId('stats-record-total-harvests')).toHaveTextContent('0');
    expect(screen.getByTestId('stats-record-crop-idle-gold')).toHaveTextContent('0G');
    expect(screen.getByTestId('stats-record-mutation-harvests')).toHaveTextContent('0');
    expect(screen.getByTestId('stats-record-prestige-count')).toHaveTextContent('0');
    expect(screen.getByTestId('stats-record-research-points')).toHaveTextContent('0 RP');
    expect(screen.getByTestId('stats-record-breeds-unlocked')).toHaveTextContent('0');
    expect(screen.getByTestId('stats-record-collection-discovered')).toHaveTextContent(
      `0 / ${initialCollection.totalCount}`
    );
  });

  test('shows today weather and its localized economy effect in the existing stats sheet', () => {
    const screen = render(
      <StatsSheet
        {...offlineIncomeProps}
        {...demotedHeaderProps}
        messages={messages}
        locale={LOCALE}
        researchLevel={0}
        profitMultiplier={1}
        speedMultiplier={1.08}
        boostActive={false}
        boostMultiplier={1}
        boostRemainingMs={0}
        weather={{
          key: 'rain',
          icon: '🌧️',
          weight: 25,
          axis: 'speed',
          multiplier: 1.08,
          precipitation: 'rain',
          windowStartAt: 0,
          windowEndAt: 24 * HOUR_MS,
        }}
        weatherRemainingMs={2 * HOUR_MS}
        weeklyEventActive={false}
        weeklyEventAreaName="초보 농장"
        weeklyEventMultiplier={1}
        weeklyEventAxis="sell"
        weeklyEventTypeKey="sale"
        weeklyEventRemainingMs={HOUR_MS}
        farmRecords={emptyFarmRecords}
      />
    );

    expect(screen.getByTestId('weather-status-title')).toHaveTextContent(`🌧️ ${messages.weatherSection}`);
    expect(screen.getByTestId('weather-status-banner')).toHaveTextContent(
      messages.weatherDesc(
        messages.weatherRainLabel,
        messages.weatherSpeedBonus(1.08),
        formatRemainingTime(2 * HOUR_MS, LOCALE)
      )
    );
  });

  test('shows the boost row as inactive and the festival banner when a festival is live', () => {
    const screen = render(
      <StatsSheet
        {...demotedHeaderProps}
        {...offlineIncomeProps}
        messages={messages}
        locale={LOCALE}
        researchLevel={0}
        profitMultiplier={1}
        speedMultiplier={1}
        boostActive={false}
        boostMultiplier={1}
        boostRemainingMs={0}
        weeklyEventActive
        weeklyEventAreaName={'초보 농장'}
        weeklyEventMultiplier={1.5}
        weeklyEventAxis={'sell'}
        weeklyEventTypeKey="sale"
        weeklyEventRemainingMs={5 * HOUR_MS}
        farmRecords={emptyFarmRecords}
      />
    );

    // 부스트 비활성: '현재 비활성' 문구가 뜨고 잔여시간 요소는 없다.
    expect(screen.getByText(messages.statsBoostInactive)).toBeTruthy();
    expect(screen.queryByTestId('boost-remaining')).toBeNull();
    expect(screen.getByTestId('stats-offline-income')).toHaveTextContent(formatHourlyGold(0, LOCALE));
    // 축제 라이브(판매 종류): 판매 배수 문구 배너가 노출되고 티저는 없다.
    const saleBanner = screen.getByTestId('weekly-event-banner');
    expect(saleBanner).toHaveTextContent(/판매/);
    expect(saleBanner).not.toHaveTextContent(/성장속도/);
    expect(screen.queryByTestId('weekly-event-teaser')).toBeNull();
  });

  test('distinguishes the golden sell flavor in live and teaser copy with an axis fallback', () => {
    const renderFestival = (active: boolean, typeKey: string, axis: 'sell' | 'speed', remainingMs: number) => (
      <StatsSheet
        {...demotedHeaderProps}
        {...offlineIncomeProps}
        messages={messages}
        locale={LOCALE}
        researchLevel={0}
        profitMultiplier={1}
        speedMultiplier={1}
        boostActive={false}
        boostMultiplier={1}
        boostRemainingMs={0}
        weeklyEventActive={active}
        weeklyEventAreaName="초보 농장"
        weeklyEventMultiplier={active ? 1.5 : 1}
        weeklyEventAxis={axis}
        weeklyEventTypeKey={typeKey}
        weeklyEventRemainingMs={remainingMs}
        farmRecords={emptyFarmRecords}
      />
    );

    const screen = render(renderFestival(true, 'golden_sale', 'sell', 5 * HOUR_MS));
    expect(screen.getByTestId('weekly-event-title')).toHaveTextContent(
      `🪙 ${messages.weeklyEventGoldenLabel}`,
    );
    expect(screen.getByTestId('weekly-event-banner')).toHaveTextContent(
      messages.weeklyEventGoldenDesc('초보 농장', 1.5, formatRemainingTime(5 * HOUR_MS, LOCALE)),
    );

    screen.rerender(renderFestival(false, 'golden_sale', 'sell', 2 * HOUR_MS));
    expect(screen.getByTestId('weekly-event-title')).toHaveTextContent(
      `🪙 ${messages.weeklyEventGoldenTeaserLabel}`,
    );
    expect(screen.getByTestId('weekly-event-teaser')).toHaveTextContent(
      messages.weeklyEventGoldenTeaserDesc('초보 농장', formatRemainingTime(2 * HOUR_MS, LOCALE)),
    );

    screen.rerender(renderFestival(true, 'future_speed_type', 'speed', 5 * HOUR_MS));
    expect(screen.getByTestId('weekly-event-title')).toHaveTextContent(`⚡ ${messages.weeklyEventLabel}`);
    expect(screen.getByTestId('weekly-event-banner')).toHaveTextContent(
      messages.weeklyEventHarvestDesc('초보 농장', 1.5, formatRemainingTime(5 * HOUR_MS, LOCALE)),
    );
  });

  test('shows the harvest (speed) festival copy when the live event is a harvest type (#243)', () => {
    const screen = render(
      <StatsSheet
        {...demotedHeaderProps}
        {...offlineIncomeProps}
        messages={messages}
        locale={LOCALE}
        researchLevel={0}
        profitMultiplier={1}
        speedMultiplier={1}
        boostActive={false}
        boostMultiplier={1}
        boostRemainingMs={0}
        weeklyEventActive
        weeklyEventAreaName={'초보 농장'}
        weeklyEventMultiplier={1.5}
        weeklyEventAxis={'speed'}
        weeklyEventTypeKey="harvest"
        weeklyEventRemainingMs={5 * HOUR_MS}
        farmRecords={emptyFarmRecords}
      />
    );

    // 수확 축제: 판매가 아니라 성장속도 배수를 강조하는 문구가 나온다.
    const harvestBanner = screen.getByTestId('weekly-event-banner');
    expect(harvestBanner).toHaveTextContent(/성장속도/);
    expect(harvestBanner).not.toHaveTextContent(/판매/);
  });

  test('localizes stats content in en-US', () => {
    const enMessages = getFarmMessages('en-US');
    const screen = render(
      <StatsSheet
        {...demotedHeaderProps}
        {...offlineIncomeProps}
        offlineGoldPerHour={1_234}
        messages={enMessages}
        locale="en-US"
        researchLevel={2}
        profitMultiplier={1}
        speedMultiplier={1}
        boostActive={false}
        boostMultiplier={1}
        boostRemainingMs={0}
        weeklyEventActive={false}
        weeklyEventAreaName={'Starter Farm'}
        weeklyEventMultiplier={1}
        weeklyEventAxis={'sell'}
        weeklyEventTypeKey="sale"
        weeklyEventRemainingMs={HOUR_MS}
        farmRecords={emptyFarmRecords}
      />
    );

    expect(screen.getByText(enMessages.profitLabel)).toBeTruthy();
    expect(screen.getByText(enMessages.statsBoostInactive)).toBeTruthy();
    expect(enMessages.statsBoostInactive).toBe('Inactive');
    expect(enMessages.statsOfflineIncomeLabel).toBe('Active farm offline income');
    expect(screen.getByTestId('stats-offline-income')).toHaveTextContent(formatHourlyGold(1_234, 'en-US'));
    expect(screen.getByTestId('stats-offline-income-cap')).toHaveTextContent(
      enMessages.statsOfflineIncomeCap('24h')
    );
  });

  test('formats large farm records in en-US and uses the live research total', () => {
    const enMessages = getFarmMessages('en-US');
    const lifetimeStats = {
      totalHarvests: 1_234_567,
      totalGoldEarned: 1_234_567_890,
      mutationsFound: 2_345,
      prestigeCount: 12,
      researchPointsEarned: 1,
      breedsUnlocked: 8,
    };
    const screen = render(
      <StatsSheet
        {...demotedHeaderProps}
        {...offlineIncomeProps}
        messages={enMessages}
        locale="en-US"
        researchLevel={9}
        profitMultiplier={123.4}
        speedMultiplier={2.5}
        boostActive={false}
        boostMultiplier={1}
        boostRemainingMs={0}
        weeklyEventActive={false}
        weeklyEventAreaName="Starter Farm"
        weeklyEventMultiplier={1}
        weeklyEventAxis="sell"
        weeklyEventTypeKey="sale"
        weeklyEventRemainingMs={HOUR_MS}
        farmRecords={{
          totalHarvests: lifetimeStats.totalHarvests,
          cropAndIdleGoldEarned: lifetimeStats.totalGoldEarned,
          mutationHarvests: lifetimeStats.mutationsFound,
          prestigeCount: lifetimeStats.prestigeCount,
          researchPointsEarned: 987_654,
          breedsUnlocked: lifetimeStats.breedsUnlocked,
          collectionDiscoveredCount: 11,
          collectionTotalCount: 28,
        }}
      />
    );

    expect(screen.getByText(enMessages.statsRecordsSection)).toBeTruthy();
    expect(screen.getByText(enMessages.statsCropIdleGoldLabel)).toBeTruthy();
    expect(screen.getByTestId('stats-record-total-harvests')).toHaveTextContent(
      formatMoney(lifetimeStats.totalHarvests, 'en-US')
    );
    expect(screen.getByTestId('stats-record-crop-idle-gold')).toHaveTextContent(
      `${formatMoney(lifetimeStats.totalGoldEarned, 'en-US')}G`
    );
    expect(screen.getByTestId('stats-record-mutation-harvests')).toHaveTextContent(
      formatMoney(lifetimeStats.mutationsFound, 'en-US')
    );
    expect(screen.getByTestId('stats-record-prestige-count')).toHaveTextContent('12');
    expect(screen.getByTestId('stats-record-research-points')).toHaveTextContent(
      `${formatMoney(987_654, 'en-US')} RP`
    );
    expect(screen.getByTestId('stats-record-breeds-unlocked')).toHaveTextContent('8');
    expect(screen.getByTestId('stats-record-collection-discovered')).toHaveTextContent('11 / 28');
  });
});

describe('AchievementsSheet', () => {
  test('renders the track and title sections', () => {
    const state = createInitialState();
    const screen = render(
      <AchievementsSheet
        gameState={state}
        locale={LOCALE}
        messages={messages}
        onClaim={jest.fn()}
        onClaimAll={jest.fn()}
        onSelectTitle={jest.fn()}
      />
    );

    expect(screen.getByText(messages.achievementTracksSection)).toBeTruthy();
    expect(screen.getByText(messages.titlesSection)).toBeTruthy();
    const claimAllAction = screen.getByTestId('achievement-claim-all-action');
    expect(claimAllAction.props.accessibilityLabel).toBe(messages.achievementClaimAllAction(0));
    expect(claimAllAction.props.accessibilityState.disabled).toBe(true);
  });

  test('claims a track reward once its stat passes the next threshold', () => {
    // 누적 스탯 기반(lifetime) 트랙만 골라, 해당 트랙의 스탯을 임계 위로 올려 수령 가능 상태로 만든다.
    const track = ACHIEVEMENT_TRACKS.find((candidate) => candidate.stat != null)!;
    const base = createInitialState();
    const state: GameState = {
      ...base,
      lifetimeStats: { ...base.lifetimeStats, [track.stat!]: Number.MAX_SAFE_INTEGER },
    };
    const onClaim = jest.fn();
    const screen = render(
      <AchievementsSheet
        gameState={state}
        locale={LOCALE}
        messages={messages}
        onClaim={onClaim}
        onClaimAll={jest.fn()}
        onSelectTitle={jest.fn()}
      />
    );

    fireEvent.press(screen.getByText(messages.achievementClaimAction(track.starsPerTier)));
    expect(onClaim).toHaveBeenCalledWith(track.key);
  });

  test('claims every available track and tier from one total-star action', () => {
    const harvestTrack = ACHIEVEMENT_TRACKS.find((track) => track.key === 'harvest_total')!;
    const prestigeTrack = ACHIEVEMENT_TRACKS.find((track) => track.key === 'prestige_pioneer')!;
    const base = createInitialState();
    const state: GameState = {
      ...base,
      lifetimeStats: {
        ...base.lifetimeStats,
        totalHarvests: getAchievementThreshold(harvestTrack, 3),
        prestigeCount: getAchievementThreshold(prestigeTrack, 2),
      },
    };
    const preview = claimAllAchievements(state);
    const onClaimAll = jest.fn();
    const screen = render(
      <AchievementsSheet
        gameState={state}
        locale={LOCALE}
        messages={messages}
        onClaim={jest.fn()}
        onClaimAll={onClaimAll}
        onSelectTitle={jest.fn()}
      />
    );

    const action = screen.getByTestId('achievement-claim-all-action');
    expect(action.props.accessibilityLabel).toBe(messages.achievementClaimAllAction(preview.totalStars));
    expect(action.props.accessibilityState.disabled).toBe(false);
    fireEvent.press(action);
    expect(onClaimAll).toHaveBeenCalledTimes(1);
  });
});

describe('LabSheet', () => {
  test('renders automation, research, and breeding sections', () => {
    const state = createInitialState();
    const screen = render(
      <LabSheet
        gameState={state}
        locale={LOCALE}
        messages={messages}
        onToggleAutomation={jest.fn()}
        onUnlockNode={jest.fn()}
        onBreed={jest.fn()}
      />
    );

    expect(screen.getByText(messages.automationSection)).toBeTruthy();
    expect(screen.getByText(messages.researchNodesSection)).toBeTruthy();
    expect(screen.getByText(messages.automationResearchSection)).toBeTruthy();
    expect(screen.getByText(messages.scalingResearchSection)).toBeTruthy();
    expect(screen.getByText(messages.breedingResearchSection)).toBeTruthy();
    expect(screen.getByText(messages.breedingSection)).toBeTruthy();
  });

  test('shows repeatable scale research level and buys the next tier inside the lab', () => {
    const base = createInitialState();
    const state: GameState = {
      ...base,
      research: {
        ...base.research,
        points: 10_000_000,
        nodeLevels: { donation_amplifier: 1, market_studies: 1 },
        unlockedNodes: ['donation_amplifier', 'market_studies'],
      },
    };
    const onUnlockNode = jest.fn();
    const screen = render(
      <LabSheet
        gameState={state}
        locale={LOCALE}
        messages={messages}
        onToggleAutomation={jest.fn()}
        onUnlockNode={onUnlockNode}
        onBreed={jest.fn()}
      />
    );
    const title = `${getResearchNodeLabel('market_studies', LOCALE).name} · ${messages.researchNodeLevelLabel(1)}`;

    fireEvent.press(screen.getByText(title));
    expect(onUnlockNode).toHaveBeenCalledWith('market_studies');
  });

  test('toggles the always-available donation automation setting', () => {
    const state = createInitialState();
    const onToggleAutomation = jest.fn();
    const screen = render(
      <LabSheet
        gameState={state}
        locale={LOCALE}
        messages={messages}
        onToggleAutomation={onToggleAutomation}
        onUnlockNode={jest.fn()}
        onBreed={jest.fn()}
      />
    );

    fireEvent.press(screen.getByText(messages.donationToggleLabel));
    expect(onToggleAutomation).toHaveBeenCalledWith('donationModeEnabled');
  });
});

describe('ChainMapSheet', () => {
  test('renders the current-farm and skills sections', () => {
    const state = createInitialState();
    const screen = render(
      <ChainMapSheet
        gameState={state}
        locale={LOCALE}
        messages={messages}
        now={NOW}
        onCollectChain={jest.fn()}
        onOpenPrestigeConfirm={jest.fn()}
        onBuySkill={jest.fn()}
      />
    );

    expect(screen.getByText(messages.currentFarmSection)).toBeTruthy();
    expect(screen.getByText(messages.skillsSection)).toBeTruthy();
  });

  test('buys a prestige skill when enough stars are banked', () => {
    const skill = PRESTIGE_SKILLS[0]!;
    const base = createInitialState();
    const state: GameState = { ...base, prestige: { ...base.prestige, stars: 1_000_000_000 } };
    const onBuySkill = jest.fn();
    const screen = render(
      <ChainMapSheet
        gameState={state}
        locale={LOCALE}
        messages={messages}
        now={NOW}
        onCollectChain={jest.fn()}
        onOpenPrestigeConfirm={jest.fn()}
        onBuySkill={onBuySkill}
      />
    );

    const skillTitle = `${skill.icon} ${getPrestigeSkillLabel(skill.key, LOCALE).name} · Lv.${getSkillLevel(state, skill.key)}`;
    fireEvent.press(screen.getByText(skillTitle));
    expect(onBuySkill).toHaveBeenCalledWith(skill.key);
  });
});

describe('PrestigeConfirmSheet', () => {
  test('shows the exact base chain income and next-farm starting gold preview', () => {
    const base = createInitialState();
    const legendCrops = getAreaCropKeys('legend_field');
    const state: GameState = {
      ...base,
      gold: getPrestigeCost(0),
      harvestedCropKeys: [...legendCrops],
      prestige: {
        ...base.prestige,
        skills: { starting_capital: 2, chain_yield: 3 },
      },
    };
    const result = prestigeFarm(state, 'tundra', NOW);
    expect(result).not.toBeNull();
    const onConfirm = jest.fn();
    const screen = render(
      <PrestigeConfirmSheet
        gameState={state}
        locale={LOCALE}
        messages={messages}
        now={NOW}
        selectedArchetype="plains"
        onSelectArchetype={jest.fn()}
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />
    );

    expect(screen.getByText(messages.prestigePreviewSection)).toBeTruthy();
    expect(screen.getByText(formatHourlyGold(result!.chainFarm.goldPerHour, LOCALE))).toBeTruthy();
    expect(
      screen.getByText(formatHourlyGold(getChainIncome(result!.state, NOW).totalGoldPerHour, LOCALE))
    ).toBeTruthy();
    expect(screen.getByText(`${formatMoney(result!.state.gold, LOCALE)}G`)).toBeTruthy();
    expect(screen.getByText(messages.prestigeChainIncomePreviewHint)).toBeTruthy();
    fireEvent.press(screen.getByText(messages.prestigeConfirmAction(PRESTIGE_STARS_BASE)));
    expect(onConfirm).toHaveBeenCalledWith(NOW);

    screen.rerender(
      <PrestigeConfirmSheet
        gameState={state}
        locale={LOCALE}
        messages={messages}
        now={NOW}
        selectedArchetype="tundra"
        onSelectArchetype={jest.fn()}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(screen.getByText(formatHourlyGold(result!.chainFarm.goldPerHour, LOCALE))).toBeTruthy();
    expect(screen.getByText(`${formatMoney(result!.state.gold, LOCALE)}G`)).toBeTruthy();
  });

  test('renders the full English preview copy', () => {
    const base = createInitialState();
    const state: GameState = {
      ...base,
      prestige: { ...base.prestige, skills: { starting_capital: 2, chain_yield: 3 } },
    };
    const englishMessages = getFarmMessages('en-US');
    const screen = render(
      <PrestigeConfirmSheet
        gameState={state}
        locale="en-US"
        messages={englishMessages}
        now={NOW}
        selectedArchetype="plains"
        onSelectArchetype={jest.fn()}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(screen.getByText(englishMessages.prestigeChainIncomePreviewLabel)).toBeTruthy();
    expect(screen.getByText(englishMessages.prestigeEffectiveChainIncomePreviewLabel)).toBeTruthy();
    expect(screen.getByText(englishMessages.prestigeStartingGoldPreviewLabel)).toBeTruthy();
    expect(screen.getByText(englishMessages.prestigeChainIncomePreviewHint)).toBeTruthy();
  });
});

// #208: 데일리 룰렛 스핀 연출. 핵심 계약 — 보상 확정(onSpin)은 탭 즉시, 연출은 순수
// 코스메틱. 연출 중 언마운트(시트 닫힘)에도 보상 유실/이중 지급이 없어야 한다.
describe('WheelSheet', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  // 연출 총 길이(2초) + 여유. 스텝 타이머가 전부 소진되도록 충분히 진행한다.
  const SPIN_SETTLE_MS = 4000;

  function renderWheel(
    state: GameState,
    onSpin: jest.Mock,
    onRevealed: jest.Mock,
    bonus: {
      onBonusSpin?: jest.Mock;
      supported?: boolean;
      ready?: boolean;
      allowed?: boolean;
      blockedReason?: string;
      onImpression?: jest.Mock;
    } = {}
  ) {
    return render(
      <WheelSheet
        gameState={state}
        locale={LOCALE}
        messages={messages}
        now={NOW}
        onSpin={onSpin}
        onBonusSpin={bonus.onBonusSpin ?? jest.fn(async () => null)}
        bonusAdSupported={bonus.supported ?? false}
        bonusAdReady={bonus.ready ?? false}
        bonusAdAllowed={bonus.allowed ?? true}
        bonusAdBlockedReason={bonus.blockedReason ?? ''}
        onBonusImpression={bonus.onImpression}
        onRevealed={onRevealed}
      />
    );
  }

  test('WHEEL_SLOTS 6종이 아이콘+보상 골드와 함께 항상 표시된다', () => {
    const state = createInitialState();
    const screen = renderWheel(state, jest.fn(), jest.fn());
    for (const slot of WHEEL_SLOTS) {
      const cell = screen.getByTestId(`wheel-slot-${slot.key}`);
      expect(cell).toBeTruthy();
    }
    // 진행도 스케일 기준 금액(초기 광고 보상)에 슬롯 배수를 곱한 값이 표기된다.
    const adGold = getRewardedGoldAmount(state);
    expect(
      screen.getByText(`${formatMoney(getWheelSlotGold(WHEEL_SLOTS[0]!, adGold), LOCALE)}G`)
    ).toBeTruthy();
  });

  test('스핀 탭 즉시 보상이 확정되고, 감속 연출 종료 후에 결과가 노출된다', () => {
    const state = createInitialState();
    const winner = WHEEL_SLOTS[2]!;
    const onSpin = jest.fn(() => ({ type: 'gold' as const, slotKey: winner.key, gold: 12345 }));
    const onRevealed = jest.fn();
    const screen = renderWheel(state, onSpin, onRevealed);

    fireEvent.press(screen.getByText(messages.wheelSpinAction));
    // 보상 확정은 연출 시작 시점(탭 즉시).
    expect(onSpin).toHaveBeenCalledTimes(1);
    // 연출 중에는 결과 카드가 아직 없다(두근두근 라벨 노출).
    expect(screen.queryByTestId('wheel-result')).toBeNull();
    expect(screen.getByText(messages.wheelSpinningLabel)).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(SPIN_SETTLE_MS);
    });
    // 연출 종료: 결과 카드 + 호출부 알림(토스트/펄스용) 1회.
    expect(onRevealed).toHaveBeenCalledTimes(1);
    expect(onRevealed).toHaveBeenCalledWith({ type: 'gold', slotKey: winner.key, gold: 12345 });
    expect(screen.getByTestId('wheel-result')).toBeTruthy();
    expect(screen.getByText(`+${formatMoney(12345, LOCALE)}G`)).toBeTruthy();
  });

  test('연출 중 재탭해도 스핀 커밋은 1회다(이중 지급 없음)', () => {
    const state = createInitialState();
    const onSpin = jest.fn(() => ({ type: 'gold' as const, slotKey: WHEEL_SLOTS[0]!.key, gold: 100 }));
    const screen = renderWheel(state, onSpin, jest.fn());

    const action = screen.getByText(messages.wheelSpinAction);
    fireEvent.press(action);
    // 연출 중 버튼은 disabled로 렌더된다(가드가 렌더 단계에서 확정). disabled여도
    // 이벤트를 강제로 흘려 이중 탭을 흉내 내면 spinningRef가 2차 안전망으로 막는다.
    fireEvent.press(screen.getByText(messages.wheelSpinAction));
    expect(onSpin).toHaveBeenCalledTimes(1);
  });

  test('연출 중 시트가 언마운트돼도 에러 없이 정리되고 보상 커밋은 유지된다', () => {
    const state = createInitialState();
    const onSpin = jest.fn(() => ({ type: 'gold' as const, slotKey: WHEEL_SLOTS[5]!.key, gold: 777 }));
    const onRevealed = jest.fn();
    const screen = renderWheel(state, onSpin, onRevealed);

    fireEvent.press(screen.getByText(messages.wheelSpinAction));
    expect(onSpin).toHaveBeenCalledTimes(1);
    // 연출 도중 시트 닫힘(언마운트): 보상은 onSpin 시점에 이미 지급됐다.
    screen.unmount();
    // 남은 타이머가 실행돼도 크래시/추가 호출이 없어야 한다(타이머 정리 계약).
    act(() => {
      jest.advanceTimersByTime(SPIN_SETTLE_MS);
    });
    expect(onSpin).toHaveBeenCalledTimes(1);
    expect(onRevealed).not.toHaveBeenCalled();
  });

  test('연출 종료 후에도 canSpin이 열려 있으면(자정 롤오버) 재스핀이 가능하고 펄스/타이머가 재시작된다', () => {
    // 테스트의 gameState는 onSpin 목이 갱신하지 않으므로 canSpin이 계속 true다 —
    // 결과 카드가 떠 있어도 버튼이 다시 노출되는 자정 롤오버 경로를 그대로 흉내 낸다.
    const state = createInitialState();
    const onSpin = jest.fn(() => ({ type: 'gold' as const, slotKey: WHEEL_SLOTS[1]!.key, gold: 200 }));
    const onRevealed = jest.fn();
    const screen = renderWheel(state, onSpin, onRevealed);

    fireEvent.press(screen.getByText(messages.wheelSpinAction));
    act(() => {
      jest.advanceTimersByTime(SPIN_SETTLE_MS);
    });
    expect(onRevealed).toHaveBeenCalledTimes(1);

    // 재스핀: 이전 결과가 지워지고 새 연출이 문제없이 시작·종료된다(루프 핸들 정리 계약).
    fireEvent.press(screen.getByText(messages.wheelSpinAction));
    expect(onSpin).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('wheel-result')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(SPIN_SETTLE_MS);
    });
    expect(onRevealed).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('wheel-result')).toBeTruthy();
  });

  test('광고 보너스 CTA는 오늘 무료 스핀을 소비한 뒤에만 노출되고 impression은 1회다 (#298)', () => {
    const fresh = createInitialState();
    const freshScreen = renderWheel(fresh, jest.fn(), jest.fn(), {
      supported: true,
      ready: true,
    });
    expect(freshScreen.queryByText(messages.wheelBonusSpinAction)).toBeNull();
    freshScreen.unmount();

    const used: GameState = {
      ...fresh,
      wheelState: { ...fresh.wheelState, lastFreeSpinAt: NOW },
    };
    const onImpression = jest.fn();
    const screen = renderWheel(used, jest.fn(), jest.fn(), {
      supported: true,
      ready: true,
      onImpression,
    });
    expect(screen.getByText(messages.wheelBonusReadyLabel)).toBeTruthy();
    expect(screen.getByText(messages.wheelBonusSpinAction)).toBeTruthy();
    expect(onImpression).toHaveBeenCalledTimes(1);

    screen.rerender(
      <WheelSheet
        gameState={used}
        locale={LOCALE}
        messages={messages}
        now={NOW + 1}
        onSpin={jest.fn()}
        onBonusSpin={jest.fn(async () => null)}
        bonusAdSupported
        bonusAdReady
        bonusAdAllowed
        bonusAdBlockedReason=""
        onBonusImpression={onImpression}
      />
    );
    expect(onImpression).toHaveBeenCalledTimes(1);
  });

  test('광고 보너스는 async earned 결과로 같은 연출을 시작하고 빠른 재탭은 한 요청만 보낸다 (#298)', async () => {
    const base = createInitialState();
    const state: GameState = {
      ...base,
      wheelState: { ...base.wheelState, lastFreeSpinAt: NOW },
    };
    const reward = { type: 'gold' as const, slotKey: WHEEL_SLOTS[1]!.key, gold: 321 };
    const onBonusSpin = jest.fn(async () => reward);
    const onRevealed = jest.fn();
    const screen = renderWheel(state, jest.fn(), onRevealed, {
      onBonusSpin,
      supported: true,
      ready: true,
    });

    const action = screen.getByText(messages.wheelBonusSpinAction);
    fireEvent.press(action);
    fireEvent.press(action);
    expect(onBonusSpin).toHaveBeenCalledTimes(1);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText(messages.wheelSpinningLabel)).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(SPIN_SETTLE_MS);
    });
    expect(onRevealed).toHaveBeenCalledTimes(1);
    expect(onRevealed).toHaveBeenCalledWith(reward);
  });

  test('광고가 보상을 주지 않으면 연출 없이 CTA가 다시 활성화된다 (#298)', async () => {
    const base = createInitialState();
    const state: GameState = {
      ...base,
      wheelState: { ...base.wheelState, lastFreeSpinAt: NOW },
    };
    const onBonusSpin = jest.fn(async () => null);
    const onRevealed = jest.fn();
    const screen = renderWheel(state, jest.fn(), onRevealed, {
      onBonusSpin,
      supported: true,
      ready: true,
    });

    fireEvent.press(screen.getByText(messages.wheelBonusSpinAction));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText(messages.wheelSpinningLabel)).toBeNull();
    expect(screen.getByText(messages.wheelBonusSpinAction)).toBeTruthy();
    expect(onRevealed).not.toHaveBeenCalled();
  });

  test('rp/harvest_boost 슬롯도 릴에 타입별 보상 표기(RP·×배수/시간)로 노출된다(#209)', () => {
    const state = createInitialState();
    const screen = renderWheel(state, jest.fn(), jest.fn());
    const adGold = getRewardedGoldAmount(state);
    const rpSlot = WHEEL_SLOTS.find((slot) => slot.type === 'rp')!;
    const boostSlot = WHEEL_SLOTS.find((slot) => slot.type === 'harvest_boost')!;
    expect(screen.getByTestId(`wheel-slot-${rpSlot.key}`)).toBeTruthy();
    expect(screen.getByTestId(`wheel-slot-${boostSlot.key}`)).toBeTruthy();
    // rp 슬롯은 지급 경로(getWheelSlotReward)와 같은 계산의 RP 표기를 쓴다.
    const rpReward = getWheelSlotReward(rpSlot, adGold);
    if (rpReward.type === 'rp') {
      expect(screen.getByText(messages.wheelSlotRpValue(formatMoney(rpReward.rp, LOCALE)))).toBeTruthy();
    }
  });

  test('rp 슬롯 당첨 시 연출 종료 후 RP 결과 카드가 노출되고 onRevealed에 rp 보상이 전달된다(#209)', () => {
    const state = createInitialState();
    const rpSlot = WHEEL_SLOTS.find((slot) => slot.type === 'rp')!;
    const onSpin = jest.fn(() => ({ type: 'rp' as const, slotKey: rpSlot.key, rp: 42 }));
    const onRevealed = jest.fn();
    const screen = renderWheel(state, onSpin, onRevealed);

    fireEvent.press(screen.getByText(messages.wheelSpinAction));
    act(() => {
      jest.advanceTimersByTime(SPIN_SETTLE_MS);
    });
    expect(onRevealed).toHaveBeenCalledWith({ type: 'rp', slotKey: rpSlot.key, rp: 42 });
    expect(screen.getByTestId('wheel-result')).toBeTruthy();
    expect(screen.getByText(messages.wheelRewardRpToast(formatMoney(42, LOCALE)))).toBeTruthy();
  });

  test('릴은 한 줄 고정(nowrap)이라 줄바꿈으로 강조 인덱스가 어긋나지 않는다', () => {
    // 좁은 화면에서 셀이 줄바꿈되면 감속 하이라이트가 멈추는 셀의 시각 위치가 당첨
    // 슬롯과 어긋난다. nowrap + 균등 flex 분배 계약을 스타일 회귀로 고정한다.
    const screen = renderWheel(createInitialState(), jest.fn(), jest.fn());
    const row = StyleSheet.flatten(screen.getByTestId('wheel-reel').props.style);
    expect(row.flexWrap).toBe('nowrap');
    const cell = StyleSheet.flatten(screen.getByTestId(`wheel-slot-${WHEEL_SLOTS[0]!.key}`).props.style);
    expect(cell.flexBasis).toBe(0);
    expect(cell.flexShrink).toBe(1);
    expect(cell.minWidth).toBe(0);
  });

  test('시계 역전(미래 lastFreeSpinAt) 시에도 카운트다운은 24시간 이하로 표시되고 버튼이 없다', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const base = createInitialState();
    // 세이브에 미래 타임스탬프가 남은 역전 상황: getWheelStatus가 now로 클램프해
    // canSpin=false + 다음 자정 잔여(0~24h)로 정규화한다.
    const state: GameState = {
      ...base,
      wheelState: { ...base.wheelState, lastFreeSpinAt: NOW + 5 * DAY_MS },
    };
    const screen = renderWheel(state, jest.fn(), jest.fn());
    expect(screen.queryByText(messages.wheelSpinAction)).toBeNull();
    // 다음 스핀은 다음 리셋 경계(기본 KST 04:00)에 열린다(#251).
    const remaining = getResetDayStart(getResetDayIndex(NOW) + 1) - NOW;
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(DAY_MS);
    expect(screen.getByText(messages.wheelNextSpinLabel(formatRemainingTime(remaining, LOCALE)))).toBeTruthy();
  });

  test('오늘 이미 스핀했으면 버튼 없이 다음 스핀 카운트다운이 노출된다', () => {
    const base = createInitialState();
    const state: GameState = { ...base, wheelState: { ...base.wheelState, lastFreeSpinAt: NOW } };
    const screen = renderWheel(state, jest.fn(), jest.fn());
    expect(screen.queryByText(messages.wheelSpinAction)).toBeNull();
  });
});
