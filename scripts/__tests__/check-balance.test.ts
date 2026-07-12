import fs from 'node:fs';
import path from 'node:path';

// @ts-expect-error — .js 검출기 모듈(CommonJS)에는 타입 선언이 없다. 런타임 계약만 검증한다.
import { computeNetPerHour, findCropDominanceViolations } from '../lib/crop-dominance.js';
// @ts-expect-error — .js 검출기 모듈(CommonJS)에는 타입 선언이 없다. 런타임 계약만 검증한다.
import { findFirstTierHybridProfitViolations } from '../lib/hybrid-profit-checks.js';

// check:balance(scripts/check-balance.mjs)의 작물 수익 지배(dominance) 역전 검출
// 회귀 테스트(#206).
//
// 배경: 기존 check:balance는 작물별 ROI 밴드만 검사해서, 체리(과수원)가 더 늦게
// 해금되는 망고~키위(과수원/온실)보다 시간당 순수익(net/h)이 높은 "수익 역전"을
// 잡지 못했다. 역전이 있으면 새 구역/티어 해금이 진행 체감을 주지 못한다.
// 이 테스트는 검출기의 판정 계약(해금 순서 prefix 최고와 비교, 동률 허용,
// gate 구역 제외)과 실제 balance.json의 무역전 상태를 함께 고정한다.

type FixtureCrop = {
  key: string;
  area: string;
  cost: number;
  sell: number;
  growTime: number;
};

function makeBalance(crops: FixtureCrop[], areas?: Array<{ key: string; unlock?: { gate?: string | null } }>) {
  return {
    areas: areas ?? [
      { key: 'orchard', unlock: {} },
      { key: 'greenhouse', unlock: {} },
      { key: 'hybrid_greenhouse', unlock: { gate: 'breeding_lab' } },
    ],
    crops,
  };
}

describe('check:balance 작물 수익 지배 역전 검출 (findCropDominanceViolations)', () => {
  it('computeNetPerHour는 (sell-cost)/growTime 을 시간당으로 환산한다', () => {
    // 1시간에 net 100G → 100 G/h
    expect(computeNetPerHour({ cost: 50, sell: 150, growTime: 3_600_000 })).toBe(100);
  });

  it('조정 전(#206) 데이터에서 역전 6건을 해금 순서대로 검출한다', () => {
    // #206 시점의 실제 수치 스냅샷: 체리가 망고~키위를, 선인장이 대나무를,
    // 달빛꽃이 무지개나무를 지배했다. 천년인삼은 선인장과 정확히 동률(3.4M G/h).
    const before = makeBalance(
      [
        { key: 'cherry', area: 'orchard', cost: 105000, sell: 265000, growTime: 300000 },
        { key: 'mango', area: 'orchard', cost: 165000, sell: 430000, growTime: 700000 },
        { key: 'pineapple', area: 'greenhouse', cost: 260000, sell: 700000, growTime: 1200000 },
        { key: 'coconut', area: 'greenhouse', cost: 410000, sell: 1150000, growTime: 1800000 },
        { key: 'kiwi', area: 'greenhouse', cost: 650000, sell: 1850000, growTime: 2400000 },
        { key: 'avocado', area: 'greenhouse', cost: 1000000, sell: 3000000, growTime: 3000000 },
        { key: 'cactus', area: 'greenhouse', cost: 1600000, sell: 5000000, growTime: 3600000 },
        { key: 'bamboo', area: 'mystic_field', cost: 2600000, sell: 8400000, growTime: 7200000 },
        { key: 'ginseng', area: 'mystic_field', cost: 4300000, sell: 14500000, growTime: 10800000 },
        { key: 'moonflower', area: 'legend_field', cost: 120000000, sell: 400000000, growTime: 86400000 },
        { key: 'rainbow_tree', area: 'legend_field', cost: 400000000, sell: 1500000000, growTime: 345600000 },
      ],
      [
        { key: 'orchard', unlock: {} },
        { key: 'greenhouse', unlock: {} },
        { key: 'mystic_field', unlock: {} },
        { key: 'legend_field', unlock: {} },
      ]
    );

    const violations = findCropDominanceViolations(before);
    expect(violations.map((v: { cropKey: string }) => v.cropKey)).toEqual([
      'mango',
      'pineapple',
      'coconut',
      'kiwi',
      'bamboo',
      'rainbow_tree',
    ]);
    // 지배자는 그 시점 prefix 최고 net/h 작물이다.
    expect(violations[0].dominatedByKey).toBe('cherry');
    expect(violations[4].dominatedByKey).toBe('cactus');
    expect(violations[5].dominatedByKey).toBe('moonflower');
  });

  it('동률(net/h가 정확히 같은 경우)은 지배가 아니다', () => {
    // 둘 다 100 G/h — 더 비싼 작물이 이득을 주지 못하지만 "역전"은 아니므로 허용.
    const balance = makeBalance([
      { key: 'a', area: 'orchard', cost: 100, sell: 200, growTime: 3_600_000 },
      { key: 'b', area: 'orchard', cost: 300, sell: 400, growTime: 3_600_000 },
    ]);
    expect(findCropDominanceViolations(balance)).toEqual([]);
  });

  it('연속 동률 뒤에 낮은 작물이 오면 그 작물만 위반이고, 지배자는 동률 최신 작물이다', () => {
    // A=100, B=100(동률·비위반), C=99 → C 1건. 동률 갱신(>=) 계약이 흔들리면
    // B가 위반으로 잡히거나 지배자가 A로 남는 회귀가 여기서 드러난다.
    const balance = makeBalance([
      { key: 'a', area: 'orchard', cost: 100, sell: 200, growTime: 3_600_000 },
      { key: 'b', area: 'orchard', cost: 300, sell: 400, growTime: 3_600_000 },
      { key: 'c', area: 'orchard', cost: 500, sell: 599, growTime: 3_600_000 },
    ]);
    const violations = findCropDominanceViolations(balance);
    expect(violations).toHaveLength(1);
    expect(violations[0].cropKey).toBe('c');
    expect(violations[0].dominatedByKey).toBe('b');
    expect(violations[0].dominatedByNetPerHour).toBe(100);
  });

  it('같은 구역 안에서는 씨앗 비용 순서를 해금 순서로 본다', () => {
    // 목록 순서를 비용 역순으로 넣어도(정렬 계약 검증) 싼 작물이 먼저다.
    const balance = makeBalance([
      { key: 'expensive_slow', area: 'orchard', cost: 1000, sell: 1100, growTime: 3_600_000 },
      { key: 'cheap_fast', area: 'orchard', cost: 10, sell: 210, growTime: 3_600_000 },
    ]);
    const violations = findCropDominanceViolations(balance);
    expect(violations.map((v: { cropKey: string }) => v.cropKey)).toEqual(['expensive_slow']);
    expect(violations[0].dominatedByKey).toBe('cheap_fast');
  });

  it('gate 구역(hybrid_greenhouse) 작물은 검사에서 제외된다', () => {
    // 교배 부모용 저티어 하이브리드는 본편 곡선과 다른 수익이 의도된 예외다.
    const balance = makeBalance([
      { key: 'cherry', area: 'orchard', cost: 105000, sell: 265000, growTime: 300000 },
      // net/h가 체리보다 훨씬 높지만(gate 구역) 지배자 후보가 되지 않아야 하고,
      { key: 'frost_blueberry', area: 'hybrid_greenhouse', cost: 49000, sell: 122500, growTime: 120000 },
      // net/h가 체리보다 낮아도(gate 구역) 위반으로 잡히지 않아야 한다.
      { key: 'weak_hybrid', area: 'hybrid_greenhouse', cost: 100, sell: 110, growTime: 3_600_000 },
    ]);
    expect(findCropDominanceViolations(balance)).toEqual([]);
  });

  it('실제 balance.json에는 수익 지배 역전이 없다(#206 조정 후 상태 고정)', () => {
    const balance = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'packages', 'farm-core', 'src', 'balance.json'), 'utf8')
    );
    expect(findCropDominanceViolations(balance)).toEqual([]);
  });

  it('실제 balance.json에서 #206 조정 7종은 각각 직전 해금 작물보다 엄격히 큰 net/h를 갖는다', () => {
    // 위 "위반 0건" 단정은 동률까지 허용하므로, 이번 조정의 목표였던
    // "역전 구간의 엄격한 단조 증가"를 조정 작물별로 별도 고정한다.
    // 사슬은 해금 순서(구역 순 → 구역 내 씨앗 비용 순)의 인접 구간이다.
    const balance = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'packages', 'farm-core', 'src', 'balance.json'), 'utf8')
    );
    const netPerHourOf = (key: string) => {
      const crop = balance.crops.find((candidate: { key: string }) => candidate.key === key);
      expect(crop).toBeDefined();
      return computeNetPerHour(crop);
    };

    const strictlyIncreasingChains: string[][] = [
      // 과수원~온실: 체리가 망고~키위를 지배하던 구간(#206 본문).
      ['cherry', 'mango', 'pineapple', 'coconut', 'kiwi', 'avocado'],
      // 신비: 선인장이 대나무를 지배하고 천년인삼이 선인장과 동률이던 구간.
      ['cactus', 'bamboo', 'ginseng', 'crystal_flower'],
      // 전설: 달빛꽃이 무지개나무를 지배하던 구간. 별빛열매(net/h 8.33M)→달빛꽃
      // (11.67M) 경계는 역전이 아님을 함께 고정한다(리뷰에서 별빛열매 25M 역전
      // 주장이 있었으나 net/h = (sell-cost)/growTime 기준 8,333,333이다).
      ['diamond', 'starfruit', 'moonflower', 'rainbow_tree', 'world_tree'],
    ];
    for (const chain of strictlyIncreasingChains) {
      for (let index = 1; index < chain.length; index += 1) {
        const prev = netPerHourOf(chain[index - 1]);
        const curr = netPerHourOf(chain[index]);
        // 어느 인접쌍이 깨졌는지 바로 보이도록 키를 메시지에 싣는다.
        expect({ pair: `${chain[index - 1]} < ${chain[index]}`, increased: curr > prev }).toEqual({
          pair: `${chain[index - 1]} < ${chain[index]}`,
          increased: true,
        });
      }
    }
  });
});

describe('check:balance 1차 교배 작물 수익성 검증 (#285)', () => {
  const validCrops: FixtureCrop[] = [
    { key: 'pineapple', area: 'greenhouse', cost: 260000, sell: 700000, growTime: 1200000 },
    { key: 'coconut', area: 'greenhouse', cost: 410000, sell: 1150000, growTime: 1800000 },
    { key: 'kiwi', area: 'greenhouse', cost: 650000, sell: 1850000, growTime: 2400000 },
    { key: 'avocado', area: 'greenhouse', cost: 1000000, sell: 3000000, growTime: 3000000 },
    { key: 'cactus', area: 'greenhouse', cost: 1600000, sell: 5000000, growTime: 3600000 },
    { key: 'crystalberry', area: 'hybrid_greenhouse', cost: 103000, sell: 257500, growTime: 168000 },
    { key: 'sun_grape', area: 'hybrid_greenhouse', cost: 137000, sell: 342500, growTime: 224000 },
    { key: 'royal_potato', area: 'hybrid_greenhouse', cost: 117000, sell: 292500, growTime: 192000 },
    { key: 'frost_blueberry', area: 'hybrid_greenhouse', cost: 73000, sell: 182500, growTime: 120000 },
  ];

  const mutateCrop = (key: string, patch: Partial<FixtureCrop>) => ({
    crops: validCrops.map((crop) => (crop.key === key ? { ...crop, ...patch } : crop)),
  });

  it('현재 4종은 avocado보다 높고 cactus보다 낮으며 sell/cost 2.5를 유지한다', () => {
    expect(findFirstTierHybridProfitViolations({ crops: validCrops })).toEqual([]);
  });

  it('net/h가 avocado와 같거나 낮아지면 실패한다', () => {
    // net 240,000 / growTime 360,000ms면 avocado와 같은 2.4M/h다.
    const violations = findFirstTierHybridProfitViolations(
      mutateCrop('frost_blueberry', { cost: 160000, sell: 400000, growTime: 360000 })
    );
    expect(violations.some((message: string) => message.includes('온실 최고'))).toBe(true);
  });

  it('net/h가 cactus와 같거나 높아지면 실패한다', () => {
    // ROI 2.5를 유지하면서 frost_blueberry를 cactus와 같은 3.4M/h로 맞춘다.
    const violations = findFirstTierHybridProfitViolations(
      mutateCrop('frost_blueberry', { cost: 680000, sell: 1700000, growTime: 1080000 })
    );
    expect(violations.some((message: string) => message.includes('온실 상한'))).toBe(true);
  });

  it('수익 밴드 안이어도 sell/cost 2.5가 깨지면 실패한다', () => {
    const violations = findFirstTierHybridProfitViolations(mutateCrop('crystalberry', { sell: 250000 }));
    expect(violations.some((message: string) => message.includes('sell/cost'))).toBe(true);
  });

  it('필수 비교 작물이 누락되면 명시적으로 실패한다', () => {
    const violations = findFirstTierHybridProfitViolations({
      crops: validCrops.filter((crop) => crop.key !== 'avocado'),
    });
    expect(violations).toContain('1차 교배 수익성 비교 작물 avocado: 유효한 cost/sell/growTime이 필요합니다.');
  });

  it('실제 balance.json도 1차 교배 수익성 밴드를 만족한다', () => {
    const balance = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'packages', 'farm-core', 'src', 'balance.json'), 'utf8')
    );
    expect(findFirstTierHybridProfitViolations(balance)).toEqual([]);
  });
});

// @ts-expect-error — .js 검증기 모듈(CommonJS)에는 타입 선언이 없다. 런타임 계약만 검증한다.
import { findWheelSlotViolations } from '../lib/wheel-slot-checks.js';

// check:balance의 룰렛 슬롯 검증(4-c, #209) 회귀 테스트. 타입별 필수 비율 필드가
// 빠지면 조용한 오지급(진행도 스케일 소실)으로 이어지므로 데이터 게이트에서 막는다.
describe('check:balance 룰렛 슬롯 검증 (findWheelSlotViolations)', () => {
  const validSlots = [
    { key: 'gold_small', icon: '🪙', weight: 10, goldRatio: 0.5 },
    { key: 'boon', icon: '🧪', weight: 5, type: 'rp', rpRatio: 2 },
    { key: 'frenzy', icon: '⚡', weight: 3, type: 'harvest_boost' },
  ];

  it('유효한 카탈로그(gold/rp/harvest_boost + type 누락 gold)는 위반이 없다', () => {
    expect(findWheelSlotViolations({ wheel: { slots: validSlots } })).toEqual([]);
  });

  it('미지원 type은 위반이다', () => {
    const violations = findWheelSlotViolations({
      wheel: { slots: [{ key: 'weird', icon: '❓', weight: 1, type: 'gems', goldRatio: 1 }] },
    });
    expect(violations.some((message: string) => message.includes('지원 타입'))).toBe(true);
  });

  it('rp 슬롯의 rpRatio 누락/0 이하는 위반이다(1 RP 오지급 방지)', () => {
    for (const bad of [undefined, 0, -1]) {
      const violations = findWheelSlotViolations({
        wheel: { slots: [{ key: 'boon', icon: '🧪', weight: 1, type: 'rp', rpRatio: bad }] },
      });
      expect(violations.some((message: string) => message.includes('rpRatio'))).toBe(true);
    }
  });

  it('gold 슬롯(및 type 누락 슬롯)의 goldRatio 누락/음수는 위반이다', () => {
    for (const slot of [
      { key: 'g', icon: '🪙', weight: 1, type: 'gold' },
      { key: 'legacy', icon: '🪙', weight: 1, goldRatio: -2 },
    ]) {
      const violations = findWheelSlotViolations({ wheel: { slots: [slot] } });
      expect(violations.some((message: string) => message.includes('goldRatio'))).toBe(true);
    }
  });

  it('중복 key·비양수 weight·빈 카탈로그는 위반이다', () => {
    expect(
      findWheelSlotViolations({
        wheel: {
          slots: [
            { key: 'dup', icon: '🪙', weight: 1, goldRatio: 1 },
            { key: 'dup', icon: '💰', weight: 1, goldRatio: 2 },
          ],
        },
      }).some((message: string) => message.includes('중복'))
    ).toBe(true);
    expect(
      findWheelSlotViolations({ wheel: { slots: [{ key: 'zero', icon: '🪙', weight: 0, goldRatio: 1 }] } }).some(
        (message: string) => message.includes('weight')
      )
    ).toBe(true);
    expect(findWheelSlotViolations({ wheel: { slots: [] } })).toHaveLength(1);
  });

  it('실제 balance.json의 슬롯 카탈로그는 위반이 없다', () => {
    const balance = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'packages', 'farm-core', 'src', 'balance.json'), 'utf8')
    );
    expect(findWheelSlotViolations(balance)).toEqual([]);
  });
});
