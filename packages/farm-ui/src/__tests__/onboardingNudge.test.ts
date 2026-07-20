/// <reference types="jest" />

import { CROPS, createInitialState, getCropPurchaseCost } from '../../../farm-core/src';
import type { CropKey } from '../../../farm-core/src';
import {
  isQuickStartCtaAvailable,
  resolveUnaffordableSeedNudge,
  shouldFireStallNudge,
} from '../onboardingNudge';

const NOW = 1_700_000_000_000;

// selectSeed 온보딩 병목 방어(#362)의 순수 결정 로직 회귀 테스트.
// 실제 애니메이션/렌더는 헤드리스로 검증 불가하므로 여기서는 "언제/어디로
// 유도할지"의 판정만 검증한다.

describe('shouldFireStallNudge — AC-3 (세션당 1회, selectSeed 한정)', () => {
  it('selectSeed에서 아직 발화 전이면 넛지를 발화한다', () => {
    expect(shouldFireStallNudge('selectSeed', false)).toBe(true);
  });

  it('이미 세션 내에서 발화했으면 다시 발화하지 않는다(1회 가드)', () => {
    expect(shouldFireStallNudge('selectSeed', true)).toBe(false);
  });

  it('selectSeed가 아닌 단계에서는 발화하지 않는다', () => {
    expect(shouldFireStallNudge('plant', false)).toBe(false);
    expect(shouldFireStallNudge('harvest', false)).toBe(false);
    expect(shouldFireStallNudge('reward', false)).toBe(false);
    expect(shouldFireStallNudge(null, false)).toBe(false);
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
    const nudge = resolveUnaffordableSeedNudge(state, expensive, 'selectSeed', NOW);
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
    expect(resolveUnaffordableSeedNudge(state, cheap, 'selectSeed', NOW)).toBeNull();
  });

  it('selectSeed 단계가 아니면 유도하지 않는다', () => {
    const state = createInitialState();
    const expensive = findUnaffordableStarterCrop(state.gold);
    expect(resolveUnaffordableSeedNudge(state, expensive, 'plant', NOW)).toBeNull();
    expect(resolveUnaffordableSeedNudge(state, expensive, null, NOW)).toBeNull();
  });

  it('감당 가능한 작물이 전혀 없으면(골드 0) 유도하지 않는다', () => {
    const broke = { ...createInitialState(), gold: 0 };
    const anyStarter = (Object.keys(CROPS) as CropKey[]).find((candidate) =>
      broke.unlockedAreas.includes(CROPS[candidate]!.area)
    ) as CropKey;
    expect(resolveUnaffordableSeedNudge(broke, anyStarter, 'selectSeed', NOW)).toBeNull();
  });
});
