// 일일 행운 룰렛(데일리 스핀)
// 하루 1회 무료 스핀과 선택형 광고 보너스 스핀으로 가변 보상을 지급해 재방문을
// 넛지하는 룰렛 리텐션 장치입니다.
//
// - 무료/보너스 cap은 cropOfTheDay와 같은 공통 day-index 경계(기본 KST 04:00)에서
//   리셋됩니다. dailyBonus의 24h 쿨다운과는 다른 일일 경계 모델입니다.
// - 보상 슬롯/가중치/배수는 balance.json의 `wheel` 섹션에서 읽습니다(코드 하드코딩 금지).
// - spinWheel/spinBonusWheel은 같은 슬롯·보상 계산을 공유하는 순수 함수입니다. 무료
//   스핀을 먼저 소비해야 광고 보너스 스핀이 열리고, 공통 리셋일의 일일 cap을 넘으면
//   보너스 함수가 null을 반환합니다(#298).
// - 골드 보상은 진행도 스케일된 광고 보상(getRewardedGoldAmount)에 슬롯 배수를 곱하므로
//   후반에도 의미가 유지됩니다. dailyBonus와 동일하게, 진행도 값(baseGold)은 순환 import를
//   피하려고 호출부에서 주입받습니다(모듈은 GameState/constants에 의존하지 않음).

import balance from './balance.json';
import { getAdLimits } from './adLimits';
import { getResetDayIndex, getResetDayStart } from './resetBoundary';

// 진행도 정보가 없을 때 쓰는 기본 광고 보상(초기 100G). dailyBonus와 동일한 폴백.
const WHEEL_BASE_GOLD_FALLBACK = balance.ads.rewardedGoldAmount;
// RP 슬롯 지급량 계산에 쓰는 기부 RP 비율. research.ts를 import하지 않고 balance에서
// 직접 읽어 모듈을 cycle-free로 유지한다(modifiers.ts의 prestige 접근과 동일한 관례).
const WHEEL_DONATION_RP_RATE = balance.research.donationRpRate;
// harvest_boost 슬롯의 부스트 지속시간(기존 보상형 광고 부스트와 동일 값·동일 만료 경로).
export const WHEEL_HARVEST_BOOST_DURATION_MS = balance.ads.harvestBonusBoostDurationMs;

// 슬롯 보상 타입. 데이터에 type이 없으면 gold로 정규화한다(기존 balance 하위 호환).
export const WHEEL_SLOT_TYPES = ['gold', 'rp', 'harvest_boost'] as const;
export type WheelSlotType = (typeof WHEEL_SLOT_TYPES)[number];

export type WheelSlot = {
  // 슬롯 식별자(분석/디버그용).
  key: string;
  // 슬롯 아이콘(UI 표시용).
  icon: string;
  // 추첨 가중치(양수). 확률 = weight / 전체 weight 합.
  weight: number;
  // 보상 타입(gold/rp/harvest_boost). 정규화 후에는 항상 존재한다.
  type: WheelSlotType;
  // gold 슬롯: 진행도 스케일된 광고 보상 대비 지급 배수. 보상 골드 = floor(baseGold × goldRatio).
  goldRatio?: number;
  // rp 슬롯: 지급 RP = max(1, floor(baseGold × donationRpRate × rpRatio)) — 광고 보상만큼의
  // 골드를 기부했을 때 얻는 RP의 rpRatio배로, 진행도에 비례한다.
  rpRatio?: number;
};

export type WheelState = {
  // 마지막으로 무료 스핀을 돌린 UTC ms. null이면 한 번도 돌리지 않음.
  lastFreeSpinAt: number | null;
  // 보너스 스핀 카운트가 속한 공통 리셋 일 인덱스. 레거시 세이브는 null로 정규화한다.
  bonusSpinDayIndex: number | null;
  // bonusSpinDayIndex에서 광고 보상으로 실행한 스핀 수.
  bonusSpinsUsed: number;
  // 마지막 광고 보너스 스핀 시각. 원격 쿨다운이 0보다 커질 때도 재시작 후 유지한다.
  lastBonusSpinAt: number | null;
};

export type WheelStatus = {
  // 지금 무료 스핀이 가능한지.
  canSpin: boolean;
  // 다음 무료 스핀이 열리는 UTC ms(가능하면 now). 알림/카운트다운 표시용.
  nextSpinAt: number;
  // 무료 스핀을 오늘 소비했고 광고 보너스 일일 cap이 남았는지.
  canBonusSpin: boolean;
  // 현재 리셋일에 사용한 광고 보너스 스핀 수(날짜가 다르면 0으로 간주).
  bonusSpinsUsedToday: number;
  // Remote Config가 반영된 현재 일일 cap.
  bonusSpinDailyLimit: number;
};

// 타입별 보상 유니언. 적용(골드 가산/RP 가산/부스트 연장)은 호출부(FarmGame)에서 분기한다.
export type WheelReward =
  | { type: 'gold'; slotKey: string; gold: number }
  | { type: 'rp'; slotKey: string; rp: number }
  | { type: 'harvest_boost'; slotKey: string; durationMs: number };

export type WheelSpinResult = {
  reward: WheelReward;
  newState: WheelState;
};

// balance 슬롯 데이터를 정규화한다: type 누락은 gold(하위 호환), 미지원 type도 gold로
// 강제해 런타임에서 항상 세 타입 중 하나만 흐르게 한다(잘못된 데이터는 check:balance가 fail).
export function normalizeWheelSlot(raw: {
  key: string;
  icon: string;
  weight: number;
  type?: string;
  goldRatio?: number;
  rpRatio?: number;
}): WheelSlot {
  const type = (WHEEL_SLOT_TYPES as readonly string[]).includes(raw.type ?? '')
    ? (raw.type as WheelSlotType)
    : 'gold';
  return { key: raw.key, icon: raw.icon, weight: raw.weight, type, goldRatio: raw.goldRatio, rpRatio: raw.rpRatio };
}

// balance.json의 룰렛 슬롯 카탈로그(선언 순서 유지, 정규화 적용). UI는 이 순서로 슬롯을 표시한다.
export const WHEEL_SLOTS: readonly WheelSlot[] = (
  balance.wheel.slots as ReadonlyArray<Parameters<typeof normalizeWheelSlot>[0]>
).map(normalizeWheelSlot);

export function createInitialWheelState(): WheelState {
  return {
    lastFreeSpinAt: null,
    bonusSpinDayIndex: null,
    bonusSpinsUsed: 0,
    lastBonusSpinAt: null,
  };
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
  const bonusSpinDayIndex =
    typeof raw.bonusSpinDayIndex === 'number' &&
    Number.isInteger(raw.bonusSpinDayIndex) &&
    raw.bonusSpinDayIndex >= 0
      ? raw.bonusSpinDayIndex
      : null;
  const bonusSpinsUsed =
    bonusSpinDayIndex != null &&
    typeof raw.bonusSpinsUsed === 'number' &&
    Number.isFinite(raw.bonusSpinsUsed) &&
    raw.bonusSpinsUsed > 0
      ? Math.floor(raw.bonusSpinsUsed)
      : 0;
  const lastBonusSpinAt =
    typeof raw.lastBonusSpinAt === 'number' &&
    Number.isFinite(raw.lastBonusSpinAt) &&
    raw.lastBonusSpinAt > 0
      ? raw.lastBonusSpinAt
      : null;
  return { lastFreeSpinAt, bonusSpinDayIndex, bonusSpinsUsed, lastBonusSpinAt };
}

// 리셋 일 인덱스. 같은 리셋 일이면 같은 값. cropOfTheDay와 동일한 리셋 경계(공통
// getResetDayIndex, 기본 KST 04:00)를 쓴다(#251).
function dayIndex(ms: number): number {
  return getResetDayIndex(ms);
}

// 무료 스핀 가능 여부와 다음 가능 시각을 반환한다.
// 미래 타임스탬프(시계 조작)는 min(last, now)로 클램프해 부당한 재스핀을 막는다.
export function getWheelStatus(state: WheelState, now = Date.now()): WheelStatus {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const todayIndex = dayIndex(safeNow);
  const clockReversed = state.lastFreeSpinAt != null && state.lastFreeSpinAt > safeNow;
  const safeLast = state.lastFreeSpinAt == null ? null : Math.min(state.lastFreeSpinAt, safeNow);
  const canSpin = safeLast == null || dayIndex(safeLast) < todayIndex;
  const bonusSpinsUsedToday = state.bonusSpinDayIndex === todayIndex ? state.bonusSpinsUsed : 0;
  const bonusSpinDailyLimit = getAdLimits().wheelBonusAdDailyLimit;
  return {
    canSpin,
    // 이미 오늘 돌렸으면 다음 리셋 경계(기본 KST 04:00)에 열린다.
    nextSpinAt: canSpin ? safeNow : getResetDayStart(todayIndex + 1),
    // A future free-spin timestamp locks both paths. Otherwise clock rollback
    // could keep the free spin locked while reopening an extra ad spin.
    canBonusSpin: !canSpin && !clockReversed && bonusSpinsUsedToday < bonusSpinDailyLimit,
    bonusSpinsUsedToday,
    bonusSpinDailyLimit,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  // rng()가 1(또는 그 이상)을 반환해도 [0,1) 범위에 들도록, 1보다 "가능한 한 가까운"
  // 값으로 클램프한다. 1 - Number.EPSILON은 여전히 1 미만이라 roll < totalWeight가
  // 유지되어 마지막 슬롯이 정상적으로 선택되며, 마지막 슬롯 확률을 부당하게 깎지 않는다.
  if (value >= 1) return 1 - Number.EPSILON;
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

// 비율 필드 누락/비정상(0 이하·NaN) 방어: 1(광고 1회 등가 배수)로 폴백한다.
// 0으로 두면 max(1, floor(base×0)) = 1G/1RP로 떨어져 진행도 스케일이 통째로
// 사라지는 조용한 오지급이 된다. 이런 데이터는 check:balance가 fail로 막지만,
// 런타임에 새어 들어와도 최소한 진행도 비례 보상이 유지되게 한다.
function safeRewardRatio(ratio: number | undefined): number {
  return ratio != null && Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

// 슬롯 배수와 진행도 스케일된 광고 보상으로 실제 지급 골드를 계산한다(gold 슬롯 전용).
export function getWheelSlotGold(slot: WheelSlot, baseGold: number = WHEEL_BASE_GOLD_FALLBACK): number {
  const base = Number.isFinite(baseGold) && baseGold > 0 ? baseGold : WHEEL_BASE_GOLD_FALLBACK;
  const gold = Math.floor(base * safeRewardRatio(slot.goldRatio));
  return Number.isFinite(gold) ? Math.max(1, gold) : WHEEL_BASE_GOLD_FALLBACK;
}

// rp 슬롯의 지급 RP를 계산한다. "광고 보상만큼의 골드를 기부했을 때 얻는 RP" ×
// rpRatio로, 광고 보상과 같은 진행도 스케일을 탄다. 최소 1 RP 보장.
export function getWheelSlotRp(slot: WheelSlot, baseGold: number = WHEEL_BASE_GOLD_FALLBACK): number {
  const base = Number.isFinite(baseGold) && baseGold > 0 ? baseGold : WHEEL_BASE_GOLD_FALLBACK;
  const rp = Math.floor(base * WHEEL_DONATION_RP_RATE * safeRewardRatio(slot.rpRatio));
  return Number.isFinite(rp) ? Math.max(1, rp) : 1;
}

// 슬롯의 타입별 보상을 계산한다. spinWheel과 UI 표기가 같은 계산을 공유해
// "표시 금액 = 지급 금액"을 보장한다.
export function getWheelSlotReward(slot: WheelSlot, baseGold: number = WHEEL_BASE_GOLD_FALLBACK): WheelReward {
  switch (slot.type) {
    case 'rp':
      return { type: 'rp', slotKey: slot.key, rp: getWheelSlotRp(slot, baseGold) };
    case 'harvest_boost':
      return { type: 'harvest_boost', slotKey: slot.key, durationMs: WHEEL_HARVEST_BOOST_DURATION_MS };
    case 'gold':
    default:
      return { type: 'gold', slotKey: slot.key, gold: getWheelSlotGold(slot, baseGold) };
  }
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
  return {
    reward: getWheelSlotReward(slot, baseGold),
    newState: {
      lastFreeSpinAt: safeNow,
      bonusSpinDayIndex: dayIndex(safeNow),
      bonusSpinsUsed: 0,
      lastBonusSpinAt: state.lastBonusSpinAt,
    },
  };
}

/**
 * 무료 스핀을 소비한 뒤 광고 보상 콜백에서 실행하는 추가 스핀.
 * 무료 스핀과 같은 슬롯 추첨·보상 계산을 사용하되, 공통 리셋일의 bonus count만
 * 증가시킨다. 무료 스핀이 남았거나 일일 cap을 소진했으면 null이다.
 */
export function spinBonusWheel(
  state: WheelState,
  baseGold: number = WHEEL_BASE_GOLD_FALLBACK,
  now = Date.now(),
  rng: () => number = Math.random
): WheelSpinResult | null {
  const status = getWheelStatus(state, now);
  if (!status.canBonusSpin) {
    return null;
  }
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const slot = pickWheelSlot(rng);
  return {
    reward: getWheelSlotReward(slot, baseGold),
    newState: {
      lastFreeSpinAt: state.lastFreeSpinAt,
      bonusSpinDayIndex: dayIndex(safeNow),
      bonusSpinsUsed: status.bonusSpinsUsedToday + 1,
      lastBonusSpinAt: safeNow,
    },
  };
}
