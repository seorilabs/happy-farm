import type { SheetOpenSource } from '../../farm-core/src';

// 시트 진입 경로 판정(#606). 내비 탭이 시트를 여는 순간 출처를 잠깐 기억해 두고, 시트 전환
// effect에서 이 값을 읽는다. 탭이 시트를 열지 못한 경우 그 출처가 뒤의 자동 팝업에 붙지 않도록
// 짧은 유효 시간을 둔다.
export const PENDING_SHEET_SOURCE_TTL_MS = 1_000;

export type PendingSheetSource = { source: SheetOpenSource; at: number };

// 시트 종류와, 출석·생산 시트가 이미 가진 출처 필드만 본다.
export type SheetSourceInput = { type: string; source?: string };

export function resolveSheetOpenSource(
  sheet: SheetSourceInput,
  pending: PendingSheetSource | null,
  now: number
): SheetOpenSource {
  if (pending != null && now - pending.at <= PENDING_SHEET_SOURCE_TTL_MS) {
    return pending.source;
  }
  if (sheet.type === 'welcomeBack') {
    return 'auto_popup';
  }
  if (sheet.type === 'dailyBonus' || sheet.type === 'production') {
    if (sheet.source === 'auto_popup') return 'auto_popup';
    if (sheet.source === 'more') return 'more_menu';
  }
  return 'other';
}

// 시트 체류 시간(#606). 앱이 백그라운드에 있던 시간은 빼고 화면에 떠 있던 시간만 센다.
// activeSince가 null이면 일시정지(백그라운드) 상태다.
export type SheetDwell = { sheet: string; accumulatedMs: number; activeSince: number | null };

// 앱이 활성이 아닐 때(로드가 백그라운드에서 끝나 자동 시트가 열린 경우) 열리면 일시정지 상태로 시작해
// 복귀 이벤트부터 센다.
export function startSheetDwell(sheet: string, now: number, appActive = true): SheetDwell {
  return { sheet, accumulatedMs: 0, activeSince: appActive ? now : null };
}

export function pauseSheetDwell(dwell: SheetDwell, now: number): SheetDwell {
  if (dwell.activeSince == null) return dwell;
  return { ...dwell, accumulatedMs: dwell.accumulatedMs + Math.max(0, now - dwell.activeSince), activeSince: null };
}

export function resumeSheetDwell(dwell: SheetDwell, now: number): SheetDwell {
  if (dwell.activeSince != null) return dwell;
  return { ...dwell, activeSince: now };
}

export function finishSheetDwell(dwell: SheetDwell, now: number): number {
  return pauseSheetDwell(dwell, now).accumulatedMs;
}
