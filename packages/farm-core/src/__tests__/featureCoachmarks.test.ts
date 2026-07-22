/// <reference types="jest" />

import { createInitialState, migrateLoadedState } from '../constants';
import {
  FEATURE_COACHMARK_KEYS,
  getPendingFeatureCoachmark,
  isFeatureCoachmarkAvailable,
  markFeatureCoachmarkSeen,
  normalizeSeenFeatureCoachmarks,
  seedSeenFeatureCoachmarksForLoadedSave,
} from '../featureCoachmarks';
import { createPrestigedState } from '../prestige';
import { META_LAYER_KEYS, type CropKey, type GameState } from '../types';

// 각 딥 기능이 "가용"으로 판정되도록 최소 상태를 만드는 헬퍼(가용 판정 기준을 문서화).
function withGold(state: GameState, gold: number): GameState {
  return { ...state, gold };
}
function withResearchPoints(state: GameState, totalPointsEarned: number): GameState {
  return { ...state, research: { ...state.research, totalPointsEarned } };
}
function withBreedingLab(state: GameState): GameState {
  return { ...state, research: { ...state.research, unlockedNodes: ['breeding_lab'] } };
}
function withWorkshopInventory(state: GameState): GameState {
  return { ...state, production: { ...state.production, inventory: { carrot: 3 } as Partial<Record<CropKey, number>> } };
}
function withGraduatedFarm(state: GameState): GameState {
  return { ...state, prestige: { ...state.prestige, level: 1 } };
}

describe('featureCoachmarks 가용 판정', () => {
  it('브랜드-신규 상태에서는 아무 딥 기능도 가용하지 않다(코치마크 없음)', () => {
    const state = createInitialState();
    for (const key of FEATURE_COACHMARK_KEYS) {
      expect(isFeatureCoachmarkAvailable(state, key)).toBe(false);
    }
    expect(getPendingFeatureCoachmark(state)).toBeNull();
  });

  it('동물: 가장 싼 축사를 살 골드가 생기면 가용해진다', () => {
    const base = createInitialState();
    expect(isFeatureCoachmarkAvailable(base, 'animals')).toBe(false);
    expect(isFeatureCoachmarkAvailable(withGold(base, 600), 'animals')).toBe(true);
  });

  it('공방: 가공 재고가 쌓이면 가용해진다', () => {
    const base = createInitialState();
    expect(isFeatureCoachmarkAvailable(base, 'workshop')).toBe(false);
    expect(isFeatureCoachmarkAvailable(withWorkshopInventory(base), 'workshop')).toBe(true);
  });

  it('연구소: 연구 RP를 처음 축적하면 가용해진다', () => {
    const base = createInitialState();
    expect(isFeatureCoachmarkAvailable(base, 'lab')).toBe(false);
    expect(isFeatureCoachmarkAvailable(withResearchPoints(base, 1), 'lab')).toBe(true);
  });

  it('교배: breeding_lab 노드를 해금하면 가용해진다', () => {
    const base = createInitialState();
    expect(isFeatureCoachmarkAvailable(base, 'breeding')).toBe(false);
    expect(isFeatureCoachmarkAvailable(withBreedingLab(base), 'breeding')).toBe(true);
  });

  it('개척: 졸업 컬렉션을 완성하거나 이미 졸업했으면 가용해진다', () => {
    const base = createInitialState();
    expect(isFeatureCoachmarkAvailable(base, 'chain')).toBe(false);
    const collectionComplete: GameState = {
      ...base,
      harvestedCropKeys: ['starfruit', 'moonflower', 'rainbow_tree', 'world_tree'],
    };
    expect(isFeatureCoachmarkAvailable(collectionComplete, 'chain')).toBe(true);
    expect(isFeatureCoachmarkAvailable(withGraduatedFarm(base), 'chain')).toBe(true);
  });
});

describe('getPendingFeatureCoachmark 1회성 노출', () => {
  it('가용해진 기능을 최초 1회 노출하고, 확인 후에는 재노출하지 않는다', () => {
    const state = withResearchPoints(createInitialState(), 5);
    expect(getPendingFeatureCoachmark(state)).toBe('lab');

    const afterSeen = markFeatureCoachmarkSeen(state, 'lab');
    expect(afterSeen.seenFeatureCoachmarks).toContain('lab');
    // 같은 상태에서 다시 계산해도(재개/리마운트) 다시 뜨지 않는다.
    expect(getPendingFeatureCoachmark(afterSeen)).toBeNull();
  });

  it('여러 기능이 동시에 가용하면 정의된 순서대로 하나씩 노출한다', () => {
    // 골드(동물)와 연구 RP(연구소)가 함께 충족된 상태.
    const state = withResearchPoints(withGold(createInitialState(), 600), 5);
    expect(getPendingFeatureCoachmark(state)).toBe('animals');

    const afterAnimals = markFeatureCoachmarkSeen(state, 'animals');
    expect(getPendingFeatureCoachmark(afterAnimals)).toBe('lab');

    const afterLab = markFeatureCoachmarkSeen(afterAnimals, 'lab');
    expect(getPendingFeatureCoachmark(afterLab)).toBeNull();
  });

  it('markFeatureCoachmarkSeen은 이미 확인했거나 미지의 키면 동일 참조를 반환한다', () => {
    const state = markFeatureCoachmarkSeen(createInitialState(), 'lab');
    expect(markFeatureCoachmarkSeen(state, 'lab')).toBe(state);
    expect(markFeatureCoachmarkSeen(state, 'nope' as never)).toBe(state);
  });
});

describe('세이브 정규화·이관', () => {
  it('normalizeSeenFeatureCoachmarks는 알려진 키만 남기고 중복을 제거한다', () => {
    expect(normalizeSeenFeatureCoachmarks(['lab', 'lab', 'chain', 'bogus', 42])).toEqual(['lab', 'chain']);
    expect(normalizeSeenFeatureCoachmarks(undefined)).toEqual([]);
    expect(normalizeSeenFeatureCoachmarks('lab')).toEqual([]);
  });

  it('필드가 있는 세이브는 확인 상태가 저장·재개 시 유지된다', () => {
    const base = createInitialState();
    const loaded: Partial<GameState> = { seenFeatureCoachmarks: ['lab', 'animals', 'bogus' as never] };
    const migrated = migrateLoadedState(loaded, base);
    expect(migrated.seenFeatureCoachmarks).toEqual(['lab', 'animals']);
    // 재노출 방지: 확인한 lab은 가용해도 다시 뜨지 않는다.
    const advanced = withResearchPoints(migrated, 5);
    expect(getPendingFeatureCoachmark(advanced)).toBeNull();
  });

  it('필드가 없는 레거시 세이브는 이미 가용한 기능을 전부 확인됨으로 선반영한다', () => {
    const base = createInitialState();
    // 이미 골드·RP가 충분한 진행된 레거시 세이브(코치마크 필드 없음).
    const loaded: Partial<GameState> = { gold: 700, research: { ...base.research, totalPointsEarned: 5 } };
    const migrated = migrateLoadedState(loaded, base);
    expect(migrated.seenFeatureCoachmarks).toEqual(expect.arrayContaining(['animals', 'lab']));
    // 그래서 업데이트 직후 과거 해금분 코치마크가 뜨지 않는다.
    expect(getPendingFeatureCoachmark(migrated)).toBeNull();
  });

  it('seedSeenFeatureCoachmarksForLoadedSave는 현재 가용한 키만 반환한다', () => {
    const state = withGold(createInitialState(), 600);
    expect(seedSeenFeatureCoachmarksForLoadedSave(state)).toEqual(['animals']);
  });
});

describe('메타-레이어 유지', () => {
  it('seenFeatureCoachmarks는 메타-레이어라 프레스티지를 넘어 유지된다', () => {
    expect(META_LAYER_KEYS).toContain('seenFeatureCoachmarks');
    const state = markFeatureCoachmarkSeen(createInitialState(), 'lab');
    const prestiged = createPrestigedState(state);
    expect(prestiged.seenFeatureCoachmarks).toEqual(['lab']);
  });
});
