import React from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { CROPS, DEFAULT_GOLD, FARM_AREAS, formatMoney } from '../../packages/farm-core/src';

const firstCrop = Object.values(CROPS)[0];

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <ScrollView contentInsetAdjustmentBehavior="automatic" style={styles.scrollView}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>Happy Farm Tycoon</Text>
            <Text style={styles.title}>행복 농장 타이쿤</Text>
            <Text style={styles.subtitle}>작물을 키우고 구역을 확장하는 농장 성장 게임</Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{Object.keys(CROPS).length}</Text>
              <Text style={styles.statLabel}>작물</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{FARM_AREAS.length}</Text>
              <Text style={styles.statLabel}>구역</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{formatMoney(DEFAULT_GOLD)}G</Text>
              <Text style={styles.statLabel}>시작 골드</Text>
            </View>
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelLabel}>첫 작물</Text>
            <Text style={styles.cropName}>{firstCrop?.name ?? '감자'}</Text>
            <Text style={styles.cropMeta}>
              구매 {formatMoney(firstCrop?.cost ?? 0)}G · 판매 {formatMoney(firstCrop?.sell ?? 0)}G
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F3EA',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 42,
    paddingBottom: 28,
  },
  eyebrow: {
    color: '#5C6B4A',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  title: {
    color: '#1F2A18',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 39,
  },
  subtitle: {
    color: '#526047',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
  },
  statBox: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E0D8C7',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 88,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  statValue: {
    color: '#26331E',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0,
  },
  statLabel: {
    color: '#66725C',
    fontSize: 13,
    marginTop: 8,
  },
  panel: {
    backgroundColor: '#2E6A4E',
    borderRadius: 8,
    margin: 16,
    padding: 18,
  },
  panelLabel: {
    color: '#D9E8D3',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: 8,
  },
  cropName: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0,
  },
  cropMeta: {
    color: '#EEF5EA',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
});

export default App;
