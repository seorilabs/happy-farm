import fs from 'node:fs';
import path from 'node:path';

// balance.json 회귀 가드. balance를 손볼 때 무심코 깨지기 쉬운 핵심 곡선/지표
// 불변식을 검증하고, 기준에서 벗어나면 CI를 실패시킨다. 게임 동작을 완전히
// 시뮬레이션하지는 않고, "명백히 잘못된 밸런스"(역마진 작물, 감소하는 해금 곡선,
// 광고 인센티브를 무너뜨리는 데일리 보너스 등)를 빠르게 잡아내는 정적 검증이다.

const root = process.cwd();
const failures = [];
const passes = [];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function check(condition, message) {
  if (condition) {
    passes.push(message);
  } else {
    failures.push(message);
  }
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

const balance = readJson('packages/farm-core/src/balance.json');

// 1) 스키마/경제 기본값
check(Number.isInteger(balance.schemaVersion) && balance.schemaVersion > 0, 'schemaVersion은 양의 정수여야 합니다.');

const economy = balance.economy ?? {};
check(isFiniteNumber(economy.defaultGold) && economy.defaultGold > 0, 'economy.defaultGold는 0보다 커야 합니다.');
check(
  Number.isInteger(economy.initialPlots) && economy.initialPlots >= 1,
  'economy.initialPlots는 1 이상이어야 합니다.'
);
check(
  Number.isInteger(economy.maxPlots) && economy.maxPlots >= economy.initialPlots,
  'economy.maxPlots는 initialPlots 이상이어야 합니다.'
);
check(economy.plotCostBase > 0, 'economy.plotCostBase는 0보다 커야 합니다.');
check(economy.plotCostGrowth > 1, 'economy.plotCostGrowth는 1보다 커야 합니다(밭 가격은 우상향).');
check(economy.speedUpgradeBaseCost > 0, 'economy.speedUpgradeBaseCost는 0보다 커야 합니다.');
check(economy.profitUpgradeBaseCost > 0, 'economy.profitUpgradeBaseCost는 0보다 커야 합니다.');
check(economy.upgradeCostGrowth > 1, 'economy.upgradeCostGrowth는 1보다 커야 합니다(업그레이드 가격은 우상향).');
check(economy.upgradeStep > 0, 'economy.upgradeStep은 0보다 커야 합니다.');

// 1-b) 프레스티지 이전 오프라인 수익: 효율계수는 (0,1)로 능동 플레이 가치를 보존하고,
// cap은 양수여야 무한 누적(스노볼)을 막는다.
const offlineIncome = balance.offlineIncome ?? {};
// 효율계수 상한은 0.5: 오프라인 수익이 능동 플레이의 절반을 넘지 않아야 방치가
// 능동을 추월하지 않는다. (0,1)만 검사하면 0.4→5 같은 폭주가 cap만큼 스노볼되어도
// 통과하므로, 설계 상한(0.5)을 명시적으로 강제한다.
const OFFLINE_EFFICIENCY_RATIO_MAX = 0.5;
check(
  isFiniteNumber(offlineIncome.efficiencyRatio) &&
    offlineIncome.efficiencyRatio > 0 &&
    offlineIncome.efficiencyRatio <= OFFLINE_EFFICIENCY_RATIO_MAX,
  `offlineIncome.efficiencyRatio(${offlineIncome.efficiencyRatio})는 0 초과 ${OFFLINE_EFFICIENCY_RATIO_MAX} 이하여야 합니다(능동 플레이 가치 보존).`
);
check(
  isFiniteNumber(offlineIncome.capMs) && offlineIncome.capMs > 0,
  'offlineIncome.capMs는 0보다 커야 합니다(오프라인 누적 상한).'
);

// 2) 구역 해금 곡선: 메인 진행 구역(gate 없는 구역)의 해금 비용/요구치는 단조 증가/비감소.
const areas = Array.isArray(balance.areas) ? balance.areas : [];
check(areas.length > 0, 'areas는 비어 있을 수 없습니다.');
const areaKeys = new Set(areas.map((area) => area.key));
const sequentialAreas = areas.filter((area) => area.unlock?.gate == null);
for (let index = 1; index < sequentialAreas.length; index += 1) {
  const prev = sequentialAreas[index - 1];
  const curr = sequentialAreas[index];
  // 구조가 어긋나면(TypeError로 가드가 비정상 종료되지 않도록) 명시적 실패로 적재.
  if (prev.unlock == null || curr.unlock == null) {
    check(false, `구역 ${prev.key}/${curr.key}: unlock 정보가 없습니다.`);
    continue;
  }
  check(
    curr.unlock.cost > prev.unlock.cost,
    `구역 해금 비용은 진행 순서대로 증가해야 합니다: ${prev.key}(${prev.unlock.cost}) → ${curr.key}(${curr.unlock.cost}).`
  );
  check(
    curr.unlock.requiredHarvestedCropCount >= prev.unlock.requiredHarvestedCropCount,
    `구역 요구 수확 작물 수는 감소하면 안 됩니다: ${prev.key} → ${curr.key}.`
  );
  check(
    curr.unlock.requiredUpgradeLevel >= prev.unlock.requiredUpgradeLevel,
    `구역 요구 업그레이드 레벨은 감소하면 안 됩니다: ${prev.key} → ${curr.key}.`
  );
}

// 2-b) 구역 해금비 점프 배율 곡선: 단계별 배율(curr.cost / prev.cost)이 완만한
// 단조 비감소 곡선이어야 한다. 중간 구간이 가파르다가 후반에 급등하는 스파이크
// (역전)는 진행 벽을 만들고 컬렉션 보상 곡선까지 왜곡하므로 금지한다. 첫 유료
// 점프(채소→과일)는 초반 이탈 구간과 겹쳐 상한을 더 낮게(≤35), 후반 최대 점프는
// ≤45로 제한한다. prev.cost가 0인 전환(무료→첫 유료)은 배율이 정의되지 않으므로 제외.
const FIRST_JUMP_RATIO_MAX = 35;
const LATE_JUMP_RATIO_MAX = 45;
const jumpRatios = [];
for (let index = 1; index < sequentialAreas.length; index += 1) {
  const prev = sequentialAreas[index - 1];
  const curr = sequentialAreas[index];
  if (prev.unlock == null || curr.unlock == null || !(prev.unlock.cost > 0) || !(curr.unlock.cost > 0)) {
    continue;
  }
  jumpRatios.push({ from: prev.key, to: curr.key, ratio: curr.unlock.cost / prev.unlock.cost });
}
for (let index = 0; index < jumpRatios.length; index += 1) {
  const { from, to, ratio } = jumpRatios[index];
  // 모든 점프 배율은 후반 상한(≤45)을 넘지 않는다(과도 스파이크 금지).
  check(
    ratio <= LATE_JUMP_RATIO_MAX,
    `구역 해금비 점프 배율이 과도합니다: ${from}→${to}(×${ratio.toFixed(1)})는 ${LATE_JUMP_RATIO_MAX} 이하여야 합니다.`
  );
  // 첫 유료 점프는 초반 이탈 구간과 겹쳐 더 낮은 상한(≤35)을 적용한다.
  if (index === 0) {
    check(
      ratio <= FIRST_JUMP_RATIO_MAX,
      `첫 유료 구역 점프 배율이 과도합니다: ${from}→${to}(×${ratio.toFixed(1)})는 ${FIRST_JUMP_RATIO_MAX} 이하여야 합니다.`
    );
  }
  // 배율은 단조 비감소여야 한다(중간이 완만하다가 후반에 급등하는 역전 금지).
  if (index > 0) {
    const prevRatio = jumpRatios[index - 1];
    check(
      ratio >= prevRatio.ratio - 1e-9,
      `구역 해금비 점프 배율이 역전했습니다(단조 비감소 위반): ${prevRatio.from}→${prevRatio.to}(×${prevRatio.ratio.toFixed(1)}) 이후 ${from}→${to}(×${ratio.toFixed(1)}).`
    );
  }
}

// 2-c) 컬렉션 보상 곡선: 진행 구역(gate 없는)의 areaCompletionReward는
//  (1) 진행 순서대로 단조 비감소이고,
//  (2) "다음 진행 구역 해금비의 약 1/2"(0.4~0.6) 규칙을 따른다.
// 단, 첫 구역(starter)은 초반 부스트로 1/2 규칙 예외, 마지막 진행 구역(legend)은
// 다음 진행 구역이 없어 졸업비(graduation.costBase)의 1/2을 기준으로 삼는다.
// gate 구역(hybrid 등)은 선형 진행 밖이라 두 검사 모두에서 제외(sequentialAreas).
const areaRewards = balance.collection?.areaCompletionReward ?? {};
const graduationCostBase = balance.regions?.graduation?.costBase ?? 0;
for (let index = 1; index < sequentialAreas.length; index += 1) {
  const prevReward = areaRewards[sequentialAreas[index - 1].key];
  const currReward = areaRewards[sequentialAreas[index].key];
  if (!isFiniteNumber(prevReward) || !isFiniteNumber(currReward)) {
    continue;
  }
  check(
    currReward >= prevReward,
    `컬렉션 보상은 진행 순서대로 감소하면 안 됩니다: ${sequentialAreas[index - 1].key}(${prevReward}) → ${sequentialAreas[index].key}(${currReward}).`
  );
}
for (let index = 1; index < sequentialAreas.length; index += 1) {
  const area = sequentialAreas[index];
  const reward = areaRewards[area.key];
  if (!isFiniteNumber(reward)) {
    continue;
  }
  // 다음 진행 구역의 해금비(없으면 졸업비)를 1/2 규칙의 기준으로 삼는다.
  const next = sequentialAreas[index + 1];
  const referenceCost = next != null ? next.unlock?.cost : graduationCostBase;
  if (!isFiniteNumber(referenceCost) || referenceCost <= 0) {
    continue;
  }
  const ratio = reward / referenceCost;
  check(
    ratio >= 0.4 && ratio <= 0.6,
    `컬렉션 보상 ${area.key}(${reward})는 기준 해금비(${referenceCost})의 약 1/2(0.4~0.6 배)이어야 합니다(현재 ×${ratio.toFixed(2)}).`
  );
}

// 3) 작물: 양수 값 + 양의 마진(sell > cost) + 합리적 ROI 밴드 + 유효 구역/티어 참조.
const crops = Array.isArray(balance.crops) ? balance.crops : [];
check(crops.length > 0, 'crops는 비어 있을 수 없습니다.');
const MIN_ROI = 1.1;
const MAX_ROI = 10;
for (const crop of crops) {
  const label = crop?.key ?? '(이름 없음)';
  // 필수 수치 필드가 빠지면 이후 산술(`sell/cost` 등)이 NaN/TypeError가 되므로 먼저 거른다.
  if (!isFiniteNumber(crop?.cost) || !isFiniteNumber(crop?.sell) || !isFiniteNumber(crop?.growTime)) {
    check(false, `작물 ${label}: cost/sell/growTime이 모두 유효한 숫자여야 합니다.`);
    continue;
  }
  check(crop.cost > 0 && crop.sell > 0 && crop.growTime > 0, `작물 ${label}: cost/sell/growTime은 모두 0보다 커야 합니다.`);
  check(crop.sell > crop.cost, `작물 ${label}: 판매가(${crop.sell})는 씨앗 비용(${crop.cost})보다 커야 합니다(양의 마진).`);
  const roi = crop.sell / crop.cost;
  check(roi >= MIN_ROI && roi <= MAX_ROI, `작물 ${label}: ROI(${roi.toFixed(2)})가 허용 범위[${MIN_ROI}, ${MAX_ROI}]를 벗어났습니다.`);
  check(Number.isInteger(crop.tier) && crop.tier >= 1 && crop.tier <= 10, `작물 ${label}: tier는 1~10의 정수여야 합니다.`);
  check(areaKeys.has(crop.area), `작물 ${label}: area "${crop.area}"가 정의된 구역이 아닙니다.`);
}

// 4) 데일리 보너스: 광고 인센티브 보존을 위해 일일 ad-reward 비율이 1 미만.
const dailyBonus = balance.dailyBonus ?? {};
const streakRatioEntries = Object.entries(dailyBonus.adRewardRatioByStreak ?? {});
for (const [streak, ratio] of streakRatioEntries) {
  check(ratio > 0 && ratio < 1, `dailyBonus.adRewardRatioByStreak[${streak}](${ratio})는 0 초과 1 미만이어야 합니다(광고 인센티브 보존).`);
}
// adRewardRatioMax를 먼저 (0,1)로 검증한 뒤, 그것이 유효할 때만 streak 값과의
// 일관성(모든 streak 비율 ≤ Max)을 검사한다. Max가 비정상이면 보조 검사가 항상
// 통과해 무의미해지므로 순서를 분리한다.
const adRewardRatioMaxValid = dailyBonus.adRewardRatioMax > 0 && dailyBonus.adRewardRatioMax < 1;
check(adRewardRatioMaxValid, `dailyBonus.adRewardRatioMax(${dailyBonus.adRewardRatioMax})는 0 초과 1 미만이어야 합니다.`);
if (adRewardRatioMaxValid) {
  check(
    streakRatioEntries.every(([, ratio]) => ratio <= dailyBonus.adRewardRatioMax),
    'dailyBonus.adRewardRatioByStreak의 모든 값은 adRewardRatioMax 이하여야 합니다.'
  );
}
check((dailyBonus.weeklyMilestone?.everyDays ?? 0) > 0, 'dailyBonus.weeklyMilestone.everyDays는 0보다 커야 합니다.');
// 주간 마일스톤은 설계상(balance.json agentPurpose 참조) 광고 보상의 "배수"라서
// 1 이상이 정상(현재 2)이다. 따라서 1 미만 상한은 적용하지 않고, 광고 가치를
// 무너뜨리는 비정상 폭주만 잡도록 합리적 상한(≤ 10)을 둔다.
const WEEKLY_MILESTONE_RATIO_MAX = 10;
const weeklyMilestoneRatio = dailyBonus.weeklyMilestone?.adRewardRatio ?? 0;
check(
  weeklyMilestoneRatio > 0 && weeklyMilestoneRatio <= WEEKLY_MILESTONE_RATIO_MAX,
  `dailyBonus.weeklyMilestone.adRewardRatio(${weeklyMilestoneRatio})는 0 초과 ${WEEKLY_MILESTONE_RATIO_MAX} 이하여야 합니다.`
);

// 5) 마스터리: 랭크 보너스 비감소 + 티어별 임계값 순증가.
const ranks = balance.mastery?.ranks ?? [];
for (let index = 1; index < ranks.length; index += 1) {
  check(
    ranks[index].sellBonus >= ranks[index - 1].sellBonus,
    `마스터리 sellBonus는 랭크가 오를수록 감소하면 안 됩니다: ${ranks[index - 1].key} → ${ranks[index].key}.`
  );
  check(
    ranks[index].speedBonus >= ranks[index - 1].speedBonus,
    `마스터리 speedBonus는 랭크가 오를수록 감소하면 안 됩니다: ${ranks[index - 1].key} → ${ranks[index].key}.`
  );
}
for (const [tier, thresholds] of Object.entries(balance.mastery?.thresholdsByTier ?? {})) {
  check(
    Array.isArray(thresholds) && thresholds.length === ranks.length,
    `마스터리 thresholdsByTier[${tier}]는 랭크 수(${ranks.length})와 길이가 같아야 합니다.`
  );
  for (let index = 1; index < (thresholds?.length ?? 0); index += 1) {
    check(
      thresholds[index] > thresholds[index - 1],
      `마스터리 thresholdsByTier[${tier}]는 순증가해야 합니다(인덱스 ${index}).`
    );
  }
}

// 6) 변이: 배수>1, 확률(0,1), 희귀할수록 배수↑·확률↓.
const kinds = balance.mutations?.kinds ?? [];
for (const kind of kinds) {
  check(kind.sellMultiplier > 1, `변이 ${kind.key}: sellMultiplier는 1보다 커야 합니다.`);
  check(kind.baseChance > 0 && kind.baseChance < 1, `변이 ${kind.key}: baseChance는 0 초과 1 미만이어야 합니다.`);
}
// 배열 순서에 의존하지 않고 모든 쌍에 대해 "배수↑ ⟺ 확률↓" 관계만 강제한다.
// 이렇게 하면 같은 단계의 변이가 공존하거나 변이가 추가/재정렬되어도, 더 큰
// 보상이 더 흔해지는 역전(광고/희소성 가치 붕괴)만 정확히 잡는다.
for (let i = 0; i < kinds.length; i += 1) {
  for (let j = i + 1; j < kinds.length; j += 1) {
    const a = kinds[i];
    const b = kinds[j];
    if (a.sellMultiplier === b.sellMultiplier) {
      continue;
    }
    const richer = a.sellMultiplier > b.sellMultiplier ? a : b;
    const cheaper = a.sellMultiplier > b.sellMultiplier ? b : a;
    check(
      richer.baseChance < cheaper.baseChance,
      `변이 희귀도 역전: 더 큰 배수의 ${richer.key}가 더 낮은 확률이어야 합니다(${richer.key} vs ${cheaper.key}).`
    );
  }
}

// 7) 프레스티지/체인.
const graduation = balance.regions?.graduation ?? {};
check(graduation.costBase > 0, 'regions.graduation.costBase는 0보다 커야 합니다.');
check(graduation.costGrowth > 1, 'regions.graduation.costGrowth는 1보다 커야 합니다.');
check(graduation.starsBase > 0, 'regions.graduation.starsBase는 0보다 커야 합니다.');
check((balance.regions?.scalePerLevel ?? 0) > 1, 'regions.scalePerLevel은 1보다 커야 합니다.');
const chain = balance.regions?.chain ?? {};
check(chain.incomeRatio > 0 && chain.incomeRatio <= 1, 'regions.chain.incomeRatio는 0 초과 1 이하여야 합니다.');
check(chain.offlineCapMs > 0, 'regions.chain.offlineCapMs는 0보다 커야 합니다.');

// 8) 프레스티지 스킬.
for (const skill of balance.prestigeSkills ?? []) {
  check(skill.baseCost > 0, `프레스티지 스킬 ${skill.key}: baseCost는 0보다 커야 합니다.`);
  check(skill.costGrowth >= 1, `프레스티지 스킬 ${skill.key}: costGrowth는 1 이상이어야 합니다.`);
  check(Number.isInteger(skill.maxLevel) && skill.maxLevel > 0, `프레스티지 스킬 ${skill.key}: maxLevel은 양의 정수여야 합니다.`);
  check(skill.effectPerLevel > 0, `프레스티지 스킬 ${skill.key}: effectPerLevel은 0보다 커야 합니다.`);
}

// 9) 연구 노드: 비용>0, requires는 유효 노드 키 또는 null.
const nodes = balance.research?.nodes ?? [];
const nodeKeys = new Set(nodes.map((node) => node.key));
for (const node of nodes) {
  check(node.cost > 0, `연구 노드 ${node.key}: cost는 0보다 커야 합니다.`);
  check(node.requires == null || nodeKeys.has(node.requires), `연구 노드 ${node.key}: requires "${node.requires}"가 유효한 노드가 아닙니다.`);
}
check(
  (balance.research?.donationRpRate ?? 0) > 0 && balance.research.donationRpRate < 1,
  'research.donationRpRate는 0 초과 1 미만이어야 합니다.'
);

// 10) 업적 트랙/타이틀.
const tracks = balance.achievements?.tracks ?? [];
const trackKeys = new Set(tracks.map((track) => track.key));
for (const track of tracks) {
  check(track.base > 0, `업적 트랙 ${track.key}: base는 0보다 커야 합니다.`);
  check(track.growth > 1, `업적 트랙 ${track.key}: growth는 1보다 커야 합니다.`);
  check(track.starsPerTier > 0, `업적 트랙 ${track.key}: starsPerTier는 0보다 커야 합니다.`);
}
for (const title of balance.achievements?.titles ?? []) {
  check(trackKeys.has(title.track), `타이틀 ${title.key}: track "${title.track}"이 유효한 업적 트랙이 아닙니다.`);
  check(Number.isInteger(title.tier) && title.tier > 0, `타이틀 ${title.key}: tier는 양의 정수여야 합니다.`);
}

const result = {
  status: failures.length > 0 ? 'fail' : 'pass',
  checked: passes.length + failures.length,
  failures,
};

console.log(JSON.stringify(result, null, 2));

if (failures.length > 0) {
  process.exit(1);
}
