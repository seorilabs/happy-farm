import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  formatMoney,
  getAreaLabel,
  getDailyMissionsSnapshot,
  type DailyMissionView,
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

export function MissionsSheet({
  gameState,
  locale,
  messages,
  now,
  onClaim,
}: {
  gameState: GameState;
  locale: SupportedLocale;
  messages: FarmMessages;
  now: number;
  onClaim: (slot: number) => void;
}) {
  const snapshot = getDailyMissionsSnapshot(gameState.dailyMissionState, now, gameState.unlockedAreas);

  return (
    <View>
      <Text style={styles.hint}>{messages.missionsHint}</Text>
      {snapshot.missions.map((mission) => {
        const shownProgress = Math.min(mission.progress, mission.target);
        const ratio = mission.target > 0 ? Math.min(mission.progress / mission.target, 1) : 0;
        const rewardText = `+${formatMoney(mission.rewardGold, locale)}G`;
        return (
          <View key={mission.slot} style={styles.missionCard}>
            <View style={styles.missionHeader}>
              <Text style={styles.missionTitle} numberOfLines={2}>
                {getMissionLabel(mission, locale, messages)}
              </Text>
              <Text style={styles.missionReward}>{rewardText}</Text>
            </View>
            <Text style={styles.missionProgress} numberOfLines={1}>
              {messages.missionProgressLabel(shownProgress, mission.target)}
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(ratio * 100)}%` as `${number}%` }]} />
            </View>
            {mission.claimed ? (
              <Text style={styles.claimedBadge}>{messages.missionClaimedBadge}</Text>
            ) : mission.claimable ? (
              <SheetAction
                label={messages.missionClaimAction(formatMoney(mission.rewardGold, locale))}
                onPress={() => onClaim(mission.slot)}
              />
            ) : null}
          </View>
        );
      })}
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
