/// <reference types="jest" />

import {
  PENDING_SHEET_SOURCE_TTL_MS,
  finishSheetDwell,
  pauseSheetDwell,
  resolveSheetOpenSource,
  resumeSheetDwell,
  startSheetDwell,
} from '../sheetAnalytics';

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

describe('시트 체류 시간 누적 (#606)', () => {
  test('앱이 백그라운드에 있던 시간은 체류에서 뺀다', () => {
    let dwell = startSheetDwell('shop', NOW);
    dwell = pauseSheetDwell(dwell, NOW + 3_000);
    // 10분 동안 다른 앱에 있다 돌아온다.
    dwell = resumeSheetDwell(dwell, NOW + 603_000);
    expect(finishSheetDwell(dwell, NOW + 605_000)).toBe(5_000);
  });

  test('일시정지와 재개가 중복으로 와도 한 번만 센다', () => {
    let dwell = startSheetDwell('shop', NOW);
    dwell = pauseSheetDwell(dwell, NOW + 1_000);
    dwell = pauseSheetDwell(dwell, NOW + 2_000);
    dwell = resumeSheetDwell(dwell, NOW + 10_000);
    dwell = resumeSheetDwell(dwell, NOW + 11_000);
    expect(finishSheetDwell(dwell, NOW + 12_000)).toBe(3_000);
  });

  test('일시정지 상태에서 닫히면 누적값만 돌려준다', () => {
    const dwell = pauseSheetDwell(startSheetDwell('more', NOW), NOW + 4_000);
    expect(finishSheetDwell(dwell, NOW + 90_000)).toBe(4_000);
  });
});

describe('백그라운드에서 열린 시트 (#606)', () => {
  test('앱이 활성이 아닐 때 열린 시트는 복귀한 뒤부터 센다', () => {
    let dwell = startSheetDwell('welcomeBack', NOW, false);
    dwell = resumeSheetDwell(dwell, NOW + 120_000);
    expect(finishSheetDwell(dwell, NOW + 125_000)).toBe(5_000);
  });
});
