/// <reference types="jest" />

import {
  BREEDING_RECIPES,
  DONATION_AMPLIFIER_BONUS,
  DONATION_RP_RATE,
  RESEARCH_NODES,
  breedCrop,
  canUnlockNode,
  getBreedingRecipeStatus,
  getDonationRp,
  isCropPlantable,
  isHybridCrop,
  normalizeAutomationSettings,
  normalizeResearchState,
  unlockNode,
  getResearchOpportunityKeys,
  hasUnseenResearchOpportunity,
  acknowledgeResearchOpportunities,
} from '../research';
import {
  CROPS,
  INITIAL_AREA_KEYS,
  canUnlockArea,
  createInitialState,
  getCollectionSummary,
  claimCollectionReward,
  migrateLoadedState,
} from '../constants';
import { performHarvest, runAutomationTick } from '../harvest';
import { COLLECTION_FULL_REWARD_KEY, type CropKey, type GameState } from '../types';

function getRecipe(cropKey: string) {
  const recipe = BREEDING_RECIPES.find((candidate) => candidate.crop === cropKey);
  if (recipe == null) {
    throw new Error(`Breeding balance must include the ${cropKey} recipe.`);
  }
  return recipe;
}

describe('breeding balance invariants', () => {
  test('every recipe references known crops and a hybrid result', () => {
    for (const recipe of BREEDING_RECIPES) {
      expect(CROPS[recipe.crop]).toBeDefined();
      expect(isHybridCrop(recipe.crop)).toBe(true);
      expect(recipe.parents).toHaveLength(2);
      for (const parent of recipe.parents) {
        expect(CROPS[parent]).toBeDefined();
        expect(isHybridCrop(parent)).toBe(false);
      }
      expect(recipe.rpCost).toBeGreaterThan(0);
    }
  });

  test('hybrid stats follow the breeding formula from their parents', () => {
    for (const recipe of BREEDING_RECIPES) {
      const hybrid = CROPS[recipe.crop]!;
      const [firstParent, secondParent] = recipe.parents.map((parent) => CROPS[parent]!);
      const costSum = firstParent!.cost + secondParent!.cost;
      const sellSum = firstParent!.sell + secondParent!.sell;

      expect(hybrid.cost).toBe(Math.floor(costSum * 1.5));
      expect(hybrid.sell).toBe(Math.round(sellSum * 1.8));
      expect(hybrid.growTime).toBe(Math.round(Math.max(firstParent!.growTime, secondParent!.growTime) * 0.8));
      expect(hybrid.tier).toBe(10);
    }
  });
});

describe('research nodes', () => {
  function stateWithRp(points: number): GameState {
    const base = createInitialState();
    return { ...base, research: { ...base.research, points } };
  }

  test('node costs and prerequisites gate unlocks', () => {
    const autoHarvest = RESEARCH_NODES.find((node) => node.key === 'auto_harvest')!;
    const poor = stateWithRp(autoHarvest.cost - 1);
    expect(canUnlockNode(poor, 'auto_harvest')).toBe(false);

    const rich = stateWithRp(autoHarvest.cost);
    expect(canUnlockNode(rich, 'auto_harvest')).toBe(true);
    expect(canUnlockNode(rich, 'auto_replant')).toBe(false);

    const unlocked = unlockNode(rich, 'auto_harvest');
    expect(unlocked).not.toBeNull();
    expect(unlocked!.research.points).toBe(0);
    expect(unlocked!.research.unlockedNodes).toEqual(['auto_harvest']);
    expect(unlockNode(unlocked!, 'auto_harvest')).toBeNull();
  });

  test('donation RP follows the rate and the amplifier node', () => {
    const base = createInitialState();
    expect(getDonationRp(base, 1000)).toBe(Math.floor(1000 * DONATION_RP_RATE));
    expect(getDonationRp(base, 1)).toBe(1);

    const amplified: GameState = {
      ...base,
      research: { ...base.research, unlockedNodes: ['donation_amplifier'] },
    };
    expect(getDonationRp(amplified, 1000)).toBe(Math.floor(1000 * DONATION_RP_RATE * (1 + DONATION_AMPLIFIER_BONUS)));
  });

  test('donation mode converts harvests into RP through the shared pipeline', () => {
    const base = createInitialState();
    const ready: GameState = {
      ...base,
      automationSettings: { ...base.automationSettings, donationModeEnabled: true },
      plots: base.plots.map((plot, index) =>
        index === 0 ? { ...plot, cropType: 'carrot' as const, startTime: 0, state: 2 as const } : plot
      ),
    };

    const outcome = performHarvest(ready, 0, { now: 1000, rng: () => 0.999 });
    expect(outcome!.donated).toBe(true);
    expect(outcome!.goldGained).toBe(0);
    expect(outcome!.rpGained).toBeGreaterThanOrEqual(1);
    expect(outcome!.state.gold).toBe(base.gold);
    expect(outcome!.state.research.points).toBe(outcome!.rpGained);
    expect(outcome!.state.lifetimeStats.researchPointsEarned).toBe(outcome!.rpGained);
  });
});

describe('breeding', () => {
  function breedableState(cropKey: CropKey): GameState {
    const base = createInitialState();
    const recipe = getRecipe(cropKey);
    return {
      ...base,
      harvestedCropKeys: [...recipe.parents],
      research: {
        ...base.research,
        points: recipe.rpCost,
        unlockedNodes: recipe.advanced ? ['breeding_lab', 'breeding_advanced'] : ['breeding_lab'],
      },
    };
  }

  test('breeding requires the node, discovered parents, and RP', () => {
    const recipe = getRecipe('crystalberry');
    const ready = breedableState('crystalberry');
    expect(getBreedingRecipeStatus(ready, recipe).breedable).toBe(true);

    const noNode: GameState = { ...ready, research: { ...ready.research, unlockedNodes: [] } };
    expect(getBreedingRecipeStatus(noNode, recipe).breedable).toBe(false);

    const noParents: GameState = { ...ready, harvestedCropKeys: [] };
    expect(getBreedingRecipeStatus(noParents, recipe).breedable).toBe(false);

    const noRp: GameState = { ...ready, research: { ...ready.research, points: recipe.rpCost - 1 } };
    expect(getBreedingRecipeStatus(noRp, recipe).breedable).toBe(false);
  });

  test('advanced recipes need the advanced node', () => {
    const advancedRecipe = BREEDING_RECIPES.find((recipe) => recipe.advanced)!;
    const ready = breedableState(advancedRecipe.crop);
    expect(getBreedingRecipeStatus(ready, advancedRecipe).breedable).toBe(true);

    const basicOnly: GameState = {
      ...ready,
      research: { ...ready.research, unlockedNodes: ['breeding_lab'] },
    };
    expect(getBreedingRecipeStatus(basicOnly, advancedRecipe).breedable).toBe(false);
  });

  test('breedCrop unlocks the crop for planting and feeds lifetime stats', () => {
    const ready = breedableState('crystalberry');
    expect(isCropPlantable(ready, 'crystalberry')).toBe(false);

    const bred = breedCrop(ready, 'crystalberry');
    expect(bred).not.toBeNull();
    expect(bred!.research.points).toBe(0);
    expect(bred!.research.unlockedBreeds).toEqual(['crystalberry']);
    expect(bred!.lifetimeStats.breedsUnlocked).toBe(1);
    expect(isCropPlantable(bred!, 'crystalberry')).toBe(true);

    expect(breedCrop(bred!, 'crystalberry')).toBeNull();
  });

  test('regular crops are always plantable once their area opens', () => {
    expect(isCropPlantable(createInitialState(), 'carrot')).toBe(true);
  });
});

describe('automation tick', () => {
  function readyState(): GameState {
    const base = createInitialState();
    return {
      ...base,
      plots: base.plots.map((plot, index) =>
        index < 2 ? { ...plot, cropType: 'carrot' as const, startTime: 0, state: 2 as const } : plot
      ),
    };
  }

  test('does nothing without the node or the toggle', () => {
    const noNode: GameState = {
      ...readyState(),
      automationSettings: { autoHarvestEnabled: true, autoReplantEnabled: false, donationModeEnabled: false },
    };
    expect(runAutomationTick(noNode, { now: 1000, rng: () => 0.999 }).harvestedCount).toBe(0);

    const noToggle: GameState = {
      ...readyState(),
      research: { ...readyState().research, unlockedNodes: ['auto_harvest'] },
    };
    expect(runAutomationTick(noToggle, { now: 1000, rng: () => 0.999 }).harvestedCount).toBe(0);
  });

  test('harvests every ready plot and replants the same crop', () => {
    const base = readyState();
    const state: GameState = {
      ...base,
      research: { ...base.research, unlockedNodes: ['auto_harvest', 'auto_replant'] },
      automationSettings: { autoHarvestEnabled: true, autoReplantEnabled: true, donationModeEnabled: false },
    };

    const result = runAutomationTick(state, { now: 1000, rng: () => 0.999 });
    const carrot = CROPS.carrot!;

    expect(result.harvestedCount).toBe(2);
    expect(result.replantedCount).toBe(2);
    expect(result.goldGained).toBe(carrot.sell * 2);
    expect(result.state.gold).toBe(state.gold + carrot.sell * 2 - carrot.cost * 2);
    expect(result.state.plots[0]!.state).toBe(1);
    expect(result.state.plots[0]!.cropType).toBe('carrot');
    expect(result.state.lifetimeStats.totalHarvests).toBe(2);
  });

  test('skips replanting when gold runs out but keeps harvesting', () => {
    const base = readyState();
    const state: GameState = {
      ...base,
      gold: 0,
      automationSettings: { autoHarvestEnabled: true, autoReplantEnabled: true, donationModeEnabled: true },
      research: { ...base.research, unlockedNodes: ['auto_harvest', 'auto_replant'] },
    };

    // Donation mode yields RP, not gold, so replanting stays unaffordable.
    const result = runAutomationTick(state, { now: 1000, rng: () => 0.999 });
    expect(result.harvestedCount).toBe(2);
    expect(result.replantedCount).toBe(0);
    expect(result.rpGained).toBeGreaterThanOrEqual(2);
    expect(result.state.plots[0]!.state).toBe(0);
  });
});

describe('gated areas', () => {
  test('the hybrid greenhouse never counts as initially unlocked', () => {
    expect(INITIAL_AREA_KEYS).not.toContain('hybrid_greenhouse');
    expect(createInitialState().unlockedAreas).not.toContain('hybrid_greenhouse');
  });

  test('gated areas require their research node on top of normal conditions', () => {
    const base = createInitialState();
    const qualified: GameState = {
      ...base,
      gold: Number.MAX_SAFE_INTEGER,
      harvestedCropKeys: (Object.keys(CROPS) as CropKey[]).slice(0, 30),
      upgrades: { speed: 50, profit: 50 },
    };
    expect(canUnlockArea(qualified, 'hybrid_greenhouse')).toBe(false);

    const researched: GameState = {
      ...qualified,
      research: { ...qualified.research, unlockedNodes: ['breeding_lab'] },
    };
    expect(canUnlockArea(researched, 'hybrid_greenhouse')).toBe(true);
  });

  test('migration revokes a gated area when its research node is missing', () => {
    const migrated = migrateLoadedState(
      { unlockedAreas: ['starter_field', 'hybrid_greenhouse'] },
      createInitialState()
    );
    expect(migrated.unlockedAreas).toEqual(['starter_field']);

    const kept = migrateLoadedState(
      {
        unlockedAreas: ['starter_field', 'hybrid_greenhouse'],
        research: {
          points: 0,
          totalPointsEarned: 0,
          unlockedNodes: ['breeding_lab'],
          unlockedBreeds: [],
          acknowledgedOpportunities: [],
        },
      },
      createInitialState()
    );
    expect(kept.unlockedAreas).toContain('hybrid_greenhouse');
  });
});

describe('collection with hybrid crops', () => {
  test('adding hybrid crops never re-opens an already claimed full reward', () => {
    // A player who finished the original collection and claimed 'all' must not
    // be able to claim it again after the crop list grew.
    const legacyCropKeys = (Object.keys(CROPS) as CropKey[]).filter((cropKey) => CROPS[cropKey]!.tier < 10);
    const state: GameState = {
      ...createInitialState(),
      harvestedCropKeys: legacyCropKeys,
      claimedCollectionRewards: [COLLECTION_FULL_REWARD_KEY],
    };

    const summary = getCollectionSummary(state);
    expect(summary.allDiscovered).toBe(false);
    expect(summary.fullRewardClaimed).toBe(true);
    expect(summary.fullRewardClaimable).toBe(false);
    expect(claimCollectionReward(state, COLLECTION_FULL_REWARD_KEY)).toBeNull();
  });
});

describe('research save migration', () => {
  test('normalizes research state and drops unreachable nodes', () => {
    expect(normalizeResearchState(undefined)).toEqual({
      points: 0,
      totalPointsEarned: 0,
      unlockedNodes: [],
      unlockedBreeds: [],
      acknowledgedOpportunities: [],
    });

    const normalized = normalizeResearchState({
      points: 120.9,
      totalPointsEarned: 7,
      unlockedNodes: ['auto_replant', 'breeding_lab', 'ghost_node', 'breeding_lab'],
      unlockedBreeds: ['crystalberry', 'carrot', 'ghost_crop'],
    });

    // auto_replant requires auto_harvest, so it cannot survive on its own.
    expect(normalized.unlockedNodes).toEqual(['breeding_lab']);
    expect(normalized.unlockedBreeds).toEqual(['crystalberry']);
    expect(normalized.points).toBe(120);
    expect(normalized.totalPointsEarned).toBe(120);
  });

  test('normalizes automation settings to strict booleans', () => {
    expect(normalizeAutomationSettings(undefined)).toEqual({
      autoHarvestEnabled: false,
      autoReplantEnabled: false,
      donationModeEnabled: false,
    });
    expect(
      normalizeAutomationSettings({ autoHarvestEnabled: 1, autoReplantEnabled: true, donationModeEnabled: 'yes' })
    ).toEqual({ autoHarvestEnabled: false, autoReplantEnabled: true, donationModeEnabled: false });
  });

  test('migration is idempotent for research fields', () => {
    const once = migrateLoadedState(
      {
        research: {
          points: 50,
          totalPointsEarned: 80,
          unlockedNodes: ['breeding_lab'],
          unlockedBreeds: [],
          acknowledgedOpportunities: [],
        },
        automationSettings: { autoHarvestEnabled: true, autoReplantEnabled: false, donationModeEnabled: true },
      },
      createInitialState()
    );
    const twice = migrateLoadedState(once, createInitialState());

    expect(twice.research).toEqual(once.research);
    expect(twice.automationSettings).toEqual(once.automationSettings);
  });
});

describe('연구실 진입 유도 배지(발견 기회)', () => {
  test('RP가 없으면 기회가 없고, 충분하면 해금 가능 노드가 기회로 잡힌다', () => {
    const base = createInitialState();
    expect(getResearchOpportunityKeys(base)).toEqual([]);
    expect(hasUnseenResearchOpportunity(base)).toBe(false);

    const rich: GameState = { ...base, research: { ...base.research, points: 1_000_000 } };
    const keys = getResearchOpportunityKeys(rich);
    expect(keys.length).toBeGreaterThan(0);
    // 모든 기회 키는 node:/breed: 접두사를 가진다.
    expect(keys.every((key) => key.startsWith('node:') || key.startsWith('breed:'))).toBe(true);
    expect(hasUnseenResearchOpportunity(rich)).toBe(true);
  });

  test('확인(acknowledge) 후에는 같은 기회로 배지가 다시 뜨지 않는다', () => {
    const base = createInitialState();
    const rich: GameState = { ...base, research: { ...base.research, points: 1_000_000 } };

    const acked = acknowledgeResearchOpportunities(rich);
    expect(acked.research.acknowledgedOpportunities).toEqual(getResearchOpportunityKeys(rich));
    expect(hasUnseenResearchOpportunity(acked)).toBe(false);
  });

  test('확인 목록에 없는 기회가 하나라도 있으면 배지가 뜬다', () => {
    const base = createInitialState();
    const rich: GameState = { ...base, research: { ...base.research, points: 1_000_000 } };
    const keys = getResearchOpportunityKeys(rich);
    expect(keys.length).toBeGreaterThan(1);

    // 일부만 확인된 상태 → 나머지 기회 때문에 배지 노출.
    const partial: GameState = { ...rich, research: { ...rich.research, acknowledgedOpportunities: [keys[0]!] } };
    expect(hasUnseenResearchOpportunity(partial)).toBe(true);

    // 전부 확인 → 배지 해제.
    const full: GameState = { ...rich, research: { ...rich.research, acknowledgedOpportunities: keys } };
    expect(hasUnseenResearchOpportunity(full)).toBe(false);
  });

  test('해금으로 새 선행 충족 노드가 드러나면 다시 미확인 기회가 된다', () => {
    // 선행이 루트 노드(선행 없음)인 종속 노드를 찾아 시뮬레이션.
    const dependent = RESEARCH_NODES.find(
      (node) => node.requires != null && RESEARCH_NODES.find((r) => r.key === node.requires)?.requires == null
    );
    if (dependent == null) {
      return; // 트리에 해당 형태가 없으면 스킵(밸런스 의존).
    }
    const base = createInitialState();
    const rich: GameState = { ...base, research: { ...base.research, points: 1_000_000 } };
    const acked = acknowledgeResearchOpportunities(rich);
    expect(hasUnseenResearchOpportunity(acked)).toBe(false);

    // 선행 노드 해금 → 종속 노드가 새 기회로 등장(확인 목록에 없음).
    const afterUnlock = unlockNode(acked, dependent.requires!);
    expect(afterUnlock).not.toBeNull();
    expect(getResearchOpportunityKeys(afterUnlock!)).toContain(`node:${dependent.key}`);
    expect(hasUnseenResearchOpportunity(afterUnlock!)).toBe(true);
  });

  test('변화가 없으면 동일 참조를 반환해 불필요한 세이브를 피한다', () => {
    const base = createInitialState();
    expect(acknowledgeResearchOpportunities(base)).toBe(base);
  });

  test('normalizeResearchState는 acknowledgedOpportunities를 기본값[]로 채우고 무효 키를 버린다', () => {
    expect(normalizeResearchState({}).acknowledgedOpportunities).toEqual([]);

    const validKey = `node:${RESEARCH_NODES[0]!.key}`;
    const normalized = normalizeResearchState({
      points: 0,
      totalPointsEarned: 0,
      unlockedNodes: [],
      unlockedBreeds: [],
      acknowledgedOpportunities: ['node:bogus', 'breed:bogus', 'garbage', 123, validKey, validKey],
    });
    // 잘 알려진 키만, 중복 제거되어 남는다.
    expect(normalized.acknowledgedOpportunities).toEqual([validKey]);
  });
});
