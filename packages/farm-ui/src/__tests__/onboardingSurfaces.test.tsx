/// <reference types="jest" />

import React from 'react';
import { Animated } from 'react-native';
import { act, render } from '@testing-library/react-native';

import { FtueSpotlight } from '../components/FtueSpotlight';
import { GameTabBar, type GameTab } from '../components/GameTabBar';

const TABS: GameTab[] = [
  { key: 'shop', label: 'Shop', icon: 'shop', fallback: '🏪', onPress: () => undefined },
  { key: 'farm', label: 'Farm', icon: 'harvest', fallback: '🌾', current: true, onPress: () => undefined },
];

const SKIP = {
  label: 'Skip',
  confirmTitle: 'Skip?',
  confirmDescription: 'You can learn later.',
  cancelLabel: 'Keep going',
  confirmLabel: 'Skip',
};

describe('첫 수확 스포트라이트 주변 (2회차 N1, N2)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('탭 바가 막혀 있으면 가운데 탭을 솟은 원으로 그리지 않아 딤 위로 밝게 남지 않는다 (N1)', () => {
    const blocked = render(<GameTabBar tabs={TABS} bottomInset={0} blocked />);
    expect(blocked.queryByTestId('game-tab-current-disc')).toBeNull();
    expect(blocked.getByTestId('game-tab-bar-blocker')).toBeTruthy();

    const open = render(<GameTabBar tabs={TABS} bottomInset={0} />);
    expect(open.getByTestId('game-tab-current-disc')).toBeTruthy();
  });

  test('밝힐 칸을 재기 전에도 화면 전체를 어둡게 덮고 누름을 삼킨다 (N2)', () => {
    jest.useFakeTimers();
    const view = render(
      <FtueSpotlight
        layerRef={React.createRef()}
        motionEnabled={false}
        hole={null}
        size={null}
        pulse={new Animated.Value(0)}
        hint="Tap the ripe crop to harvest!"
        skipTop={40}
        skip={SKIP}
        onSkip={() => undefined}
        onLayout={() => undefined}
        onBlockedTap={() => undefined}
      />
    );
    const pending = view.getByTestId('ftue-spotlight-pending');
    expect(pending.props.onStartShouldSetResponder()).toBe(true);
    expect(view.queryByTestId('ftue-spotlight-blocker-0')).toBeNull();
    // 재는 동안 잠깐은 건너뛰기를 그리지 않고(자리를 몰라 화면 맨 위에 그려졌다), 1초가 지나도 못 재면
    // 건너뛰기로 빠져나갈 수 있다.
    expect(view.queryByTestId('onboarding-skip')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(view.getByTestId('onboarding-skip')).toBeTruthy();
  });
});
