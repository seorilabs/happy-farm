import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BREEDING_RECIPES,
  CROPS,
  FARM_AREAS,
  REGION_ARCHETYPES,
  RESEARCH_NODES,
  breedCrop,
  buySkill,
  canPrestige,
  canUnlockNode,
  claimNextAchievementTier,
  collectChainIncome,
  getBreedingRecipeStatus,
  getChainIncome,
  getClaimableAchievementCount,
  getCropModifiers,
  getCropPurchaseCost,
  getFarmHourlyProductivity,
  getGlobalModifiers,
  getPrestigeSkillLabel,
  getRegionArchetypeLabel,
  getResearchNodeLabel,
  getTitleLabel,
  prestigeFarm,
  runAutomationTick,
  setActiveTitle,
  unlockNode,
  type AchievementTrackKey,
  type MasteryRankKey,
  type PrestigeSkillKey,
  type RegionArchetypeKey,
  type ResearchNodeKey,
  type TitleKey,
  GROWTH_AD_MAX_SKIP_MS,
  GROWTH_AD_MIN_REMAINING_MS,
  HARVEST_BONUS_BOOST_DURATION_MS,
  HARVEST_BONUS_MULTIPLIER,
  INTERSTITIAL_MILESTONE_COOLDOWN_MS,
  MAX_PLOTS,
  REWARDED_GOLD_AMOUNT,
  REWARDED_GOLD_MAX_USES_PER_WINDOW,
  REWARDED_GOLD_WINDOW_MS,
  type AreaKey,
  type CollectionRewardKey,
  type CropKey,
  type GameAnalyticsContext,
  type GameState,
  type RewardedAdController,
  type RewardedAdShowResult,
  type RewardedAdType,
  canUnlockArea,
  claimCollectionReward,
  createFarmAnalytics,
  createInitialState,
  DEFAULT_LOCALE,
  executeFarmGameCommand,
  formatDuration,
  formatHourlyGold,
  formatMoney,
  formatRemainingTime,
  formatSignedPercent,
  getReturnSummary,
  type ReturnSummary,
  getAreaLabel,
  getAreaUnlockRequirementText,
  getCollectionSummary,
  type CollectionSummary,
  getCropLabel,
  getCropEconomyEstimate,
  getGameAnalyticsContext,
  getHarvestBonusBoostStatus,
  getHarvestBonusPromptStatus,
  getMasteryRankLabel,
  getMasteryStatus,
  getMinUpgradeLevel,
  getMutationLabel,
  getPlotCost,
  getPlotGrowthDisplay,
  getPlotRemainingGrowthMs,
  getRewardedAdLimitStatus,
  getUpgradeCost,
  isAreaUnlocked,
  isCropPlantable,
  isPlotGrowthComplete,
  isTitleUnlocked,
  normalizeLocale,
  performHarvestAll,
  getReadyPlotCount,
  recordHarvestBonusAdPrompt,
  recordRewardedAdUsage,
  type CropHarvestedGameEvent,
  type CropPlantedGameEvent,
  type CropEconomyEstimate,
  type FarmGameCommandBlockedReason,
  type SupportedLocale,
} from '../../../../packages/farm-core/src';
import {
  claimDailyBonus,
  getDailyBonusLabel,
  isDailyBonusAvailable,
  type DailyBonusResult,
  type DailyBonusState,
} from '../../../../packages/farm-core/src/dailyBonus';

import { DEFAULT_FARM_GAME_SETTINGS, normalizeFarmGameSettings, type FarmGameSettings } from './gameSettings';
import { getFarmMessages, type FarmMessages } from './i18n';
import { AchievementsSheet } from './components/AchievementsSheet';
import { ChainMapSheet, PrestigeConfirmSheet } from './components/ChainMapSheet';
import { CollectionSheet } from './components/CollectionSheet';
import { LabSheet } from './components/LabSheet';
import { AdRewardCard, SettingToggle, SheetAction, ShopCard, sheetPartStyles } from './components/SheetParts';

const REWARDED_AD_GROUP_ID = 'ait.v2.live.6fc77adf3f034cd6';
const INTERSTITIAL_AD_GROUP_ID = '';
const PLOT_COLUMNS = 4;
const PLOT_GAP = 10;
const MAIN_HORIZONTAL_PADDING = 16;
// Game tick: drives idle re-renders so time-based UI (growth, cooldowns) advances.
// The growth bar animates one tick at a time, so its duration is tied to this value
// rather than hardcoded separately.
export const GAME_TICK_INTERVAL_MS = 250;
// Auto-harvest analytics are batched into one summary event per interval.
const AUTO_HARVEST_SUMMARY_INTERVAL_MS = 60_000;
// How often the active session refreshes its "last seen" timestamp so the
// welcome-back recap measures the real away gap even if the app is killed
// without firing a background event.
const LAST_SEEN_HEARTBEAT_MS = 30_000;
const PROGRESS_ANIMATION_DURATION_MS = GAME_TICK_INTERVAL_MS;
// Fresh-plant sprout "bounce in" duration.
const PLANT_POP_DURATION_MS = 320;
// The "Harvest All" shortcut only appears once enough plots are ripe that
// tapping each one becomes a chore; a single ripe plot is a quick one-tap.
const HARVEST_ALL_MIN_COUNT = 2;
// Harvest combo: the window (ms) within which consecutive manual harvests
// build a streak counter. Tier thresholds gate icon/color escalation and
// audio milestone cues.
const COMBO_WINDOW_MS = 1500;
export const COMBO_GREAT_THRESHOLD = 5;
export const COMBO_LEGENDARY_THRESHOLD = 10;
export const MASTERY_RANK_UP_CELEBRATION_DURATION_MS = 2600;
export const PRESTIGE_GRADUATION_CELEBRATION_DURATION_MS = 3500;
export const FIRST_HARVEST_CELEBRATION_DURATION_MS = 3200;
const SHEET_DISMISS_DRAG_DISTANCE = 96;
const SHEET_DISMISS_VELOCITY = 1.1;
const SHEET_DISMISS_TRANSLATE_Y = 520;
const SHEET_ANIMATION_DURATION_MS = 180;
const SHEET_DRAG_HIT_TARGET_HEIGHT = 36;
const EMPTY_SAFE_AREA_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

import { _callGoldPulseHook } from './farmGoldPulse';

function getFirstArea() {
  const area = FARM_AREAS[0];
  if (area == null) {
    throw new Error('Farm balance must include at least one area.');
  }
  return area;
}

function getCrop(cropKey: CropKey) {
  const crop = CROPS[cropKey];
  if (crop == null) {
    throw new Error(`Unknown crop: ${cropKey}`);
  }
  return crop;
}

// Region scaling can push multipliers far past the upgrade range, so switch
// to a whole-number display once a decimal stops being informative.
function formatStatMultiplier(value: number) {
  return value >= 100 ? `×${Math.round(value).toLocaleString()}` : `×${value.toFixed(1)}`;
}