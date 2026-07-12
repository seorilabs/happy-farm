import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { CropGlyph } from '../farmArt';
import {
  COLLECTION_FULL_REWARD_KEY,
  CROPS,
  MUTATION_KINDS,
  formatMoney,
  getAreaLabel,
  getAreaUnlockRequirementText,
  getCropLabel,
  getMasteryStatus,
  getMutationCollectionSummary,
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
  // 발견한 작물을 탭하면 플레이버 텍스트(설명)를 상세 팝업으로 보여준다(#253).
  // 72px 그리드 셀에는 설명을 담을 공간이 없어 한 뎁스 뒤의 팝업에 배치한다.
  const [detailCropKey, setDetailCropKey] = React.useState<CropKey | null>(null);
  const detailCrop = detailCropKey != null ? getKnownCrop(detailCropKey) : null;
  const detailLabel = detailCropKey != null ? getCropLabel(detailCropKey, locale) : null;
  const mutationCollectionSummary = getMutationCollectionSummary(gameState);

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
                  <Pressable
                    key={cropKey}
                    style={[styles.collectionCell, !discovered && styles.collectionCellLocked]}
                    // 발견한 작물만 상세 팝업을 연다. 미발견 셀은 잠금 표현을 유지하고 탭 비활성.
                    onPress={discovered ? () => setDetailCropKey(cropKey) : undefined}
                    disabled={!discovered}
                    testID={`collection-cell-${cropKey}`}
                  >
                    {discovered ? (
                      <CropGlyph cropKey={cropKey} emoji={crop.icon} size={28} textStyle={styles.collectionCellIcon} />
                    ) : (
                      <Text style={styles.collectionCellIcon}>❓</Text>
                    )}
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
                  </Pressable>
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
        <Text testID="collection-mutation-progress" style={styles.collectionMutationProgress}>
          {messages.collectionMutationProgress(
            mutationCollectionSummary.discoveredCount,
            mutationCollectionSummary.totalCount,
          )}
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

      {detailCropKey != null && detailCrop != null && detailLabel != null ? (
        <Modal
          transparent
          visible
          animationType="fade"
          onRequestClose={() => setDetailCropKey(null)}
        >
          <Pressable
            style={styles.detailBackdrop}
            onPress={() => setDetailCropKey(null)}
            testID="collection-detail-backdrop"
          >
            {/* 카드 내부 탭은 배경으로 전파돼 닫히지 않도록 빈 onPress로 막는다. */}
            <Pressable style={styles.detailCard} onPress={() => {}} testID="collection-detail-card">
              <CropGlyph cropKey={detailCropKey} emoji={detailCrop.icon} size={52} textStyle={styles.detailIcon} />
              <Text style={styles.detailName}>{detailLabel.name}</Text>
              <Text style={styles.detailValue}>{formatMoney(detailCrop.sell, locale)}G</Text>
              <Text style={styles.detailDescription}>{detailLabel.description}</Text>
              <SheetAction
                label={messages.collectionDetailCloseAction}
                onPress={() => setDetailCropKey(null)}
              />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

// 도감 셀 폭. 돌연변이 배지 행이 이 폭(에서 좌우 패딩을 뺀 값)을 넘지 않아야 한다.
// 테스트에서 레이아웃 불변식을 고정하기 위해 상수로 노출한다.
export const COLLECTION_CELL_WIDTH = 72;

export const styles = StyleSheet.create({
  collectionArea: {
    marginBottom: 14,
  },
  detailBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  detailCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
  },
  detailIcon: {
    fontSize: 48,
    lineHeight: 54,
  },
  detailName: {
    color: '#253126',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  detailValue: {
    color: '#247241',
    fontSize: 14,
    fontWeight: '900',
  },
  detailDescription: {
    marginTop: 2,
    marginBottom: 6,
    color: '#475467',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    textAlign: 'center',
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
    width: COLLECTION_CELL_WIDTH,
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
    // 내부 콘텐츠(특히 돌연변이 배지 행)가 카드 경계를 넘지 않도록 클리핑한다.
    // 배지 행은 아래에서 카드 폭에 맞게 사이징하지만, 이 클립을 안전망으로 둔다(#237 선례).
    overflow: 'hidden',
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
    gap: 2,
    marginTop: 1,
    // 4개 셀이 72px 카드(가용폭 64px) 안에 들어오도록 폭을 제한하고, 만약을 대비해
    // 줄바꿈을 허용한다(돌연변이 종류가 더 늘어도 박스를 넘지 않음 — #266 후속 UI 회귀).
    maxWidth: '100%',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  mutationCell: {
    // 13*4 + gap 2*3 = 58px ≤ 카드 가용폭 64px(72 - 좌우 패딩 4*2). 기존 18px는
    // 4종 기준 81px라 카드를 튀어나가 UI가 깨졌다.
    width: 13,
    height: 13,
    borderRadius: 3,
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
    fontSize: 9,
    lineHeight: 11,
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
  collectionMutationProgress: {
    marginTop: 6,
    color: '#6f57d9',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
  },
});
