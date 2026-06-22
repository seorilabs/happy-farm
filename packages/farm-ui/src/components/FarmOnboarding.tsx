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
}: {
  step: OnboardingStep;
  messages: FarmMessages;
  onSkip: () => void;
}) {
  const { title, description } = getStepText(step, messages);
  const stepIndex = ONBOARDING_STEPS.indexOf(step);

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
          <Pressable testID="onboarding-skip" hitSlop={8} style={styles.skipButton} onPress={onSkip}>
            <Text style={styles.skipText}>{messages.onboardingSkip}</Text>
          </Pressable>
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
