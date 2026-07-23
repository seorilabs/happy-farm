import type { GameState } from './types';

// 신규 미션 중 별도 시스템 해금이 필요한 목표. 기존 심기/수확/광고/기부와
// spend_gold는 처음부터 가능한 기본 루프라 별도 게이트 없이 항상 노출한다.
export type GatedMissionType = 'collect_produce' | 'craft_complete' | 'breed';

// 표시·수령 단계에서만 쓰는 안정적인 해금 판정. 한 번 true가 된 뒤 프레스티지나
// 재고 소비로 다시 false가 되지 않는 메타 상태를 기준으로 삼아, 같은 날/주에 미션이
// 갑자기 사라지는 일을 막는다.
export function isMissionTypeUnlocked(gameState: GameState, type: string): boolean {
  switch (type) {
    case 'collect_produce':
      // 축사를 하나라도 지은 뒤부터 산출 수집 루프가 실제로 가능하다.
      return gameState.animals.owned.length > 0;
    case 'craft_complete':
      // 첫 수확 이후 공방 재고를 모을 수 있다. totalHarvests/발견 목록은 영구 메타라
      // 가공 후 재고가 0이 되어도 미션 노출이 흔들리지 않는다.
      return gameState.lifetimeStats.totalHarvests > 0 || gameState.harvestedCropKeys.length > 0;
    case 'breed':
      return gameState.research.unlockedNodes.includes('breeding_lab');
    default:
      return true;
  }
}
