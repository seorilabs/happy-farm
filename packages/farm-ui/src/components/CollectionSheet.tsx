import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  COLLECTION_FULL_REWARD_KEY,
  CROPS,
  MUTATION_KINDS,
  formatMoney,
  getAreaLabel,
  getAreaUnlockRequirementText,
  getCropLabel,
  getMasteryStatus,
  isAreaUnlocked,
  isCropDiscovered,
  isMutationDiscovered,
  type CollectionRewardKey,
  type CollectionSummary,
  type CropKey,
  type GameState,
  type SupportedLocale,
} from '../../../farm-core/src';

import type { FarmMessages } from '../i18n';
import { SheetAction, sheetPartStyles } from './SheetParts';

function getKnownCrop(cropKey: CropKey) {
  const crop = CROPS[cropKey];
  if (crop == null) {
    throw new Error(`Unknown crop: ${cropKey}`);
  }
  return crop;
}

function MasteryBadge({ gameState, cropKey }: { gameState: GameState; cropKey: CropKey }) {
  const mastery = getMasteryStatus(gameState, cropKey);
  const progressText =
    mastery.nextThreshold == null
      ? `${mastery.harvestCount}`
      : `${mastery.harvestCount}/${mastery.nextThreshold}`;

  return (
    <View style={styles.masteryRow}>
      {mastery.rank != null ? <Text style={styles.masteryRankIcon}>{mastery.rank.icon}</Text> : null}
      <Text style={[styles.masteryProgress, mastery.nextThreshold == null && styles.masteryProgressMax]}>
        {progressText}
      </Text>
    </View>
  );
}

function MutationBadges({ gameState, cropKey }: { gameState: GameState; cropKey: CropKey }) {
  return (
    <View style={styles.mutationRow}>
      {MUTATION_KINDS.map((kind) => {
        const discovered = isMutationDiscovered(gameState, cropKey, kind.key);
        return (
          <View key={kind.key} style={[styles.mutationCell, !discovered && styles.mutationCellLocked]}>
            <Text style={styles.mutationCellIcon}>{discovered ? kind.icon : '·'}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function CollectionSheet({
  gameState,
  locale,
  messages,
  collectionSummary,
  onClaimReward,
}: {
  gameState: GameState;
  locale: SupportedLocale;
  messages: FarmMessages;
  collectionSummary: CollectionSummary;
  onClaimReward: (rewardKey: CollectionRewardKey) => void;
}) {
  return (
    <View testID="collection-sheet">
      {collectionSummary.areas.map((area) => {
        const areaLabel = getAreaLabel(area.areaKey, locale);
        // 아직 해금하지 않은 구역엔 해금 조건 힌트를 노출해 도감이 다음 진행 목표를
        // 안내하게 한다(#228). 문구는 씨앗 스트립의 잠금 안내와 동일한 순수 함수
        // getAreaUnlockRequirementText에서 파생해 표시가 일치한다. 개별 미발견 작물은
        // 아래에서 그대로 ❓/???로 유지해 작물 정체는 스포일하지 않는다.
        const areaUnlocked = isAreaUnlocked(gameState, area.areaKey);
        return (
          <View key={area.areaKey} style={styles.collectionArea}>
            <View style={styles.collectionAreaHeader}>
              <Text style={styles.collectionAreaName} numberOfLines={1}>
                {areaLabel.name}
              </Text>
              <Text style={[styles.collectionAreaProgress, area.completed && styles.collectionAreaProgressDone]}>
                {area.completed ? messages.collectionCompletedBadge : `${area.discoveredCount}/${area.totalCount}`}
              </Text>
            </View>
            {!areaUnlocked ? (
              <Text
                testID={`collection-unlock-hint-${area.areaKey}`}
                style={styles.collectionUnlockHint}
                numberOfLines={2}
              >
                {messages.collectionUnlockHint(getAreaUnlockRequirementText(gameState, area.areaKey, locale))}
              </Text>
            ) : null}
            <View style={styles.collectionGrid}>
              {area.cropKeys.map((cropKey) => {
                const discovered = isCropDiscovered(gameState, cropKey);
                const crop = getKnownCrop(cropKey);
                return (
                  <View key={cropKey} style={[styles.collectionCell, !discovered && styles.collectionCellLocked]}>
                    <Text style={styles.collectionCellIcon}>{discovered ? crop.icon : '❓'}</Text>
                    <Text style={styles.collectionCellName} numberOfLines={1}>
                      {discovered ? getCropLabel(cropKey, locale).name : '???'}
                    </Text>
                    {discovered ? (
                      <>
                        <Text style={styles.collectionCellValue} numberOfLines={1}>
                          {formatMoney(crop.sell, locale)}G
                        </Text>
                        <MasteryBadge gameState={gameState} cropKey={cropKey} />
                        <MutationBadges gameState={gameState} cropKey={cropKey} />
                      </>
                    ) : null}
                  </View>
                );
              })}
            </View>
            {area.rewardClaimed ? (
              <Text style={styles.collectionClaimedLabel}>{messages.collectionClaimedLabel}</Text>
            ) : area.rewardClaimable ? (
              <SheetAction
                label={messages.collectionClaimAction(formatMoney(area.reward, locale))}
                onPress={() => onClaimReward(area.areaKey)}
              />
            ) : null}
          </View>
        );
      })}

      <Text style={sheetPartStyles.sheetSectionTitle}>{messages.collectionFullTitle}</Text>
      <View style={styles.collectionArea}>
        <Text style={styles.collectionFullDesc}>
          {messages.collectionFullDesc(collectionSummary.discoveredCount, collectionSummary.totalCount)}
        </Text>
        {collectionSummary.fullRewardClaimed ? (
          <Text style={styles.collectionClaimedLabel}>{messages.collectionClaimedLabel}</Text>
        ) : collectionSummary.fullRewardClaimable ? (
          <SheetAction
            label={messages.collectionClaimAction(formatMoney(collectionSummary.fullReward, locale))}
            onPress={() => onClaimReward(COLLECTION_FULL_REWARD_KEY)}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  collectionArea: {
    marginBottom: 14,
  },
  collectionAreaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  collectionAreaName: {
    minWidth: 0,
    flexShrink: 1,
    color: '#253126',
    fontSize: 15,
    fontWeight: '900',
  },
  collectionAreaProgress: {
    flexShrink: 0,
    color: '#7b8794',
    fontSize: 13,
    fontWeight: '900',
  },
  collectionAreaProgressDone: {
    color: '#247241',
  },
  collectionUnlockHint: {
    marginBottom: 8,
    color: '#8f5c00',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  collectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  collectionCell: {
    width: 72,
    minHeight: 96,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  collectionCellLocked: {
    minHeight: 72,
    borderColor: '#e1e5ea',
    backgroundColor: '#f1f3f5',
  },
  collectionCellIcon: {
    fontSize: 26,
    lineHeight: 30,
  },
  collectionCellName: {
    maxWidth: '100%',
    color: '#344054',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  collectionCellValue: {
    maxWidth: '100%',
    color: '#8f5c00',
    fontSize: 10,
    fontWeight: '900',
  },
  masteryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  masteryRankIcon: {
    fontSize: 10,
    lineHeight: 12,
  },
  masteryProgress: {
    color: '#7b8794',
    fontSize: 9,
    fontWeight: '900',
  },
  masteryProgressMax: {
    color: '#6f57d9',
  },
  mutationRow: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 1,
  },
  mutationCell: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#f1d98a',
    backgroundColor: '#fff8d8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mutationCellLocked: {
    borderColor: '#e1e5ea',
    backgroundColor: '#f1f3f5',
  },
  mutationCellIcon: {
    fontSize: 10,
    lineHeight: 12,
  },
  collectionClaimedLabel: {
    marginTop: 8,
    color: '#7b8794',
    fontSize: 13,
    fontWeight: '900',
  },
  collectionFullDesc: {
    color: '#344054',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
});
