import { INITIAL_PLOTS, type GameState } from '../../farm-core/src';

// 첫 세션 팝업 순서(#606 AC-4). GA4에서 첫날 밭을 해금한 사용자의 복귀율이 크게 높았고,
// 첫 1분 안에 온보딩, 출석 보너스, 알림 안내, 기능 안내가 연달아 떠서 첫 목표를 가렸다.
// 첫 세션에서는 첫 밭을 늘릴 때까지 출석 보너스 자동 팝업, 알림 권한 안내, 기능 안내, 수확 보너스 광고
// 제안을 미룬다.
// firstSessionStartedAt은 이번 실행이 새 세이브로 시작했을 때만 값이 있다.
export function isFirstSessionPopupHoldActive(gameState: GameState, firstSessionStartedAt: number | null): boolean {
  return (
    firstSessionStartedAt != null && gameState.prestige.level === 0 && gameState.unlockedPlotCount <= INITIAL_PLOTS
  );
}

// 자동 팝업끼리의 최소 간격(1회차 #4, 2회차 N9). 첫 밭을 늘린 직후 출석, 알림 안내, 광고 제안, 기능 안내가
// 연달아 떴다. 광고 제안과 기능 안내는 다른 자동 팝업이 뜬 뒤 이만큼 지나야 연다. 출석 다음의 알림 안내는
// 설계(AC-4)대로 출석을 닫으면 바로 하나씩 이어진다.
export const AUTO_POPUP_MIN_GAP_MS = 60_000;

export function getAutoPopupGapRemainingMs(lastAutoPopupAt: number | null, now: number): number {
  return lastAutoPopupAt == null ? 0 : Math.max(0, lastAutoPopupAt + AUTO_POPUP_MIN_GAP_MS - now);
}

// 수확 뒤 수확 보너스 광고 제안을 자동으로 열지 정한다(1회차 #4). 첫 세션에서 첫 밭을 늘리기 전에는
// 출석 보너스, 알림 안내와 같이 미룬다. GA4에서 첫 1분 안의 광고 제안(중앙값 48초)이 첫 목표를 가렸다.
export function canAutoOpenHarvestBonusOffer(input: {
  // 광고 준비, 광고 한도, 제안 간격, 부스트 중 여부를 이미 통과했는지.
  nudgeEligible: boolean;
  onboardingCompleted: boolean;
  firstMeaningfulHarvest: boolean;
  firstSessionHold: boolean;
  lastAutoPopupAt: number | null;
  now: number;
}): boolean {
  if (!input.nudgeEligible || !input.onboardingCompleted || input.firstMeaningfulHarvest || input.firstSessionHold) {
    return false;
  }
  return getAutoPopupGapRemainingMs(input.lastAutoPopupAt, input.now) === 0;
}
