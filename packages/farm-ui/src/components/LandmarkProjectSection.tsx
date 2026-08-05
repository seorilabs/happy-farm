import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  LANDMARK_STAGES,
  formatMoney,
  getLandmarkStageQuote,
  getLandmarkStatus,
  type GameState,
  type LandmarkFundBlockedReason,
  type LandmarkStageKey,
  type SupportedLocale,
} from '../../../farm-core/src';

import type { FarmMessages } from '../i18n';
import { SheetAction, sheetPartStyles } from './SheetParts';

export const LANDMARK_FUND_CONFIRM_WINDOW_MS = 4000;

function getStageName(stageKey: LandmarkStageKey, messages: FarmMessages): string {
  switch (stageKey) {
    case 'foundation':
      return messages.landmarkStageFoundation;
    case 'frame':
      return messages.landmarkStageFrame;
    case 'equipment':
      return messages.landmarkStageEquipment;
    case 'festival_prep':
      return messages.landmarkStageFestivalPrep;
    case 'complete':
    default:
      return messages.landmarkStageComplete;
  }
}

function getBlockedReasonLabel(
  reason: LandmarkFundBlockedReason | null,
  messages: FarmMessages
): string {
  switch (reason) {
    case 'insufficient_gold':
      return messages.landmarkInsufficientGoldLabel;
    case 'insufficient_crops':
      return messages.landmarkInsufficientCropsLabel;
    case 'insufficient_animal_products':
      return messages.landmarkInsufficientAnimalProductsLabel;
    case 'insufficient_festival_points':
      return messages.landmarkInsufficientFestivalPointsLabel;
    case null:
    default:
      return messages.landmarkInsufficientResourcesLabel;
  }
}

function RequirementRow({
  label,
  satisfied,
  testID,
}: {
  label: string;
  satisfied: boolean;
  testID: string;
}) {
  return (
    <View testID={testID} style={styles.requirementRow}>
      <Text style={[styles.requirementState, satisfied ? styles.requirementReady : styles.requirementMissing]}>
        {satisfied ? '✓' : '•'}
      </Text>
      <Text style={[styles.requirementLabel, satisfied ? styles.requirementReady : styles.requirementMissing]}>
        {label}
      </Text>
    </View>
  );
}

export function LandmarkProjectSection({
  gameState,
  locale,
  messages,
  onFundLandmark,
}: {
  gameState: GameState;
  locale: SupportedLocale;
  messages: FarmMessages;
  onFundLandmark: (expectedTier: number, expectedStageKey: LandmarkStageKey) => void;
}) {
  const status = getLandmarkStatus(gameState);
  const quote = getLandmarkStageQuote(gameState);
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const disarmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disarm = useCallback(() => {
    if (disarmTimerRef.current != null) {
      clearTimeout(disarmTimerRef.current);
      disarmTimerRef.current = null;
    }
    setArmedKey(null);
  }, []);

  useEffect(
    () => () => {
      if (disarmTimerRef.current != null) {
        clearTimeout(disarmTimerRef.current);
      }
    },
    []
  );

  const currentQuoteKey = quote == null ? null : `${quote.tier}:${quote.stageKey}`;
  useEffect(() => {
    if (armedKey != null && armedKey !== currentQuoteKey) {
      disarm();
    }
  }, [armedKey, currentQuoteKey, disarm]);

  if (!status.isFeatureUnlocked) {
    return null;
  }

  const completedStageCount = status.completedForCurrentPrestige
    ? status.totalStageCount
    : Math.max(0, status.currentStageIndex);
  const displayTier = status.completedForCurrentPrestige ? status.completedTier : status.currentTier;

  function handleFundPress() {
    if (quote == null || !quote.canFund) {
      return;
    }
    const expectedKey = `${quote.tier}:${quote.stageKey}`;
    if (armedKey === expectedKey) {
      disarm();
      onFundLandmark(quote.tier, quote.stageKey);
      return;
    }

    if (disarmTimerRef.current != null) {
      clearTimeout(disarmTimerRef.current);
    }
    setArmedKey(expectedKey);
    disarmTimerRef.current = setTimeout(() => {
      disarmTimerRef.current = null;
      setArmedKey(null);
    }, LANDMARK_FUND_CONFIRM_WINDOW_MS);
  }

  return (
    <View testID="landmark-project-section">
      <Text style={sheetPartStyles.sheetSectionTitle}>{messages.landmarkSection}</Text>
      <View style={styles.projectCard}>
        <View style={styles.projectHeader}>
          <View style={styles.projectHeaderText}>
            <Text style={styles.projectTitle}>{messages.landmarkTierLabel(displayTier)}</Text>
            <Text style={styles.projectProgress} testID="landmark-stage-progress">
              {messages.landmarkStageProgressLabel(completedStageCount, status.totalStageCount)}
            </Text>
          </View>
          <Text style={styles.projectIcon}>{status.completedForCurrentPrestige ? '🏆' : '🏗️'}</Text>
        </View>

        <View style={styles.stageTrack}>
          {LANDMARK_STAGES.map((stage, index) => {
            const completed = status.completedForCurrentPrestige || index < status.currentStageIndex;
            const current = !status.completedForCurrentPrestige && index === status.currentStageIndex;
            return (
              <View
                key={stage.key}
                testID={`landmark-stage-${stage.key}`}
                style={[styles.stageStep, completed && styles.stageStepComplete, current && styles.stageStepCurrent]}
              >
                <Text style={[styles.stageIndex, (completed || current) && styles.stageIndexActive]}>{index + 1}</Text>
                <Text style={[styles.stageName, (completed || current) && styles.stageNameActive]} numberOfLines={2}>
                  {getStageName(stage.key, messages)}
                </Text>
              </View>
            );
          })}
        </View>

        {status.completedTier > 0 ? (
          <View testID="landmark-tier-complete" style={styles.completeCard}>
            <Text style={styles.completeIcon}>🏆</Text>
            <Text style={styles.completeTitle}>{messages.landmarkCompletedLabel(status.completedTier)}</Text>
            <Text style={styles.completeDesc}>{messages.landmarkCompletedDescription}</Text>
          </View>
        ) : null}

        {!status.completedForCurrentPrestige && quote != null ? (
          <>
            <Text style={styles.currentStageLabel}>
              {messages.landmarkCurrentStageLabel(getStageName(quote.stageKey, messages))}
            </Text>
            <View style={styles.requirementCard}>
              <RequirementRow
                testID="landmark-requirement-gold"
                satisfied={quote.holdings.gold >= quote.requirements.gold}
                label={messages.landmarkRequirementGold(
                  formatMoney(quote.holdings.gold, locale),
                  formatMoney(quote.requirements.gold, locale)
                )}
              />
              <RequirementRow
                testID="landmark-requirement-crops"
                satisfied={quote.holdings.cropUnits >= quote.requirements.cropUnits}
                label={messages.landmarkRequirementCropUnits(
                  formatMoney(quote.holdings.cropUnits, locale),
                  formatMoney(quote.requirements.cropUnits, locale)
                )}
              />
              <RequirementRow
                testID="landmark-requirement-animal-products"
                satisfied={quote.holdings.animalProducts >= quote.requirements.animalProducts}
                label={messages.landmarkRequirementAnimalProducts(
                  formatMoney(quote.holdings.animalProducts, locale),
                  formatMoney(quote.requirements.animalProducts, locale)
                )}
              />
              <RequirementRow
                testID="landmark-requirement-festival-points"
                satisfied={quote.holdings.festivalPoints >= quote.requirements.festivalPoints}
                label={messages.landmarkRequirementFestivalPoints(
                  formatMoney(quote.holdings.festivalPoints, locale),
                  formatMoney(quote.requirements.festivalPoints, locale)
                )}
              />
            </View>
            <Text style={styles.hint}>{messages.landmarkLowTierCropHint}</Text>
            {!quote.canFund ? (
              <Text testID="landmark-blocked-reason" style={styles.blockedReason}>
                {getBlockedReasonLabel(quote.blockedReason, messages)}
              </Text>
            ) : null}
            <SheetAction
              testID="landmark-fund-action"
              label={
                armedKey === currentQuoteKey
                  ? messages.landmarkFundConfirmAction(getStageName(quote.stageKey, messages))
                  : messages.landmarkFundAction(getStageName(quote.stageKey, messages))
              }
              accessibilityHint={
                armedKey === currentQuoteKey
                  ? messages.landmarkFundConfirmHint
                  : messages.landmarkFundAccessibilityHint
              }
              disabled={!quote.canFund}
              onPress={handleFundPress}
            />
            {armedKey === currentQuoteKey ? (
              <Text
                testID="landmark-fund-confirm-hint"
                accessibilityLiveRegion="assertive"
                style={styles.confirmHint}
              >
                {messages.landmarkFundConfirmHint}
              </Text>
            ) : null}
          </>
        ) : null}

        <View style={styles.policyCard}>
          <Text style={styles.policyText}>{messages.landmarkNoEconomyBonusHint}</Text>
          <Text style={styles.policyText}>{messages.landmarkPersistentHint}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  projectCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2c98c',
    borderRadius: 12,
    backgroundColor: '#fffbeb',
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  projectHeaderText: {
    minWidth: 0,
    flex: 1,
  },
  projectTitle: {
    color: '#614210',
    fontSize: 17,
    fontWeight: '900',
  },
  projectProgress: {
    marginTop: 3,
    color: '#8a621d',
    fontSize: 12,
    fontWeight: '700',
  },
  projectIcon: {
    flexShrink: 0,
    fontSize: 30,
  },
  stageTrack: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 14,
    marginBottom: 12,
  },
  stageStep: {
    minWidth: 0,
    flex: 1,
    minHeight: 66,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#ded7c7',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  stageStepComplete: {
    borderColor: '#7ab986',
    backgroundColor: '#edf8ef',
  },
  stageStepCurrent: {
    borderWidth: 2,
    borderColor: '#d39524',
    backgroundColor: '#fff4cd',
  },
  stageIndex: {
    color: '#667085',
    fontSize: 11,
    fontWeight: '900',
  },
  stageIndexActive: {
    color: '#8a621d',
  },
  stageName: {
    marginTop: 3,
    color: '#667085',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  stageNameActive: {
    color: '#4c3a18',
    fontWeight: '900',
  },
  currentStageLabel: {
    marginBottom: 7,
    color: '#614210',
    fontSize: 14,
    fontWeight: '900',
  },
  requirementCard: {
    gap: 6,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  requirementState: {
    width: 14,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  requirementLabel: {
    minWidth: 0,
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  requirementReady: {
    color: '#247241',
  },
  requirementMissing: {
    color: '#b54708',
  },
  hint: {
    marginTop: 8,
    color: '#7a5b24',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  blockedReason: {
    marginTop: 7,
    color: '#b42318',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  confirmHint: {
    marginTop: 7,
    color: '#614210',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  policyCard: {
    gap: 3,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2c98c',
  },
  policyText: {
    color: '#7a6b4d',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  completeCard: {
    alignItems: 'center',
    marginBottom: 12,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#fff1b8',
  },
  completeIcon: {
    fontSize: 34,
  },
  completeTitle: {
    marginTop: 3,
    color: '#76510d',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  completeDesc: {
    marginTop: 4,
    color: '#7a6b4d',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
