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
