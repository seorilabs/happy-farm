/// <reference types="jest" />

import {
  COLLECTION_AREA_REWARDS,
  COLLECTION_FULL_REWARD,
  CROPS,
  FARM_AREAS,
  claimCollectionReward,
  createInitialState,
  getAreaCropKeys,
  getClaimableCollectionRewardCount,
  getCollectionSummary,
  isCropDiscovered,
  migrateLoadedState,
} from '../constants';
import { COLLECTION_FULL_REWARD_KEY, type CropKey, type GameState } from '../types';

function allCropKeys(): CropKey[] {
  return Object.keys(CROPS) as CropKey[];
}

function getFirstArea() {
  const firstArea = FARM_AREAS[0];
  if (firstArea == null) {
    throw new Error('Collection tests require at least one area.');
  }
  return firstArea;
}

describe('crop collection', () => {
  test('initial state starts with no claimed rewards and nothing discovered', () => {
    const state = createInitialState();
    expect(state.claimedCollectionRewards).toEqual([]);

    const summary = getCollectionSummary(state);
    expect(summary.discoveredCount).toBe(0);
    expect(summary.totalCount).toBe(allCropKeys().length);
    expect(summary.claimableCount).toBe(0);
    expect(summary.allDiscovered).toBe(false);
    expect(summary.areas).toHaveLength(FARM_AREAS.length);
    expect(summary.areas.every((area) => !area.completed && !area.rewardClaimable)).toBe(true);
  });

  test('every crop belongs to exactly one area bucket', () => {
    const bucketed = FARM_AREAS.flatMap((area) => getAreaCropKeys(area.key));
    expect(bucketed.slice().sort()).toEqual(allCropKeys().slice().sort());
  });

  test('completing an area makes its reward claimable', () => {
    const firstArea = getFirstArea();
    const areaCrops = getAreaCropKeys(firstArea.key);
    const state: GameState = { ...createInitialState(), harvestedCropKeys: [...areaCrops] };

    const status = getCollectionSummary(state).areas.find((area) => area.areaKey === firstArea.key);
    expect(status?.completed).toBe(true);
    expect(status?.discoveredCount).toBe(areaCrops.length);
    expect(status?.rewardClaimable).toBe(true);
    expect(status?.reward).toBe(COLLECTION_AREA_REWARDS[firstArea.key]);
    expect(getClaimableCollectionRewardCount(state)).toBe(1);
    expect(areaCrops.every((cropKey) => isCropDiscovered(state, cropKey))).toBe(true);
  });

  test('a partially discovered area is not claimable', () => {
    const firstArea = getFirstArea();
    const areaCrops = getAreaCropKeys(firstArea.key);
    const partial = areaCrops.slice(0, Math.max(0, areaCrops.length - 1));
    const state: GameState = { ...createInitialState(), harvestedCropKeys: partial };

    expect(getCollectionSummary(state).areas.find((area) => area.areaKey === firstArea.key)?.rewardClaimable).toBe(
      false
    );
    expect(claimCollectionReward(state, firstArea.key)).toBeNull();
  });

  test('claiming an area reward grants gold once and then blocks re-claims', () => {
    const firstArea = getFirstArea();
    const areaCrops = getAreaCropKeys(firstArea.key);
    const reward = COLLECTION_AREA_REWARDS[firstArea.key];
    if (reward == null) {
      throw new Error('starter area must define a completion reward');
    }
    const state: GameState = { ...createInitialState(), gold: 100, harvestedCropKeys: [...areaCrops] };

    const result = claimCollectionReward(state, firstArea.key);
    if (result == null) {
      throw new Error('expected a claimable area reward');
    }
    expect(result.awardedGold).toBe(reward);
    expect(result.state.gold).toBe(100 + reward);
    expect(result.state.claimedCollectionRewards).toContain(firstArea.key);

    expect(claimCollectionReward(result.state, firstArea.key)).toBeNull();
    expect(getCollectionSummary(result.state).claimableCount).toBe(0);
  });

  test('full reward is claimable only after every crop is discovered', () => {
    const state: GameState = { ...createInitialState(), gold: 0, harvestedCropKeys: allCropKeys() };
    const summary = getCollectionSummary(state);

    expect(summary.allDiscovered).toBe(true);
    expect(summary.fullRewardClaimable).toBe(true);
    expect(summary.claimableCount).toBe(FARM_AREAS.length + 1);

    const result = claimCollectionReward(state, COLLECTION_FULL_REWARD_KEY);
    if (result == null) {
      throw new Error('expected a claimable full reward');
    }
    expect(result.awardedGold).toBe(COLLECTION_FULL_REWARD);
    expect(result.state.gold).toBe(COLLECTION_FULL_REWARD);
    expect(claimCollectionReward(result.state, COLLECTION_FULL_REWARD_KEY)).toBeNull();
  });

  test('migration keeps only known reward keys and dedupes them', () => {
    const base = createInitialState();
    const migrated = migrateLoadedState(
      {
        claimedCollectionRewards: ['starter_field', 'starter_field', 'ghost_area', COLLECTION_FULL_REWARD_KEY, 123],
      } as unknown as Partial<GameState>,
      base
    );

    expect(migrated.claimedCollectionRewards).toEqual(['starter_field', COLLECTION_FULL_REWARD_KEY]);
  });

  test('migration defaults missing reward list to empty', () => {
    const migrated = migrateLoadedState({}, createInitialState());
    expect(migrated.claimedCollectionRewards).toEqual([]);
  });
});
