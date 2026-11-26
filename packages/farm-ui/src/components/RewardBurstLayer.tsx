import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { ABSOLUTE_FILL } from '../absoluteFill';

import {
  REWARD_BURST_COIN_COUNT,
  REWARD_BURST_FLY_MS,
  REWARD_BURST_SCATTER_MS,
  REWARD_BURST_STAGGER_MS,
  REWARD_BURST_TOTAL_MS,
  getBurstScatterOffsets,
  type Point,
} from '../rewardBurst';

export type RewardBurstSpec = { id: number; amountLabel: string; from: Point; to: Point };

const COIN_SIZE = 30;

// 보상 연출(#606 AC-3). 입력을 막지 않는 오버레이라 시트 안팎 어디에 그려도 된다.
// 시트 Modal 안에서 네이티브 드라이버 애니메이션이 반영되지 않아(iOS 실행 화면 재현) 1초 미만의 짧은
// 연출은 JS 드라이버로 움직인다.
export function RewardBurstLayer({
  bursts,
  renderCoin,
  onDone,
}: {
  bursts: RewardBurstSpec[];
  renderCoin: () => React.ReactNode;
  onDone: (id: number) => void;
}) {
  return (
    <View testID="reward-burst-layer" pointerEvents="none" style={styles.layer}>
      {bursts.map((burst) => (
        <RewardBurstView key={burst.id} burst={burst} renderCoin={renderCoin} onDone={onDone} />
      ))}
    </View>
  );
}

function RewardBurstView({
  burst,
  renderCoin,
  onDone,
}: {
  burst: RewardBurstSpec;
  renderCoin: () => React.ReactNode;
  onDone: (id: number) => void;
}) {
  const offsets = useMemo(() => getBurstScatterOffsets(REWARD_BURST_COIN_COUNT), []);
  const coinValuesRef = useRef<Animated.Value[] | null>(null);
  if (coinValuesRef.current == null) {
    coinValuesRef.current = offsets.map(() => new Animated.Value(0));
  }
  const coinValues = coinValuesRef.current;
  const labelRef = useRef<Animated.Value | null>(null);
  if (labelRef.current == null) {
    labelRef.current = new Animated.Value(0);
  }
  const label = labelRef.current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const coins = coinValues.map((value, index) =>
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: REWARD_BURST_SCATTER_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.delay(REWARD_BURST_STAGGER_MS * index),
        Animated.timing(value, {
          toValue: 2,
          duration: REWARD_BURST_FLY_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: false,
        }),
      ])
    );
    const animation = Animated.parallel([
      ...coins,
      Animated.timing(label, {
        toValue: 1,
        duration: REWARD_BURST_TOTAL_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]);
    animation.start();
    // 애니메이션 콜백 대신 전체 시간으로 끝을 알린다. 백그라운드에서 멈춘 애니메이션에도 정리된다.
    const timer = setTimeout(() => onDoneRef.current(burst.id), REWARD_BURST_TOTAL_MS);
    return () => {
      clearTimeout(timer);
      animation.stop();
    };
  }, [burst.id, coinValues, label]);

  const dx = burst.to.x - burst.from.x;
  const dy = burst.to.y - burst.from.y;

  return (
    <View testID={`reward-burst-${burst.id}`} style={StyleSheet.absoluteFill}>
      {coinValues.map((value, index) => {
        const offset = offsets[index] ?? { x: 0, y: 0 };
        return (
          <Animated.View
            key={index}
            style={[
              styles.coin,
              {
                left: burst.from.x - COIN_SIZE / 2,
                top: burst.from.y - COIN_SIZE / 2,
                opacity: value.interpolate({ inputRange: [0, 0.08, 1.85, 2], outputRange: [0, 1, 1, 0] }),
                transform: [
                  { translateX: value.interpolate({ inputRange: [0, 1, 2], outputRange: [0, offset.x, dx] }) },
                  { translateY: value.interpolate({ inputRange: [0, 1, 2], outputRange: [0, offset.y, dy] }) },
                  { scale: value.interpolate({ inputRange: [0, 1, 2], outputRange: [0.5, 1.15, 0.6] }) },
                ],
              },
            ]}
          >
            {renderCoin()}
          </Animated.View>
        );
      })}
      <Animated.View
        style={[
          styles.amount,
          {
            left: burst.from.x - 80,
            top: burst.from.y - 40,
            opacity: label.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateY: label.interpolate({ inputRange: [0, 1], outputRange: [0, -44] }) },
              { scale: label.interpolate({ inputRange: [0, 0.12, 0.25, 1], outputRange: [0.6, 1.25, 1, 1] }) },
            ],
          },
        ]}
      >
        <Text style={styles.amountText}>{burst.amountLabel}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...ABSOLUTE_FILL,
    zIndex: 25,
    elevation: 25,
  },
  coin: {
    position: 'absolute',
    width: COIN_SIZE,
    height: COIN_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amount: {
    position: 'absolute',
    width: 160,
    alignItems: 'center',
  },
  amountText: {
    color: '#ffd23f',
    fontSize: 28,
    fontWeight: '900',
    textShadowColor: '#5c3a16',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 2,
  },
});
