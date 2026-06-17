import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  BREEDING_RECIPES,
  CROPS,
  RESEARCH_NODES,
  canUnlockNode,
  formatMoney,
  getBreedingRecipeStatus,
  getCropLabel,
  getResearchNodeLabel,
  isNodeUnlocked,
  type CropKey,
  type GameState,
  type ResearchNodeKey,
  type SupportedLocale,
} from '../../../farm-core/src';

import type { FarmMessages } from '../i18n';
import { SettingToggle, ShopCard, sheetPartStyles } from './SheetParts';

function getKnownCrop(cropKey: CropKey) {
  const crop = CROPS[cropKey];
  if (crop == null) {
    throw new Error(`Unknown crop: ${cropKey}`);
  }
  return crop;
}

export function LabSheet({
  gameState,
  locale,
  messages,
  onToggleAutomation,
  onUnlockNode,
  onBreed,
}: {
  gameState: GameState;
  locale: SupportedLocale;
  messages: FarmMessages;
  onToggleAutomation: (key: keyof GameState['automationSettings']) => void;
  onUnlockNode: (nodeKey: ResearchNodeKey) => void;
  onBreed: (cropKey: CropKey) => void;
}) {
  const autoHarvestUnlocked = isNodeUnlocked(gameState, 'auto_harvest');
  const autoReplantUnlocked = isNodeUnlocked(gameState, 'auto_replant');

  return (
    <View>
      <View style={styles.rpBanner}>
        <Text style={styles.rpBannerText}>{messages.rpBalanceLabel(formatMoney(gameState.research.points, locale))}</Text>
      </View>

      <Text style={sheetPartStyles.sheetSectionTitle}>{messages.automationSection}</Text>
      <SettingToggle
        label={messages.donationToggleLabel}
        desc={messages.donationToggleDesc}
        value={gameState.automationSettings.donationModeEnabled}
        onPress={() => onToggleAutomation('donationModeEnabled')}
      />
      <SettingToggle
        label={getResearchNodeLabel('auto_harvest', locale).name}
        desc={
          autoHarvestUnlocked
            ? getResearchNodeLabel('auto_harvest', locale).description
            : messages.automationLockedDesc(getResearchNodeLabel('auto_harvest', locale).name)
        }
        value={gameState.automationSettings.autoHarvestEnabled && autoHarvestUnlocked}
        disabled={!autoHarvestUnlocked}
        onPress={() => onToggleAutomation('autoHarvestEnabled')}
      />
      <SettingToggle
        label={getResearchNodeLabel('auto_replant', locale).name}
        desc={
          autoReplantUnlocked
            ? getResearchNodeLabel('auto_replant', locale).description
            : messages.automationLockedDesc(getResearchNodeLabel('auto_replant', locale).name)
        }
        value={gameState.automationSettings.autoReplantEnabled && autoReplantUnlocked}
        disabled={!autoReplantUnlocked}
        onPress={() => onToggleAutomation('autoReplantEnabled')}
      />

      <Text style={sheetPartStyles.sheetSectionTitle}>{messages.researchNodesSection}</Text>
      {RESEARCH_NODES.map((node) => {
        const label = getResearchNodeLabel(node.key, locale);
        const unlocked = isNodeUnlocked(gameState, node.key);
        const requirementText =
          node.requires != null && !isNodeUnlocked(gameState, node.requires)
            ? messages.nodeRequiresLabel(getResearchNodeLabel(node.requires, locale).name)
            : null;
        return (
          <ShopCard
            key={node.key}
            title={label.name}
            desc={requirementText == null ? label.description : `${label.description} · ${requirementText}`}
            price={unlocked ? messages.completePrice : messages.rpPrice(formatMoney(node.cost, locale))}
            disabled={unlocked || !canUnlockNode(gameState, node.key)}
            onPress={() => onUnlockNode(node.key)}
          />
        );
      })}

      <Text style={sheetPartStyles.sheetSectionTitle}>{messages.breedingSection}</Text>
      {BREEDING_RECIPES.map((recipe) => {
        const status = getBreedingRecipeStatus(gameState, recipe);
        const hybrid = getKnownCrop(recipe.crop);
        const parentNames = recipe.parents
          .map((parent) => `${getKnownCrop(parent).icon} ${getCropLabel(parent, locale).name}`)
          .join(' × ');
        return (
          <ShopCard
            key={recipe.crop}
            title={`${hybrid.icon} ${getCropLabel(recipe.crop, locale).name}`}
            desc={
              status.unlocked
                ? messages.breedUnlockedDesc
                : !status.nodeSatisfied
                  ? messages.nodeRequiresLabel(
                      getResearchNodeLabel(recipe.advanced ? 'breeding_advanced' : 'breeding_lab', locale).name
                    )
                  : !status.parentsDiscovered
                    ? messages.breedParentsRequiredDesc(parentNames)
                    : parentNames
            }
            price={status.unlocked ? messages.completePrice : messages.rpPrice(formatMoney(recipe.rpCost, locale))}
            disabled={!status.breedable}
            onPress={() => onBreed(recipe.crop)}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rpBanner: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#c9b8f5',
    borderRadius: 8,
    backgroundColor: '#f3edff',
  },
  rpBannerText: {
    color: '#5b3fc4',
    fontSize: 15,
    fontWeight: '900',
  },
});
