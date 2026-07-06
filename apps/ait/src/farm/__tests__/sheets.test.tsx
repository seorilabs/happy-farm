/// <reference types="jest" />

import React from 'react';
import { StyleSheet } from 'react-native';
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';

import {
  ACHIEVEMENT_TRACKS,
  COLLECTION_AREA_REWARDS,
  DEFAULT_LOCALE,
  FARM_AREAS,
  PRESTIGE_SKILLS,
  createInitialState,
  formatMoney,
  formatRemainingTime,
  getAreaCropKeys,
  getAreaUnlockRequirementText,
  getCollectionSummary,
  getCropLabel,
  isAreaUnlocked,
  getPrestigeSkillLabel,
  getRewardedGoldAmount,
  getSkillLevel,
  getWheelSlotGold,
  getWheelSlotReward,
  getResetDayIndex,
  getResetDayStart,
  WHEEL_SLOTS,
  type GameState,
} from '../../../../../packages/farm-core/src';
import { getFarmMessages } from '../../../../../packages/farm-ui/src';
import { CollectionSheet } from '../../../../../packages/farm-ui/src/components/CollectionSheet';
import { StatsSheet } from '../../../../../packages/farm-ui/src/components/StatsSheet';
import { AchievementsSheet } from '../../../../../packages/farm-ui/src/components/AchievementsSheet';
import { LabSheet } from '../../../../../packages/farm-ui/src/components/LabSheet';
import { ChainMapSheet } from '../../../../../packages/farm-ui/src/components/ChainMapSheet';
import { WheelSheet } from '../../../../../packages/farm-ui/src/components/WheelSheet';

const LOCALE = DEFAULT_LOCALE;
const messages = getFarmMessages(LOCALE);
const NOW = Date.parse('2026-05-27T03:00:00.000Z');

afterEach(cleanup);

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
  function renderDiscovered(locale: typeof LOCALE | 'en-US', localeMessages = messages) {
    const base = createInitialState();
    // carrot을 발견 상태로 만들어 상시 해금된 초보 밭 셀이 활성화되도록 한다.
    const state: GameState = { ...base, harvestedCropKeys: ['carrot'] };
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

  test('renders research/profit/growth stats and the boost as active with a remaining time', () => {
    const screen = render(
      <StatsSheet
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
        weeklyEventRemainingMs={2 * HOUR_MS}
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
    // 축제 비활성 요일: 티저가 노출되고 라이브 배너는 없다.
    expect(screen.getByTestId('weekly-event-teaser')).toBeTruthy();
    expect(screen.queryByTestId('weekly-event-banner')).toBeNull();
  });

  test('shows the boost row as inactive and the festival banner when a festival is live', () => {
    const screen = render(
      <StatsSheet
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
        weeklyEventRemainingMs={5 * HOUR_MS}
      />
    );

    // 부스트 비활성: '현재 비활성' 문구가 뜨고 잔여시간 요소는 없다.
    expect(screen.getByText(messages.statsBoostInactive)).toBeTruthy();
    expect(screen.queryByTestId('boost-remaining')).toBeNull();
    // 축제 라이브(판매 종류): 판매 배수 문구 배너가 노출되고 티저는 없다.
    const saleBanner = screen.getByTestId('weekly-event-banner');
    expect(saleBanner).toHaveTextContent(/판매/);
    expect(saleBanner).not.toHaveTextContent(/성장속도/);
    expect(screen.queryByTestId('weekly-event-teaser')).toBeNull();
  });

  test('shows the harvest (speed) festival copy when the live event is a harvest type (#243)', () => {
    const screen = render(
      <StatsSheet
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
        weeklyEventRemainingMs={5 * HOUR_MS}
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
        weeklyEventRemainingMs={HOUR_MS}
      />
    );

    expect(screen.getByText(enMessages.profitLabel)).toBeTruthy();
    expect(screen.getByText(enMessages.statsBoostInactive)).toBeTruthy();
    expect(enMessages.statsBoostInactive).toBe('Inactive');
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
        onSelectTitle={jest.fn()}
      />
    );

    expect(screen.getByText(messages.achievementTracksSection)).toBeTruthy();
    expect(screen.getByText(messages.titlesSection)).toBeTruthy();
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
        onSelectTitle={jest.fn()}
      />
    );

    fireEvent.press(screen.getByText(messages.achievementClaimAction(track.starsPerTier)));
    expect(onClaim).toHaveBeenCalledWith(track.key);
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
    expect(screen.getByText(messages.breedingSection)).toBeTruthy();
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

  function renderWheel(state: GameState, onSpin: jest.Mock, onRevealed: jest.Mock) {
    return render(
      <WheelSheet
        gameState={state}
        locale={LOCALE}
        messages={messages}
        now={NOW}
        onSpin={onSpin}
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
    const state: GameState = { ...base, wheelState: { lastFreeSpinAt: NOW + 5 * DAY_MS } };
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
    const state: GameState = { ...base, wheelState: { lastFreeSpinAt: NOW } };
    const screen = renderWheel(state, jest.fn(), jest.fn());
    expect(screen.queryByText(messages.wheelSpinAction)).toBeNull();
  });
});
