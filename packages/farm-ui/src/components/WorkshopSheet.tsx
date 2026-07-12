import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  CROPS,
  formatMoney,
  formatRemainingTime,
  getProductionRecipeLabel,
  getProductionStates,
  type CropKey,
  type GameState,
  type ProductionRecipeKey,
  type ProductionStatus,
  type SupportedLocale,
} from '../../../farm-core/src';

import type { FarmMessages } from '../i18n';
import { SheetAction } from './SheetParts';

// 생산 가공 공방 시트(#250). '더보기' 시트 한 뎁스 뒤에서 진입한다.
//
// 매 수확마다 작물이 인벤토리에 부산물로 적재되고, 각 레시피 카드는 phase에 따라
// 하나의 액션만 노출한다:
//   idle     → 가공 시작(입력 작물 차감) — 재고가 부족하면 비활성
//   crafting → 완료까지 남은 시간(카운트다운, 액션 없음)
//   ready    → 수집(sellPrice 골드 획득) → 다시 idle
//
// 순수 로직은 모두 core(production.ts)에 있고 여기서는 표시와 액션 배선만 담당한다.
// 카운트다운은 부모의 틱 재렌더로 갱신되도록 now를 prop으로 받는다.

export function WorkshopSheet({
  gameState,
  locale,
  messages,
  now,
  getCropName,
  onStart,
  onCollect,
  onCollectAll,
}: {
  gameState: GameState;
  locale: SupportedLocale;
  messages: FarmMessages;
  now: number;
  getCropName: (cropKey: CropKey) => string;
  onStart: (key: ProductionRecipeKey) => void;
  onCollect: (key: ProductionRecipeKey) => void;
  onCollectAll: () => void;
}) {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const statuses = getProductionStates(gameState, safeNow);
  const readyCount = statuses.filter((status) => status.phase === 'ready').length;

  return (
    <View testID="workshop-sheet">
      {readyCount >= 2 ? (
        <View style={styles.collectAllArea}>
          <SheetAction
            testID="workshop-collect-all-action"
            label={messages.workshopCollectAllAction(readyCount)}
            onPress={onCollectAll}
          />
        </View>
      ) : null}
      {statuses.map((status) => (
        <RecipeCard
          key={status.key}
          status={status}
          inventory={gameState.production.inventory}
          locale={locale}
          messages={messages}
          getCropName={getCropName}
          onStart={onStart}
          onCollect={onCollect}
        />
      ))}
    </View>
  );
}

function RecipeCard({
  status,
  inventory,
  locale,
  messages,
  getCropName,
  onStart,
  onCollect,
}: {
  status: ProductionStatus;
  inventory: Partial<Record<CropKey, number>>;
  locale: SupportedLocale;
  messages: FarmMessages;
  getCropName: (cropKey: CropKey) => string;
  onStart: (key: ProductionRecipeKey) => void;
  onCollect: (key: ProductionRecipeKey) => void;
}) {
  const label = getProductionRecipeLabel(status.key, locale);
  // 판매가·주기 요약(무엇을 얻는지 항상 노출).
  const yieldLine = messages.workshopYieldLabel(
    formatMoney(status.sellPrice, locale),
    formatRemainingTime(status.timerMs, locale)
  );
  // 입력 재료: "🌾 밀 2/3" 형태로 보유/요구를 함께 보여준다.
  const inputsLine = status.inputs
    .map((input) => {
      const owned = inventory[input.crop] ?? 0;
      const icon = CROPS[input.crop]?.icon ?? '';
      return `${icon} ${getCropName(input.crop)} ${owned}/${input.qty}`;
    })
    .join('   ');

  let statusLine: string;
  let action: React.ReactNode = null;
  switch (status.phase) {
    case 'idle': {
      statusLine = status.hasIngredients ? messages.workshopReadyToCraftLabel : messages.workshopNeedIngredientsLabel;
      action = (
        <SheetAction
          label={messages.workshopStartAction}
          disabled={!status.hasIngredients}
          onPress={() => onStart(status.key)}
        />
      );
      break;
    }
    case 'crafting': {
      statusLine = messages.workshopCraftingLabel(formatRemainingTime(status.remainingMs, locale));
      break;
    }
    case 'ready':
    default: {
      statusLine = messages.workshopDoneLabel;
      action = (
        <SheetAction
          label={messages.workshopCollectAction(formatMoney(status.sellPrice, locale))}
          onPress={() => onCollect(status.key)}
        />
      );
      break;
    }
  }

  return (
    <View testID={`recipe-card-${status.key}`} style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.icon}>{status.icon}</Text>
        <View style={styles.textGroup}>
          <Text style={styles.name}>{label.name}</Text>
          <Text style={styles.desc}>{label.description}</Text>
        </View>
      </View>
      <Text style={styles.inputs} testID={`recipe-inputs-${status.key}`}>
        {inputsLine}
      </Text>
      <Text style={styles.yield}>{yieldLine}</Text>
      <Text style={styles.status} testID={`recipe-status-${status.key}`}>
        {statusLine}
      </Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  collectAllArea: {
    marginBottom: 8,
  },
  card: {
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  icon: {
    fontSize: 30,
  },
  textGroup: {
    flexShrink: 1,
    minWidth: 0,
  },
  name: {
    color: '#253126',
    fontSize: 15,
    fontWeight: '800',
  },
  desc: {
    marginTop: 2,
    color: '#667085',
    fontSize: 12,
  },
  inputs: {
    color: '#475467',
    fontSize: 12,
    fontWeight: '700',
  },
  yield: {
    color: '#2f8747',
    fontSize: 12,
    fontWeight: '700',
  },
  status: {
    color: '#475467',
    fontSize: 13,
    fontWeight: '600',
  },
});
