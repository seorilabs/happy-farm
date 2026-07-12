import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { ONBOARDING_STEPS, type OnboardingStep } from '../../../farm-core/src';
import type { FarmMessages } from '../i18n';

// Keep existing farm-ui imports working while farm-core remains the canonical
// owner of the persisted onboarding step contract.
export { ONBOARDING_STEPS };
export type { OnboardingStep };

// Directional hint of the coachmark. The seed strip sits below the banner, so
// that step points down; action steps point up and the final reward uses a gift.
const STEP_ARROW: Record<OnboardingStep, string> = {
  selectSeed: '👇',
  plant: '👆',
  harvest: '👆',
  reward: '🎁',
};

function getStepText(step: OnboardingStep, messages: FarmMessages): { title: string; description: string } {
  switch (step) {
    case 'selectSeed':
      return { title: messages.onboardingSelectSeedTitle, description: messages.onboardingSelectSeedDesc };
    case 'plant':
      return { title: messages.onboardingPlantTitle, description: messages.onboardingPlantDesc };
    case 'harvest':
      return { title: messages.onboardingHarvestTitle, description: messages.onboardingHarvestDesc };
    case 'reward':
      return { title: messages.onboardingRewardTitle, description: messages.onboardingRewardDesc };
  }
}

// First-session onboarding coachmark banner. Mounted between the header and the
// farm to guide the next action. The container is box-none so taps outside the
// card pass straight through to the game.
export function FarmOnboarding({
  step,
  messages,
  onSkip,
  onRewardConfirm,
  onQuickStart,
}: {
  step: OnboardingStep;
  messages: FarmMessages;
  onSkip: () => void;
  onRewardConfirm: () => void;
  // #274: selectSeed 단계에서만 노출되는 "바로 시작" CTA. 탭 시 대표 씨앗을
  // 자동 선택해 plant 단계로 즉시 진행시킨다(직접 선택도 여전히 가능).
  onQuickStart?: () => void;
}) {
  const { title, description } = getStepText(step, messages);
  const stepIndex = ONBOARDING_STEPS.indexOf(step);
  const [skipConfirmationStep, setSkipConfirmationStep] = useState<OnboardingStep | null>(null);
  const isSkipConfirmationOpen = skipConfirmationStep === step;
  // Skip is limited to the action stage. Once the first harvest is complete,
  // the explicit reward confirmation is the only way to finish the guide.
  const canSkip = step === 'harvest';
  // "바로 시작"은 정체가 가장 심한 selectSeed 단계에서만 제공한다(#274).
  const canQuickStart = step === 'selectSeed' && onQuickStart != null;
  const canConfirmReward = step === 'reward';

  useEffect(() => {
    setSkipConfirmationStep(null);
  }, [step]);

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
        <View style={styles.contentRow}>
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
                style={styles.primaryButton}
                onPress={onQuickStart}
              >
                <Text style={styles.primaryButtonText}>{messages.onboardingQuickStart}</Text>
              </Pressable>
            ) : null}
            {canConfirmReward ? (
              <Pressable
                testID="onboarding-reward-confirm"
                accessibilityLabel={messages.onboardingRewardContinue}
                hitSlop={8}
                style={styles.primaryButton}
                onPress={onRewardConfirm}
              >
                <Text style={styles.primaryButtonText}>{messages.onboardingRewardContinue}</Text>
              </Pressable>
            ) : null}
            {canSkip ? (
              <Pressable
                testID="onboarding-skip"
                accessibilityLabel={messages.onboardingSkip}
                hitSlop={8}
                style={styles.skipButton}
                onPress={() => setSkipConfirmationStep(step)}
              >
                <Text style={styles.skipText}>{messages.onboardingSkip}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        {isSkipConfirmationOpen ? (
          <View testID="onboarding-skip-confirm" style={styles.skipConfirmation}>
            <Text style={styles.skipConfirmationTitle}>{messages.onboardingSkipConfirmTitle}</Text>
            <Text style={styles.skipConfirmationDescription}>{messages.onboardingSkipConfirmDesc}</Text>
            <View style={styles.skipConfirmationActions}>
              <Pressable
                testID="onboarding-skip-cancel"
                accessibilityLabel={messages.onboardingSkipConfirmCancel}
                style={styles.skipConfirmationCancelButton}
                onPress={() => setSkipConfirmationStep(null)}
              >
                <Text style={styles.skipConfirmationCancelText}>{messages.onboardingSkipConfirmCancel}</Text>
              </Pressable>
              <Pressable
                testID="onboarding-skip-confirm-action"
                accessibilityLabel={messages.onboardingSkipConfirmAction}
                style={styles.skipConfirmationActionButton}
                onPress={() => {
                  setSkipConfirmationStep(null);
                  onSkip();
                }}
              >
                <Text style={styles.skipConfirmationActionText}>{messages.onboardingSkipConfirmAction}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
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
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  // Primary onboarding actions use a compact solid treatment so the coachmark
  // copy keeps enough room to wrap on narrow portrait screens.
  primaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#2e9e52',
  },
  primaryButtonText: {
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
  skipConfirmation: {
    alignItems: 'stretch',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f7faf7',
    borderWidth: 1,
    borderColor: '#d7e4d9',
  },
  skipConfirmationTitle: {
    color: '#26472e',
    fontSize: 14,
    fontWeight: '900',
  },
  skipConfirmationDescription: {
    color: '#4d6252',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    flexShrink: 1,
  },
  skipConfirmationActions: {
    alignItems: 'stretch',
    gap: 8,
  },
  skipConfirmationCancelButton: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#b9ccbd',
  },
  skipConfirmationCancelText: {
    color: '#35583e',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    flexShrink: 1,
  },
  skipConfirmationActionButton: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#e7eee8',
  },
  skipConfirmationActionText: {
    color: '#4d6252',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    flexShrink: 1,
  },
});
