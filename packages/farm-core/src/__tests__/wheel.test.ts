/// <reference types="jest" />

import {
  WHEEL_HARVEST_BOOST_DURATION_MS,
  WHEEL_SLOTS,
  createInitialWheelState,
  normalizeWheelSlot,
  normalizeWheelState,
  getWheelStatus,
  pickWheelSlot,
  getWheelSlotGold,
  getWheelSlotReward,
  getWheelSlotRp,
  spinBonusWheel,
  spinWheel,
} from '../wheel';
import type { WheelState } from '../wheel';
import { getResetDayIndex, getResetDayStart } from '../resetBoundary';
import balance from '../balance.json';
import {
  applyWheelReward,
  createInitialState,
  extendHarvestBonusBoost,
  getHarvestBonusBoostStatus,
  migrateLoadedState,
  getRewardedGoldAmount,
} from '../constants';
import { createPrestigedState } from '../prestige';
import type { GameState } from '../types';
import { META_LAYER_KEYS } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
// An arbitrary UTC midnight (day index 20000) to anchor deterministic day math.
const DAY0 = 20000 * DAY_MS;
// 리셋 경계(#251)는 오프셋(기본 KST 04:00) 기준이라 UTC 자정과 다르다. DAY0를 포함하는
// 리셋 일의 시작 시각을 앵커로 삼아 하루가 온전히 [RESET0, RESET0+24h)에 들어가게 한다.
const RESET0 = getResetDayStart(getResetDayIndex(DAY0));

// An rng that yields a fixed value (for deterministic slot selection).
const constRng = (value: number) => () => value;

describe('wheel slot catalog', () => {
  test('is non-empty with unique keys, positive weights, and per-type reward fields', () => {
    expect(WHEEL_SLOTS.length).toBeGreaterThanOrEqual(6);
    const keys = WHEEL_SLOTS.map((slot) => slot.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const slot of WHEEL_SLOTS) {
      expect(slot.weight).toBeGreaterThan(0);
      expect(['gold', 'rp', 'harvest_boost']).toContain(slot.type);
      if (slot.type === 'gold') {
        expect(slot.goldRatio).toBeGreaterThan(0);
      }
      if (slot.type === 'rp') {
        expect(slot.rpRatio).toBeGreaterThan(0);
      }
      expect(typeof slot.icon).toBe('string');
      expect(slot.icon.length).toBeGreaterThan(0);
    }
  });

  test('카탈로그에 rp / harvest_boost 슬롯이 각각 1개 이상 존재한다(#209)', () => {
    expect(WHEEL_SLOTS.some((slot) => slot.type === 'rp')).toBe(true);
    expect(WHEEL_SLOTS.some((slot) => slot.type === 'harvest_boost')).toBe(true);
  });
});

describe('normalizeWheelSlot (하위 호환 정규화)', () => {
  test('type이 없는 기존 슬롯 데이터는 gold로 동작한다', () => {
    const slot = normalizeWheelSlot({ key: 'legacy', icon: '🪙', weight: 10, goldRatio: 1.5 });
    expect(slot.type).toBe('gold');
    // 실제 balance 데이터에서도 type 미표기 슬롯은 전부 gold로 정규화된다.
    const rawSlots = balance.wheel.slots as ReadonlyArray<{ key: string; type?: string }>;
    for (const raw of rawSlots) {
      if (raw.type == null) {
        expect(WHEEL_SLOTS.find((slot2) => slot2.key === raw.key)?.type).toBe('gold');
      }
    }
  });

  test('미지원 type은 gold로 강제된다(런타임 안전)', () => {
    const slot = normalizeWheelSlot({ key: 'weird', icon: '❓', weight: 1, type: 'gems', goldRatio: 1 });
    expect(slot.type).toBe('gold');
  });
});

describe('getWheelStatus (daily gating + shared reset rollover)', () => {
  test('a fresh state can spin immediately', () => {
    const status = getWheelStatus(createInitialWheelState(), DAY0 + 3_600_000);
    expect(status.canSpin).toBe(true);
    expect(status.nextSpinAt).toBe(DAY0 + 3_600_000);
  });

  test('after spinning today, the next spin opens at the next reset boundary', () => {
    const state: WheelState = { ...createInitialWheelState(), lastFreeSpinAt: RESET0 + 1_000 };
    const status = getWheelStatus(state, RESET0 + 5_000);
    expect(status.canSpin).toBe(false);
    expect(status.nextSpinAt).toBe(RESET0 + DAY_MS);
  });

  test('crossing the reset boundary re-opens the free spin', () => {
    const state: WheelState = { ...createInitialWheelState(), lastFreeSpinAt: RESET0 + 1_000 };
    // Same reset day, later: still locked.
    expect(getWheelStatus(state, RESET0 + DAY_MS - 1).canSpin).toBe(false);
    // Next reset day: available again.
    expect(getWheelStatus(state, RESET0 + DAY_MS).canSpin).toBe(true);
  });

  test('future lastFreeSpinAt (clock manipulation) is clamped and stays locked today', () => {
    const state: WheelState = { ...createInitialWheelState(), lastFreeSpinAt: DAY0 + 10 * DAY_MS };
    // now is "today" but the save claims a spin 10 days in the future.
    const status = getWheelStatus(state, DAY0 + 5_000);
    expect(status.canSpin).toBe(false);
    expect(status.canBonusSpin).toBe(false);
  });
});

describe('pickWheelSlot (weighted, deterministic)', () => {
  test('rng≈0 selects the first slot, rng≈1 selects the last slot', () => {
    expect(pickWheelSlot(constRng(0)).key).toBe(WHEEL_SLOTS[0]!.key);
    expect(pickWheelSlot(constRng(0.9999999)).key).toBe(WHEEL_SLOTS[WHEEL_SLOTS.length - 1]!.key);
  });

  test('the same rng value always yields the same slot', () => {
    const a = pickWheelSlot(constRng(0.42));
    const b = pickWheelSlot(constRng(0.42));
    expect(a.key).toBe(b.key);
  });

  test('a full sweep of rng lands on the weighted slot boundaries', () => {
    const total = WHEEL_SLOTS.reduce((sum, slot) => sum + slot.weight, 0);
    let cumulative = 0;
    for (const slot of WHEEL_SLOTS) {
      // A roll just inside this slot's weight band must map to this slot.
      const mid = (cumulative + slot.weight / 2) / total;
      expect(pickWheelSlot(constRng(mid)).key).toBe(slot.key);
      cumulative += slot.weight;
    }
  });

  test('out-of-range rng values are clamped (never throws, always a valid slot)', () => {
    const keys = new Set(WHEEL_SLOTS.map((slot) => slot.key));
    for (const bad of [-1, 1, 2, NaN, Infinity]) {
      expect(keys.has(pickWheelSlot(constRng(bad)).key)).toBe(true);
    }
  });
});

describe('getWheelSlotGold (progression-scaled reward)', () => {
  test('reward = floor(baseGold * goldRatio) and always >= 1 (gold 슬롯)', () => {
    const base = 1000;
    for (const slot of WHEEL_SLOTS.filter((candidate) => candidate.type === 'gold')) {
      expect(getWheelSlotGold(slot, base)).toBe(Math.floor(base * slot.goldRatio!));
      expect(getWheelSlotGold(slot, base)).toBeGreaterThan(0);
    }
  });

  test('invalid baseGold falls back so the reward stays positive', () => {
    for (const bad of [0, -5, NaN, Infinity]) {
      expect(getWheelSlotGold(WHEEL_SLOTS[0]!, bad)).toBeGreaterThan(0);
    }
  });
});

describe('getWheelSlotReward (타입별 보상, #209)', () => {
  const rpSlot = WHEEL_SLOTS.find((slot) => slot.type === 'rp')!;
  const boostSlot = WHEEL_SLOTS.find((slot) => slot.type === 'harvest_boost')!;

  test('rp 슬롯: RP = max(1, floor(baseGold × donationRpRate × rpRatio)) — 진행도 비례', () => {
    const base = 100_000;
    const expected = Math.floor(base * balance.research.donationRpRate * rpSlot.rpRatio!);
    expect(getWheelSlotRp(rpSlot, base)).toBe(expected);
    const reward = getWheelSlotReward(rpSlot, base);
    expect(reward).toEqual({ type: 'rp', slotKey: rpSlot.key, rp: expected });
    // 진행도(baseGold)가 10배면 RP도 10배 스케일.
    expect(getWheelSlotRp(rpSlot, base * 10)).toBe(expected * 10);
    // 비정상 baseGold에도 최소 1 RP 보장.
    expect(getWheelSlotRp(rpSlot, NaN)).toBeGreaterThanOrEqual(1);
  });

  test('harvest_boost 슬롯: 광고 부스트와 같은 지속시간을 보상으로 반환한다', () => {
    const reward = getWheelSlotReward(boostSlot, 1000);
    expect(reward).toEqual({
      type: 'harvest_boost',
      slotKey: boostSlot.key,
      durationMs: balance.ads.harvestBonusBoostDurationMs,
    });
    expect(WHEEL_HARVEST_BOOST_DURATION_MS).toBe(balance.ads.harvestBonusBoostDurationMs);
  });
});

describe('비율 필드 누락 폴백(조용한 1RP/1G 오지급 방지)', () => {
  test('rpRatio가 없거나 0 이하인 rp 슬롯은 비율 1(광고 등가)로 지급된다', () => {
    const base = 100_000;
    const adEquivalentRp = Math.floor(base * balance.research.donationRpRate);
    for (const badRatio of [undefined, 0, -1, Number.NaN]) {
      const slot = { key: 'x', icon: '🧪', weight: 1, type: 'rp' as const, rpRatio: badRatio };
      expect(getWheelSlotRp(slot, base)).toBe(adEquivalentRp);
    }
  });

  test('goldRatio가 없는 gold 슬롯은 비율 1(광고 등가)로 지급된다', () => {
    const base = 100_000;
    const slot = { key: 'x', icon: '🪙', weight: 1, type: 'gold' as const };
    expect(getWheelSlotGold(slot, base)).toBe(base);
  });
});

describe('applyWheelReward (스핀 결과 적용, #209)', () => {
  const NOW = DAY0 + 1_000;

  test('gold 보상은 골드에 가산되고 wheelState가 갱신된다', () => {
    const state = createInitialState();
    const next = applyWheelReward(
      state,
      {
        reward: { type: 'gold', slotKey: 'gold_small', gold: 500 },
        newState: { ...state.wheelState, lastFreeSpinAt: NOW },
      },
      NOW
    );
    expect(next.gold).toBe(state.gold + 500);
    expect(next.wheelState.lastFreeSpinAt).toBe(NOW);
  });

  test('rp 보상은 research.points와 totalPointsEarned에 함께 가산돼 즉시 사용 가능하다', () => {
    const state = createInitialState();
    const next = applyWheelReward(
      state,
      {
        reward: { type: 'rp', slotKey: 'research_boon', rp: 42 },
        newState: { ...state.wheelState, lastFreeSpinAt: NOW },
      },
      NOW
    );
    expect(next.research.points).toBe(state.research.points + 42);
    expect(next.research.totalPointsEarned).toBe(state.research.totalPointsEarned + 42);
    expect(next.gold).toBe(state.gold);
    expect(next.wheelState.lastFreeSpinAt).toBe(NOW);
  });

  test('harvest_boost 보상은 광고 부스트와 동일 만료 경로로 활성화된다', () => {
    const state = createInitialState();
    const next = applyWheelReward(
      state,
      {
        reward: { type: 'harvest_boost', slotKey: 'harvest_frenzy', durationMs: WHEEL_HARVEST_BOOST_DURATION_MS },
        newState: { ...state.wheelState, lastFreeSpinAt: NOW },
      },
      NOW
    );
    expect(next.adUsage.harvestBonusAd.boostEndsAt).toBe(NOW + WHEEL_HARVEST_BOOST_DURATION_MS);
    expect(getHarvestBonusBoostStatus(next, NOW).active).toBe(true);
    expect(next.gold).toBe(state.gold);
  });

  test('스핀(rng 결정적) → 적용까지 이어지는 rp 경로가 진행도 비례 값으로 가산된다', () => {
    const state = createInitialState();
    const base = getRewardedGoldAmount(state);
    // rp 슬롯의 가중치 구간 중앙을 겨냥한 결정적 roll.
    const total = WHEEL_SLOTS.reduce((sum, slot) => sum + slot.weight, 0);
    let cumulative = 0;
    let rpRoll = 0;
    for (const slot of WHEEL_SLOTS) {
      if (slot.type === 'rp') {
        rpRoll = (cumulative + slot.weight / 2) / total;
        break;
      }
      cumulative += slot.weight;
    }
    const result = spinWheel(state.wheelState, base, NOW, constRng(rpRoll));
    expect(result!.reward.type).toBe('rp');
    const next = applyWheelReward(state, result!, NOW);
    const rpSlot = WHEEL_SLOTS.find((slot) => slot.type === 'rp')!;
    expect(next.research.points).toBe(state.research.points + getWheelSlotRp(rpSlot, base));
  });
});

describe('extendHarvestBonusBoost (부스트 중첩 정책: 연장, #209)', () => {
  const NOW = DAY0 + 1_000;

  test('비활성 상태에서 당첨되면 now + duration 으로 시작한다', () => {
    const state = createInitialState();
    const adUsage = extendHarvestBonusBoost(state, WHEEL_HARVEST_BOOST_DURATION_MS, NOW);
    expect(adUsage.harvestBonusAd.boostEndsAt).toBe(NOW + WHEEL_HARVEST_BOOST_DURATION_MS);
    // 기존 광고 부스트와 동일한 만료 경로(getHarvestBonusBoostStatus)로 활성 판정된다.
    const boosted = { ...state, adUsage };
    expect(getHarvestBonusBoostStatus(boosted, NOW).active).toBe(true);
    expect(getHarvestBonusBoostStatus(boosted, NOW + WHEEL_HARVEST_BOOST_DURATION_MS).active).toBe(false);
  });

  test('활성 부스트 위에 당첨되면 남은 시간 뒤로 이어 붙는다(연장 — 유실 없음)', () => {
    const state = createInitialState();
    const first = extendHarvestBonusBoost(state, WHEEL_HARVEST_BOOST_DURATION_MS, NOW);
    const midway = NOW + 5_000;
    const second = extendHarvestBonusBoost(
      { ...state, adUsage: first },
      WHEEL_HARVEST_BOOST_DURATION_MS,
      midway
    );
    // 기존 만료 시각(NOW+D)에 이어 붙어 NOW + 2D가 된다(midway + D가 아님).
    expect(second.harvestBonusAd.boostEndsAt).toBe(NOW + 2 * WHEEL_HARVEST_BOOST_DURATION_MS);
  });

  test('광고 사용 카운트/쿨다운에는 영향을 주지 않는다', () => {
    const state = createInitialState();
    const adUsage = extendHarvestBonusBoost(state, WHEEL_HARVEST_BOOST_DURATION_MS, NOW);
    expect(adUsage.harvestBonusAd.dailyCount).toBe(state.adUsage.harvestBonusAd.dailyCount);
    expect(adUsage.harvestBonusAd.lastUsedAt).toBe(state.adUsage.harvestBonusAd.lastUsedAt);
  });
});

describe('spinWheel (one free spin/day, no double claim)', () => {
  test('awards a reward within the slot range and records the spin time', () => {
    const base = 2000;
    const result = spinWheel(createInitialWheelState(), base, DAY0 + 1_000, constRng(0));
    expect(result).not.toBeNull();
    expect(result!.reward.slotKey).toBe(WHEEL_SLOTS[0]!.key);
    // 첫 슬롯은 gold 타입 — 타입 내로잉 후 금액 검증.
    expect(result!.reward.type).toBe('gold');
    if (result!.reward.type === 'gold') {
      expect(result!.reward.gold).toBe(Math.floor(base * WHEEL_SLOTS[0]!.goldRatio!));
    }
    expect(result!.newState.lastFreeSpinAt).toBe(DAY0 + 1_000);
  });

  test('any rng yields a reward matching its slot type and value formula', () => {
    const base = 5000;
    const goldRatios = WHEEL_SLOTS.filter((slot) => slot.type === 'gold').map((slot) => slot.goldRatio!);
    const min = Math.floor(base * Math.min(...goldRatios));
    const max = Math.floor(base * Math.max(...goldRatios));
    for (let i = 0; i < 50; i++) {
      const roll = i / 50;
      const result = spinWheel(createInitialWheelState(), base, DAY0, constRng(roll));
      const reward = result!.reward;
      const slot = WHEEL_SLOTS.find((candidate) => candidate.key === reward.slotKey)!;
      expect(reward.type).toBe(slot.type);
      if (reward.type === 'gold') {
        expect(reward.gold).toBeGreaterThanOrEqual(min);
        expect(reward.gold).toBeLessThanOrEqual(max);
      } else if (reward.type === 'rp') {
        expect(reward.rp).toBe(getWheelSlotRp(slot, base));
      } else {
        expect(reward.durationMs).toBe(WHEEL_HARVEST_BOOST_DURATION_MS);
      }
    }
  });

  test('a second spin on the same day is rejected (double-claim prevented)', () => {
    const first = spinWheel(createInitialWheelState(), 1000, DAY0 + 1_000, constRng(0.5));
    expect(first).not.toBeNull();
    const second = spinWheel(first!.newState, 1000, DAY0 + 2_000, constRng(0.5));
    expect(second).toBeNull();
  });

  test('a spin re-opens after crossing the shared reset boundary', () => {
    const first = spinWheel(createInitialWheelState(), 1000, DAY0 + 1_000, constRng(0.5))!;
    const nextDay = spinWheel(first.newState, 1000, DAY0 + DAY_MS + 5_000, constRng(0.5));
    expect(nextDay).not.toBeNull();
    expect(nextDay!.newState.lastFreeSpinAt).toBe(DAY0 + DAY_MS + 5_000);
  });

  test('is pure: the input state is not mutated', () => {
    const state = createInitialWheelState();
    spinWheel(state, 1000, DAY0, constRng(0.5));
    expect(state.lastFreeSpinAt).toBeNull();
  });
});

describe('spinBonusWheel (광고 보너스 일일 cap, #298)', () => {
  test('무료 스핀 전에는 닫혀 있고 무료 스핀 소비 후 같은 슬롯 계산으로 한 번 열린다', () => {
    const initial = createInitialWheelState();
    expect(getWheelStatus(initial, RESET0 + 1_000).canBonusSpin).toBe(false);
    expect(spinBonusWheel(initial, 2_000, RESET0 + 1_000, constRng(0))).toBeNull();

    const free = spinWheel(initial, 2_000, RESET0 + 1_000, constRng(0.5))!;
    const ready = getWheelStatus(free.newState, RESET0 + 2_000);
    expect(ready.canSpin).toBe(false);
    expect(ready.canBonusSpin).toBe(true);
    expect(ready.bonusSpinsUsedToday).toBe(0);

    const bonus = spinBonusWheel(free.newState, 2_000, RESET0 + 2_000, constRng(0))!;
    expect(bonus.reward).toEqual(getWheelSlotReward(WHEEL_SLOTS[0]!, 2_000));
    expect(bonus.newState.lastFreeSpinAt).toBe(free.newState.lastFreeSpinAt);
    expect(bonus.newState.lastBonusSpinAt).toBe(RESET0 + 2_000);
    expect(bonus.newState.bonusSpinsUsed).toBe(1);
  });

  test('같은 리셋일의 두 번째 보너스는 거부되고 다음 리셋일에는 무료부터 다시 요구한다', () => {
    const free = spinWheel(createInitialWheelState(), 1_000, RESET0 + 1_000, constRng(0.2))!;
    const bonus = spinBonusWheel(free.newState, 1_000, RESET0 + 2_000, constRng(0.2))!;
    expect(spinBonusWheel(bonus.newState, 1_000, RESET0 + 3_000, constRng(0.2))).toBeNull();

    const nextDayStatus = getWheelStatus(bonus.newState, RESET0 + DAY_MS + 1_000);
    expect(nextDayStatus.canSpin).toBe(true);
    expect(nextDayStatus.canBonusSpin).toBe(false);
    expect(nextDayStatus.bonusSpinsUsedToday).toBe(0);

    const nextFree = spinWheel(bonus.newState, 1_000, RESET0 + DAY_MS + 1_000, constRng(0.2))!;
    expect(nextFree.newState.bonusSpinsUsed).toBe(0);
    expect(nextFree.newState.lastBonusSpinAt).toBe(bonus.newState.lastBonusSpinAt);
    expect(getWheelStatus(nextFree.newState, RESET0 + DAY_MS + 2_000).canBonusSpin).toBe(true);
  });
});

describe('normalizeWheelState', () => {
  test('junk normalizes to "never spun"', () => {
    expect(normalizeWheelState(undefined)).toEqual(createInitialWheelState());
    expect(normalizeWheelState('nope')).toEqual(createInitialWheelState());
    expect(normalizeWheelState({ lastFreeSpinAt: 'x' })).toEqual(createInitialWheelState());
    expect(normalizeWheelState({ lastFreeSpinAt: -1 })).toEqual(createInitialWheelState());
    expect(normalizeWheelState({ lastFreeSpinAt: NaN })).toEqual(createInitialWheelState());
  });

  test('레거시 timestamp는 보존되고 신규 보너스 필드는 안전한 초기값으로 채워진다', () => {
    expect(normalizeWheelState({ lastFreeSpinAt: DAY0 })).toEqual({
      ...createInitialWheelState(),
      lastFreeSpinAt: DAY0,
    });
  });

  test('유효한 보너스 일자·횟수·시각을 보존하고 잘못된 값은 0/null로 복구한다', () => {
    const day = getResetDayIndex(DAY0);
    expect(
      normalizeWheelState({
        lastFreeSpinAt: DAY0,
        bonusSpinDayIndex: day,
        bonusSpinsUsed: 1.9,
        lastBonusSpinAt: DAY0 + 1_000,
      })
    ).toEqual({
      lastFreeSpinAt: DAY0,
      bonusSpinDayIndex: day,
      bonusSpinsUsed: 1,
      lastBonusSpinAt: DAY0 + 1_000,
    });
    expect(
      normalizeWheelState({ bonusSpinDayIndex: -1, bonusSpinsUsed: 99, lastBonusSpinAt: 'bad' })
    ).toEqual(createInitialWheelState());
  });
});

describe('save migration & prestige', () => {
  test('wheelState is a meta-layer field', () => {
    expect(META_LAYER_KEYS).toContain('wheelState');
  });

  test('a save without wheelState loads as spinnable', () => {
    const migrated = migrateLoadedState({} as Partial<GameState>, createInitialState());
    expect(migrated.wheelState).toEqual(createInitialWheelState());
    expect(getWheelStatus(migrated.wheelState, DAY0).canSpin).toBe(true);
  });

  test('a malformed wheelState is repaired on load', () => {
    const loaded = { wheelState: { lastFreeSpinAt: 'bad' } } as unknown as Partial<GameState>;
    const migrated = migrateLoadedState(loaded, createInitialState());
    expect(migrated.wheelState).toEqual(createInitialWheelState());
  });

  test('the last spin time survives prestige (meta layer preserved)', () => {
    const base = createInitialState();
    const spun: GameState = {
      ...base,
      wheelState: {
        lastFreeSpinAt: DAY0,
        bonusSpinDayIndex: getResetDayIndex(DAY0),
        bonusSpinsUsed: 1,
        lastBonusSpinAt: DAY0 + 1_000,
      },
    };
    const prestiged = createPrestigedState(spun);
    expect(prestiged.wheelState).toEqual(spun.wheelState);
  });

  test('reward scales with progression via getRewardedGoldAmount', () => {
    const state = createInitialState();
    const base = getRewardedGoldAmount(state);
    // 잭팟 슬롯의 가중치 구간 중앙을 겨냥한 결정적 roll을 계산한다(슬롯 순서/가중치가
    // 바뀌어도 테스트가 잭팟을 정확히 가리키도록).
    const total = WHEEL_SLOTS.reduce((sum, slot) => sum + slot.weight, 0);
    let cumulative = 0;
    let jackpotRoll = 0;
    for (const slot of WHEEL_SLOTS) {
      if (slot.key === 'jackpot') {
        jackpotRoll = (cumulative + slot.weight / 2) / total;
        break;
      }
      cumulative += slot.weight;
    }
    const result = spinWheel(state.wheelState, base, DAY0, constRng(jackpotRoll));
    expect(result!.reward.slotKey).toBe('jackpot');
    if (result!.reward.type === 'gold') {
      expect(result!.reward.gold).toBe(
        Math.floor(base * WHEEL_SLOTS.find((slot) => slot.key === 'jackpot')!.goldRatio!)
      );
    }
  });
});
