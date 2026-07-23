import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  getAnimalStates,
  getProductionStates,
  type AnimalKey,
  type CropKey,
  type GameState,
  type ProductionRecipeKey,
  type SupportedLocale,
} from '../../../farm-core/src';

import type { FarmMessages } from '../i18n';
import { AnimalsSheet } from './AnimalsSheet';
import { WorkshopSheet } from './WorkshopSheet';

export type ProductionTabKey = 'animals' | 'workshop';

export function ProductionSheet({
  activeTab,
  gameState,
  locale,
  messages,
  now,
  getCropName,
  onTabChange,
  onPurchaseAnimal,
  onFeedAnimal,
  onCollectAnimal,
  onCollectAllAnimals,
  onStartCraft,
  onCancelCraft,
  onCollectCraft,
  onCollectAllCrafts,
}: {
  activeTab: ProductionTabKey;
  gameState: GameState;
  locale: SupportedLocale;
  messages: FarmMessages;
  now: number;
  getCropName: (cropKey: CropKey) => string;
  onTabChange: (tab: ProductionTabKey) => void;
  onPurchaseAnimal: (key: AnimalKey) => void;
  onFeedAnimal: (key: AnimalKey) => void;
  onCollectAnimal: (key: AnimalKey) => void;
  onCollectAllAnimals: () => void;
  onStartCraft: (key: ProductionRecipeKey) => void;
  onCancelCraft: (key: ProductionRecipeKey) => void;
  onCollectCraft: (key: ProductionRecipeKey) => void;
  onCollectAllCrafts: () => void;
}) {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const tabs: { key: ProductionTabKey; label: string; badge: number }[] = [
    {
      key: 'animals',
      label: messages.productionTabAnimals,
      badge: getAnimalStates(gameState, safeNow).filter((status) => status.phase === 'ready').length,
    },
    {
      key: 'workshop',
      label: messages.productionTabWorkshop,
      badge: getProductionStates(gameState, safeNow).filter((status) => status.phase === 'ready').length,
    },
  ];

  return (
    <View testID="production-sheet">
      <View testID="production-tab-bar" accessibilityRole="tablist" style={styles.tabBar}>
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              testID={`production-tab-${tab.key}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.label}
              style={[styles.tabButton, active && styles.tabButtonActive]}
              onPress={() => onTabChange(tab.key)}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
              {tab.badge > 0 ? (
                <View testID={`production-tab-${tab.key}-badge`} style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{tab.badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {activeTab === 'animals' ? (
        <AnimalsSheet
          gameState={gameState}
          locale={locale}
          messages={messages}
          now={safeNow}
          onPurchase={onPurchaseAnimal}
          onFeed={onFeedAnimal}
          onCollect={onCollectAnimal}
          onCollectAll={onCollectAllAnimals}
        />
      ) : (
        <WorkshopSheet
          gameState={gameState}
          locale={locale}
          messages={messages}
          now={safeNow}
          getCropName={getCropName}
          onStart={onStartCraft}
          onCancel={onCancelCraft}
          onCollect={onCollectCraft}
          onCollectAll={onCollectAllCrafts}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
    padding: 4,
    borderRadius: 12,
    backgroundColor: '#eef4ef',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 38,
    paddingHorizontal: 8,
    borderRadius: 9,
  },
  tabButtonActive: {
    borderWidth: 1,
    borderColor: '#4caf6a',
    backgroundColor: '#ffffff',
  },
  tabLabel: {
    color: '#5b6b5f',
    fontSize: 13,
    fontWeight: '800',
  },
  tabLabelActive: {
    color: '#1c7538',
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e5484d',
  },
  tabBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
});
