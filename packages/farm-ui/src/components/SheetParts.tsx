import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function SheetAction({
  label,
  accessibilityHint,
  disabled,
  secondary,
  danger,
  onPress,
  testID,
}: {
  label: string;
  accessibilityHint?: string;
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
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled === true }}
      style={[
        sheetPartStyles.sheetAction,
        secondary && sheetPartStyles.secondarySheetAction,
        danger && sheetPartStyles.dangerSheetAction,
        disabled && sheetPartStyles.disabledSheetAction,
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          sheetPartStyles.sheetActionText,
          secondary && sheetPartStyles.secondarySheetActionText,
          disabled && sheetPartStyles.disabledSheetActionText,
        ]}
      >
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
  const fillColor = priceTone === 'speed' ? '#9a63e0' : priceTone === 'profit' ? '#bf7a00' : '#2f8747';

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
          <Text style={sheetPartStyles.shopDesc} textBreakStrategy="balanced">
            {desc}
          </Text>
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
          <Text style={sheetPartStyles.shopDesc} textBreakStrategy="balanced">
            {desc}
          </Text>
        </View>
        <Text style={sheetPartStyles.shopPrice}>{cta}</Text>
      </View>
    </Pressable>
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
    color: '#a98a4e',
    fontSize: 13,
    fontWeight: '900',
  },
  shopCard: {
    minHeight: 72,
    marginBottom: 10,
    padding: 14,
    borderWidth: 2,
    borderColor: '#e4d3ae',
    borderBottomWidth: 4,
    borderBottomColor: '#dcc189',
    borderRadius: 14,
    backgroundColor: '#fffaf0',
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
    backgroundColor: '#eadfc4',
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
  // 구매 불가를 투명도만으로 알리지 않는다. 배경과 테두리를 무채색으로 내려
  // 형태로도 전달한다. 가격 배지는 카드에 걸린 opacity를 함께 받는다.
  disabledCard: {
    opacity: 0.7,
    backgroundColor: '#f0ece2',
    borderColor: '#d9d2c2',
    borderBottomColor: '#cec6b3',
  },
  shopTextGroup: {
    flex: 1,
    minWidth: 0,
  },
  shopTitle: {
    color: '#6b4a22',
    fontSize: 16,
    fontWeight: '900',
  },
  shopDesc: {
    marginTop: 3,
    color: '#a98a4e',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  shopPrice: {
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    color: '#ffffff',
    backgroundColor: '#68b035',
    fontSize: 13,
    fontWeight: '900',
  },
  speedPrice: {
    backgroundColor: '#9a63e0',
  },
  profitPrice: {
    backgroundColor: '#bf7a00',
  },
  settingRow: {
    minHeight: 70,
    marginBottom: 10,
    padding: 14,
    borderWidth: 2,
    borderColor: '#e4d3ae',
    borderBottomWidth: 4,
    borderBottomColor: '#dcc189',
    borderRadius: 14,
    backgroundColor: '#fffaf0',
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
    color: '#6b4a22',
    fontSize: 16,
    fontWeight: '900',
  },
  settingDesc: {
    marginTop: 3,
    color: '#a98a4e',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  sheetNotice: {
    marginTop: 8,
    color: '#6b4a22',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 3,
    backgroundColor: '#d9cdb4',
    justifyContent: 'center',
  },
  activeToggleTrack: {
    backgroundColor: '#68b035',
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
    borderRadius: 10,
    paddingHorizontal: 16,
    marginTop: 8,
    borderWidth: 2,
    borderColor: '#4d8a22',
    borderBottomWidth: 4,
    borderBottomColor: '#3f7a1c',
    backgroundColor: '#68b035',
  },
  secondarySheetAction: {
    borderColor: '#e4d3ae',
    borderBottomColor: '#dcc189',
    backgroundColor: '#fffaf0',
  },
  dangerSheetAction: {
    borderColor: '#c23b3f',
    borderBottomColor: '#a83034',
    backgroundColor: '#e5484d',
  },
  sheetActionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  secondarySheetActionText: {
    color: '#6b4a22',
  },
  // 비활성 버튼은 카드용 disabledCard를 쓰지 않는다. 그쪽 opacity 0.7이 라벨까지
  // 연하게 만들어, 색을 내려도 실제 렌더 대비가 2.79:1에 그쳤다(실기기 측정).
  // 버튼은 투명도 없이 배경·테두리·글자색만으로 비활성을 전달한다.
  disabledSheetAction: {
    backgroundColor: '#f0ece2',
    borderColor: '#d9d2c2',
    borderBottomColor: '#cec6b3',
  },
  // 흰 라벨이 그대로 남아 대비 1.08:1로 사실상 읽히지 않았다(실기기 측정).
  // 비활성 배경 위에서 4.5:1을 넘는 갈색으로 내려, 파괴적 액션의 확인 버튼까지
  // 라벨이 읽히게 한다.
  disabledSheetActionText: {
    color: '#7a6647',
  },
});
