import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  formatMoney,
  formatRemainingTime,
  getAnimalLabel,
  getAnimalStates,
  type AnimalKey,
  type AnimalStatus,
  type GameState,
  type SupportedLocale,
} from '../../../farm-core/src';

import type { FarmMessages } from '../i18n';
import { SheetAction } from './SheetParts';

// 동물 사육/생산 시트(#249). '더보기' 시트 한 뎁스 뒤에서 진입한다.
//
// 각 동물 카드는 파생 상태(getAnimalState)의 phase에 따라 하나의 액션만 노출한다:
//   locked  → 축사 짓기(purchaseCost 골드)
//   idle    → 먹이 주기(feedCost 골드) — 급여 시 결정적 타이머 시작
//   growing → 수확까지 남은 시간(카운트다운, 액션 없음)
//   ready   → 수확(producePrice 골드 획득) → 다시 idle
//
// 순수 로직은 모두 core(animals.ts)에 있고, 여기서는 표시와 액션 배선만 담당한다.
// 카운트다운은 부모의 틱 재렌더로 갱신되도록 now를 prop으로 받는다(WheelSheet와 동일).

export function AnimalsSheet({
  gameState,
  locale,
  messages,
  now,
  onPurchase,
  onFeed,
  onCollect,
}: {
  gameState: GameState;
  locale: SupportedLocale;
  messages: FarmMessages;
  now: number;
  onPurchase: (key: AnimalKey) => void;
  onFeed: (key: AnimalKey) => void;
  onCollect: (key: AnimalKey) => void;
}) {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const statuses = getAnimalStates(gameState, safeNow);

  return (
    <View testID="animals-sheet">
      {statuses.map((status) => (
        <AnimalCard
          key={status.key}
          status={status}
          gold={gameState.gold}
          locale={locale}
          messages={messages}
          onPurchase={onPurchase}
          onFeed={onFeed}
          onCollect={onCollect}
        />
      ))}
    </View>
  );
}

function AnimalCard({
  status,
  gold,
  locale,
  messages,
  onPurchase,
  onFeed,
  onCollect,
}: {
  status: AnimalStatus;
  gold: number;
  locale: SupportedLocale;
  messages: FarmMessages;
  onPurchase: (key: AnimalKey) => void;
  onFeed: (key: AnimalKey) => void;
  onCollect: (key: AnimalKey) => void;
}) {
  const label = getAnimalLabel(status.key, locale);
  // 산출물 판매가·주기 요약(항상 노출해 무엇을 얻는지 알려준다).
  const yieldLine = messages.animalsYieldLabel(
    status.produceIcon,
    formatMoney(status.producePrice, locale),
    formatRemainingTime(status.produceTimerMs, locale)
  );

  let statusLine: string;
  let action: React.ReactNode = null;
  switch (status.phase) {
    case 'locked': {
      const affordable = gold >= status.purchaseCost;
      statusLine = messages.animalsLockedLabel;
      action = (
        <SheetAction
          label={messages.animalsBuildAction(formatMoney(status.purchaseCost, locale))}
          disabled={!affordable}
          onPress={() => onPurchase(status.key)}
        />
      );
      break;
    }
    case 'idle': {
      const affordable = gold >= status.feedCost;
      statusLine = messages.animalsIdleLabel;
      action = (
        <SheetAction
          label={messages.animalsFeedAction(formatMoney(status.feedCost, locale))}
          disabled={!affordable}
          onPress={() => onFeed(status.key)}
        />
      );
      break;
    }
    case 'growing': {
      statusLine = messages.animalsGrowingLabel(formatRemainingTime(status.remainingMs, locale));
      break;
    }
    case 'ready':
    default: {
      statusLine = messages.animalsReadyLabel;
      action = (
        <SheetAction
          label={messages.animalsCollectAction(formatMoney(status.producePrice, locale))}
          onPress={() => onCollect(status.key)}
        />
      );
      break;
    }
  }

  return (
    <View testID={`animal-card-${status.key}`} style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.icon}>{status.icon}</Text>
        <View style={styles.textGroup}>
          <Text style={styles.name}>{label.name}</Text>
          <Text style={styles.desc}>{label.description}</Text>
        </View>
      </View>
      <Text style={styles.yield}>{yieldLine}</Text>
      <Text style={styles.status} testID={`animal-status-${status.key}`}>
        {statusLine}
      </Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
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
