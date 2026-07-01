// 일일 행운 룰렛(데일리 스핀)
// 하루 1회 무료 스핀으로 "무엇이 나올지 모르는" 가변 골드 보상을 지급해 재방문을
// 넛지하는 장르 표준 리텐션 장치(Hay Day의 Wheel of Fortune 계열)입니다.
//
// - 무료 스핀은 UTC 자정 롤오버 기준으로 하루 1회 리셋됩니다(cropOfTheDay와 동일한
//   day-index 경계). dailyBonus의 24h 쿨다운과 달리, 자정을 넘기면 다시 열립니다.
// - 보상 슬롯/가중치/배수는 balance.json의 `wheel` 섹션에서 읽습니다(코드 하드코딩 금지).
// - spinWheel은 순수 함수입니다: 결과는 주입된 rng로 결정되고, 뽑은 시각을 상태
//   (WheelState.lastFreeSpinAt)에 기록해 같은 날 두 번째 무료 스핀을 거부합니다.
// - 골드 보상은 진행도 스케일된 광고 보상(getRewardedGoldAmount)에 슬롯 배수를 곱하므로
//   후반에도 의미가 유지됩니다. dailyBonus와 동일하게, 진행도 값(baseGold)은 순환 import를
//   피하려고 호출부에서 주입받습니다(모듈은 GameState/constants에 의존하지 않음).

import balance from './balance.json';

const DAY_MS = 24 * 60 * 60 * 1000;

// 진행도 정보가 없을 때 쓰는 기본 광고 보상(초기 100G). dailyBonus와 동일한 폴백.
const WHEEL_BASE_GOLD_FALLBACK = balance.ads.rewardedGoldAmount;

export type WheelSlot = {
  // 슬롯 식별자(분석/디버그용). 보상은 goldRatio로 결정된다.
  key: string;
  // 슬롯 아이콘(UI 표시용).
  icon: string;
  // 추첨 가중치(양수). 확률 = weight / 전체 weight 합.
  weight: number;
  // 진행도 스케일된 광고 보상 대비 지급 배수. 보상 골드 = floor(baseGold × goldRatio).
  goldRatio: number;
};

export type WheelState = {
  // 마지막으로 무료 스핀을 돌린 UTC ms. null이면 한 번도 돌리지 않음.
  lastFreeSpinAt: number | null;
};

export type WheelStatus = {
  // 지금 무료 스핀이 가능한지.
  canSpin: boolean;
  // 다음 무료 스핀이 열리는 UTC ms(가능하면 now). 알림/카운트다운 표시용.
  nextSpinAt: number;
};

export type WheelReward = {
  slotKey: string;
  gold: number;
};

export type WheelSpinResult = {
  reward: WheelReward;
  newState: WheelState;
};

// balance.json의 룰렛 슬롯 카탈로그(선언 순서 유지). UI는 이 순서로 슬롯을 표시한다.
export const WHEEL_SLOTS: readonly WheelSlot[] = balance.wheel.slots as readonly WheelSlot[];

export function createInitialWheelState(): WheelState {
  return { lastFreeSpinAt: null };
}

// 직렬화된 unknown 값을 WheelState로 정규화한다. 형식 오류는 초기 상태로 복구한다
// (미래 타임스탬프 처리는 조회 시점에서 클램프).
export function normalizeWheelState(value: unknown): WheelState {
  if (typeof value !== 'object' || value == null) {
    return createInitialWheelState();
  }
  const raw = value as Record<string, unknown>;
  const lastFreeSpinAt =
    typeof raw.lastFreeSpinAt === 'number' &&
    Number.isFinite(raw.lastFreeSpinAt) &&
    raw.lastFreeSpinAt > 0
      ? raw.lastFreeSpinAt
      : null;
  return { lastFreeSpinAt };
}

// UTC day-index. 같은 달력일이면 같은 값. cropOfTheDay와 동일한 경계.
function dayIndex(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

// 무료 스핀 가능 여부와 다음 가능 시각을 반환한다.
// 미래 타임스탬프(시계 조작)는 min(last, now)로 클램프해 부당한 재스핀을 막는다.
export function getWheelStatus(state: WheelState, now = Date.now()): WheelStatus {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const todayIndex = dayIndex(safeNow);
  if (state.lastFreeSpinAt == null) {
    return { canSpin: true, nextSpinAt: safeNow };
  }
  const safeLast = Math.min(state.lastFreeSpinAt, safeNow);
  const canSpin = dayIndex(safeLast) < todayIndex;
  return {
    canSpin,
    // 이미 오늘 돌렸으면 다음 UTC 자정에 열린다.
    nextSpinAt: canSpin ? safeNow : (todayIndex + 1) * DAY_MS,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  // rng()가 1을 반환해도 마지막 슬롯 경계를 넘지 않도록 1 미만으로 클램프.
  if (value >= 1) return 0.999999999;
  return value;
}

// 가중치 기반으로 슬롯을 하나 뽑는다. rng는 [0,1) 난수를 반환하는 주입 함수.
// 순수/결정적: 같은 rng 값이면 항상 같은 슬롯이 나온다.
export function pickWheelSlot(rng: () => number): WheelSlot {
  const slots = WHEEL_SLOTS;
  if (slots.length === 0) {
    throw new Error('No wheel slots configured');
  }
  const totalWeight = slots.reduce((sum, slot) => sum + Math.max(0, slot.weight), 0);
  if (totalWeight <= 0) {
    // 모든 가중치가 0인 비정상 데이터: 첫 슬롯으로 폴백.
    return slots[0]!;
  }
  const roll = clamp01(rng()) * totalWeight;
  let cumulative = 0;
  for (const slot of slots) {
    cumulative += Math.max(0, slot.weight);
    if (roll < cumulative) {
      return slot;
    }
  }
  // 부동소수 오차로 마지막 경계를 넘긴 경우 마지막 슬롯으로 폴백.
  return slots[slots.length - 1]!;
}

// 슬롯 배수와 진행도 스케일된 광고 보상으로 실제 지급 골드를 계산한다.
export function getWheelSlotGold(slot: WheelSlot, baseGold: number = WHEEL_BASE_GOLD_FALLBACK): number {
  const base = Number.isFinite(baseGold) && baseGold > 0 ? baseGold : WHEEL_BASE_GOLD_FALLBACK;
  const gold = Math.floor(base * slot.goldRatio);
  return Number.isFinite(gold) ? Math.max(1, gold) : WHEEL_BASE_GOLD_FALLBACK;
}

/**
 * 무료 스핀을 실행하고 보상 + 갱신된 WheelState를 반환한다.
 * 오늘 이미 무료 스핀을 돌렸으면 null을 반환해 이중 수령을 막는다(순수 함수).
 *
 * @param state    현재 WheelState.
 * @param baseGold 진행도 스케일된 광고 보상(`getRewardedGoldAmount`). 생략 시 기본 광고 보상.
 * @param now      기준 UTC ms.
 * @param rng      [0,1) 난수 주입 함수(테스트 결정성). 생략 시 Math.random.
 */
export function spinWheel(
  state: WheelState,
  baseGold: number = WHEEL_BASE_GOLD_FALLBACK,
  now = Date.now(),
  rng: () => number = Math.random
): WheelSpinResult | null {
  if (!getWheelStatus(state, now).canSpin) {
    return null;
  }
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const slot = pickWheelSlot(rng);
  const gold = getWheelSlotGold(slot, baseGold);
  return {
    reward: { slotKey: slot.key, gold },
    newState: { lastFreeSpinAt: safeNow },
  };
}
