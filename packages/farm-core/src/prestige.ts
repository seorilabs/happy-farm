import balance from './balance.json';
import type {
  ChainFarm,
  CropKey,
  GameState,
  PrestigeProgress,
  PrestigeSkillKey,
  RegionArchetypeKey,
} from './types';
// NOTE: module-level import cycle — constants.ts imports this module's
// normalizers while we import constants/modifiers here. The cycle is safe
// only because no side of it reads the other's exports during module
// initialization (all cross-module references happen inside functions called
// after init), which CJS loading (jest/metro) tolerates. Keep any new
// top-level code in these modules free of cross-module reads.
import { createEmptyPlots, createInitialState } from './constants';
import { getFarmHourlyProductivity } from './modifiers';

export type RegionArchetype = {
  key: RegionArchetypeKey;
  icon: string;
  growTimeMult: number;
  sellMult: number;
};

export type PrestigeSkill = {
  key: PrestigeSkillKey;
  icon: string;
  baseCost: number;
  costGrowth: number;
  maxLevel: number;
  effectPerLevel: number;
};

export const REGION_ARCHETYPES = balance.regions.archetypes as RegionArchetype[];
export const PRESTIGE_SKILLS = balance.prestigeSkills as PrestigeSkill[];
export const PRESTIGE_STARS_BASE = balance.regions.graduation.starsBase;
export const CHAIN_INCOME_RATIO = balance.regions.chain.incomeRatio;
export const CHAIN_OFFLINE_CAP_MS = balance.regions.chain.offlineCapMs;

const MS_PER_HOUR = 60 * 60 * 1000;
const DEFAULT_ARCHETYPE_KEY = (REGION_ARCHETYPES[0]?.key ?? 'plains') as RegionArchetypeKey;
const GRADUATION_CROP_KEYS = balance.crops
  .filter((crop) => crop.area === balance.regions.graduation.requiredAreaCollection)
  .map((crop) => crop.key) as CropKey[];

function isKnownArchetypeKey(value: unknown): value is RegionArchetypeKey {
  return typeof value === 'string' && REGION_ARCHETYPES.some((archetype) => archetype.key === value);
}

function isKnownSkillKey(value: unknown): value is PrestigeSkillKey {
  return typeof value === 'string' && PRESTIGE_SKILLS.some((skill) => skill.key === value);
}

export function getKnownSkill(skillKey: PrestigeSkillKey): PrestigeSkill {
  const skill = PRESTIGE_SKILLS.find((candidate) => candidate.key === skillKey);
  if (skill == null) {
    throw new Error(`Unknown prestige skill: ${skillKey}`);
  }
  return skill;
}

export function getRegionArchetype(archetypeKey: RegionArchetypeKey): RegionArchetype {
  const archetype = REGION_ARCHETYPES.find((candidate) => candidate.key === archetypeKey);
  if (archetype == null) {
    throw new Error(`Unknown region archetype: ${archetypeKey}`);
  }
  return archetype;
}

export function getSkillLevel(gameState: GameState, skillKey: PrestigeSkillKey): number {
  return gameState.prestige.skills[skillKey] ?? 0;
}

export function getSkillEffect(gameState: GameState, skillKey: PrestigeSkillKey): number {
  return getSkillLevel(gameState, skillKey) * getKnownSkill(skillKey).effectPerLevel;
}

// Star price of the next level, or null when the skill is maxed out.
export function getSkillCost(gameState: GameState, skillKey: PrestigeSkillKey): number | null {
  const skill = getKnownSkill(skillKey);
  const level = getSkillLevel(gameState, skillKey);
  if (level >= skill.maxLevel) {
    return null;
  }
  return Math.floor(skill.baseCost * Math.pow(skill.costGrowth, level));
}

export function buySkill(gameState: GameState, skillKey: PrestigeSkillKey): GameState | null {
  const cost = getSkillCost(gameState, skillKey);
  if (cost == null || gameState.prestige.stars < cost) {
    return null;
  }
  return {
    ...gameState,
    prestige: {
      ...gameState.prestige,
      stars: gameState.prestige.stars - cost,
      skills: {
        ...gameState.prestige.skills,
        [skillKey]: getSkillLevel(gameState, skillKey) + 1,
      },
    },
  };
}

export function getPrestigeCost(level: number): number {
  return Math.floor(balance.regions.graduation.costBase * Math.pow(balance.regions.graduation.costGrowth, level));
}

export function getPrestigeStarsAward(level: number): number {
  return PRESTIGE_STARS_BASE + level;
}

export type PrestigeCheck = {
  allowed: boolean;
  collectionComplete: boolean;
  goldSufficient: boolean;
  cost: number;
};

export function canPrestige(gameState: GameState): PrestigeCheck {
  const cost = getPrestigeCost(gameState.prestige.level);
  const collectionComplete =
    GRADUATION_CROP_KEYS.length > 0 &&
    GRADUATION_CROP_KEYS.every((cropKey) => gameState.harvestedCropKeys.includes(cropKey));
  const goldSufficient = gameState.gold >= cost;
  return {
    allowed: collectionComplete && goldSufficient,
    collectionComplete,
    goldSufficient,
    cost,
  };
}

export type PrestigePreview = {
  // Base income persisted on the new chain-farm snapshot. The chain_yield
  // prestige skill is applied later by getChainIncome when gold is collected.
  baseChainGoldPerHour: number;
  // Income rate shown on the chain map and used by getChainIncome after the
  // current chain_yield prestige-skill multiplier is applied.
  effectiveChainGoldPerHour: number;
  // Exact purse balance the next active farm starts with after graduation.
  startingGold: number;
};

function getPrestigeStartingGold(gameState: GameState): number {
  return createInitialState().gold + getSkillEffect(gameState, 'starting_capital');
}

function getChainYieldMultiplier(gameState: GameState): number {
  return 1 + getSkillEffect(gameState, 'chain_yield');
}

// Computes the two economic outcomes shown before graduation. prestigeFarm
// consumes this same preview so the confirmation sheet cannot drift from the
// persisted chain-farm value when balance or modifier formulas change.
export function getPrestigePreview(gameState: GameState, now = Date.now()): PrestigePreview {
  const productivity = getFarmHourlyProductivity(gameState, now);
  const baseChainGoldPerHour = Math.max(0, Math.floor(productivity.netProfitPerHour * CHAIN_INCOME_RATIO));
  return {
    baseChainGoldPerHour,
    effectiveChainGoldPerHour: Math.floor(baseChainGoldPerHour * getChainYieldMultiplier(gameState)),
    startingGold: getPrestigeStartingGold(gameState),
  };
}

// Resets exactly the farm layer (FARM_LAYER_KEYS); every meta-layer field is
// carried over untouched.
export function createPrestigedState(gameState: GameState): GameState {
  const fresh = createInitialState();
  return {
    ...gameState,
    gold: getPrestigeStartingGold(gameState),
    // #427: createInitialState는 이제 신규 온보딩용 자동 파종 carrot을 담지만,
    // 프레스티지 리셋은 빈 밭에서 다시 시작해야 한다(스타터 작물 무상 지급 방지).
    plots: createEmptyPlots(),
    unlockedPlotCount: fresh.unlockedPlotCount,
    unlockedAreas: fresh.unlockedAreas,
    upgrades: fresh.upgrades,
  };
}

export type PrestigeResult = {
  state: GameState;
  starsAwarded: number;
  chainFarm: ChainFarm;
};

export function prestigeFarm(
  gameState: GameState,
  nextArchetypeKey: RegionArchetypeKey,
  now = Date.now(),
  productivitySnapshotAt = now
): PrestigeResult | null {
  if (!canPrestige(gameState).allowed || !isKnownArchetypeKey(nextArchetypeKey)) {
    return null;
  }

  // Snapshot the farm being left behind, with all current modifiers applied.
  const preview = getPrestigePreview(gameState, productivitySnapshotAt);
  const chainFarm: ChainFarm = {
    id: gameState.prestige.level,
    archetype: gameState.prestige.currentRegionArchetype,
    goldPerHour: preview.baseChainGoldPerHour,
    lastCollectedAt: now,
  };
  const starsAwarded = getPrestigeStarsAward(gameState.prestige.level);

  const nextState: GameState = {
    ...createPrestigedState(gameState),
    chainFarms: [...gameState.chainFarms, chainFarm],
    prestige: {
      ...gameState.prestige,
      level: gameState.prestige.level + 1,
      stars: gameState.prestige.stars + starsAwarded,
      totalStarsEarned: gameState.prestige.totalStarsEarned + starsAwarded,
      currentRegionArchetype: nextArchetypeKey,
    },
    lifetimeStats: {
      ...gameState.lifetimeStats,
      prestigeCount: gameState.lifetimeStats.prestigeCount + 1,
    },
  };

  return { state: nextState, starsAwarded, chainFarm };
}

export function getOfflineCapMs(gameState: GameState): number {
  return CHAIN_OFFLINE_CAP_MS + getSkillEffect(gameState, 'offline_cap');
}

export type ChainIncomeStatus = {
  totalGoldPerHour: number;
  accruedGold: number;
  capMs: number;
};

export function getChainIncome(gameState: GameState, now = Date.now()): ChainIncomeStatus {
  const capMs = getOfflineCapMs(gameState);
  const yieldMultiplier = getChainYieldMultiplier(gameState);
  let totalGoldPerHour = 0;
  let accruedGold = 0;

  for (const farm of gameState.chainFarms) {
    const hourly = farm.goldPerHour * yieldMultiplier;
    totalGoldPerHour += hourly;
    const elapsedMs = Math.min(Math.max(0, now - farm.lastCollectedAt), capMs);
    accruedGold += Math.floor((hourly * elapsedMs) / MS_PER_HOUR);
  }

  return {
    totalGoldPerHour: Math.floor(totalGoldPerHour),
    accruedGold,
    capMs,
  };
}

export function collectChainIncome(
  gameState: GameState,
  now = Date.now()
): { state: GameState; collectedGold: number } | null {
  const { accruedGold } = getChainIncome(gameState, now);
  if (accruedGold <= 0) {
    return null;
  }

  return {
    state: {
      ...gameState,
      gold: gameState.gold + accruedGold,
      chainFarms: gameState.chainFarms.map((farm) => ({ ...farm, lastCollectedAt: now })),
      lifetimeStats: {
        ...gameState.lifetimeStats,
        totalGoldEarned: gameState.lifetimeStats.totalGoldEarned + accruedGold,
      },
    },
    collectedGold: accruedGold,
  };
}

export function createInitialPrestigeProgress(): PrestigeProgress {
  return {
    level: 0,
    stars: 0,
    totalStarsEarned: 0,
    skills: {},
    currentRegionArchetype: DEFAULT_ARCHETYPE_KEY,
  };
}

function normalizeCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

export function normalizePrestigeProgress(value: unknown): PrestigeProgress {
  const loaded = (typeof value === 'object' && value != null ? value : {}) as Partial<PrestigeProgress>;
  const stars = normalizeCount(loaded.stars);

  const skills: PrestigeProgress['skills'] = {};
  if (typeof loaded.skills === 'object' && loaded.skills != null) {
    for (const [skillKey, rawLevel] of Object.entries(loaded.skills)) {
      if (!isKnownSkillKey(skillKey)) continue;
      const level = Math.min(normalizeCount(rawLevel), getKnownSkill(skillKey).maxLevel);
      if (level > 0) {
        skills[skillKey] = level;
      }
    }
  }

  return {
    level: normalizeCount(loaded.level),
    stars,
    // Total earned can never trail the currently held amount.
    totalStarsEarned: Math.max(stars, normalizeCount(loaded.totalStarsEarned)),
    skills,
    currentRegionArchetype: isKnownArchetypeKey(loaded.currentRegionArchetype)
      ? loaded.currentRegionArchetype
      : DEFAULT_ARCHETYPE_KEY,
  };
}

export function normalizeChainFarms(value: unknown, now = Date.now()): ChainFarm[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is Partial<ChainFarm> => typeof entry === 'object' && entry != null)
    .map((entry, index) => ({
      id: normalizeCount(entry.id ?? index),
      archetype: isKnownArchetypeKey(entry.archetype) ? entry.archetype : DEFAULT_ARCHETYPE_KEY,
      goldPerHour: normalizeCount(entry.goldPerHour),
      // Clamp future timestamps so a rolled-back clock can't bank extra time.
      lastCollectedAt:
        typeof entry.lastCollectedAt === 'number' && Number.isFinite(entry.lastCollectedAt)
          ? Math.min(entry.lastCollectedAt, now)
          : now,
    }));
}
