/// <reference types="jest" />

import {
  CROPS,
  createInitialState,
  getCropPurchaseCost,
  getOnboardingCropKey,
  resolveOnboardingStep,
} from '../../../farm-core/src';
import type { CropKey } from '../../../farm-core/src';
import {
  isQuickStartCtaAvailable,
  resolveUnaffordableSeedNudge,
  shouldFireStallNudge,
} from '../onboardingNudge';

const NOW = 1_700_000_000_000;

// #427: selectSeed 단계 제거 후, 씨앗 유도(강조/넛지)는 직접 파종을 안내하는 plant
// 단계로 귀속된다. 실제 애니메이션/렌더는 헤드리스로 검증 불가하므로 여기서는
// "언제/어디로 유도할지"의 판정만 검증한다.

// 아직 아무것도 심지 않은 미완료 상태 — plant 재개 경로를 대표한다.
const untouchedPlantState = () => ({
  ...createInitialState(),
  onboardingStep: 'plant' as const,
  plots: createInitialState().plots.map((plot) => ({ ...plot, cropType: null, startTime: null, state: 0 as const })),
});

describe('shouldFireStallNudge — AC-3 (단계별 세션당 1회, plant/harvest)', () => {
  it('plant에서 아직 발화 전이면 넛지를 발화한다', () => {
    expect(shouldFireStallNudge('plant', false)).toBe(true);
  });

  it('harvest에서도 아직 발화 전이면 넛지를 발화한다', () => {
    expect(shouldFireStallNudge('harvest', false)).toBe(true);
  });

  it('각 단계에서 이미 발화했으면 다시 발화하지 않는다(1회 가드)', () => {
    expect(shouldFireStallNudge('plant', true)).toBe(false);
    expect(shouldFireStallNudge('harvest', true)).toBe(false);
  });

  it('실제 조작 대상이 없는 단계에서는 발화하지 않는다', () => {
    expect(shouldFireStallNudge('reward', false)).toBe(false);
    expect(shouldFireStallNudge(null, false)).toBe(false);
  });
});

describe('getOnboardingCropKey — AC-1 (quickStartCropKey 항상 non-null fallback)', () => {
  it('신규 유저(초기 골드) 기준 quickStartCropKey가 항상 non-null이다', () => {
    expect(getOnboardingCropKey(createInitialState(), NOW)).not.toBeNull();
  });

  it('fallback으로 고른 대표 씨앗은 초기 골드로 감당 가능하다(가드 토스트로 튕기지 않음)', () => {
    const state = createInitialState();
    const key = getOnboardingCropKey(state, NOW);
    expect(key).not.toBeNull();
    expect(state.gold).toBeGreaterThanOrEqual(getCropPurchaseCost(state, key as CropKey, NOW));
  });

  it('감당 가능한 작물이 하나도 없어도(골드 0) fallback으로 non-null을 보장한다', () => {
    expect(getOnboardingCropKey({ ...createInitialState(), gold: 0 }, NOW)).not.toBeNull();
  });
});

describe('isQuickStartCtaAvailable — AC-2 (CTA 항상 렌더 가능)', () => {
  it('신규 유저(초기 골드)에서 CTA 게이트가 열려 있다(quickStartCropKey non-null)', () => {
    expect(isQuickStartCtaAvailable(createInitialState(), NOW)).toBe(true);
  });

  it('골드가 0이어도(폴백 경로) CTA 게이트는 여전히 열려 있다', () => {
    expect(isQuickStartCtaAvailable({ ...createInitialState(), gold: 0 }, NOW)).toBe(true);
  });
});

describe('resolveUnaffordableSeedNudge — AC-4 (감당 불가 탭 시 감당 가능 작물 유도)', () => {
  // 초기 골드(50)로는 못 사지만 첫 구역 안에 있는 비싼 작물을 찾는다.
  const findUnaffordableStarterCrop = (gold: number): CropKey => {
    const state = { ...createInitialState(), gold };
    const key = (Object.keys(CROPS) as CropKey[]).find(
      (candidate) =>
        state.unlockedAreas.includes(CROPS[candidate]!.area) &&
        state.gold < getCropPurchaseCost(state, candidate, NOW)
    );
    if (key == null) {
      throw new Error('테스트 전제: 초기 골드로 감당 불가한 첫 구역 작물이 있어야 한다');
    }
    return key;
  };

  it('감당 불가 작물을 탭하면 감당 가능한 대표 작물로 유도한다', () => {
    const state = createInitialState();
    const expensive = findUnaffordableStarterCrop(state.gold);
    const nudge = resolveUnaffordableSeedNudge(state, expensive, 'plant', NOW);
    expect(nudge).not.toBeNull();
    // 유도 대상은 실제로 감당 가능해야 한다.
    expect(state.gold).toBeGreaterThanOrEqual(getCropPurchaseCost(state, nudge!.cropKey, NOW));
  });

  it('탭한 작물이 감당 가능하면 유도하지 않는다(정상 선택 경로)', () => {
    const state = createInitialState();
    const cheap = (Object.keys(CROPS) as CropKey[]).find(
      (candidate) =>
        state.unlockedAreas.includes(CROPS[candidate]!.area) &&
        state.gold >= getCropPurchaseCost(state, candidate, NOW)
    ) as CropKey;
    expect(resolveUnaffordableSeedNudge(state, cheap, 'plant', NOW)).toBeNull();
  });

  it('plant 단계가 아니면 유도하지 않는다', () => {
    const state = createInitialState();
    const expensive = findUnaffordableStarterCrop(state.gold);
    expect(resolveUnaffordableSeedNudge(state, expensive, 'harvest', NOW)).toBeNull();
    expect(resolveUnaffordableSeedNudge(state, expensive, null, NOW)).toBeNull();
  });

  it('감당 가능한 작물이 전혀 없으면(골드 0) 유도하지 않는다', () => {
    const broke = { ...createInitialState(), gold: 0 };
    const anyStarter = (Object.keys(CROPS) as CropKey[]).find((candidate) =>
      broke.unlockedAreas.includes(CROPS[candidate]!.area)
    ) as CropKey;
    expect(resolveUnaffordableSeedNudge(broke, anyStarter, 'plant', NOW)).toBeNull();
  });
});

describe('AC-5 (온보딩 계약: 자동 파종 신규 상태 + plant 재개 케이스)', () => {
  it('신규(자동 파종) 초기 상태는 harvest로 해석된다 — selectSeed 제거 회귀 방지', () => {
    const state = createInitialState();
    expect(state.onboardingCompleted).toBe(false);
    // 첫 밭이 자동 파종되어 온보딩은 harvest부터 시작한다.
    expect(resolveOnboardingStep(state, state.onboardingStep)).toBe('harvest');
    // 신규 병목인 harvest에서도 밭 대상 stall 넛지가 발화한다.
    expect(shouldFireStallNudge(resolveOnboardingStep(state, state.onboardingStep), false)).toBe(true);
  });

  it('아무것도 심지 않은 미완료 상태는 plant로 재개하고, 거기서 씨앗 유도가 성립한다', () => {
    const state = untouchedPlantState();
    // 빈 밭·미수확 상태 → plant 재개.
    expect(resolveOnboardingStep(state, null)).toBe('plant');
    // 대표 씨앗(quickStartCropKey)이 존재 → 바로 시작 CTA 진행 가능.
    expect(getOnboardingCropKey(state, NOW)).not.toBeNull();
    // 아직 넛지 미발화면 plant에서 stall 넛지가 발화한다.
    expect(shouldFireStallNudge(resolveOnboardingStep(state, null), false)).toBe(true);
  });
});
