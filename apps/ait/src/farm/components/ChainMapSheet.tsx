import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  PRESTIGE_SKILLS,
  REGION_ARCHETYPES,
  canPrestige,
  formatDuration,
  formatHourlyGold,
  formatMoney,
  getChainIncome,
  getPrestigeStarsAward,
  getPrestigeSkillLabel,
  getRegionArchetype,
  getRegionArchetypeLabel,
  getSkillCost,
  getSkillLevel,
  type GameState,
  type PrestigeSkillKey,
  type RegionArchetypeKey,
  type SupportedLocale,
} from '../../../../../packages/farm-core/src';

import type { FarmMessages } from '../i18n';
import { SheetAction, ShopCard, sheetPartStyles } from './SheetParts';

function formatMultiplier(value: number): string {
  return `×${Number(value.toFixed(2))}`;
}

export function ChainMapSheet({
  gameState,
  locale,
  messages,
  now,
  onCollectChain,
  onOpenPrestigeConfirm,
  onBuySkill,
}: {
  gameState: GameState;
  locale: SupportedLocale;
  messages: FarmMessages;
  now: number;
  onCollectChain: () => void;
  onOpenPrestigeConfirm: () => void;
  onBuySkill: (skillKey: PrestigeSkillKey) => void;
}) {
  const archetype = getRegionArchetype(gameState.prestige.currentRegionArchetype);
  const regionName = getRegionArchetypeLabel(archetype.key, locale).name;
  const chainIncome = getChainIncome(gameState, now);
  const prestigeCheck = canPrestige(gameState);

  return (
    <View>
      <Text style={sheetPartStyles.sheetSectionTitle}>{messages.currentFarmSection}</Text>
      <View style={styles.regionCard}>
        <Text style={styles.regionTitle}>
          {archetype.icon} {regionName}
        </Text>
        <Text style={styles.regionDesc}>
          {messages.farmNumberLabel(gameState.prestige.level + 1)} ·{' '}
          {messages.regionModifiersLabel(formatMultiplier(archetype.sellMult), formatMultiplier(archetype.growTimeMult))}
        </Text>
      </View>

      <Text style={sheetPartStyles.sheetSectionTitle}>{messages.chainSection}</Text>
      {gameState.chainFarms.length === 0 ? (
        <Text style={styles.chainEmptyDesc}>{messages.chainEmptyDesc}</Text>
      ) : (
        <>
          {gameState.chainFarms.map((farm) => {
            const farmArchetype = getRegionArchetype(farm.archetype);
            return (
              <View key={farm.id} style={styles.chainFarmRow}>
                <Text style={styles.chainFarmTitle}>
                  {farmArchetype.icon} {messages.farmNumberLabel(farm.id + 1)} ·{' '}
                  {getRegionArchetypeLabel(farm.archetype, locale).name}
                </Text>
                <Text style={styles.chainFarmIncome}>{formatHourlyGold(farm.goldPerHour, locale)}</Text>
              </View>
            );
          })}
          <Text style={styles.chainCapLabel}>{messages.chainCapLabel(formatDuration(chainIncome.capMs, locale))}</Text>
          <SheetAction
            label={messages.collectChainAction(formatMoney(chainIncome.accruedGold, locale))}
            disabled={chainIncome.accruedGold <= 0}
            onPress={onCollectChain}
          />
        </>
      )}

      <Text style={sheetPartStyles.sheetSectionTitle}>{messages.prestigeSection}</Text>
      <Text style={styles.prestigeRequirement}>
        {messages.prestigeRequirementLabel(formatMoney(prestigeCheck.cost, locale))}
      </Text>
      <SheetAction
        label={messages.prestigeAction(getPrestigeStarsAward(gameState.prestige.level))}
        disabled={!prestigeCheck.allowed}
        onPress={onOpenPrestigeConfirm}
      />

      <Text style={sheetPartStyles.sheetSectionTitle}>{messages.skillsSection}</Text>
      <Text style={styles.starsBalance}>★ {gameState.prestige.stars}</Text>
      {PRESTIGE_SKILLS.map((skill) => {
        const label = getPrestigeSkillLabel(skill.key, locale);
        const level = getSkillLevel(gameState, skill.key);
        const cost = getSkillCost(gameState, skill.key);
        return (
          <ShopCard
            key={skill.key}
            title={`${skill.icon} ${label.name} · Lv.${level}`}
            desc={label.description}
            price={cost == null ? messages.completePrice : messages.skillPrice(cost)}
            disabled={cost == null || gameState.prestige.stars < cost}
            onPress={() => onBuySkill(skill.key)}
          />
        );
      })}
    </View>
  );
}

export function PrestigeConfirmSheet({
  gameState,
  locale,
  messages,
  selectedArchetype,
  onSelectArchetype,
  onConfirm,
  onCancel,
}: {
  gameState: GameState;
  locale: SupportedLocale;
  messages: FarmMessages;
  selectedArchetype: RegionArchetypeKey;
  onSelectArchetype: (archetypeKey: RegionArchetypeKey) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <View>
      <Text style={styles.prestigeWarning}>{messages.prestigeWarning}</Text>

      <Text style={sheetPartStyles.sheetSectionTitle}>{messages.regionChoiceSection}</Text>
      {REGION_ARCHETYPES.map((archetype) => {
        const active = selectedArchetype === archetype.key;
        return (
          <Pressable
            key={archetype.key}
            style={[styles.regionOption, active && styles.activeRegionOption]}
            onPress={() => onSelectArchetype(archetype.key)}
          >
            <Text style={styles.regionOptionTitle}>
              {archetype.icon} {getRegionArchetypeLabel(archetype.key, locale).name}
            </Text>
            <Text style={styles.regionOptionDesc}>
              {messages.regionModifiersLabel(formatMultiplier(archetype.sellMult), formatMultiplier(archetype.growTimeMult))}
            </Text>
          </Pressable>
        );
      })}

      <SheetAction
        label={messages.prestigeConfirmAction(getPrestigeStarsAward(gameState.prestige.level))}
        onPress={onConfirm}
      />
      <SheetAction label={messages.prestigeCancelAction} secondary onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  regionCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#aad8b1',
    borderRadius: 8,
    backgroundColor: '#f0fbf0',
  },
  regionTitle: {
    color: '#253126',
    fontSize: 16,
    fontWeight: '900',
  },
  regionDesc: {
    marginTop: 4,
    color: '#247241',
    fontSize: 13,
    fontWeight: '700',
  },
  chainEmptyDesc: {
    color: '#667085',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  chainFarmRow: {
    minHeight: 56,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  chainFarmTitle: {
    minWidth: 0,
    flexShrink: 1,
    color: '#253126',
    fontSize: 14,
    fontWeight: '900',
  },
  chainFarmIncome: {
    flexShrink: 0,
    color: '#247241',
    fontSize: 13,
    fontWeight: '900',
  },
  chainCapLabel: {
    color: '#7b8794',
    fontSize: 12,
    fontWeight: '700',
  },
  prestigeRequirement: {
    color: '#344054',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  starsBalance: {
    marginBottom: 8,
    color: '#8a4b0f',
    fontSize: 15,
    fontWeight: '900',
  },
  prestigeWarning: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    color: '#8a4b0f',
    backgroundColor: '#fff8d8',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  regionOption: {
    minHeight: 64,
    marginBottom: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  activeRegionOption: {
    borderColor: '#4d9d56',
    backgroundColor: '#edf8ed',
  },
  regionOptionTitle: {
    color: '#253126',
    fontSize: 15,
    fontWeight: '900',
  },
  regionOptionDesc: {
    marginTop: 3,
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
});
