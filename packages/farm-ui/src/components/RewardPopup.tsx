import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { ABSOLUTE_FILL } from '../absoluteFill';
import type { CountUpRun } from '../rewardBurst';
import { CountUpText } from './CountUpText';
import { GAME_UI_MAX_FONT_SCALE, GameText, SkinFrame, UiIcon, useDisplayFontStyle } from './GameUi';
import { GamePressable, PRESSED_SINK_STYLE } from './GamePressable';
import { usePopInStyle } from './popIn';

const RAY_COUNT = 12;
const HERO_COIN_SIZE = 92;
const CONFIRM_HEIGHT = 54;
const RIBBON_HEIGHT = 50;

// 보상 팝업(1회차 #2, #6). 설계의 보상 상태 "딤, 나무 패널, 리본 제목, 큰 코인, 숫자 카운트업, 확인 버튼
// 하나"를 그린다. 코인이 골드 칩으로 날아가는 연출(RewardBurstLayer)은 호출하는 쪽이 따로 낸다.
export function RewardPopup({
  testID = 'reward-popup',
  panelTestID,
  title,
  subtitle,
  amount,
  confirmLabel,
  confirmTestID,
  motionEnabled,
  onConfirm,
  onBackdropPress,
}: {
  testID?: string;
  panelTestID?: string;
  title: string;
  subtitle?: string;
  // 이어 하기처럼 받은 금액을 모르면 코인만 보인다.
  amount?: { value: number; format: (value: number) => string } | null;
  confirmLabel: string;
  confirmTestID?: string;
  // 동작 줄이기면 빛살 회전과 카운트업 없이 최종 금액을 바로 보인다.
  motionEnabled: boolean;
  onConfirm: () => void;
  // 없으면 바깥을 눌러도 닫히지 않고 입력만 막는다(설계: 연출 중 입력은 확인 버튼만 받는다).
  onBackdropPress?: () => void;
}) {
  const popIn = usePopInStyle();
  const displayFont = useDisplayFontStyle();
  // 금액이 처음 보이는 순간부터 0에서 받은 금액까지 올린다. 한 번 정한 시작 시각은 다시 그려도 바꾸지
  // 않는다. 첫 수확 보상은 팝업이 수확과 같은 프레임에 뜨고 금액은 한 박자 뒤에 들어온다(2회차 N3).
  const [countUp, setCountUp] = useState<CountUpRun | null>(null);
  if (countUp == null && motionEnabled && amount != null) {
    setCountUp({ from: 0, to: amount.value, startedAt: Date.now() });
  }
  return (
    <View testID={testID} style={styles.root}>
      <GamePressable
        testID={`${testID}-backdrop`}
        silent
        pressedStyle={null}
        accessible={false}
        style={styles.backdrop}
        onPress={onBackdropPress ?? (() => undefined)}
      />
      <Animated.View testID={panelTestID} style={[styles.panel, popIn]}>
        <SkinFrame
          skin="primary"
          height={RIBBON_HEIGHT}
          style={styles.ribbon}
          fallbackStyle={styles.ribbonFallback}
          contentStyle={styles.ribbonContent}
        >
          <GameText tone="onPrimary" style={styles.ribbonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {title}
          </GameText>
        </SkinFrame>
        <View style={styles.hero}>
          <RewardRays motionEnabled={motionEnabled} />
          <UiIcon name="coin" size={HERO_COIN_SIZE} fallback="💰" />
        </View>
        {amount != null ? (
          <CountUpText
            testID={`${testID}-amount`}
            value={amount.value}
            run={countUp}
            format={amount.format}
            maxFontSizeMultiplier={GAME_UI_MAX_FONT_SCALE}
            style={[styles.amount, displayFont, styles.amountColor]}
          />
        ) : null}
        {subtitle != null ? (
          <GameText tone="muted" style={styles.subtitle}>
            {subtitle}
          </GameText>
        ) : null}
        <GamePressable
          testID={confirmTestID}
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
          pressedStyle={PRESSED_SINK_STYLE}
          style={styles.confirm}
          onPress={onConfirm}
        >
          {({ pressed }) => (
            <SkinFrame skin="primary" height={CONFIRM_HEIGHT} pressed={pressed} fallbackStyle={styles.confirmFallback}>
              <GameText tone="onPrimary" style={styles.confirmText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                {confirmLabel}
              </GameText>
            </SkinFrame>
          )}
        </GamePressable>
      </Animated.View>
    </View>
  );
}

// 큰 코인 뒤의 빛살. 동작 줄이기면 돌지 않는다.
function RewardRays({ motionEnabled }: { motionEnabled: boolean }) {
  const spinRef = useRef<Animated.Value | null>(null);
  if (spinRef.current == null) {
    spinRef.current = new Animated.Value(0);
  }
  const spin = spinRef.current;
  useEffect(() => {
    if (!motionEnabled) return;
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 9_000, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [motionEnabled, spin]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.rays,
        { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] },
      ]}
    >
      {Array.from({ length: RAY_COUNT }, (_, index) => (
        <View key={index} style={[styles.ray, { transform: [{ rotate: `${(index * 180) / RAY_COUNT}deg` }] }]} />
      ))}
      <View style={styles.glow} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...ABSOLUTE_FILL,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    // 보상 코인(z25)은 딤 위로 날아가 골드 칩에 닿는 모습이 보여야 해서 그 바로 아래에 둔다.
    zIndex: 24,
    elevation: 24,
  },
  backdrop: {
    ...ABSOLUTE_FILL,
    backgroundColor: 'rgba(36, 22, 8, 0.62)',
  },
  panel: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    paddingTop: RIBBON_HEIGHT / 2 + 12,
    paddingHorizontal: 22,
    paddingBottom: 22,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: '#d9a35b',
    borderBottomWidth: 8,
    borderBottomColor: '#a8692a',
    backgroundColor: '#fff6e2',
  },
  ribbon: {
    position: 'absolute',
    top: -RIBBON_HEIGHT / 2,
    left: -14,
    right: -14,
  },
  ribbonFallback: {
    borderRadius: RIBBON_HEIGHT / 2,
    backgroundColor: '#68b035',
    borderBottomWidth: 4,
    borderBottomColor: '#4d8a22',
  },
  ribbonContent: {
    paddingHorizontal: 22,
    paddingBottom: 4,
  },
  ribbonText: {
    fontSize: 21,
  },
  hero: {
    width: 180,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rays: {
    position: 'absolute',
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ray: {
    position: 'absolute',
    width: 14,
    height: 180,
    borderRadius: 7,
    backgroundColor: 'rgba(255, 205, 80, 0.26)',
  },
  glow: {
    position: 'absolute',
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: 'rgba(255, 226, 140, 0.55)',
  },
  amount: {
    fontSize: 40,
    fontWeight: '900',
    textAlign: 'center',
  },
  amountColor: {
    color: '#d98a12',
    textShadowColor: 'rgba(92, 58, 22, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    textAlign: 'center',
  },
  confirm: {
    alignSelf: 'stretch',
    marginTop: 18,
  },
  confirmFallback: {
    borderRadius: CONFIRM_HEIGHT / 2,
    backgroundColor: '#68b035',
    borderBottomWidth: 4,
    borderBottomColor: '#4d8a22',
  },
  confirmText: {
    fontSize: 19,
  },
});
