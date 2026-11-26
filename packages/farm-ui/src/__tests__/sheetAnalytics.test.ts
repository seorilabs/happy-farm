/// <reference types="jest" />

import { PENDING_SHEET_SOURCE_TTL_MS, resolveSheetOpenSource } from '../sheetAnalytics';

const NOW = 1_700_000_000_000;

describe('resolveSheetOpenSource (#606)', () => {
  test('직전 내비 탭이 있으면 그 위치를 출처로 쓴다', () => {
    expect(resolveSheetOpenSource({ type: 'shop' }, { source: 'tab_bar', at: NOW - 10 }, NOW)).toBe('tab_bar');
    expect(resolveSheetOpenSource({ type: 'lab' }, { source: 'more_menu', at: NOW }, NOW)).toBe('more_menu');
  });

  test('오래된 내비 탭은 무시하고 시트 자체의 출처로 판정한다', () => {
    const stale = { source: 'nav' as const, at: NOW - PENDING_SHEET_SOURCE_TTL_MS - 1 };
    expect(resolveSheetOpenSource({ type: 'shop' }, stale, NOW)).toBe('other');
    expect(resolveSheetOpenSource({ type: 'dailyBonus', source: 'auto_popup' }, stale, NOW)).toBe('auto_popup');
  });

  test('출석과 생산 시트는 기존 출처 필드를 공통 출처로 옮긴다', () => {
    expect(resolveSheetOpenSource({ type: 'dailyBonus', source: 'auto_popup' }, null, NOW)).toBe('auto_popup');
    expect(resolveSheetOpenSource({ type: 'dailyBonus', source: 'more' }, null, NOW)).toBe('more_menu');
    expect(resolveSheetOpenSource({ type: 'dailyBonus', source: 'welcome_back' }, null, NOW)).toBe('other');
    expect(resolveSheetOpenSource({ type: 'production', source: 'more' }, null, NOW)).toBe('more_menu');
    expect(resolveSheetOpenSource({ type: 'production', source: 'welcome_back' }, null, NOW)).toBe('other');
  });

  test('복귀 요약은 자동 팝업으로, 그 밖에는 other로 둔다', () => {
    expect(resolveSheetOpenSource({ type: 'welcomeBack' }, null, NOW)).toBe('auto_popup');
    expect(resolveSheetOpenSource({ type: 'growthAd' }, null, NOW)).toBe('other');
  });
});
