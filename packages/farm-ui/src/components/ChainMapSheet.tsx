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
  getPrestigePreview,
  getPrestigeSkillLabel,
  getRegionArchetype,
  getRegionArchetypeLabel,
  getSkillCost,
  getSkillEffect,
  getSkillLevel,
  type GameState,
  type LandmarkStageKey,
  type PrestigeSkillKey,
  type RegionArchetypeKey,
  type SupportedLocale,
} from '../../../farm-core/src';

import type { FarmMessages } from '../i18n';
import { LandmarkProjectSection } from './LandmarkProjectSection';
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
  onFundLandmark,
}: {
  gameState: GameState;
  locale: SupportedLocale;
  messages: FarmMessages;
  now: number;
  onCollectChain: () => void;
  onOpenPrestigeConfirm: () => void;
  onBuySkill: (skillKey: PrestigeSkillKey) => void;
  onFundLandmark: (expectedTier: number, expectedStageKey: LandmarkStageKey) => void;
}) {
  const archetype = getRegionArchetype(gameState.prestige.currentRegionArchetype);
  const regionName = getRegionArchetypeLabel(archetype.key, locale).name;
  const chainIncome = getChainIncome(gameState, now);
  const prestigeCheck = canPrestige(gameState);
  // Displayed per-farm income must match what getChainIncome actually pays,
  // including the chain_yield skill multiplier.
  const chainYieldMultiplier = 1 + getSkillEffect(gameState, 'chain_yield');

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

      <LandmarkProjectSection
        gameState={gameState}
        locale={locale}
        messages={messages}
        onFundLandmark={onFundLandmark}
      />

      <Text style={sheetPartStyles.sheetSectionTitle}>{messages.chainSection}</Text>
      {gameState.chainFarms.length === 0 ? (
        <Text style={styles.chainEmptyDesc}>{messages.chainEmptyDesc}</Text>
      ) : (
        <>
          {gameState.chainFarms.map((farm, index) => {
            const farmArchetype = getRegionArchetype(farm.archetype);
            return (
              // Normalized legacy saves may carry duplicate farm ids, so the
              // key must include the index.
              <View key={`${farm.id}-${index}`} style={styles.chainFarmRow}>
                <Text style={styles.chainFarmTitle}>
                  {farmArchetype.icon} {messages.farmNumberLabel(farm.id + 1)} ·{' '}
                  {getRegionArchetypeLabel(farm.archetype, locale).name}
                </Text>
                <Text style={styles.chainFarmIncome}>
                  {formatHourlyGold(Math.floor(farm.goldPerHour * chainYieldMultiplier), locale)}
                </Text>
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
  now,
  selectedArchetype,
  onSelectArchetype,
  onConfirm,
  onCancel,
}: {
  gameState: GameState;
  locale: SupportedLocale;
  messages: FarmMessages;
  now: number;
  selectedArchetype: RegionArchetypeKey;
  onSelectArchetype: (archetypeKey: RegionArchetypeKey) => void;
  onConfirm: (previewAt: number) => void;
  onCancel: () => void;
}) {
  const preview = getPrestigePreview(gameState, now);

  return (
    <View>
      <Text style={styles.prestigeWarning}>{messages.prestigeWarning}</Text>

      <Text style={sheetPartStyles.sheetSectionTitle}>{messages.prestigePreviewSection}</Text>
      <View testID="prestige-preview" style={styles.prestigePreviewCard}>
        <View style={styles.prestigePreviewRow}>
          <Text style={styles.prestigePreviewLabel}>{messages.prestigeChainIncomePreviewLabel}</Text>
          <Text testID="prestige-preview-chain-income" numberOfLines={1} style={styles.prestigePreviewValue}>
            {formatHourlyGold(preview.baseChainGoldPerHour, locale)}
          </Text>
        </View>
        {preview.effectiveChainGoldPerHour !== preview.baseChainGoldPerHour ? (
          <View style={[styles.prestigePreviewRow, styles.prestigePreviewRowDivider]}>
            <Text style={styles.prestigePreviewLabel}>{messages.prestigeEffectiveChainIncomePreviewLabel}</Text>
            <Text testID="prestige-preview-effective-chain-income" numberOfLines={1} style={styles.prestigePreviewValue}>
              {formatHourlyGold(preview.effectiveChainGoldPerHour, locale)}
            </Text>
          </View>
        ) : null}
        <View style={[styles.prestigePreviewRow, styles.prestigePreviewRowDivider]}>
          <Text style={styles.prestigePreviewLabel}>{messages.prestigeStartingGoldPreviewLabel}</Text>
          <Text testID="prestige-preview-starting-gold" numberOfLines={1} style={styles.prestigePreviewValue}>
            {formatMoney(preview.startingGold, locale)}G
          </Text>
        </View>
        <Text style={styles.prestigePreviewHint}>{messages.prestigeChainIncomePreviewHint}</Text>
      </View>

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
        onPress={() => onConfirm(now)}
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
  prestigePreviewCard: {
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#aad8b1',
    borderRadius: 8,
    backgroundColor: '#f0fbf0',
  },
  prestigePreviewRow: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  prestigePreviewRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#c8e5cc',
  },
  prestigePreviewLabel: {
    minWidth: 0,
    flex: 1,
    color: '#344054',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  prestigePreviewValue: {
    flexShrink: 0,
    color: '#247241',
    fontSize: 14,
    fontWeight: '900',
  },
  prestigePreviewHint: {
    marginTop: 6,
    color: '#667085',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
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
