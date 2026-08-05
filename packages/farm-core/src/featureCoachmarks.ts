import balance from './balance.json';
import { ANIMALS, canPurchaseAnimal, isAnimalOwned } from './animals';
import { COOKING_MIN_INGREDIENTS } from './cooking';
import { isNodeUnlocked } from './research';
import type { CropKey, GameState } from './types';

// 딥 기능(동물·공방·연구소·교배·개척) 최초 해금 시 1회성 발견성 코치마크(#367)를
// 식별하는 키. 각 키는 '더보기' 시트 안의 진입점 하나와 대응한다. 배열 순서는 여러
// 기능이 동시에 가용해졌을 때(예: 진행이 앞선 세이브 로드) 노출 우선순위이며, 대략적인
// 게임 진행 순서를 따른다.
export const FEATURE_COACHMARK_KEYS = ['animals', 'workshop', 'cooking', 'lab', 'breeding', 'chain'] as const;
export type FeatureCoachmarkKey = (typeof FEATURE_COACHMARK_KEYS)[number];

// 졸업(개척) 컬렉션 대상 작물. prestige.ts의 GRADUATION_CROP_KEYS와 동일한 balance
// 파생이지만 여기서 다시 계산해 featureCoachmarks가 prestige→constants 순환에 얽히지
// 않게 한다(이 모듈은 balance 전용 하위 모듈만 의존한다).
const GRADUATION_CROP_KEYS = balance.crops
  .filter((crop) => crop.area === balance.regions.graduation.requiredAreaCollection)
  .map((crop) => crop.key) as CropKey[];

// 개척(체인 지도)이 의미 있어지는 시점: 이미 한 번이라도 졸업했거나(체인 수입 사용 중),
// 아직이라면 졸업 컬렉션을 모두 채워 지금 졸업할 수 있게 된 순간.
function isChainAvailable(state: GameState): boolean {
  if (state.prestige.level > 0) {
    return true;
  }
  return (
    GRADUATION_CROP_KEYS.length > 0 &&
    GRADUATION_CROP_KEYS.every((cropKey) => state.harvestedCropKeys.includes(cropKey))
  );
}

// 공방이 의미 있어지는 시점: 가공 재고(수확 부산물)가 쌓였거나 이미 가공이 진행 중일 때.
function isWorkshopAvailable(state: GameState): boolean {
  const hasInventory = Object.values(state.production.inventory).some(
    (count) => typeof count === 'number' && count > 0
  );
  return hasInventory || Object.keys(state.production.crafting).length > 0;
}

// 요리 솥이 의미 있어지는 시점(#442): 서로 다른 재료가 최소 조합 수만큼 쌓였거나
// 이미 조리가 진행 중일 때. 재료는 수확 부산물이라 첫 수확들 직후 자연히 열린다
// (GDD 온보딩: 첫 수확 후 요리 솥 강조).
function isCookingAvailable(state: GameState): boolean {
  if (state.cooking.pot != null || Object.keys(state.cooking.discoveredDishes).length > 0) {
    return true;
  }
  const distinctCrops = Object.entries(state.production.inventory).filter(
    ([, count]) => typeof count === 'number' && count > 0
  ).length;
  return distinctCrops >= COOKING_MIN_INGREDIENTS;
}

// 동물이 의미 있어지는 시점: 축사를 이미 지었거나, 지금 지을 골드가 처음 생겼을 때.
function isAnimalsAvailable(state: GameState): boolean {
  return ANIMALS.some((animal) => isAnimalOwned(state, animal.key) || canPurchaseAnimal(state, animal.key));
}

// 각 딥 기능이 "지금 최초로 가용/의미 있는" 상태인지 판정하는 순수 함수. now에 의존하지
// 않아 렌더 틱마다 흔들리지 않는다(가용 판정은 골드·연구 노드·컬렉션 등 안정 상태 기반).
export function isFeatureCoachmarkAvailable(state: GameState, key: FeatureCoachmarkKey): boolean {
  switch (key) {
    case 'animals':
      return isAnimalsAvailable(state);
    case 'workshop':
      return isWorkshopAvailable(state);
    case 'cooking':
      return isCookingAvailable(state);
    case 'lab':
      // 연구 RP를 처음 축적한 순간(연구소가 실제로 쓸모 있어지는 시점).
      return state.research.totalPointsEarned > 0;
    case 'breeding':
      // 교배 노드(breeding_lab)를 해금한 순간.
      return isNodeUnlocked(state, 'breeding_lab');
    case 'chain':
      return isChainAvailable(state);
  }
}

function hasSeenFeatureCoachmark(state: GameState, key: FeatureCoachmarkKey): boolean {
  return state.seenFeatureCoachmarks.includes(key);
}

// 지금 노출해야 할 코치마크 1개(가용 && 미확인). FEATURE_COACHMARK_KEYS 순서로 첫 번째를
// 반환하고, 노출할 것이 없으면 null. 한 번에 하나만 노출해 오버레이가 겹치지 않게 한다.
export function getPendingFeatureCoachmark(state: GameState): FeatureCoachmarkKey | null {
  for (const key of FEATURE_COACHMARK_KEYS) {
    if (!hasSeenFeatureCoachmark(state, key) && isFeatureCoachmarkAvailable(state, key)) {
      return key;
    }
  }
  return null;
}

// 코치마크를 "확인됨"으로 저장(1회성 플래그). 이미 확인했거나 미지의 키면 동일 참조를
// 반환해 불필요한 상태 갱신/세이브를 피한다.
export function markFeatureCoachmarkSeen(state: GameState, key: FeatureCoachmarkKey): GameState {
  if (!isFeatureCoachmarkKey(key) || hasSeenFeatureCoachmark(state, key)) {
    return state;
  }
  return { ...state, seenFeatureCoachmarks: [...state.seenFeatureCoachmarks, key] };
}

function isFeatureCoachmarkKey(value: unknown): value is FeatureCoachmarkKey {
  return typeof value === 'string' && (FEATURE_COACHMARK_KEYS as readonly string[]).includes(value);
}

// 세이브 정규화용: 알려진 키만 남기고 중복을 제거한다.
export function normalizeSeenFeatureCoachmarks(value: unknown): FeatureCoachmarkKey[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen: FeatureCoachmarkKey[] = [];
  for (const item of value) {
    if (isFeatureCoachmarkKey(item) && !seen.includes(item)) {
      seen.push(item);
    }
  }
  return seen;
}

// 레거시 세이브(필드 없음) 이관용: 이미 가용한 기능을 전부 "확인됨"으로 선반영한다.
// 기존 플레이어가 오랫동안 써 온 기능들의 코치마크가 업데이트 직후 한꺼번에 뜨는 것을
// 막는다(브랜드-신규 플레이어는 세이브가 없어 이 경로를 타지 않는다).
export function seedSeenFeatureCoachmarksForLoadedSave(state: GameState): FeatureCoachmarkKey[] {
  return FEATURE_COACHMARK_KEYS.filter((key) => isFeatureCoachmarkAvailable(state, key));
}
