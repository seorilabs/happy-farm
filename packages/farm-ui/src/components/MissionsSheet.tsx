import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  formatMoney,
  getAreaLabel,
  getDailyMissionsSnapshot,
  getWeeklyMissionsSnapshot,
  type DailyMissionView,
  type WeeklyMissionView,
  type GameState,
  type SupportedLocale,
} from '../../../farm-core/src';

import type { FarmMessages } from '../i18n';
import { SheetAction } from './SheetParts';

function getMissionLabel(mission: DailyMissionView, locale: SupportedLocale, messages: FarmMessages): string {
  switch (mission.type) {
    case 'harvest_area': {
      const areaName = mission.areaKey != null ? getAreaLabel(mission.areaKey, locale).name : '';
      return messages.missionHarvestAreaLabel(mission.target, areaName);
    }
    case 'watch_ad':
      return messages.missionWatchAdLabel(mission.target);
    case 'harvest':
    default:
      return messages.missionHarvestLabel(mission.target);
  }
}

function getWeeklyMissionLabel(
  mission: WeeklyMissionView,
  locale: SupportedLocale,
  messages: FarmMessages
): string {
  switch (mission.type) {
    case 'harvest_area': {
      const areaName = mission.areaKey != null ? getAreaLabel(mission.areaKey, locale).name : '';
      return messages.weeklyMissionHarvestAreaLabel(mission.target, areaName);
    }
    case 'watch_ad':
      return messages.weeklyMissionWatchAdLabel(mission.target);
    case 'donate':
      return messages.weeklyMissionDonateLabel(mission.target);
    case 'harvest':
    default:
      return messages.weeklyMissionHarvestLabel(mission.target);
  }
}

// Shared card renderer for a single daily/weekly mission (both views share the
// progress/target/reward/claim shape). `label` is resolved per-track by caller.
function MissionCard({
  label,
  progress,
  target,
  rewardGold,
  claimed,
  claimable,
  slot,
  locale,
  messages,
  onClaim,
}: {
  label: string;
  progress: number;
  target: number;
  rewardGold: number;
  claimed: boolean;
  claimable: boolean;
  slot: number;
  locale: SupportedLocale;
  messages: FarmMessages;
  onClaim: (slot: number) => void;
}) {
  const shownProgress = Math.min(progress, target);
  const ratio = target > 0 ? Math.min(progress / target, 1) : 0;
  return (
    <View style={styles.missionCard}>
      <View style={styles.missionHeader}>
        <Text style={styles.missionTitle} numberOfLines={2}>
          {label}
        </Text>
        <Text style={styles.missionReward}>{`+${formatMoney(rewardGold, locale)}G`}</Text>
      </View>
      <Text style={styles.missionProgress} numberOfLines={1}>
        {messages.missionProgressLabel(shownProgress, target)}
      </Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(ratio * 100)}%` as `${number}%` }]} />
      </View>
      {claimed ? (
        <Text style={styles.claimedBadge}>{messages.missionClaimedBadge}</Text>
      ) : claimable ? (
        <SheetAction
          label={messages.missionClaimAction(formatMoney(rewardGold, locale))}
          onPress={() => onClaim(slot)}
        />
      ) : null}
    </View>
  );
}

export function MissionsSheet({
  gameState,
  locale,
  messages,
  now,
  onClaim,
  onClaimWeekly,
}: {
  gameState: GameState;
  locale: SupportedLocale;
  messages: FarmMessages;
  now: number;
  onClaim: (slot: number) => void;
  onClaimWeekly: (slot: number) => void;
}) {
  const snapshot = getDailyMissionsSnapshot(gameState.dailyMissionState, now, gameState.unlockedAreas);
  const weeklySnapshot = getWeeklyMissionsSnapshot(gameState.weeklyMissionState, now, gameState.unlockedAreas);

  return (
    <View>
      <Text style={styles.hint}>{messages.missionsHint}</Text>
      <Text style={styles.sectionTitle}>{messages.missionsDailyTitle}</Text>
      {snapshot.missions.map((mission) => (
        <MissionCard
          key={`daily-${mission.slot}`}
          label={getMissionLabel(mission, locale, messages)}
          progress={mission.progress}
          target={mission.target}
          rewardGold={mission.rewardGold}
          claimed={mission.claimed}
          claimable={mission.claimable}
          slot={mission.slot}
          locale={locale}
          messages={messages}
          onClaim={onClaim}
        />
      ))}

      <Text style={styles.sectionTitle}>{messages.missionsWeeklyTitle}</Text>
      <Text style={styles.sectionSubtitle}>{messages.weeklyMissionsHint}</Text>
      {weeklySnapshot.missions.map((mission) => (
        <MissionCard
          key={`weekly-${mission.slot}`}
          label={getWeeklyMissionLabel(mission, locale, messages)}
          progress={mission.progress}
          target={mission.target}
          rewardGold={mission.rewardGold}
          claimed={mission.claimed}
          claimable={mission.claimable}
          slot={mission.slot}
          locale={locale}
          messages={messages}
          onClaim={onClaimWeekly}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    marginBottom: 12,
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionTitle: {
    marginTop: 6,
    marginBottom: 8,
    color: '#253126',
    fontSize: 15,
    fontWeight: '900',
  },
  sectionSubtitle: {
    marginTop: -4,
    marginBottom: 8,
    color: '#667085',
    fontSize: 11,
    fontWeight: '700',
  },
  missionCard: {
    marginBottom: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  missionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  missionTitle: {
    minWidth: 0,
    flexShrink: 1,
    color: '#253126',
    fontSize: 15,
    fontWeight: '900',
  },
  missionReward: {
    flexShrink: 0,
    color: '#bf7a00',
    fontSize: 14,
    fontWeight: '900',
  },
  missionProgress: {
    marginTop: 6,
    color: '#667085',
    fontSize: 12,
    fontWeight: '800',
  },
  progressTrack: {
    marginTop: 6,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: '#edf2f7',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#2f8747',
  },
  claimedBadge: {
    marginTop: 10,
    alignSelf: 'flex-start',
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#ffffff',
    backgroundColor: '#2f8747',
    fontSize: 12,
    fontWeight: '900',
  },
});
