import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function SheetAction({
  label,
  disabled,
  secondary,
  danger,
  onPress,
  testID,
}: {
  label: string;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled === true }}
      style={[
        sheetPartStyles.sheetAction,
        secondary && sheetPartStyles.secondarySheetAction,
        danger && sheetPartStyles.dangerSheetAction,
        disabled && sheetPartStyles.disabledCard,
      ]}
      onPress={onPress}
    >
      <Text style={[sheetPartStyles.sheetActionText, secondary && sheetPartStyles.secondarySheetActionText]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ShopCard({
  title,
  desc,
  price,
  disabled,
  priceTone,
  goldProgress,
  onPress,
}: {
  title: string;
  desc: string;
  price: string;
  disabled?: boolean;
  priceTone?: 'speed' | 'profit';
  goldProgress?: number;
  onPress: () => void;
}) {
  const showProgress = disabled === true && goldProgress != null && goldProgress > 0 && goldProgress < 1;
  const fillColor = priceTone === 'speed' ? '#2f7de1' : priceTone === 'profit' ? '#bf7a00' : '#2f8747';

  return (
    <Pressable
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${desc}, ${price}`}
      accessibilityState={{ disabled: disabled === true }}
      style={[sheetPartStyles.shopCard, disabled && sheetPartStyles.disabledCard]}
      onPress={onPress}
    >
      <View style={sheetPartStyles.shopCardRow}>
        <View style={sheetPartStyles.shopTextGroup}>
          <Text style={sheetPartStyles.shopTitle}>{title}</Text>
          <Text style={sheetPartStyles.shopDesc}>{desc}</Text>
        </View>
        <Text
          style={[
            sheetPartStyles.shopPrice,
            priceTone === 'speed' && sheetPartStyles.speedPrice,
            priceTone === 'profit' && sheetPartStyles.profitPrice,
          ]}
        >
          {price}
        </Text>
      </View>
      {showProgress ? (
        <View style={sheetPartStyles.upgradeTrack}>
          <View
            style={[
              sheetPartStyles.upgradeFill,
              { width: `${Math.round((goldProgress ?? 0) * 100)}%` as `${number}%`, backgroundColor: fillColor },
            ]}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

export function AdRewardCard({
  title,
  desc,
  cta,
  disabled,
  onPress,
}: {
  title: string;
  desc: string;
  cta: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      style={[sheetPartStyles.shopCard, sheetPartStyles.adCard, disabled && sheetPartStyles.disabledCard]}
      onPress={onPress}
    >
      <View style={sheetPartStyles.shopCardRow}>
        <View style={sheetPartStyles.shopTextGroup}>
          <Text style={sheetPartStyles.shopTitle}>{title}</Text>
          <Text style={sheetPartStyles.shopDesc}>{desc}</Text>
        </View>
        <Text style={sheetPartStyles.shopPrice}>{cta}</Text>
      </View>
    </Pressable>
  );
}

// Settings cloud-backup section: description + last-result notice + backup/restore
// buttons. The caller (FarmGame) owns the actual actions and status mapping; this
// only renders. Both buttons are disabled while busy to prevent re-entry.
export function CloudSaveSection({
  title,
  desc,
  notice,
  backupLabel,
  restoreLabel,
  busy,
  onBackup,
  onRestore,
}: {
  title: string;
  desc: string;
  notice: string | null;
  backupLabel: string;
  restoreLabel: string;
  busy: boolean;
  onBackup: () => void;
  onRestore: () => void;
}) {
  return (
    <View>
      <Text style={sheetPartStyles.sheetSectionTitle}>{title}</Text>
      <Text style={sheetPartStyles.settingDesc}>{desc}</Text>
      {notice != null ? (
        <Text style={sheetPartStyles.cloudSaveNotice} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      ) : null}
      <SheetAction label={backupLabel} disabled={busy} onPress={onBackup} />
      <SheetAction label={restoreLabel} secondary disabled={busy} onPress={onRestore} />
    </View>
  );
}

export function SettingToggle({
  label,
  desc,
  value,
  disabled,
  onPress,
}: {
  label: string;
  desc: string;
  value: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      style={[sheetPartStyles.settingRow, disabled && sheetPartStyles.disabledCard]}
      onPress={onPress}
    >
      <View style={sheetPartStyles.settingTextGroup}>
        <Text style={sheetPartStyles.settingTitle}>{label}</Text>
        <Text style={sheetPartStyles.settingDesc}>{desc}</Text>
      </View>
      <View style={[sheetPartStyles.toggleTrack, value && sheetPartStyles.activeToggleTrack]}>
        <View style={[sheetPartStyles.toggleThumb, value && sheetPartStyles.activeToggleThumb]} />
      </View>
    </Pressable>
  );
}

export const sheetPartStyles = StyleSheet.create({
  sheetSectionTitle: {
    marginTop: 12,
    marginBottom: 8,
    color: '#667085',
    fontSize: 13,
    fontWeight: '900',
  },
  shopCard: {
    minHeight: 72,
    marginBottom: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  shopCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  upgradeTrack: {
    marginTop: 8,
    height: 3,
    backgroundColor: '#e0e8f0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  upgradeFill: {
    height: 3,
    borderRadius: 2,
  },
  adCard: {
    borderColor: '#aad8b1',
    backgroundColor: '#f0fbf0',
  },
  disabledCard: {
    opacity: 0.45,
  },
  shopTextGroup: {
    flex: 1,
    minWidth: 0,
  },
  shopTitle: {
    color: '#253126',
    fontSize: 16,
    fontWeight: '900',
  },
  shopDesc: {
    marginTop: 3,
    color: '#667085',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  shopPrice: {
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    color: '#ffffff',
    backgroundColor: '#2f8747',
    fontSize: 13,
    fontWeight: '900',
  },
  speedPrice: {
    backgroundColor: '#2f7de1',
  },
  profitPrice: {
    backgroundColor: '#bf7a00',
  },
  settingRow: {
    minHeight: 70,
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
  settingTextGroup: {
    flex: 1,
    minWidth: 0,
  },
  settingTitle: {
    color: '#253126',
    fontSize: 16,
    fontWeight: '900',
  },
  settingDesc: {
    marginTop: 3,
    color: '#667085',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  cloudSaveNotice: {
    marginTop: 8,
    color: '#344054',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 3,
    backgroundColor: '#d0d5dd',
    justifyContent: 'center',
  },
  activeToggleTrack: {
    backgroundColor: '#2f7de1',
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ffffff',
  },
  activeToggleThumb: {
    alignSelf: 'flex-end',
  },
  sheetAction: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#2f7de1',
  },
  secondarySheetAction: {
    backgroundColor: '#edf2f7',
  },
  dangerSheetAction: {
    backgroundColor: '#e5484d',
  },
  sheetActionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  secondarySheetActionText: {
    color: '#344054',
  },
});
