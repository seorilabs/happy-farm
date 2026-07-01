import balance from './balance.json';
import type { CropKey, GameState } from './types';
import { CROPS, INITIAL_AREA_KEYS, getAreaCropKeys, isAreaUnlocked } from './constants';
import { isCropPlantable } from './research';

// Featured-crop sell multiplier, data-driven from balance.json (was hardcoded 2).
export const CROP_OF_THE_DAY_MULTIPLIER = balance.cropOfTheDay.multiplier;

// starter_field 등 처음부터 열려 있는 구역의 작물 — 어떤 세이브에서도 항상
// 심을 수 있으므로 추첨 풀이 비는 비정상 상태의 최종 폴백으로 쓴다.
// 모듈 간 순환 import 때문에 로드 시점엔 INITIAL_AREA_KEYS가 아직 비어 있을 수
// 있으므로, 첫 호출 때 지연 계산해 캐시한다.
// 한 번만 계산해 freeze한 뒤 공유한다 — 호출자가 배열을 변형해 폴백 풀을
// 오염시키는 일을 막는다(반환 타입도 readonly).
let starterCropKeysCache: readonly CropKey[] | null = null;
function getStarterCropKeys(): readonly CropKey[] {
  if (starterCropKeysCache == null) {
    starterCropKeysCache = Object.freeze(INITIAL_AREA_KEYS.flatMap(getAreaCropKeys));
  }
  return starterCropKeysCache;
}

// 지금 바로 심을 수 있는 작물만 추린다: 구역이 해금되어 있고(브리딩 게이트가
// 있다면) 교배 레시피까지 풀려 있어야 한다. CROPS 삽입 순서를 유지해 같은 해금
// 상태면 같은 날의 추첨 결과가 결정적으로 동일하게 나오도록 한다.
function getPlantableCropKeys(gameState: GameState): CropKey[] {
  return (Object.keys(CROPS) as CropKey[]).filter(
    (cropKey) =>
      isAreaUnlocked(gameState, CROPS[cropKey]!.area) && isCropPlantable(gameState, cropKey)
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

// XOR-seeded unsigned-32 multiplicative hash of a day index. The multiply step
// uses the Fibonacci-hashing constant 0x9e3779b9 (≈ 2^32 / φ) so consecutive
// day numbers scatter across the crop list instead of cycling in sequence; the
// 0x5a3b7f1e XOR seed merely decorrelates small day indices before mixing (it
// is an arbitrary seed, not a standard constant).
function hashDay(day: number): number {
  let h = (day ^ 0x5a3b7f1e) >>> 0;
  h = Math.imul(h, 0x9e3779b9) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export type CropOfTheDayStatus = {
  cropKey: CropKey;
  multiplier: number;
  // UTC midnight that opened this window.
  windowStartAt: number;
  // UTC midnight that closes this window (= windowStartAt of next day).
  windowEndAt: number;
};

// Returns the featured crop for the UTC calendar day that contains `now`.
// Pure and deterministic: the same day(+해금 상태)는 항상 같은 작물을 주고,
// 결과는 UTC 자정에 별도 세이브 없이 자동으로 바뀐다.
//
// gameState를 넘기면 추첨 풀을 "지금 심을 수 있는 작물"로 제한해 데일리 후크가
// 미해금 작물을 가리키지 않게 한다. gameState가 없으면(예: 윈도우 시각만 필요한
// 알림 스케줄링) 전체 작물 풀을 사용한다(하위호환). 해금 상태가 바뀌면 그 날의
// 오늘의 작물이 바뀔 수 있는데, 이는 "해금 직후 더 좋은 후보 등장"이라는 의도된
// 동작이다.
export function getCropOfTheDayStatus(
  now = Date.now(),
  gameState?: GameState
): CropOfTheDayStatus {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const allCropKeys = Object.keys(CROPS) as CropKey[];
  if (allCropKeys.length === 0) {
    throw new Error('No crops configured');
  }
  let cropKeys: readonly CropKey[];
  if (gameState == null) {
    cropKeys = allCropKeys;
  } else {
    const plantableKeys = getPlantableCropKeys(gameState);
    // 정상 상태에선 starter가 항상 해금되어 plantableKeys가 비지 않는다.
    // 손상된 세이브 등 0종 엣지에서는 starter 작물로 폴백한다.
    const starterKeys = getStarterCropKeys();
    cropKeys =
      plantableKeys.length > 0
        ? plantableKeys
        : starterKeys.length > 0
          ? starterKeys
          : allCropKeys;
  }
  const day = Math.floor(safeNow / DAY_MS);
  const index = hashDay(day) % cropKeys.length;
  const cropKey = cropKeys[index]!;
  const windowStartAt = day * DAY_MS;
  return {
    cropKey,
    multiplier: CROP_OF_THE_DAY_MULTIPLIER,
    windowStartAt,
    windowEndAt: windowStartAt + DAY_MS,
  };
}
