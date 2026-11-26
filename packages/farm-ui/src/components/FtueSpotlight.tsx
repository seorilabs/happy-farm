import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { ABSOLUTE_FILL } from '../absoluteFill';
import {
  FTUE_BUBBLE_MIN_HEIGHT,
  FTUE_SPOTLIGHT_PADDING,
  getSpotlightBlockers,
  getSpotlightBubbleFrame,
  type Rect,
} from '../ftueSpotlight';
import { GAME_UI_MAX_FONT_SCALE, GameText, UiIcon } from './GameUi';
import { GamePressable, PRESSED_SINK_STYLE } from './GamePressable';
import { usePopInStyle } from './popIn';

const POINTER_SIZE = 44;

// 첫 수확 스포트라이트(#606 AC-1). 부모(페이지 내용) 전체를 어둡게 덮고 hole 자리만 비운다.
// 막 네 장이 터치를 받아 삼키므로 밝힌 칸 밖을 눌러도 아무것도 열리지 않는다. 구멍에는 막이 없어
// 아래의 실제 밭 칸이 탭을 받는다. 안내 말풍선, 건너뛰기 링크와 그 확인 창도 이 층에 절대 위치로 그려
// 밭을 밀어내지 않는다(1회차 #3: 레이아웃 안의 카드가 펼쳐지며 밭이 내려가고 강조 고리만 남았다).
export type FtueSkipCopy = {
  label: string;
  confirmTitle: string;
  confirmDescription: string;
  cancelLabel: string;
  confirmLabel: string;
};

export function FtueSpotlight({
  layerRef,
  motionEnabled,
  hole,
  size,
  pulse,
  hint,
  skipTop,
  skip,
  onSkip,
  onLayout,
  onBlockedTap,
}: {
  layerRef: React.Ref<View>;
  // 동작 줄이기면 손가락 흔들림과 고리 확대를 끄고 고리 밝기만 바꾼다.
  motionEnabled: boolean;
  hole: Rect | null;
  size: { width: number; height: number } | null;
  // 15초 무행동 넛지(stall)에 맞춰 고리를 한 번 크게 깜빡인다.
  pulse: Animated.Value;
  // 밝힌 칸 옆 말풍선의 한 줄 안내.
  hint: string;
  // 건너뛰기 링크의 위치(밭 바로 위).
  skipTop: number;
  skip: FtueSkipCopy;
  onSkip: () => void;
  onLayout: () => void;
  onBlockedTap: () => void;
}) {
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);
  const bobRef = useRef<Animated.Value | null>(null);
  if (bobRef.current == null) {
    bobRef.current = new Animated.Value(0);
  }
  const bob = bobRef.current;
  const visible = hole != null && size != null;

  useEffect(() => {
    if (!visible || !motionEnabled) {
      bob.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [bob, motionEnabled, visible]);

  return (
    <View ref={layerRef} testID="ftue-spotlight" pointerEvents="box-none" style={styles.layer} onLayout={onLayout}>
      {visible
        ? getSpotlightBlockers(size, hole).map((rect, index) => (
            <View
              key={index}
              testID={`ftue-spotlight-blocker-${index}`}
              style={[styles.dim, { left: rect.x, top: rect.y, width: rect.width, height: rect.height }]}
              onStartShouldSetResponder={() => true}
              onResponderRelease={onBlockedTap}
            />
          ))
        : null}
      {visible ? (
        <>
          <View
            testID="ftue-spotlight-ring"
            pointerEvents="none"
            style={[
              styles.ring,
              {
                left: hole.x - FTUE_SPOTLIGHT_PADDING,
                top: hole.y - FTUE_SPOTLIGHT_PADDING,
                width: hole.width + FTUE_SPOTLIGHT_PADDING * 2,
                height: hole.height + FTUE_SPOTLIGHT_PADDING * 2,
              },
            ]}
          />
          <Animated.View
            testID="ftue-spotlight-pulse"
            pointerEvents="none"
            style={[
              styles.pulseRing,
              {
                left: hole.x - FTUE_SPOTLIGHT_PADDING,
                top: hole.y - FTUE_SPOTLIGHT_PADDING,
                width: hole.width + FTUE_SPOTLIGHT_PADDING * 2,
                height: hole.height + FTUE_SPOTLIGHT_PADDING * 2,
                opacity: pulse,
                transform: motionEnabled
                  ? [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }]
                  : [],
              },
            ]}
          />
          <Animated.View
            testID="ftue-spotlight-pointer"
            pointerEvents="none"
            style={[
              styles.pointer,
              {
                // 아래를 가리키는 손 그림을 뒤집어 칸 아래에서 위로 가리키게 하고 칸 쪽으로 흔든다.
                // 작물 그림과 옆의 말풍선을 가리지 않는다.
                left: hole.x + hole.width / 2 - POINTER_SIZE / 2,
                top: hole.y + hole.height - POINTER_SIZE * 0.2,
                transform: [
                  { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [4, -4] }) },
                  { rotate: '180deg' },
                ],
              },
            ]}
          >
            <UiIcon name="pointer" size={POINTER_SIZE} fallback="👇" />
          </Animated.View>
          <View
            testID="onboarding-coachmark"
            style={[styles.bubble, bubbleFrame(size, hole)]}
            onStartShouldSetResponder={() => true}
          >
            <GameText style={styles.bubbleText}>{hint}</GameText>
          </View>
          <GamePressable
            testID="onboarding-skip"
            accessibilityRole="button"
            accessibilityLabel={skip.label}
            hitSlop={10}
            style={[styles.skipLink, { top: Math.max(4, skipTop) }]}
            onPress={() => setSkipConfirmOpen(true)}
          >
            <Text style={styles.skipLinkText} maxFontSizeMultiplier={GAME_UI_MAX_FONT_SCALE}>
              {skip.label}
            </Text>
          </GamePressable>
          {skipConfirmOpen ? (
            <SkipConfirm
              copy={skip}
              onCancel={() => setSkipConfirmOpen(false)}
              onConfirm={() => {
                setSkipConfirmOpen(false);
                onSkip();
              }}
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function bubbleFrame(size: { width: number; height: number }, hole: Rect) {
  const frame = getSpotlightBubbleFrame(size, hole);
  return { left: frame.left, right: frame.right, top: frame.top, maxWidth: frame.maxWidth };
}

function SkipConfirm({ copy, onCancel, onConfirm }: { copy: FtueSkipCopy; onCancel: () => void; onConfirm: () => void }) {
  const popIn = usePopInStyle();
  return (
    <View style={styles.confirmRoot} onStartShouldSetResponder={() => true}>
      <Animated.View testID="onboarding-skip-confirm" style={[styles.confirmPanel, popIn]}>
        <GameText style={styles.confirmTitle}>{copy.confirmTitle}</GameText>
        <GameText tone="muted" style={styles.confirmDescription}>
          {copy.confirmDescription}
        </GameText>
        <GamePressable
          testID="onboarding-skip-cancel"
          accessibilityRole="button"
          accessibilityLabel={copy.cancelLabel}
          pressedStyle={PRESSED_SINK_STYLE}
          style={styles.confirmPrimary}
          onPress={onCancel}
        >
          <GameText tone="onPrimary" style={styles.confirmPrimaryText}>
            {copy.cancelLabel}
          </GameText>
        </GamePressable>
        <GamePressable
          testID="onboarding-skip-confirm-action"
          accessibilityRole="button"
          accessibilityLabel={copy.confirmLabel}
          pressedStyle={PRESSED_SINK_STYLE}
          style={styles.confirmSecondary}
          onPress={onConfirm}
        >
          <GameText tone="muted" style={styles.confirmSecondaryText}>
            {copy.confirmLabel}
          </GameText>
        </GamePressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...ABSOLUTE_FILL,
    zIndex: 20,
    elevation: 20,
  },
  dim: {
    position: 'absolute',
    backgroundColor: 'rgba(36, 22, 8, 0.62)',
  },
  ring: {
    position: 'absolute',
    // 구멍은 네모라 고리를 둥글리면 모서리 바깥이 밝게 남는다(1회차 #16). 구멍과 같은 네모로 둔다.
    borderWidth: 3,
    borderColor: '#ffd23f',
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 4,
    borderColor: '#ffb300',
  },
  bubble: {
    position: 'absolute',
    minHeight: FTUE_BUBBLE_MIN_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#d9a35b',
    borderBottomWidth: 6,
    borderBottomColor: '#a8692a',
    backgroundColor: '#fff6e2',
  },
  bubbleText: {
    fontSize: 17,
    lineHeight: 22,
  },
  skipLink: {
    position: 'absolute',
    right: 16,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  skipLinkText: {
    color: '#fff3d6',
    fontSize: 15,
    fontWeight: '900',
    textDecorationLine: 'underline',
  },
  confirmRoot: {
    ...ABSOLUTE_FILL,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  confirmPanel: {
    width: '100%',
    maxWidth: 340,
    gap: 10,
    padding: 20,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: '#d9a35b',
    borderBottomWidth: 8,
    borderBottomColor: '#a8692a',
    backgroundColor: '#fff6e2',
  },
  confirmTitle: {
    fontSize: 19,
    textAlign: 'center',
  },
  confirmDescription: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  confirmPrimary: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    marginTop: 4,
    borderRadius: 25,
    borderBottomWidth: 4,
    borderBottomColor: '#4d8a22',
    backgroundColor: '#68b035',
  },
  confirmPrimaryText: {
    fontSize: 17,
  },
  confirmSecondary: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  confirmSecondaryText: {
    fontSize: 15,
  },
  pointer: {
    position: 'absolute',
    width: POINTER_SIZE,
    height: POINTER_SIZE,
  },
});
