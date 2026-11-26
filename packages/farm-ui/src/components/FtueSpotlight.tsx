import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { ABSOLUTE_FILL } from '../absoluteFill';
import { FTUE_SPOTLIGHT_PADDING, getSpotlightBlockers, type Rect } from '../ftueSpotlight';

const POINTER_SIZE = 40;

// 첫 수확 스포트라이트(#606 AC-1). 부모(페이지 내용) 전체를 어둡게 덮고 hole 자리만 비운다.
// 막 네 장이 터치를 받아 삼키므로 밝힌 칸 밖을 눌러도 아무것도 열리지 않는다. 구멍에는 막이 없어
// 아래의 실제 밭 칸이 탭을 받는다. 같은 부모에서 zIndex가 더 높은 온보딩 카드는 밝게 남는다.
export function FtueSpotlight({
  layerRef,
  bobEnabled,
  hole,
  size,
  pulse,
  onLayout,
  onBlockedTap,
}: {
  layerRef: React.Ref<View>;
  bobEnabled: boolean;
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
    if (!visible || !bobEnabled) {
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
  }, [bob, bobEnabled, visible]);

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
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }],
              },
            ]}
          />
          <Animated.Text
            testID="ftue-spotlight-pointer"
            pointerEvents="none"
            style={[
              styles.pointer,
              {
                // 작물 그림을 가리지 않도록 칸의 오른쪽 아래 모서리를 가리킨다.
                left: hole.x + hole.width * 0.62,
                top: hole.y + hole.height * 0.7,
                transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [6, -2] }) }],
              },
            ]}
          >
            👆
          </Animated.Text>
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
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#ffd23f',
  },
  pulseRing: {
    position: 'absolute',
    borderRadius: 18,
    borderWidth: 4,
    borderColor: '#ffb300',
  },
  pointer: {
    position: 'absolute',
    width: POINTER_SIZE,
    fontSize: 34,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
});
