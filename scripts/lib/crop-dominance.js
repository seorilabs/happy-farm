// 작물 수익 지배(dominance) 역전 검출기.
//
// 핵심 의도: 선형 진행 구역(gate 없는 구역)에서 더 늦게 해금되는 작물은 시간당
// 순수익(net/h = (sell - cost) / growTime)이 앞서 해금된 작물보다 낮아지면 안 된다.
// 뒤 구역/고비용 작물이 앞 작물에게 지배당하면 새 구역 해금이 진행 체감을 주지
// 못해 죽은 콘텐츠가 된다(#206: 체리가 망고~키위를 지배, 달빛꽃이 무지개나무를 지배).
//
// 판정 방식: 해금 순서(구역 순서 → 같은 구역 안에서는 씨앗 비용 오름차순)로 정렬한
// 뒤 prefix 최고 net/h를 추적한다. 어떤 작물의 net/h가 그 시점 prefix 최고보다
// "엄격히 낮으면" 위반이다(동률은 허용 — 지배는 더 싸고 이른 작물이 '더 높은'
// 수익을 낼 때만 성립한다).
//
// gate 구역(hybrid_greenhouse 등)은 선형 진행 밖이라 검사에서 제외한다. 특히
// 교배 부모용 저티어 하이브리드 4종(crystalberry 등)은 의도적으로 본편 곡선과
// 다른 수익을 갖는다(balance.json breeding agentPurpose 참조).
//
// check-balance.mjs(ESM CLI)와 jest 회귀 테스트 양쪽에서 그대로 쓰기 위해
// CommonJS(.js)로 둔다(scripts/lib/hangul-scan.js와 동일한 관례).

const MS_PER_HOUR = 3_600_000;

/**
 * @param {{ cost: number, sell: number, growTime: number }} crop
 * @returns {number} 시간당 순수익(G/h)
 */
function computeNetPerHour(crop) {
  return ((crop.sell - crop.cost) / crop.growTime) * MS_PER_HOUR;
}

/**
 * balance 데이터에서 수익 지배 역전을 찾는다.
 *
 * @param {{ areas?: Array<{ key: string, unlock?: { gate?: string | null } }>,
 *           crops?: Array<{ key: string, area: string, cost: number, sell: number, growTime: number }> }} balance
 * @returns {Array<{ cropKey: string, netPerHour: number, dominatedByKey: string, dominatedByNetPerHour: number }>}
 *   위반 목록(해금 순서 기준). 비어 있으면 역전 없음.
 */
function findCropDominanceViolations(balance) {
  const areas = Array.isArray(balance?.areas) ? balance.areas : [];
  const crops = Array.isArray(balance?.crops) ? balance.crops : [];

  // 선형 진행 구역만 순서 부여. gate 구역은 Map에 없으므로 자연스럽게 제외된다.
  const sequentialAreaOrder = new Map();
  for (const area of areas) {
    if (area?.unlock?.gate == null) {
      sequentialAreaOrder.set(area.key, sequentialAreaOrder.size);
    }
  }

  const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
  const candidates = crops
    // 수치가 비정상인 작물은 check-balance §3(양수/마진/ROI)에서 별도로 실패하므로
    // 여기서는 NaN 오염만 막고 건너뛴다.
    .filter(
      (crop) =>
        sequentialAreaOrder.has(crop?.area) &&
        isFiniteNumber(crop?.cost) &&
        isFiniteNumber(crop?.sell) &&
        isFiniteNumber(crop?.growTime) &&
        crop.growTime > 0
    )
    // 해금 순서: 구역 진행 순 → 같은 구역 안에서는 씨앗 비용이 곧 해금(도달) 순서.
    .sort((a, b) => {
      const areaDiff = sequentialAreaOrder.get(a.area) - sequentialAreaOrder.get(b.area);
      return areaDiff !== 0 ? areaDiff : a.cost - b.cost;
    });

  const violations = [];
  let best = null;
  for (const crop of candidates) {
    const netPerHour = computeNetPerHour(crop);
    if (best != null && netPerHour < best.netPerHour) {
      violations.push({
        cropKey: crop.key,
        netPerHour,
        dominatedByKey: best.cropKey,
        dominatedByNetPerHour: best.netPerHour,
      });
    }
    if (best == null || netPerHour > best.netPerHour) {
      best = { cropKey: crop.key, netPerHour };
    }
  }
  return violations;
}

module.exports = { computeNetPerHour, findCropDominanceViolations };
