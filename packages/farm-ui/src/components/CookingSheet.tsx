import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  COOKING_DISHES,
  COOKING_GRADES,
  COOKING_MAX_INGREDIENTS,
  COOKING_MIN_INGREDIENTS,
  CROPS,
  canStartCooking,
  formatRemainingTime,
  getCookingCompendiumProgress,
  getCookingDishLabel,
  getCookingPotStatus,
  getCookingSuccessRate,
  getCookingTimerMs,
  type CookingDishKey,
  type CookingGradeKey,
  type CropKey,
  type GameState,
  type SupportedLocale,
} from '../../../farm-core/src';

import type { FarmMessages } from '../i18n';
import { SheetAction } from './SheetParts';

// 요리 솥 + 요리 도감 시트(#442). '더보기' 시트 한 뎁스 뒤에서 진입한다.
//
// 위 절반은 요리 솥: 수확 부산물 재고(production.inventory)에서 서로 다른 작물
// 2~3종을 골라 조리를 시작하고, phase에 따라 하나의 상태/액션만 노출한다:
//   idle    → 재료 선택 + 요리하기(재료 1개씩 차감) — 규격 미달이면 비활성
//   cooking → 완성까지 남은 시간 + 광고 즉시 완성 + 취소(재료 환불)
//   ready   → 결과 확인(성공: 도감 등록 / 실패: 재료 일부 환급 — 추첨은 이 시점)
//
// 아래 절반은 150종 요리 도감: 등급별 발견 현황과 완성도 마일스톤(영구 판매 보너스)을
// 보여주고, 미발견 메뉴는 '?'로 표시한다(GDD의 Menu Book).
//
// 순수 로직은 모두 core(cooking.ts)에 있고 여기서는 표시와 액션 배선만 담당한다.
// 카운트다운은 부모의 틱 재렌더로 갱신되도록 now를 prop으로 받는다.

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function getGradeLabel(grade: CookingGradeKey, messages: FarmMessages): string {
  switch (grade) {
    case 'common':
      return messages.cookingGradeCommon;
    case 'rare':
      return messages.cookingGradeRare;
    case 'epic':
      return messages.cookingGradeEpic;
    case 'legendary':
    default:
      return messages.cookingGradeLegendary;
  }
}

export function CookingSheet({
  gameState,
  locale,
  messages,
  now,
  getCropName,
  adSupported,
  onStart,
  onCancel,
  onResolve,
  onRushAd,
}: {
  gameState: GameState;
  locale: SupportedLocale;
  messages: FarmMessages;
  now: number;
  getCropName: (cropKey: CropKey) => string;
  adSupported: boolean;
  onStart: (ingredients: CropKey[]) => void;
  onCancel: () => void;
  onResolve: () => void;
  onRushAd: () => void;
}) {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const potStatus = getCookingPotStatus(gameState, safeNow);
  const progress = getCookingCompendiumProgress(gameState);

  // 시트가 열려 있는 동안만 유지되는 선택 상태(시트 재오픈 시 초기화 — WheelSheet 관례).
  const [selectedIngredients, setSelectedIngredients] = useState<CropKey[]>([]);
  const [inspectedDishKey, setInspectedDishKey] = useState<CookingDishKey | null>(null);

  const inventory = gameState.production.inventory;
  // 재고가 있는 작물만 카탈로그 순서로 노출한다. 조리 시작으로 재고가 사라진 선택은
  // 렌더 시점에 걸러 stale 선택이 시작 버튼을 잘못 활성화하지 않게 한다.
  const stockedCrops = (Object.keys(CROPS) as CropKey[]).filter((cropKey) => (inventory[cropKey] ?? 0) > 0);
  const selection = selectedIngredients.filter((cropKey) => (inventory[cropKey] ?? 0) > 0);

  function toggleIngredient(cropKey: CropKey) {
    setSelectedIngredients((current) => {
      const active = current.filter((key) => (inventory[key] ?? 0) > 0);
      if (active.includes(cropKey)) {
        return active.filter((key) => key !== cropKey);
      }
      if (active.length >= COOKING_MAX_INGREDIENTS) {
        return active;
      }
      return [...active, cropKey];
    });
  }

  const canCook = canStartCooking(gameState, selection);

  return (
    <View testID="cooking-sheet">
      <View style={styles.potCard} testID="cooking-pot-card">
        <Text style={styles.sectionTitle}>{messages.cookingPotSectionTitle}</Text>
        {potStatus.phase === 'idle' ? (
          <>
            <Text style={styles.subTitle}>
              {messages.cookingIngredientsTitle(COOKING_MIN_INGREDIENTS, COOKING_MAX_INGREDIENTS)}
            </Text>
            {stockedCrops.length === 0 ? (
              <Text style={styles.emptyLabel}>{messages.cookingIngredientEmptyLabel}</Text>
            ) : (
              <View style={styles.ingredientGrid}>
                {stockedCrops.map((cropKey) => {
                  const selected = selection.includes(cropKey);
                  return (
                    <Pressable
                      key={cropKey}
                      testID={`cooking-ingredient-${cropKey}`}
                      style={[styles.ingredientChip, selected && styles.ingredientChipSelected]}
                      onPress={() => toggleIngredient(cropKey)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={messages.cookingIngredientAccessibilityLabel(
                        getCropName(cropKey),
                        inventory[cropKey] ?? 0
                      )}
                    >
                      <Text style={styles.ingredientIcon}>{CROPS[cropKey]?.icon ?? ''}</Text>
                      <Text style={styles.ingredientCount}>{inventory[cropKey] ?? 0}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {selection.length >= COOKING_MIN_INGREDIENTS ? (
              <Text style={styles.infoLine} testID="cooking-preview-line">
                {messages.cookingSuccessRateLabel(formatPercent(getCookingSuccessRate(selection.length)))}
                {' · '}
                {messages.cookingTimerLabel(formatRemainingTime(getCookingTimerMs(selection), locale))}
              </Text>
            ) : null}
            <SheetAction
              testID="cooking-start-action"
              label={messages.cookingStartAction}
              disabled={!canCook}
              onPress={() => {
                onStart(selection);
                setSelectedIngredients([]);
              }}
            />
          </>
        ) : null}
        {potStatus.phase === 'cooking' ? (
          <>
            <Text style={styles.potIngredientsLine}>
              {potStatus.ingredients.map((cropKey) => CROPS[cropKey]?.icon ?? '').join(' ')}
            </Text>
            <Text style={styles.infoLine} testID="cooking-status-line">
              {messages.cookingCookingLabel(formatRemainingTime(potStatus.remainingMs, locale))}
              {' · '}
              {messages.cookingSuccessRateLabel(formatPercent(potStatus.successRate))}
            </Text>
            {adSupported ? (
              <SheetAction testID="cooking-rush-ad-action" label={messages.cookingRushAdAction} onPress={onRushAd} />
            ) : null}
            <SheetAction
              testID="cooking-cancel-action"
              label={messages.cookingCancelAction}
              secondary
              onPress={onCancel}
            />
          </>
        ) : null}
        {potStatus.phase === 'ready' ? (
          <>
            <Text style={styles.potIngredientsLine}>
              {potStatus.ingredients.map((cropKey) => CROPS[cropKey]?.icon ?? '').join(' ')}
            </Text>
            <Text style={styles.infoLine} testID="cooking-status-line">
              {messages.cookingReadyLabel}
            </Text>
            <SheetAction testID="cooking-resolve-action" label={messages.cookingOpenAction} onPress={onResolve} />
          </>
        ) : null}
      </View>

      <View style={styles.compendiumHeader}>
        <Text style={styles.sectionTitle}>{messages.cookingCompendiumSectionTitle}</Text>
        <Text style={styles.progressLine} testID="cooking-compendium-progress">
          {messages.cookingCompendiumProgressLabel(progress.discoveredCount, progress.totalDishes)}
        </Text>
        {progress.sellBonus > 0 ? (
          <Text style={styles.bonusLine}>{messages.cookingCompendiumBonusLabel(formatPercent(progress.sellBonus))}</Text>
        ) : null}
        <Text style={styles.milestoneLine}>
          {progress.nextMilestone != null
            ? messages.cookingNextMilestoneLabel(
                progress.nextMilestone.count,
                formatPercent(progress.nextMilestone.sellBonus)
              )
            : messages.cookingCompendiumCompleteLabel}
        </Text>
      </View>

      {inspectedDishKey != null ? (
        <DishDetail
          dishKey={inspectedDishKey}
          cookedCount={gameState.cooking.discoveredDishes[inspectedDishKey] ?? 0}
          locale={locale}
          messages={messages}
        />
      ) : null}

      {COOKING_GRADES.map((grade) => {
        const dishes = COOKING_DISHES.filter((dish) => dish.grade === grade.key);
        return (
          <View key={grade.key} style={styles.gradeSection}>
            <Text style={styles.gradeTitle}>
              {getGradeLabel(grade.key, messages)} · {progress.discoveredByGrade[grade.key]}/
              {progress.totalByGrade[grade.key]}
            </Text>
            <View style={styles.dishGrid}>
              {dishes.map((dish) => {
                const discovered = (gameState.cooking.discoveredDishes[dish.key] ?? 0) > 0;
                return (
                  <Pressable
                    key={dish.key}
                    testID={`cooking-dish-${dish.key}`}
                    style={[styles.dishCell, inspectedDishKey === dish.key && styles.dishCellInspected]}
                    onPress={() => setInspectedDishKey((current) => (current === dish.key ? null : dish.key))}
                    accessibilityRole="button"
                    accessibilityLabel={
                      discovered ? getCookingDishLabel(dish.key, locale).name : messages.cookingUndiscoveredDishLabel
                    }
                  >
                    <Text style={styles.dishCellIcon}>{discovered ? dish.icon : '?'}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// 탭한 메뉴의 상세(발견: 이름/설명/조리 횟수, 미발견: 잠금 문구). 미발견 메뉴의
// 이름을 노출하지 않아 수집 동기를 지킨다.
function DishDetail({
  dishKey,
  cookedCount,
  locale,
  messages,
}: {
  dishKey: CookingDishKey;
  cookedCount: number;
  locale: SupportedLocale;
  messages: FarmMessages;
}) {
  const discovered = cookedCount > 0;
  const label = discovered ? getCookingDishLabel(dishKey, locale) : null;
  return (
    <View style={styles.dishDetail} testID="cooking-dish-detail">
      {label != null ? (
        <>
          <Text style={styles.dishDetailName}>{label.name}</Text>
          <Text style={styles.dishDetailDesc}>{label.description}</Text>
          <Text style={styles.dishDetailCount}>{messages.cookingDishCookedCountLabel(cookedCount)}</Text>
        </>
      ) : (
        <Text style={styles.dishDetailDesc}>{messages.cookingUndiscoveredDishLabel}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  potCard: {
    marginBottom: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    gap: 8,
  },
  sectionTitle: {
    color: '#253126',
    fontSize: 15,
    fontWeight: '800',
  },
  subTitle: {
    color: '#475467',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyLabel: {
    color: '#667085',
    fontSize: 12,
  },
  ingredientGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  ingredientChip: {
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    backgroundColor: '#f9fafb',
    minWidth: 44,
  },
  ingredientChipSelected: {
    borderColor: '#2f8747',
    backgroundColor: '#e7f5ec',
  },
  ingredientIcon: {
    fontSize: 20,
  },
  ingredientCount: {
    color: '#475467',
    fontSize: 11,
    fontWeight: '700',
  },
  infoLine: {
    color: '#475467',
    fontSize: 13,
    fontWeight: '600',
  },
  potIngredientsLine: {
    fontSize: 24,
    letterSpacing: 4,
  },
  compendiumHeader: {
    marginBottom: 10,
    gap: 4,
  },
  progressLine: {
    color: '#253126',
    fontSize: 13,
    fontWeight: '700',
  },
  bonusLine: {
    color: '#2f8747',
    fontSize: 12,
    fontWeight: '700',
  },
  milestoneLine: {
    color: '#667085',
    fontSize: 12,
  },
  dishDetail: {
    marginBottom: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    gap: 3,
  },
  dishDetailName: {
    color: '#253126',
    fontSize: 14,
    fontWeight: '800',
  },
  dishDetailDesc: {
    color: '#667085',
    fontSize: 12,
  },
  dishDetailCount: {
    color: '#2f8747',
    fontSize: 11,
    fontWeight: '700',
  },
  gradeSection: {
    marginBottom: 12,
    gap: 6,
  },
  gradeTitle: {
    color: '#475467',
    fontSize: 12,
    fontWeight: '800',
  },
  dishGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dishCell: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 8,
    backgroundColor: '#f9fafb',
  },
  dishCellInspected: {
    borderColor: '#2f8747',
    backgroundColor: '#e7f5ec',
  },
  dishCellIcon: {
    fontSize: 18,
  },
});
