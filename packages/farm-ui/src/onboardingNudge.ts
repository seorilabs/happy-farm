import type { CropKey, GameState, OnboardingStep } from '../../farm-core/src';
import { getCropPurchaseCost, getOnboardingCropKey } from '../../farm-core/src';

// #362/#427: 온보딩 파종 병목 방어를 위한 순수 결정 로직. selectSeed 단계가 제거된 뒤
// 씨앗 유도(강조/넛지)는 직접 파종을 안내하는 plant 단계로 귀속된다. 실제 애니메이션/
// 렌더는 FarmGame이 담당하고, "언제/어디로 유도할지"의 판정만 여기서 분리해 헤드리스
// 단위 테스트로 검증한다.

// AC-3: stall 시각 넛지는 plant(직접 파종) 단계에서만, 그리고 세션당 1회만 발화한다.
// alreadyFired는 세션 스코프의 1회 가드 상태.
export function shouldFireStallNudge(step: OnboardingStep | null, alreadyFired: boolean): boolean {
  return step === 'plant' && !alreadyFired;
}

// AC-2: 바로 시작 CTA는 대표 씨앗(quickStartCropKey)이 존재할 때 렌더된다.
// getOnboardingCropKey가 항상 non-null을 보장하므로 plant 단계에서 CTA는
// 항상 렌더된다 — 이 함수는 그 렌더 게이트 조건을 그대로 표현한다.
export function isQuickStartCtaAvailable(gameState: GameState, now = Date.now()): boolean {
  return getOnboardingCropKey(gameState, now) != null;
}

// AC-4: plant 단계에서 감당 불가 작물을 탭했을 때 시선을 유도할 대상 씨앗.
// 감당 가능한 대표 씨앗을 돌려주고(그 작물의 구역으로 스크롤/전환해 노출),
// plant가 아니거나 탭한 작물이 애초에 감당 가능하거나 감당 가능한 대표
// 씨앗이 없으면 null(=유도 넛지 없음)을 반환한다.
export function resolveUnaffordableSeedNudge(
  gameState: GameState,
  tappedCropKey: CropKey,
  step: OnboardingStep | null,
  now = Date.now()
): { cropKey: CropKey } | null {
  if (step !== 'plant') {
    return null;
  }
  // 탭한 작물을 감당할 수 있으면 유도가 필요 없다(정상 선택 경로).
  if (gameState.gold >= getCropPurchaseCost(gameState, tappedCropKey, now)) {
    return null;
  }
  const affordableKey = getOnboardingCropKey(gameState, now);
  if (affordableKey == null) {
    return null;
  }
  // 폴백(전부 감당 불가)으로 고른 작물조차 살 수 없으면 유도할 실익이 없다.
  if (gameState.gold < getCropPurchaseCost(gameState, affordableKey, now)) {
    return null;
  }
  return { cropKey: affordableKey };
}
