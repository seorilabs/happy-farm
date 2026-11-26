/// <reference types="jest" />

import { createInitialState, type GameState } from '../../../farm-core/src';
import {
  AUTO_POPUP_MIN_GAP_MS,
  getAutoPopupGapRemainingMs,
  canAutoOpenHarvestBonusOffer,
  isFirstSessionPopupHoldActive,
} from '../firstSessionPopups';

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

describe('canAutoOpenHarvestBonusOffer (1회차 #4)', () => {
  const NOW = 1_700_000_000_000;
  const eligible = {
    nudgeEligible: true,
    onboardingCompleted: true,
    firstMeaningfulHarvest: false,
    firstSessionHold: false,
    lastAutoPopupAt: null,
    now: NOW,
  };

  test('조건을 모두 채우면 수확 보너스 광고 제안을 자동으로 연다', () => {
    expect(canAutoOpenHarvestBonusOffer(eligible)).toBe(true);
  });

  test('첫 세션에서 첫 밭을 늘리기 전에는 광고 제안도 미룬다', () => {
    expect(canAutoOpenHarvestBonusOffer({ ...eligible, firstSessionHold: true })).toBe(false);
  });

  test('다른 자동 팝업 직후에는 간격을 두고 연다', () => {
    expect(canAutoOpenHarvestBonusOffer({ ...eligible, lastAutoPopupAt: NOW - AUTO_POPUP_MIN_GAP_MS + 1 })).toBe(false);
    expect(canAutoOpenHarvestBonusOffer({ ...eligible, lastAutoPopupAt: NOW - AUTO_POPUP_MIN_GAP_MS })).toBe(true);
  });

  test('온보딩 중이거나 첫 수확이면 열지 않는다', () => {
    expect(canAutoOpenHarvestBonusOffer({ ...eligible, onboardingCompleted: false })).toBe(false);
    expect(canAutoOpenHarvestBonusOffer({ ...eligible, firstMeaningfulHarvest: true })).toBe(false);
    expect(canAutoOpenHarvestBonusOffer({ ...eligible, nudgeEligible: false })).toBe(false);
  });
});

// 2회차 N9: 첫 밭 해금 직후 출석, 알림 안내, 기능 안내가 20초 안에 연달아 떴다. 계획대로 기능 안내도
// 다른 자동 팝업이 뜬 뒤 간격을 두고 띄운다.
describe('getAutoPopupGapRemainingMs (2회차 N9)', () => {
  test('직전 자동 팝업이 없으면 기다리지 않는다', () => {
    expect(getAutoPopupGapRemainingMs(null, 1_000)).toBe(0);
  });

  test('직전 자동 팝업이 뜬 뒤 최소 간격이 지날 때까지 남은 시간을 준다', () => {
    expect(getAutoPopupGapRemainingMs(1_000, 1_000 + 20_000)).toBe(AUTO_POPUP_MIN_GAP_MS - 20_000);
    expect(getAutoPopupGapRemainingMs(1_000, 1_000 + AUTO_POPUP_MIN_GAP_MS)).toBe(0);
  });
});
