import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  DECORATION_GRID_SLOT_COUNT,
  getDecorationLabel,
  getOwnedDecorations,
  type DecorationKey,
  type GameState,
  type SupportedLocale,
} from '../../../farm-core/src';

import type { FarmMessages } from '../i18n';
import { SheetAction } from './SheetParts';

export function DecorationLayoutSheet({
  gameState,
  locale,
  messages,
  onPlace,
  onStore,
}: {
  gameState: GameState;
  locale: SupportedLocale;
  messages: FarmMessages;
  onPlace: (key: DecorationKey, slot: number) => void;
  onStore: (key: DecorationKey) => void;
}) {
  const [selectedKey, setSelectedKey] = useState<DecorationKey | null>(null);
  const owned = getOwnedDecorations(gameState);
  const selected = selectedKey == null ? null : owned.find((decoration) => decoration.key === selectedKey) ?? null;
  const placementBySlot = new Map(
    owned
      .filter((decoration) => decoration.slot != null)
      .map((decoration) => [decoration.slot as number, decoration])
  );

  if (owned.length === 0) {
    return (
      <View testID="decoration-layout-sheet">
        <Text style={styles.emptyText}>{messages.decorationLayoutEmpty}</Text>
      </View>
    );
  }

  return (
    <View testID="decoration-layout-sheet">
      <Text style={styles.instructions}>{messages.decorationLayoutInstructions}</Text>

      <Text style={styles.sectionTitle}>{messages.decorationLayoutGridTitle}</Text>
      <View testID="decoration-layout-grid" style={styles.grid}>
        {Array.from({ length: DECORATION_GRID_SLOT_COUNT }, (_, slot) => {
          const decoration = placementBySlot.get(slot);
          const selectedSlot = decoration?.key === selectedKey;
          const empty = decoration == null;
          const label = decoration == null ? null : getDecorationLabel(decoration.key, locale);
          return (
            <Pressable
              key={slot}
              testID={`decoration-slot-${slot}`}
              accessibilityRole="button"
              accessibilityLabel={
                label == null
                  ? messages.decorationSlotEmptyAccessibilityLabel(slot + 1)
                  : messages.decorationSlotOccupiedAccessibilityLabel(slot + 1, label.name)
              }
              accessibilityState={{ selected: selectedSlot, disabled: empty && selected == null }}
              disabled={empty && selected == null}
              style={[
                styles.slot,
                empty && styles.emptySlot,
                selectedSlot && styles.selectedSlot,
                empty && selected != null && styles.availableSlot,
              ]}
              onPress={() => {
                if (decoration != null) {
                  setSelectedKey(decoration.key);
                  return;
                }
                if (selected != null) {
                  onPlace(selected.key, slot);
                }
              }}
            >
              <Text style={styles.slotIcon}>{decoration?.icon ?? '＋'}</Text>
              <Text style={styles.slotNumber}>{slot + 1}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>{messages.decorationLayoutInventoryTitle}</Text>
      <View style={styles.inventory}>
        {owned.map((decoration) => {
          const label = getDecorationLabel(decoration.key, locale);
          const selectedItem = decoration.key === selectedKey;
          return (
            <Pressable
              key={decoration.key}
              testID={`decoration-inventory-${decoration.key}`}
              accessibilityRole="button"
              accessibilityLabel={`${label.name}, ${
                decoration.slot == null
                  ? messages.decorationStoredLabel
                  : messages.decorationPlacedSlotLabel(decoration.slot + 1)
              }`}
              accessibilityState={{ selected: selectedItem }}
              style={[styles.inventoryItem, selectedItem && styles.selectedInventoryItem]}
              onPress={() => setSelectedKey(decoration.key)}
            >
              <Text style={styles.inventoryIcon}>{decoration.icon}</Text>
              <View style={styles.inventoryText}>
                <Text style={styles.inventoryName} numberOfLines={1}>
                  {label.name}
                </Text>
                <Text style={styles.inventoryStatus} numberOfLines={1}>
                  {decoration.slot == null
                    ? messages.decorationStoredLabel
                    : messages.decorationPlacedSlotLabel(decoration.slot + 1)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {selected?.slot != null ? (
        <View style={styles.storeAction}>
          <SheetAction
            testID="decoration-store-action"
            label={messages.decorationStoreAction(getDecorationLabel(selected.key, locale).name)}
            secondary
            onPress={() => onStore(selected.key)}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  instructions: {
    marginBottom: 12,
    color: '#475467',
    fontSize: 13,
    lineHeight: 19,
  },
  emptyText: {
    color: '#667085',
    fontSize: 14,
    lineHeight: 21,
  },
  sectionTitle: {
    marginTop: 4,
    marginBottom: 8,
    color: '#344054',
    fontSize: 13,
    fontWeight: '900',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
    marginBottom: 16,
  },
  slot: {
    width: '18%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    backgroundColor: '#fffdf7',
  },
  emptySlot: {
    borderStyle: 'dashed',
    backgroundColor: '#f7f9f7',
  },
  availableSlot: {
    borderColor: '#4caf6a',
    backgroundColor: '#eef9f0',
  },
  selectedSlot: {
    borderWidth: 2,
    borderColor: '#287a3f',
    backgroundColor: '#e7f6ea',
  },
  slotIcon: {
    fontSize: 24,
  },
  slotNumber: {
    position: 'absolute',
    right: 4,
    bottom: 2,
    color: '#98a2b3',
    fontSize: 9,
    fontWeight: '700',
  },
  inventory: {
    gap: 7,
  },
  inventoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#e4e7ec',
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  selectedInventoryItem: {
    borderColor: '#4caf6a',
    backgroundColor: '#eef9f0',
  },
  inventoryIcon: {
    fontSize: 25,
  },
  inventoryText: {
    flex: 1,
    minWidth: 0,
  },
  inventoryName: {
    color: '#253126',
    fontSize: 13,
    fontWeight: '800',
  },
  inventoryStatus: {
    marginTop: 2,
    color: '#667085',
    fontSize: 11,
  },
  storeAction: {
    marginTop: 12,
  },
});
