/// <reference types="jest" />

import { CROPS, createInitialState, DEFAULT_GOLD } from '../constants';
import { getCropPurchaseCost, getOnboardingCropKey } from '../modifiers';
import type { CropKey } from '../types';

// #362: selectSeed 온보딩 병목 방어. "바로 시작" CTA가 자동 선택할 대표 씨앗은
// 신규 유저가 실제로 심을 수 있어야(감당 가능) 하고, 어떤 상태에서도 non-null이라
// CTA가 "탭해도 무동작"으로 정체를 만들지 않아야 한다.
describe('getOnboardingCropKey (#362)', () => {
  const NOW = 1_700_000_000_000;

  it('신규 유저(초기 골드)에게 항상 non-null 씨앗을 돌려준다', () => {
    const state = createInitialState();
    const key = getOnboardingCropKey(state, NOW);
    expect(key).not.toBeNull();
  });

  it('돌려준 씨앗은 초기 골드로 감당 가능하다(가드 토스트로 튕기지 않음)', () => {
    const state = createInitialState();
    const key = getOnboardingCropKey(state, NOW) as CropKey;
    expect(state.gold).toBeGreaterThanOrEqual(getCropPurchaseCost(state, key, NOW));
  });

  it('감당 가능한 작물이 여러 개면 그중 가장 싼 것을 고른다', () => {
    const state = createInitialState();
    const key = getOnboardingCropKey(state, NOW) as CropKey;
    const affordable = (Object.keys(CROPS) as CropKey[]).filter(
      (candidate) =>
        state.unlockedAreas.includes(CROPS[candidate]!.area) &&
        state.gold >= getCropPurchaseCost(state, candidate, NOW)
    );
    const cheapest = affordable.reduce((best, candidate) =>
      getCropPurchaseCost(state, candidate, NOW) < getCropPurchaseCost(state, best, NOW) ? candidate : best
    );
    expect(getCropPurchaseCost(state, key, NOW)).toBe(getCropPurchaseCost(state, cheapest, NOW));
  });

  it('감당 가능한 작물이 하나도 없어도 심기 가능한 최저가로 폴백해 non-null을 보장한다', () => {
    // 골드를 최저가 작물보다도 낮게 떨어뜨려 "전부 감당 불가" 상황을 만든다.
    const broke = { ...createInitialState(), gold: 0 };
    const key = getOnboardingCropKey(broke, NOW);
    expect(key).not.toBeNull();

    // 폴백은 심기 가능한 작물 전체 중 최저가여야 한다.
    const plantableCosts = (Object.keys(CROPS) as CropKey[])
      .filter((candidate) => broke.unlockedAreas.includes(CROPS[candidate]!.area))
      .map((candidate) => getCropPurchaseCost(broke, candidate, NOW));
    const minCost = Math.min(...plantableCosts);
    expect(getCropPurchaseCost(broke, key as CropKey, NOW)).toBe(minCost);
  });

  it('DEFAULT_GOLD로 시작하는 유저가 감당 가능한 작물이 실제로 존재한다(밸런스 회귀 방지)', () => {
    const state = createInitialState();
    expect(state.gold).toBe(DEFAULT_GOLD);
    const affordableExists = (Object.keys(CROPS) as CropKey[]).some(
      (candidate) =>
        state.unlockedAreas.includes(CROPS[candidate]!.area) &&
        state.gold >= getCropPurchaseCost(state, candidate, NOW)
    );
    expect(affordableExists).toBe(true);
  });
});
