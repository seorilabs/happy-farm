import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { ABSOLUTE_FILL } from '../absoluteFill';
import { FTUE_SPOTLIGHT_PADDING, getSpotlightBlockers, type Rect } from '../ftueSpotlight';
import { UiIcon } from './GameUi';

const POINTER_SIZE = 44;

// 첫 수확 스포트라이트(#606 AC-1). 부모(페이지 내용) 전체를 어둡게 덮고 hole 자리만 비운다.
// 막 네 장이 터치를 받아 삼키므로 밝힌 칸 밖을 눌러도 아무것도 열리지 않는다. 구멍에는 막이 없어
// 아래의 실제 밭 칸이 탭을 받는다. 같은 부모에서 zIndex가 더 높은 온보딩 카드는 밝게 남는다.
export function FtueSpotlight({
  layerRef,
  motionEnabled,
  hole,
  size,
  pulse,
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
  onLayout: () => void;
  onBlockedTap: () => void;
}) {
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
                // 칸 위쪽은 온보딩 카드가 차지하므로, 아래를 가리키는 손 그림을 뒤집어 칸 아래에서
                // 위로 가리키게 하고 칸 쪽으로 흔든다. 작물 그림은 가리지 않는다.
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
        </>
      ) : null}
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
    // 구멍은 네모라 고리를 많이 둥글리면 모서리 바깥이 밝게 남는다.
    borderRadius: 6,
    borderWidth: 3,
    borderColor: '#ffd23f',
  },
  pulseRing: {
    position: 'absolute',
    borderRadius: 8,
    borderWidth: 4,
    borderColor: '#ffb300',
  },
  pointer: {
    position: 'absolute',
    width: POINTER_SIZE,
    height: POINTER_SIZE,
  },
});
