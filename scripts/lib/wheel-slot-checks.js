// 룰렛 슬롯 데이터(balance.wheel.slots) 정적 검증기(#209).
//
// 핵심 의도: 슬롯은 타입별 필수 비율 필드를 가져야 한다. type 누락은 gold로
// 정규화되는 하위 호환 데이터라 허용하지만, 미지원 type·비양수 가중치/비율·중복
// key는 조용한 오지급(예: rpRatio 누락 → 진행도 스케일이 사라진 최소 보상)으로
// 이어지므로 check:balance에서 fail 처리한다.
//
// check-balance.mjs(ESM CLI)와 jest 회귀 테스트 양쪽에서 그대로 쓰기 위해
// CommonJS(.js)로 둔다(scripts/lib/crop-dominance.js와 동일한 관례).

const WHEEL_SLOT_TYPES = new Set(['gold', 'rp', 'harvest_boost']);

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * @param {{ wheel?: { slots?: Array<{ key?: string, weight?: number, type?: string, goldRatio?: number, rpRatio?: number }> } }} balance
 * @returns {string[]} 위반 메시지 목록. 비어 있으면 유효한 슬롯 카탈로그.
 */
function findWheelSlotViolations(balance) {
  const slots = balance?.wheel?.slots ?? [];
  const violations = [];
  if (slots.length === 0) {
    violations.push('wheel.slots는 비어 있을 수 없습니다.');
    return violations;
  }
  if (new Set(slots.map((slot) => slot?.key)).size !== slots.length) {
    violations.push('wheel.slots의 key는 중복될 수 없습니다.');
  }
  for (const slot of slots) {
    const label = slot?.key ?? '(키 없음)';
    if (!(isFiniteNumber(slot?.weight) && slot.weight > 0)) {
      violations.push(`룰렛 슬롯 ${label}: weight(${slot?.weight})는 0보다 커야 합니다.`);
    }
    if (slot?.type != null && !WHEEL_SLOT_TYPES.has(slot.type)) {
      violations.push(`룰렛 슬롯 ${label}: type "${slot.type}"은 지원 타입(gold/rp/harvest_boost)이 아닙니다.`);
    }
    // 미지원 type은 런타임(normalizeWheelSlot)에서 gold로 강등되므로, 여기서도 같은
    // 기준(gold)의 필수 필드를 요구해 데이터가 어떤 경로로든 오지급되지 않게 한다.
    const effectiveType = WHEEL_SLOT_TYPES.has(slot?.type) ? slot.type : 'gold';
    if (effectiveType === 'gold' && !(isFiniteNumber(slot?.goldRatio) && slot.goldRatio > 0)) {
      violations.push(`룰렛 슬롯 ${label}: gold 슬롯은 goldRatio(${slot?.goldRatio})가 0보다 커야 합니다.`);
    }
    if (effectiveType === 'rp' && !(isFiniteNumber(slot?.rpRatio) && slot.rpRatio > 0)) {
      violations.push(`룰렛 슬롯 ${label}: rp 슬롯은 rpRatio(${slot?.rpRatio})가 0보다 커야 합니다.`);
    }
  }
  return violations;
}

module.exports = { findWheelSlotViolations };
