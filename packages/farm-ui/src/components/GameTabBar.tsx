import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ABSOLUTE_FILL } from '../absoluteFill';
import type { FarmUiIconKey } from '../farmArt';
import { GameBadge, GameText, UiIcon, type BadgeValue } from './GameUi';
import { GamePressable, PRESSED_SINK_STYLE } from './GamePressable';

export type GameTab = {
  key: string;
  label: string;
  icon: FarmUiIconKey;
  fallback: string;
  badge?: BadgeValue;
  testID?: string;
  accessibilityLabel?: string;
  // 가운데 농장 탭처럼 지금 보고 있는 화면이면 위로 솟은 원으로 그린다.
  current?: boolean;
  onPress: () => void;
};

// 하단 게임 탭 바(#606 B안). 상점, 미션, 농장, 목장, 요리를 아이콘과 짧은 이름으로 보인다.
export function GameTabBar({
  tabs,
  bottomInset,
  blocked = false,
  onBlockedTap,
}: {
  tabs: GameTab[];
  bottomInset: number;
  // 첫 수확 스포트라이트 동안 탭 바를 어둡게 덮고 누름을 삼킨다(#606 AC-1).
  blocked?: boolean;
  onBlockedTap?: () => void;
}) {
  return (
    <View testID="game-tab-bar" style={[styles.bar, { paddingBottom: Math.max(6, bottomInset) }]}>
      {tabs.map((tab) => (
        <GamePressable
          key={tab.key}
          testID={tab.testID}
          accessibilityRole="tab"
          accessibilityLabel={tab.accessibilityLabel ?? tab.label}
          accessibilityState={{ selected: tab.current === true }}
          // 지금 보고 있는 화면의 탭은 누를 것이 없어 탭음을 내지 않는다. 비활성으로 두면 스크린리더가
          // "선택됨, 흐리게"로 읽어 선택 상태만 남긴다.
          silent={tab.current === true}
          pressedStyle={PRESSED_SINK_STYLE}
          style={styles.tab}
          onPress={tab.onPress}
        >
          {tab.current === true ? (
            <View style={styles.currentDisc}>
              <UiIcon name={tab.icon} size={40} fallback={tab.fallback} />
            </View>
          ) : (
            <View style={styles.iconWrap}>
              <UiIcon name={tab.icon} size={36} fallback={tab.fallback} />
              <GameBadge value={tab.badge} />
            </View>
          )}
          <GameText tone="ink" style={styles.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {tab.label}
          </GameText>
        </GamePressable>
      ))}
      {blocked ? (
        <View
          testID="game-tab-bar-blocker"
          style={styles.blocker}
          onStartShouldSetResponder={() => true}
          onResponderRelease={onBlockedTap}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  blocker: {
    ...ABSOLUTE_FILL,
    // 스포트라이트 막과 같은 색(FtueSpotlight dim).
    backgroundColor: 'rgba(36, 22, 8, 0.62)',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: 6,
    paddingHorizontal: 6,
    backgroundColor: '#f3dfb6',
    borderTopWidth: 3,
    borderTopColor: '#d9b77a',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: 58,
  },
  iconWrap: {
    position: 'relative',
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentDisc: {
    width: 60,
    height: 60,
    marginTop: -22,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#68b035',
    borderWidth: 4,
    borderColor: '#fff3d6',
    borderBottomColor: '#4d8a22',
  },
  label: {
    marginTop: 2,
    fontSize: 12,
  },
});
