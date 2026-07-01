// 씨앗 선택 스트립 정렬. 작물이 48종까지 늘면서 한 구역에도 12종 이상이 쌓여
// 삽입 순서 고정으로는 "지금 심을 값어치가 큰 작물"을 찾기 어려워졌다. 순서를
// 바꾸는 순수 로직을 farm-core에 두어 UI와 무관하게 단위 테스트한다.
//
// - default: 주어진 순서(구역 내 카탈로그 삽입 순서) 그대로 유지.
// - profit:  시간당 순이익(netProfitPerHour) 내림차순 — 지금 가장 효율 좋은 작물이 앞.
// - growth:  기본 성장시간(growTime) 오름차순 — 빨리 자라는 작물이 앞.
//
// 모든 정렬은 원본 인덱스를 타이브레이크로 써서 값이 같아도 카탈로그 순서를 보존
// (결정적). netProfitPerHour는 런타임 수정치(속도/수익 배수)에 의존하므로 접근자로
// 주입받고, growTime은 데이터 상수라 CROPS에서 직접 읽는다.

import { CROPS } from './constants';
import type { CropKey } from './types';

export type SeedSortMode = 'default' | 'profit' | 'growth';

export const SEED_SORT_MODES = ['default', 'profit', 'growth'] as const;

// 정렬 토글이 순환할 다음 모드. 알 수 없는 값은 첫 모드로 되돌린다.
export function nextSeedSortMode(mode: SeedSortMode): SeedSortMode {
  const index = SEED_SORT_MODES.indexOf(mode);
  return SEED_SORT_MODES[(index + 1) % SEED_SORT_MODES.length]!;
}

// 비유한(NaN/±Infinity = 알 수 없는) 수익은 정렬 최하위로 보낸다(-Infinity).
// 음수(비용 > 수확인 손실) 같은 유한 값은 그대로 보존해 실제 순위를 지킨다.
// 0으로 치환하면 손실 작물이 부당하게 위로 올라오므로 쓰지 않는다.
function safeProfit(value: number): number {
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

// 미지의/누락 growTime은 맨 뒤로 밀리도록 +Infinity로 취급.
function growTimeOf(cropKey: CropKey): number {
  const growTime = CROPS[cropKey]?.growTime;
  return typeof growTime === 'number' && Number.isFinite(growTime)
    ? growTime
    : Number.POSITIVE_INFINITY;
}

// 씨앗 스트립 표시 순서를 계산한다. 원본 배열은 변경하지 않고 새 배열을 반환한다.
export function sortCropKeysForStrip(
  cropKeys: readonly CropKey[],
  mode: SeedSortMode,
  netProfitPerHour: (cropKey: CropKey) => number
): CropKey[] {
  if (mode === 'default') {
    return [...cropKeys];
  }
  const decorated = cropKeys.map((key, index) => ({ key, index }));
  if (mode === 'profit') {
    decorated.sort((a, b) => {
      const pa = safeProfit(netProfitPerHour(a.key));
      const pb = safeProfit(netProfitPerHour(b.key));
      // pa!==pb 가드로 (-Infinity)-(-Infinity)=NaN를 피하고, 값이 같으면
      // 원본 인덱스로 타이브레이크해 카탈로그 순서를 보존한다.
      return pa !== pb ? pb - pa : a.index - b.index; // 내림차순
    });
  } else {
    decorated.sort((a, b) => {
      const diff = growTimeOf(a.key) - growTimeOf(b.key); // 오름차순
      return diff !== 0 ? diff : a.index - b.index;
    });
  }
  return decorated.map((entry) => entry.key);
}
