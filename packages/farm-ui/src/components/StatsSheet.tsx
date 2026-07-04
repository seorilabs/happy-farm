import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatRemainingTime, type SupportedLocale } from '../../../farm-core/src';

import type { FarmMessages } from '../i18n';

// 헤더 HUD에서 옮겨온 보조 지표 배수 포맷터. 지역 스케일링이 배수를 업그레이드 범위보다
// 훨씬 크게 밀어올릴 수 있어, 소수 표기가 의미 없어지는 100배 이상은 정수+천단위 구분으로,
// 그 미만은 소수 1자리로 표기한다(과밀 완화 전 summaryColumn과 동일한 표기를 보존).
function formatMultiplier(value: number) {
  return value >= 100 ? `×${Math.round(value).toLocaleString()}` : `×${value.toFixed(1)}`;
}

// 라벨 + 값(+ 보조 텍스트) 한 줄. 시트 안에서만 쓰는 표시 전용 부품.
function StatRow({
  label,
  value,
  sub,
  valueStyle,
  subTestID,
}: {
  label: string;
  value: string;
  sub?: string;
  valueStyle?: object;
  subTestID?: string;
}) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValueGroup}>
        <Text style={[styles.statValue, valueStyle]}>{value}</Text>
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
// 주말 축제 상세를 한 뎁스 뒤로 모은 표시 전용 컴포넌트(#233). 게임 로직/세이브 스키마
// 변경 없이 순수 props만 받아 렌더한다.
export function StatsSheet({
  messages,
  locale,
  researchLevel,
  profitMultiplier,
  speedMultiplier,
  boostActive,
  boostMultiplier,
  boostRemainingMs,
  weeklyEventActive,
  weeklyEventAreaName,
  weeklyEventMultiplier,
  weeklyEventAxis,
  weeklyEventRemainingMs,
}: {
  messages: FarmMessages;
  locale: SupportedLocale;
  researchLevel: number;
  profitMultiplier: number;
  speedMultiplier: number;
  boostActive: boolean;
  boostMultiplier: number;
  boostRemainingMs: number;
  weeklyEventActive: boolean;
  weeklyEventAreaName: string;
  weeklyEventMultiplier: number;
  // 'speed'면 수확(성장속도) 축제, 그 외('sell')면 판매 축제로 문구를 분기한다.
  weeklyEventAxis: 'sell' | 'speed';
  weeklyEventRemainingMs: number;
}) {
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

      <Text style={styles.sectionTitle}>
        {weeklyEventActive ? messages.weeklyEventLabel : messages.weeklyEventTeaserLabel}
      </Text>
      {weeklyEventActive ? (
        <Text style={styles.eventDesc} testID="weekly-event-banner">
          {(weeklyEventAxis === 'speed' ? messages.weeklyEventHarvestDesc : messages.weeklyEventDesc)(
            weeklyEventAreaName,
            weeklyEventMultiplier,
            formatRemainingTime(weeklyEventRemainingMs, locale)
          )}
        </Text>
      ) : (
        <Text style={styles.eventDesc} testID="weekly-event-teaser">
          {messages.weeklyEventTeaserDesc(weeklyEventAreaName, formatRemainingTime(weeklyEventRemainingMs, locale))}
        </Text>
      )}
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
    color: '#667085',
    fontSize: 14,
    fontWeight: '800',
  },
  statValueGroup: {
    flexShrink: 1,
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
