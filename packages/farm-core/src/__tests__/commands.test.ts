/// <reference types="jest" />

import { CROPS, createEmptyPlots, createInitialState as createBaseInitialState } from '../constants';
import { executeFarmGameCommand } from '../commands';
import { getCropPurchaseCost } from '../modifiers';
import type { CropKey, GameState } from '../types';

// #427: createInitialState는 이제 첫 밭에 스타터 carrot을 자동 파종한다. 이 파일의
// 명령 테스트는 "빈 농장"을 전제로 하므로, 로컬에서 밭을 비운 초기 상태로 감싼다.
const createInitialState = (): GameState => ({ ...createBaseInitialState(), plots: createEmptyPlots() });

function getStarterCropKey(state = createInitialState()): CropKey {
  const starterArea = state.unlockedAreas[0];
  const cropKey = Object.keys(CROPS).find((key) => CROPS[key as CropKey]?.area === starterArea) as
    | CropKey
    | undefined;
  if (cropKey == null) {
    throw new Error('Command tests require a starter crop.');
  }
  return cropKey;
}

function getLockedAreaCropKey(state: GameState): CropKey {
  const cropKey = Object.keys(CROPS).find((key) => {
    const crop = CROPS[key as CropKey];
    return crop != null && !state.unlockedAreas.includes(crop.area);
  }) as CropKey | undefined;
  if (cropKey == null) {
    throw new Error('Command tests require a crop from a locked area.');
  }
  return cropKey;
}

describe('farm game commands', () => {
  test('plantCrop applies state and emits a platform-neutral event', () => {
    const now = 10_000;
    const cropKey = getStarterCropKey();
    const state = { ...createInitialState(), gold: 100 };
    const cost = getCropPurchaseCost(state, cropKey, now);

    const result = executeFarmGameCommand(state, { type: 'plantCrop', plotIndex: 0, cropKey }, { now, rng: () => 1 });

    expect(result.status).toBe('applied');
    if (result.status !== 'applied') {
      throw new Error('expected plant command to apply');
    }
    expect(result.state.gold).toBe(100 - cost);
    expect(result.state.plots[0]).toMatchObject({ cropType: cropKey, startTime: now, state: 1 });
    expect(result.events).toEqual([
      {
        type: 'cropPlanted',
        plotIndex: 0,
        cropKey,
        areaKey: CROPS[cropKey]!.area,
        cropTier: CROPS[cropKey]!.tier,
        cost,
      },
    ]);
  });

  test('plantCrop reports domain block reasons without changing state', () => {
    const state = createInitialState();
    const cropKey = getStarterCropKey();
    const lockedCropKey = getLockedAreaCropKey(state);

    const noGold = executeFarmGameCommand(
      { ...state, gold: 0 },
      { type: 'plantCrop', plotIndex: 0, cropKey },
      { now: 10_000, rng: () => 1 }
    );
    expect(noGold).toEqual({ status: 'blocked', reason: 'insufficientGold', events: [] });

    const lockedArea = executeFarmGameCommand(
      state,
      { type: 'plantCrop', plotIndex: 0, cropKey: lockedCropKey },
      { now: 10_000, rng: () => 1 }
    );
    expect(lockedArea).toEqual({ status: 'blocked', reason: 'areaLocked', events: [] });

    const lockedPlot = executeFarmGameCommand(
      state,
      { type: 'plantCrop', plotIndex: state.unlockedPlotCount, cropKey },
      { now: 10_000, rng: () => 1 }
    );
    expect(lockedPlot).toEqual({ status: 'blocked', reason: 'plotUnavailable', events: [] });
  });

  test('harvestCrop applies state and emits outcome details for adapters', () => {
    const cropKey = getStarterCropKey();
    const state: GameState = {
      ...createInitialState(),
      plots: createInitialState().plots.map((plot, index) =>
        index === 0 ? { ...plot, cropType: cropKey, startTime: 0, state: 2 as const } : plot
      ),
    };

    const result = executeFarmGameCommand(state, { type: 'harvestCrop', plotIndex: 0 }, { now: 10_000, rng: () => 1 });

    expect(result.status).toBe('applied');
    if (result.status !== 'applied') {
      throw new Error('expected harvest command to apply');
    }
    expect(result.state.gold).toBe(state.gold + CROPS[cropKey]!.sell);
    expect(result.state.plots[0]).toMatchObject({ cropType: null, startTime: null, state: 0 });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: 'cropHarvested',
      plotIndex: 0,
      cropKey,
      areaKey: CROPS[cropKey]!.area,
      cropTier: CROPS[cropKey]!.tier,
      goldGained: CROPS[cropKey]!.sell,
      rpGained: 0,
      donated: false,
      mutation: null,
    });
  });

  test('harvestCrop blocks when the plot is not harvestable', () => {
    const result = executeFarmGameCommand(
      createInitialState(),
      { type: 'harvestCrop', plotIndex: 0 },
      { now: 10_000, rng: () => 1 }
    );

    expect(result).toEqual({ status: 'blocked', reason: 'plotUnavailable', events: [] });
  });
});
