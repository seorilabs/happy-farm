/// <reference types="jest" />

import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react-native';

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
  getSkillLevel,
  type GameState,
} from '../../../../../packages/farm-core/src';
import { getFarmMessages } from '../../../../../packages/farm-ui/src';
import { CollectionSheet } from '../../../../../packages/farm-ui/src/components/CollectionSheet';
import { AchievementsSheet } from '../../../../../packages/farm-ui/src/components/AchievementsSheet';
import { LabSheet } from '../../../../../packages/farm-ui/src/components/LabSheet';
import { ChainMapSheet } from '../../../../../packages/farm-ui/src/components/ChainMapSheet';

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
