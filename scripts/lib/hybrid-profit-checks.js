// 1차 교배 작물 수익성 밴드 검증기(#285).
//
// PR #300에서 확정한 계약은 첫 4종이 해금 시기 온실 작물
// (pineapple~avocado)의 최고 net/h보다 엄격히 높고, 온실 졸업 작물인
// cactus보다 엄격히 낮아 정규 진행을 대체하지 않는 것이다. cost/sell을
// 다시 조정하더라도 의도한 ROI 2.5는 유지한다.
//
// check-balance.mjs(ESM CLI)와 jest 양쪽에서 공유하기 위해 CommonJS로 둔다.

const { computeNetPerHour } = require('./crop-dominance.js');

const FIRST_TIER_HYBRID_CROP_KEYS = ['crystalberry', 'sun_grape', 'royal_potato', 'frost_blueberry'];
const UNLOCK_ERA_GREENHOUSE_CROP_KEYS = ['pineapple', 'coconut', 'kiwi', 'avocado'];
const GREENHOUSE_CEILING_CROP_KEY = 'cactus';
const FIRST_TIER_HYBRID_SELL_TO_COST_RATIO = 2.5;
const RATIO_EPSILON = 1e-9;

function isValidCrop(crop) {
  return (
    crop != null &&
    Number.isFinite(crop.cost) &&
    Number.isFinite(crop.sell) &&
    Number.isFinite(crop.growTime) &&
    crop.cost > 0 &&
    crop.sell > crop.cost &&
    crop.growTime > 0
  );
}

/**
 * @param {{ crops?: Array<{ key: string, cost: number, sell: number, growTime: number }> }} balance
 * @returns {string[]} 위반 메시지 목록. 비어 있으면 수익성 밴드가 유효하다.
 */
function findFirstTierHybridProfitViolations(balance) {
  const cropByKey = new Map((balance?.crops ?? []).map((crop) => [crop?.key, crop]));
  const requiredKeys = [
    ...FIRST_TIER_HYBRID_CROP_KEYS,
    ...UNLOCK_ERA_GREENHOUSE_CROP_KEYS,
    GREENHOUSE_CEILING_CROP_KEY,
  ];
  const violations = [];

  for (const key of requiredKeys) {
    if (!isValidCrop(cropByKey.get(key))) {
      violations.push(`1차 교배 수익성 비교 작물 ${key}: 유효한 cost/sell/growTime이 필요합니다.`);
    }
  }
  if (violations.length > 0) {
    return violations;
  }

  const unlockEraBest = Math.max(
    ...UNLOCK_ERA_GREENHOUSE_CROP_KEYS.map((key) => computeNetPerHour(cropByKey.get(key)))
  );
  const greenhouseCeiling = computeNetPerHour(cropByKey.get(GREENHOUSE_CEILING_CROP_KEY));

  for (const key of FIRST_TIER_HYBRID_CROP_KEYS) {
    const crop = cropByKey.get(key);
    const netPerHour = computeNetPerHour(crop);
    if (!(netPerHour > unlockEraBest)) {
      violations.push(
        `1차 교배 작물 ${key}: net/h(${Math.round(netPerHour)})는 해금 시기 온실 최고(${Math.round(unlockEraBest)})보다 엄격히 커야 합니다.`
      );
    }
    if (!(netPerHour < greenhouseCeiling)) {
      violations.push(
        `1차 교배 작물 ${key}: net/h(${Math.round(netPerHour)})는 온실 상한 ${GREENHOUSE_CEILING_CROP_KEY}(${Math.round(greenhouseCeiling)})보다 엄격히 작아야 합니다.`
      );
    }
    const sellToCostRatio = crop.sell / crop.cost;
    if (Math.abs(sellToCostRatio - FIRST_TIER_HYBRID_SELL_TO_COST_RATIO) > RATIO_EPSILON) {
      violations.push(
        `1차 교배 작물 ${key}: sell/cost(${sellToCostRatio.toFixed(4)})는 ${FIRST_TIER_HYBRID_SELL_TO_COST_RATIO}여야 합니다.`
      );
    }
  }
  return violations;
}

module.exports = {
  FIRST_TIER_HYBRID_CROP_KEYS,
  UNLOCK_ERA_GREENHOUSE_CROP_KEYS,
  GREENHOUSE_CEILING_CROP_KEY,
  FIRST_TIER_HYBRID_SELL_TO_COST_RATIO,
  findFirstTierHybridProfitViolations,
};
