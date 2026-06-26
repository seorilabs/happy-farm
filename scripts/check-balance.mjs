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

// 2) 구역 해금 곡선: 메인 진행 구역(gate 없는 구역)의 해금 비용/요구치는 단조 증가/비감소.
const areas = Array.isArray(balance.areas) ? balance.areas : [];
check(areas.length > 0, 'areas는 비어 있을 수 없습니다.');
const areaKeys = new Set(areas.map((area) => area.key));
const sequentialAreas = areas.filter((area) => area.unlock?.gate == null);
for (let index = 1; index < sequentialAreas.length; index += 1) {
  const prev = sequentialAreas[index - 1];
  const curr = sequentialAreas[index];
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

// 3) 작물: 양수 값 + 양의 마진(sell > cost) + 합리적 ROI 밴드 + 유효 구역/티어 참조.
const crops = Array.isArray(balance.crops) ? balance.crops : [];
check(crops.length > 0, 'crops는 비어 있을 수 없습니다.');
const MIN_ROI = 1.1;
const MAX_ROI = 10;
for (const crop of crops) {
  const label = crop?.key ?? '(이름 없음)';
  check(crop.cost > 0 && crop.sell > 0 && crop.growTime > 0, `작물 ${label}: cost/sell/growTime은 모두 0보다 커야 합니다.`);
  check(crop.sell > crop.cost, `작물 ${label}: 판매가(${crop.sell})는 씨앗 비용(${crop.cost})보다 커야 합니다(양의 마진).`);
  const roi = crop.sell / crop.cost;
  check(roi >= MIN_ROI && roi <= MAX_ROI, `작물 ${label}: ROI(${roi.toFixed(2)})가 허용 범위[${MIN_ROI}, ${MAX_ROI}]를 벗어났습니다.`);
  check(Number.isInteger(crop.tier) && crop.tier >= 1 && crop.tier <= 10, `작물 ${label}: tier는 1~10의 정수여야 합니다.`);
  check(areaKeys.has(crop.area), `작물 ${label}: area "${crop.area}"가 정의된 구역이 아닙니다.`);
}

// 4) 데일리 보너스: 광고 인센티브 보존을 위해 모든 ad-reward 비율이 1 미만.
const dailyBonus = balance.dailyBonus ?? {};
const ratioByStreak = Object.values(dailyBonus.adRewardRatioByStreak ?? {});
for (const [streak, ratio] of Object.entries(dailyBonus.adRewardRatioByStreak ?? {})) {
  check(ratio > 0 && ratio < 1, `dailyBonus.adRewardRatioByStreak[${streak}](${ratio})는 0 초과 1 미만이어야 합니다(광고 인센티브 보존).`);
}
check(
  dailyBonus.adRewardRatioMax > 0 && dailyBonus.adRewardRatioMax < 1,
  `dailyBonus.adRewardRatioMax(${dailyBonus.adRewardRatioMax})는 0 초과 1 미만이어야 합니다.`
);
check(
  ratioByStreak.every((ratio) => ratio <= dailyBonus.adRewardRatioMax),
  'dailyBonus.adRewardRatioByStreak의 모든 값은 adRewardRatioMax 이하여야 합니다.'
);
check((dailyBonus.weeklyMilestone?.everyDays ?? 0) > 0, 'dailyBonus.weeklyMilestone.everyDays는 0보다 커야 합니다.');
check((dailyBonus.weeklyMilestone?.adRewardRatio ?? 0) > 0, 'dailyBonus.weeklyMilestone.adRewardRatio는 0보다 커야 합니다.');

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
for (let index = 1; index < kinds.length; index += 1) {
  check(
    kinds[index].sellMultiplier > kinds[index - 1].sellMultiplier &&
      kinds[index].baseChance < kinds[index - 1].baseChance,
    `변이는 뒤로 갈수록 더 희귀(배수↑·확률↓)해야 합니다: ${kinds[index - 1].key} → ${kinds[index].key}.`
  );
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
