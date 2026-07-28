import {
  recordBreedProgress,
  recordCraftCompletionProgress,
  recordGoldSpentProgress,
  recordProduceCollectionProgress,
} from './missions';
import type { GameState } from './types';
import {
  recordWeeklyBreedProgress,
  recordWeeklyCraftCompletionProgress,
  recordWeeklyGoldSpentProgress,
  recordWeeklyProduceCollectionProgress,
} from './weeklyMissions';

export type MissionProgressEvent =
  | { type: 'collect_produce'; amount?: number }
  | { type: 'craft_complete'; amount?: number }
  | { type: 'breed'; amount?: number }
  | { type: 'spend_gold'; amount: number };

// 행동을 성공시킨 canonical GameState 전이에 일일·주간 진행도를 함께 붙인다.
// 단일/일괄 액션은 같은 core 전이를 재사용하므로 이 함수 한 곳을 거쳐 정확한 횟수·금액이
// 누적된다. 유효하지 않은 amount는 두 미션 모듈이 no-op으로 방어한다.
export function recordMissionProgressEvent(
  gameState: GameState,
  event: MissionProgressEvent,
  now = Date.now()
): GameState {
  const amount = event.amount ?? 1;
  let dailyMissionState = gameState.dailyMissionState;
  let weeklyMissionState = gameState.weeklyMissionState;

  switch (event.type) {
    case 'collect_produce':
      dailyMissionState = recordProduceCollectionProgress(
        dailyMissionState,
        amount,
        now,
        gameState.unlockedAreas
      );
      weeklyMissionState = recordWeeklyProduceCollectionProgress(
        weeklyMissionState,
        amount,
        now,
        gameState.unlockedAreas
      );
      break;
    case 'craft_complete':
      dailyMissionState = recordCraftCompletionProgress(
        dailyMissionState,
        amount,
        now,
        gameState.unlockedAreas
      );
      weeklyMissionState = recordWeeklyCraftCompletionProgress(
        weeklyMissionState,
        amount,
        now,
        gameState.unlockedAreas
      );
      break;
    case 'breed':
      dailyMissionState = recordBreedProgress(dailyMissionState, amount, now, gameState.unlockedAreas);
      weeklyMissionState = recordWeeklyBreedProgress(
        weeklyMissionState,
        amount,
        now,
        gameState.unlockedAreas
      );
      break;
    case 'spend_gold':
      dailyMissionState = recordGoldSpentProgress(
        dailyMissionState,
        amount,
        now,
        gameState.unlockedAreas
      );
      weeklyMissionState = recordWeeklyGoldSpentProgress(
        weeklyMissionState,
        amount,
        now,
        gameState.unlockedAreas
      );
      break;
  }

  if (
    dailyMissionState === gameState.dailyMissionState &&
    weeklyMissionState === gameState.weeklyMissionState
  ) {
    return gameState;
  }
  return { ...gameState, dailyMissionState, weeklyMissionState };
}

// #426: 업그레이드 구매(단일/배치 공통)의 canonical 상태 전이. 골드 차감·레벨 증가·
// 미션 골드 소비 기록을 recordMissionProgressEvent를 거쳐 한 번의 상태 갱신으로 원자적으로
// 처리한다. 살 레벨 수(levels)와 총비용(totalCost)은 호출부(getUpgradeBatchPurchase 등)가
// 계산해 전달한다. levels<=0이면 no-op으로 방어한다.
export function applyUpgradePurchase(
  gameState: GameState,
  kind: 'speed' | 'profit',
  levels: number,
  totalCost: number,
  now = Date.now()
): GameState {
  if (levels <= 0) {
    return gameState;
  }
  return recordMissionProgressEvent(
    {
      ...gameState,
      gold: gameState.gold - totalCost,
      upgrades: { ...gameState.upgrades, [kind]: gameState.upgrades[kind] + levels },
    },
    { type: 'spend_gold', amount: totalCost },
    now
  );
}
