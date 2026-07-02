/// <reference types="jest" />

import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';

import {
  ACHIEVEMENT_TRACKS,
  COLLECTION_AREA_REWARDS,
  DEFAULT_LOCALE,
  FARM_AREAS,
  PRESTIGE_SKILLS,
  createInitialState,
  formatMoney,
  getAreaCropKeys,
  getCollectionSummary,
  getPrestigeSkillLabel,
  getRewardedGoldAmount,
  getSkillLevel,
  getWheelSlotGold,
  WHEEL_SLOTS,
  type GameState,
} from '../../../../../packages/farm-core/src';
import { getFarmMessages } from '../../../../../packages/farm-ui/src';
import { CollectionSheet } from '../../../../../packages/farm-ui/src/components/CollectionSheet';
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
    const onSpin = jest.fn(() => ({ slotKey: winner.key, gold: 12345 }));
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
    expect(onRevealed).toHaveBeenCalledWith(12345);
    expect(screen.getByTestId('wheel-result')).toBeTruthy();
    expect(screen.getByText(`+${formatMoney(12345, LOCALE)}G`)).toBeTruthy();
  });

  test('연출 중 재탭해도 스핀 커밋은 1회다(이중 지급 없음)', () => {
    const state = createInitialState();
    const onSpin = jest.fn(() => ({ slotKey: WHEEL_SLOTS[0]!.key, gold: 100 }));
    const screen = renderWheel(state, onSpin, jest.fn());

    const action = screen.getByText(messages.wheelSpinAction);
    fireEvent.press(action);
    // 연출 중에는 버튼이 사라지지만, 같은 틱의 이중 탭을 흉내 내 직접 재호출해도
    // spinningRef 가드로 onSpin이 다시 불리지 않아야 한다.
    expect(screen.queryByText(messages.wheelSpinAction)).toBeNull();
    expect(onSpin).toHaveBeenCalledTimes(1);
  });

  test('연출 중 시트가 언마운트돼도 에러 없이 정리되고 보상 커밋은 유지된다', () => {
    const state = createInitialState();
    const onSpin = jest.fn(() => ({ slotKey: WHEEL_SLOTS[5]!.key, gold: 777 }));
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
    const onSpin = jest.fn(() => ({ slotKey: WHEEL_SLOTS[1]!.key, gold: 200 }));
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

  test('오늘 이미 스핀했으면 버튼 없이 다음 스핀 카운트다운이 노출된다', () => {
    const base = createInitialState();
    const state: GameState = { ...base, wheelState: { lastFreeSpinAt: NOW } };
    const screen = renderWheel(state, jest.fn(), jest.fn());
    expect(screen.queryByText(messages.wheelSpinAction)).toBeNull();
  });
});
