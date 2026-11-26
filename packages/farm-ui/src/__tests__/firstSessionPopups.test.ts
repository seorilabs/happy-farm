/// <reference types="jest" />

import { createInitialState, type GameState } from '../../../farm-core/src';
import { isFirstSessionPopupHoldActive } from '../firstSessionPopups';

describe('isFirstSessionPopupHoldActive (#606 AC-4)', () => {
  const fresh = createInitialState();
  const SESSION_START = 1_700_000_000_000;

  test('첫 세션에서 첫 밭을 늘리기 전에는 자동 팝업을 미룬다', () => {
    expect(isFirstSessionPopupHoldActive(fresh, SESSION_START)).toBe(true);
  });

  test('첫 밭을 늘리면 미뤄 둔 팝업을 풀어 준다', () => {
    const expanded: GameState = { ...fresh, unlockedPlotCount: fresh.unlockedPlotCount + 1 };
    expect(isFirstSessionPopupHoldActive(expanded, SESSION_START)).toBe(false);
  });

  test('첫 세션이 아니면(다시 실행한 기존 사용자) 미루지 않는다', () => {
    expect(isFirstSessionPopupHoldActive(fresh, null)).toBe(false);
  });

  test('졸업해 밭 수가 초기값으로 돌아간 사용자는 미루지 않는다', () => {
    const graduated: GameState = { ...fresh, prestige: { ...fresh.prestige, level: 1 } };
    expect(isFirstSessionPopupHoldActive(graduated, SESSION_START)).toBe(false);
  });
});
