import fs from 'node:fs';
import path from 'node:path';

// @ts-expect-error — .js 검출기 모듈(CommonJS)에는 타입 선언이 없다. 런타임 계약만 검증한다.
import { computeNetPerHour, findCropDominanceViolations } from '../lib/crop-dominance.js';

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
});
