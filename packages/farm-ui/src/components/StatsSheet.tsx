import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  formatDuration,
  formatHourlyGold,
  formatMoney,
  formatRemainingTime,
  type SupportedLocale,
} from '../../../farm-core/src';

import type { FarmMessages } from '../i18n';
import { getWeeklyEventPresentation } from '../weeklyEventPresentation';

// 헤더 HUD에서 옮겨온 보조 지표 배수 포맷터. 지역 스케일링이 배수를 업그레이드 범위보다
// 훨씬 크게 밀어올릴 수 있어, 소수 표기가 의미 없어지는 100배 이상은 정수+천단위 구분으로,
// 그 미만은 소수 1자리로 표기한다(과밀 완화 전 summaryColumn과 동일한 표기를 보존).
function formatMultiplier(value: number) {
  return value >= 100 ? `×${Math.round(value).toLocaleString()}` : `×${value.toFixed(1)}`;
}

// UI-facing record names intentionally narrow legacy LifetimeStats semantics:
// totalGoldEarned is crop/idle income (not every reward), and mutationsFound
// counts mutation harvests rather than unique mutation discoveries.
export type FarmRecordStats = {
  totalHarvests: number;
  cropAndIdleGoldEarned: number;
  mutationHarvests: number;
  prestigeCount: number;
  researchPointsEarned: number;
  breedsUnlocked: number;
  collectionDiscoveredCount: number;
  collectionTotalCount: number;
};

// 라벨 + 값(+ 보조 텍스트) 한 줄. 시트 안에서만 쓰는 표시 전용 부품.
function StatRow({
  label,
  value,
  sub,
  valueStyle,
  subTestID,
  valueTestID,
}: {
  label: string;
  value: string;
  sub?: string;
  valueStyle?: object;
  subTestID?: string;
  valueTestID?: string;
}) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValueGroup}>
        <Text testID={valueTestID} numberOfLines={1} style={[styles.statValue, valueStyle]}>
          {value}
        </Text>
        {sub != null ? (
          <Text testID={subTestID} style={styles.statSub}>
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// '농장 현황' 시트: 상단 HUD 과밀을 되돌리기 위해 연구레벨·수익/성장 배수·수확 부스트·
// 현재 농장 오프라인 수익·주말 축제 상세를 한 뎁스 뒤로 모은 표시 전용 컴포넌트(#233).
// 게임 로직/세이브 스키마 변경 없이 순수 props만 받아 렌더한다.
export function StatsSheet({
  messages,
  locale,
  researchLevel,
  profitMultiplier,
  speedMultiplier,
  boostActive,
  boostMultiplier,
  boostRemainingMs,
  offlineGoldPerHour,
  offlineIncomeCapMs,
  weeklyEventActive,
  weeklyEventAreaName,
  weeklyEventMultiplier,
  weeklyEventAxis,
  weeklyEventTypeKey,
  weeklyEventRemainingMs,
  farmRecords,
}: {
  messages: FarmMessages;
  locale: SupportedLocale;
  researchLevel: number;
  profitMultiplier: number;
  speedMultiplier: number;
  boostActive: boolean;
  boostMultiplier: number;
  boostRemainingMs: number;
  offlineGoldPerHour: number;
  offlineIncomeCapMs: number;
  weeklyEventActive: boolean;
  weeklyEventAreaName: string;
  weeklyEventMultiplier: number;
  // 'speed'면 수확(성장속도) 축제, 그 외('sell')면 판매 축제로 문구를 분기한다.
  weeklyEventAxis: 'sell' | 'speed';
  // 같은 axis 안에서도 이벤트 플레이버를 구분하는 balance roster key.
  weeklyEventTypeKey: string;
  weeklyEventRemainingMs: number;
  farmRecords: FarmRecordStats;
}) {
  const weeklyEventPresentation = getWeeklyEventPresentation(messages, weeklyEventTypeKey, weeklyEventAxis);
  const weeklyEventTitle = weeklyEventActive
    ? weeklyEventPresentation.activeLabel
    : weeklyEventPresentation.teaserLabel;
  const weeklyEventRemaining = formatRemainingTime(weeklyEventRemainingMs, locale);

  return (
    <View testID="stats-sheet">
      <Text style={styles.researchBadge}>{messages.researchBadge(researchLevel)}</Text>
      <StatRow
        label={messages.profitLabel}
        value={formatMultiplier(profitMultiplier)}
        valueStyle={styles.profitValue}
      />
      <StatRow
        label={messages.growthLabel}
        value={formatMultiplier(speedMultiplier)}
        valueStyle={styles.speedValue}
      />
      <StatRow
        label={messages.boostLabel}
        value={boostActive ? `×${boostMultiplier.toFixed(1)}` : messages.statsBoostInactive}
        valueStyle={boostActive ? styles.boostValue : undefined}
        sub={boostActive ? formatRemainingTime(boostRemainingMs, locale) : undefined}
        subTestID="boost-remaining"
      />
      <StatRow
        label={messages.statsOfflineIncomeLabel}
        value={formatHourlyGold(offlineGoldPerHour, locale)}
        sub={messages.statsOfflineIncomeCap(formatDuration(offlineIncomeCapMs, locale))}
        subTestID="stats-offline-income-cap"
        valueTestID="stats-offline-income"
      />

      <Text testID="weekly-event-title" style={styles.sectionTitle}>
        {weeklyEventPresentation.badgeIcon} {weeklyEventTitle}
      </Text>
      {weeklyEventActive ? (
        <Text style={styles.eventDesc} testID="weekly-event-banner">
          {weeklyEventPresentation.activeDescription(
            weeklyEventAreaName,
            weeklyEventMultiplier,
            weeklyEventRemaining,
          )}
        </Text>
      ) : (
        <Text style={styles.eventDesc} testID="weekly-event-teaser">
          {weeklyEventPresentation.teaserDescription(weeklyEventAreaName, weeklyEventRemaining)}
        </Text>
      )}

      <View testID="farm-records-section">
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {messages.statsRecordsSection}
        </Text>
        <StatRow
          label={messages.statsTotalHarvestsLabel}
          value={formatMoney(farmRecords.totalHarvests, locale)}
          valueTestID="stats-record-total-harvests"
        />
        <StatRow
          label={messages.statsCropIdleGoldLabel}
          value={`${formatMoney(farmRecords.cropAndIdleGoldEarned, locale)}G`}
          valueTestID="stats-record-crop-idle-gold"
        />
        <StatRow
          label={messages.statsMutationHarvestsLabel}
          value={formatMoney(farmRecords.mutationHarvests, locale)}
          valueTestID="stats-record-mutation-harvests"
        />
        <StatRow
          label={messages.statsPrestigeCountLabel}
          value={formatMoney(farmRecords.prestigeCount, locale)}
          valueTestID="stats-record-prestige-count"
        />
        <StatRow
          label={messages.statsResearchPointsEarnedLabel}
          value={`${formatMoney(farmRecords.researchPointsEarned, locale)} RP`}
          valueTestID="stats-record-research-points"
        />
        <StatRow
          label={messages.statsBreedsUnlockedLabel}
          value={formatMoney(farmRecords.breedsUnlocked, locale)}
          valueTestID="stats-record-breeds-unlocked"
        />
        <StatRow
          label={messages.statsCollectionDiscoveredLabel}
          value={`${formatMoney(farmRecords.collectionDiscoveredCount, locale)} / ${formatMoney(
            farmRecords.collectionTotalCount,
            locale
          )}`}
          valueTestID="stats-record-collection-discovered"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  researchBadge: {
    marginBottom: 8,
    alignSelf: 'flex-start',
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    color: '#ffffff',
    backgroundColor: '#6f57d9',
    fontSize: 13,
    fontWeight: '900',
  },
  statRow: {
    minHeight: 52,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eef0f3',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  statLabel: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    color: '#667085',
    fontSize: 14,
    fontWeight: '800',
  },
  statValueGroup: {
    flexShrink: 0,
    alignItems: 'flex-end',
  },
  statValue: {
    color: '#253126',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
  },
  statSub: {
    marginTop: 2,
    color: '#8a4b0f',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'right',
  },
  profitValue: {
    color: '#247241',
  },
  speedValue: {
    color: '#2f7de1',
  },
  boostValue: {
    color: '#b54708',
  },
  sectionTitle: {
    marginTop: 18,
    marginBottom: 8,
    color: '#253126',
    fontSize: 15,
    fontWeight: '900',
  },
  eventDesc: {
    color: '#667085',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
});
