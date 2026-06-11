import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  ACHIEVEMENT_TITLES,
  ACHIEVEMENT_TRACKS,
  formatMoney,
  getAchievementTrackLabel,
  getAchievementTrackStatus,
  getTitleLabel,
  isTitleUnlocked,
  type AchievementTrackKey,
  type GameState,
  type SupportedLocale,
  type TitleKey,
} from '../../../../../packages/farm-core/src';

import type { FarmMessages } from '../i18n';
import { SheetAction, sheetPartStyles } from './SheetParts';

export function AchievementsSheet({
  gameState,
  locale,
  messages,
  onClaim,
  onSelectTitle,
}: {
  gameState: GameState;
  locale: SupportedLocale;
  messages: FarmMessages;
  onClaim: (trackKey: AchievementTrackKey) => void;
  onSelectTitle: (titleKey: TitleKey | null) => void;
}) {
  return (
    <View>
      <Text style={sheetPartStyles.sheetSectionTitle}>{messages.achievementTracksSection}</Text>
      {ACHIEVEMENT_TRACKS.map((track) => {
        const status = getAchievementTrackStatus(gameState, track.key);
        const trackName = getAchievementTrackLabel(track.key, locale).name;
        return (
          <View key={track.key} style={styles.trackCard}>
            <View style={styles.trackHeader}>
              <Text style={styles.trackTitle} numberOfLines={1}>
                {track.icon} {trackName}
              </Text>
              <Text style={styles.trackTier}>{messages.achievementTierLabel(status.nextTier)}</Text>
            </View>
            <Text style={styles.trackProgress} numberOfLines={1}>
              {messages.achievementProgressLabel(
                formatMoney(status.statValue, locale),
                formatMoney(status.nextThreshold, locale)
              )}
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(status.progressRatio * 100)}%` }]} />
            </View>
            {status.claimable ? (
              <SheetAction
                label={messages.achievementClaimAction(status.track.starsPerTier)}
                onPress={() => onClaim(track.key)}
              />
            ) : null}
          </View>
        );
      })}

      <Text style={sheetPartStyles.sheetSectionTitle}>{messages.titlesSection}</Text>
      {ACHIEVEMENT_TITLES.map((title) => {
        const unlocked = isTitleUnlocked(gameState, title.key);
        const active = gameState.activeTitle === title.key;
        const titleName = getTitleLabel(title.key, locale).name;
        const trackName = getAchievementTrackLabel(title.track, locale).name;
        return (
          <Pressable
            key={title.key}
            disabled={!unlocked}
            style={[styles.titleRow, !unlocked && sheetPartStyles.disabledCard, active && styles.activeTitleRow]}
            onPress={() => onSelectTitle(active ? null : title.key)}
          >
            <View style={styles.titleTextGroup}>
              <Text style={styles.titleName}>
                {title.icon} {titleName}
              </Text>
              <Text style={styles.titleDesc} numberOfLines={1}>
                {messages.titleRequirementLabel(trackName, title.tier)}
              </Text>
            </View>
            <Text style={[styles.titleStateBadge, active && styles.activeTitleStateBadge]}>
              {active ? messages.titleActiveBadge : unlocked ? messages.titleSelectBadge : messages.titleLockedBadge}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  trackCard: {
    marginBottom: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  trackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  trackTitle: {
    minWidth: 0,
    flexShrink: 1,
    color: '#253126',
    fontSize: 15,
    fontWeight: '900',
  },
  trackTier: {
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    color: '#ffffff',
    backgroundColor: '#6f57d9',
    fontSize: 11,
    fontWeight: '900',
  },
  trackProgress: {
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
    backgroundColor: '#6f57d9',
  },
  titleRow: {
    minHeight: 64,
    marginBottom: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  activeTitleRow: {
    borderColor: '#4d9d56',
    backgroundColor: '#edf8ed',
  },
  titleTextGroup: {
    flex: 1,
    minWidth: 0,
  },
  titleName: {
    color: '#253126',
    fontSize: 15,
    fontWeight: '900',
  },
  titleDesc: {
    marginTop: 3,
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  titleStateBadge: {
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    color: '#344054',
    backgroundColor: '#edf2f7',
    fontSize: 12,
    fontWeight: '900',
  },
  activeTitleStateBadge: {
    color: '#ffffff',
    backgroundColor: '#2f8747',
  },
});
