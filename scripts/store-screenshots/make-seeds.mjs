// 스토어 스크린샷용 결정론적 세이브 시드 생성기.
// farm-core 의 createInitialState 를 기반으로 4개 장면 상태를 만든다.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// farm-core 는 TypeScript 라 Node 가 바로 못 읽는다. 저장소에 이미 있는 esbuild 로
// 한 번 번들해 불러온다. 시드를 손으로 적지 않고 createInitialState 에서 파생시켜야
// 저장 스키마가 바뀌어도 시드가 조용히 낡지 않는다.
const bundleDir = mkdtempSync(path.join(os.tmpdir(), 'farm-core-'));
const bundlePath = path.join(bundleDir, 'farm-core.mjs');
execFileSync(path.join(ROOT, 'node_modules/.bin/esbuild'), [
  path.join(ROOT, 'packages/farm-core/src/index.ts'),
  '--bundle', '--format=esm', '--platform=node', '--loader:.json=json',
  `--outfile=${bundlePath}`,
], { stdio: ['ignore', 'ignore', 'inherit'] });
const core = await import(bundlePath);
rmSync(bundleDir, { recursive: true, force: true });
const { createInitialState, getCropModifiers, CROPS, MAX_PLOTS, FARM_AREAS } = core;

const OUT_DIR = process.argv[2] ?? path.join(ROOT, 'build/store-screenshots/seeds');

// 시각에 의존하는 값은 절대 시각 대신 "지금으로부터의 오프셋(ms)"으로 적어 둔다.
// 캡처는 로케일 × 장면마다 수십 분에 걸쳐 돌기 때문에, 생성 시각을 그대로 굳히면
// 뒤쪽 캡처에서는 성장 중인 밭이 전부 익어 버린다. capture.py 가 시딩 직전에
// 이 오프셋을 그때의 현재 시각으로 환산한다.
const RELATIVE_NOW = 0;

const cropsByArea = {};
for (const [key, crop] of Object.entries(CROPS)) {
  (cropsByArea[crop.area] ??= []).push({ key, ...crop });
}
for (const list of Object.values(cropsByArea)) list.sort((a, b) => a.tier - b.tier);

const AREA_ORDER = FARM_AREAS.map((area) => area.key);

function base() {
  const state = createInitialState();
  // 진입 오버레이 억제: 데일리 보너스, 알림 권한, 졸업 가이드, 기능 코치마크.
  state.onboardingCompleted = true;
  state.onboardingStep = null;
  state.firstSeedSelected = true;
  state.harvestNotificationPromptSeen = true;
  state.prestigeGuideSeen = true;
  state.dailyBonusState = { lastClaimedAt: RELATIVE_NOW, streak: 4 };
  state.seenFeatureCoachmarks = [...(core.FEATURE_COACHMARK_KEYS ?? [])];
  state.wheelState = { ...state.wheelState, lastFreeSpinAt: RELATIVE_NOW };
  return state;
}

/** 수확 대기(state 2) 칸. startTime 은 성장 계산에 쓰이지 않아 0 으로 둔다. */
function ready(id, cropKey) {
  return { id, cropType: cropKey, startTime: 0, state: 2 };
}

// 성장 중(state 1) 칸. 표시되는 진행률은 연구·업그레이드 배수가 적용된 실효
// 성장시간 기준이라, 원본 growTime 으로 심으면 화면에서는 이미 다 익어 버린다.
// startTime 은 음수 오프셋으로 적고 capture.py 가 현재 시각으로 환산한다.
function growing(state, id, cropKey, elapsedRatio) {
  const effectiveGrowTime = CROPS[cropKey].growTime / getCropModifiers(state, cropKey, Date.now()).speedMultiplier;
  return { id, cropType: cropKey, startTime: -Math.floor(effectiveGrowTime * elapsedRatio), state: 1 };
}

function empty(id) {
  return { id, cropType: null, startTime: null, state: 0 };
}

function fillPlots(entries) {
  const plots = [];
  for (let id = 0; id < MAX_PLOTS; id += 1) {
    plots.push(entries[id] ?? empty(id));
  }
  return plots;
}

function unlockAreas(state, count) {
  state.unlockedAreas = AREA_ORDER.slice(0, count);
}

function setResearch(state, nodeLevels, points) {
  state.research = {
    ...state.research,
    points,
    totalPointsEarned: points + Object.values(nodeLevels).reduce((sum, level) => sum + level, 0) * 4,
    nodeLevels,
    unlockedNodes: Object.keys(nodeLevels),
  };
}

function discovered(state, cropKeys) {
  state.harvestedCropKeys = cropKeys;
  state.harvestCounts = Object.fromEntries(cropKeys.map((key, index) => [key, 40 + index * 17]));
}

// ── 장면 1: 초기 농장 ──────────────────────────────────────────────
// 첫 밭 6칸. 수확 대기 3칸 + 빈 칸 3칸으로 "심고 수확한다"는 핵심 루프를 보여준다.
function sceneInitial() {
  const state = base();
  state.gold = 180;
  state.unlockedPlotCount = 6;
  unlockAreas(state, 1);
  state.plots = fillPlots([ready(0, 'carrot'), ready(1, 'wheat'), ready(2, 'potato')]);
  discovered(state, ['carrot', 'wheat']);
  return state;
}

// ── 장면 2: 수확 직전 ──────────────────────────────────────────────
// 두 번째 밭까지 해금. 대부분 수확 대기라 Harvest All CTA 와 GET 배지가 가득 찬다.
function sceneHarvest() {
  const state = base();
  state.gold = 48_500;
  state.unlockedPlotCount = 12;
  unlockAreas(state, 2);
  state.upgrades = { speed: 4, profit: 5 };
  setResearch(state, { market_studies: 3, growth_studies: 2, auto_harvest: 1 }, 6);
  const readyCrops = [
    'carrot', 'wheat', 'potato', 'onion',
    'sweet_potato', 'corn', 'tomato', 'pepper',
    'mushroom', 'rice', 'corn', 'tomato',
  ];
  const entries = readyCrops.map((key, index) => ready(index, key));
  state.plots = fillPlots(entries);
  discovered(state, [...new Set(readyCrops)]);
  return state;
}

// ── 장면 4: 진행된 대형 농장 ────────────────────────────────────────
// 24칸 전부 해금하고 상위 밭까지 열린 후반 화면. 시트 장면(3)의 배경으로도 쓴다.
function sceneGrown() {
  const state = base();
  state.gold = 7_400_000_000;
  state.unlockedPlotCount = MAX_PLOTS;
  unlockAreas(state, 6);
  state.upgrades = { speed: 26, profit: 31 };
  setResearch(
    state,
    {
      market_studies: 12,
      growth_studies: 11,
      auto_harvest: 1,
      auto_replant: 1,
      craft_studies: 6,
      cooking_studies: 5,
      offline_studies: 7,
      mutation_studies: 4,
    },
    38
  );
  const readyCrops = [
    'watermelon', 'melon', 'sunflower', 'pumpkin',
    'apple', 'pear', 'peach', 'cherry',
    'mango', 'pineapple', 'coconut', 'kiwi',
  ];
  const growingCrops = [
    ['avocado', 0.62], ['cactus', 0.4], ['bamboo', 0.75], ['ginseng', 0.28],
    ['crystal_flower', 0.5], ['diamond', 0.66], ['grape', 0.45], ['blueberry', 0.8],
    ['strawberry', 0.33], ['avocado', 0.15], ['cactus', 0.85], ['bamboo', 0.52],
  ];
  const entries = readyCrops.map((key, index) => ready(index, key));
  growingCrops.forEach(([key, ratio], index) => entries.push(growing(state, 12 + index, key, ratio)));
  state.plots = fillPlots(entries);
  discovered(state, [
    ...cropsByArea.starter_field.map((c) => c.key),
    ...cropsByArea.vegetable_field.map((c) => c.key),
    ...cropsByArea.fruit_field.map((c) => c.key),
    ...cropsByArea.orchard.map((c) => c.key),
    ...cropsByArea.greenhouse.map((c) => c.key),
  ]);
  return state;
}

// 장면 3(복귀 보상 시트)은 후반 농장 상태에 "자리를 비운 시간"만 더해 만든다.
// lastSeen 이 RETURN_SUMMARY_MIN_AWAY_MS(10분)보다 오래되고 수확 대기나 오프라인
// 수익이 있으면 진입과 동시에 welcomeBack 시트가 열리므로, 탭 자동화 없이도
// 시트가 열린 화면을 캡처할 수 있다.
const AWAY_HOURS = 8;

const SCENES = {
  '1-initial': { save: sceneInitial(), lastSeenOffsetMs: 0 },
  '2-harvest': { save: sceneHarvest(), lastSeenOffsetMs: 0 },
  '3-return': { save: sceneGrown(), lastSeenOffsetMs: -AWAY_HOURS * 60 * 60 * 1000 },
  '4-grown': { save: sceneGrown(), lastSeenOffsetMs: 0 },
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, scene] of Object.entries(SCENES)) {
  writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(scene, null, 1));
  const { save } = scene;
  const readyCount = save.plots.filter((plot) => plot.state === 2).length;
  const growingCount = save.plots.filter((plot) => plot.state === 1).length;
  console.log(`${name}: gold=${save.gold} plots=${save.unlockedPlotCount} ready=${readyCount} growing=${growingCount} areas=${save.unlockedAreas.length} away=${-scene.lastSeenOffsetMs / 3600000}h`);
}
