import { INITIAL_PLOTS, type GameState } from '../../farm-core/src';

// 첫 세션 팝업 순서(#606 AC-4). GA4에서 첫날 밭을 해금한 사용자의 복귀율이 크게 높았고,
// 첫 1분 안에 온보딩, 출석 보너스, 알림 안내, 기능 안내가 연달아 떠서 첫 목표를 가렸다.
// 첫 세션에서는 첫 밭을 늘릴 때까지 출석 보너스 자동 팝업, 알림 권한 안내, 기능 안내를 미룬다.
// firstSessionStartedAt은 이번 실행이 새 세이브로 시작했을 때만 값이 있다.
export function isFirstSessionPopupHoldActive(gameState: GameState, firstSessionStartedAt: number | null): boolean {
  return (
    firstSessionStartedAt != null && gameState.prestige.level === 0 && gameState.unlockedPlotCount <= INITIAL_PLOTS
  );
}
