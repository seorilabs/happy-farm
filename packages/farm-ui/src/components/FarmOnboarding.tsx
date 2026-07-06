import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import type { FarmMessages } from '../i18n';

// Steps of the first-session onboarding flow. Each advances automatically once
// the player performs the action (pick seed → plant → harvest → first unlock).
// Array order is both the progression order and the basis for the "2/4" label.
export const ONBOARDING_STEPS = ['selectSeed', 'plant', 'harvest', 'unlock'] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

// Directional hint of the coachmark. The seed strip sits below the banner, so
// that step points down; every other target (plots, shop) sits above it.
const STEP_ARROW: Record<OnboardingStep, string> = {
  selectSeed: '👇',
  plant: '👆',
  harvest: '👆',
  unlock: '👆',
};

function getStepText(step: OnboardingStep, messages: FarmMessages): { title: string; description: string } {
  switch (step) {
    case 'selectSeed':
      return { title: messages.onboardingSelectSeedTitle, description: messages.onboardingSelectSeedDesc };
    case 'plant':
      return { title: messages.onboardingPlantTitle, description: messages.onboardingPlantDesc };
    case 'harvest':
      return { title: messages.onboardingHarvestTitle, description: messages.onboardingHarvestDesc };
    case 'unlock':
      return { title: messages.onboardingUnlockTitle, description: messages.onboardingUnlockDesc };
  }
}

// First-session onboarding coachmark banner. Mounted between the header and the
// farm to guide the next action. The container is box-none so taps outside the
// card pass straight through to the game.
export function FarmOnboarding({
  step,
  messages,
  onSkip,
  onQuickStart,
}: {
  step: OnboardingStep;
  messages: FarmMessages;
  onSkip: () => void;
  // #274: selectSeed 단계에서만 노출되는 "바로 시작" CTA. 탭 시 대표 씨앗을
  // 자동 선택해 plant 단계로 즉시 진행시킨다(직접 선택도 여전히 가능).
  onQuickStart?: () => void;
}) {
  const { title, description } = getStepText(step, messages);
  const stepIndex = ONBOARDING_STEPS.indexOf(step);
  // 첫 파종(plant) 완료 전(= selectSeed·plant 단계)에는 건너뛰기를 숨긴다. 신규
  // 사용자 다수가 첫 씨앗을 심기도 전에 코치마크를 건너뛰고 이탈하는 것을 막아
  // 핵심 행동(파종)으로의 도달률을 끌어올리기 위함이다(#159). 파종 이후(harvest·
  // unlock)부터 건너뛰기를 노출한다.
  const canSkip = step !== 'selectSeed' && step !== 'plant';
  // "바로 시작"은 정체가 가장 심한 selectSeed 단계에서만 제공한다(#274).
  const canQuickStart = step === 'selectSeed' && onQuickStart != null;

  // Bob the arrow up and down a little to catch the eye.
  const bounceRef = useRef<Animated.Value | null>(null);
  if (bounceRef.current == null) {
    bounceRef.current = new Animated.Value(0);
  }
  const bounce = bounceRef.current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, {
          toValue: 1,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bounce, {
          toValue: 0,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [bounce]);

  const arrowTranslateY = bounce.interpolate({ inputRange: [0, 1], outputRange: [0, 6] });

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <View testID="onboarding-coachmark" style={styles.card}>
        <Animated.Text style={[styles.arrow, { transform: [{ translateY: arrowTranslateY }] }]}>
          {STEP_ARROW[step]}
        </Animated.Text>
        <View style={styles.textGroup}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </View>
        <View style={styles.aside}>
          <Text style={styles.progress}>{messages.onboardingProgress(stepIndex + 1, ONBOARDING_STEPS.length)}</Text>
          {canQuickStart ? (
            <Pressable
              testID="onboarding-quick-start"
              accessibilityLabel={messages.onboardingQuickStart}
              hitSlop={8}
              style={styles.quickStartButton}
              onPress={onQuickStart}
            >
              <Text style={styles.quickStartText}>{messages.onboardingQuickStart}</Text>
            </Pressable>
          ) : null}
          {canSkip ? (
            <Pressable testID="onboarding-skip" hitSlop={8} style={styles.skipButton} onPress={onSkip}>
              <Text style={styles.skipText}>{messages.onboardingSkip}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#4caf6a',
    shadowColor: '#1c7538',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  arrow: {
    fontSize: 26,
  },
  textGroup: {
    flex: 1,
  },
  title: {
    color: '#1c7538',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 2,
  },
  description: {
    color: '#3f5345',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  aside: {
    alignItems: 'flex-end',
    gap: 6,
  },
  progress: {
    color: '#4a7c59',
    fontSize: 11,
    fontWeight: '800',
  },
  // 정체 완화 CTA(#274): selectSeed 단계의 주 행동 버튼이라 초록 솔리드로 강조.
  quickStartButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#2e9e52',
  },
  quickStartText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  skipButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#eef4ef',
  },
  skipText: {
    color: '#5b6b5f',
    fontSize: 11,
    fontWeight: '800',
  },
});
