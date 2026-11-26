import React, { createContext, useContext, useState } from 'react';
import {
  Image,
  Text,
  type ImageSourcePropType,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import type { CropGrowthStage, CropKey } from '../../farm-core/src';

// Growth-stage art shared by every crop. Hosts may provide any subset; missing
// stages keep the existing crop-art/emoji fallback path.
export type FarmStageArtKey = CropGrowthStage;

// Host-provided image resolvers for the generated art set
// (assets/art/asset-manifest.json). Every resolver may return null and the
// whole prop is optional: callers fall back to the original emoji glyph, so a
// host without art (or with a partial set) keeps working unchanged.
export type FarmArt = {
  cropIcon?: (cropKey: CropKey) => ImageSourcePropType | null;
  stageIcon?: (stage: FarmStageArtKey) => ImageSourcePropType | null;
  // 게임 UI 스킨과 아이콘(#606). 없으면 코드로 그린 View와 이모지로 그린다.
  ui?: FarmUiArt;
  // 숫자와 라틴 문자용 디스플레이 서체(#606). 호스트가 네이티브로 등록한 이름을 넘긴다.
  // 없으면(AIT) 시스템 굵은 글씨에 외곽선을 입힌다.
  displayFontFamily?: string;
};

export type FarmUiIconKey =
  | 'coin'
  | 'star'
  | 'more'
  | 'daily'
  | 'goal'
  | 'shop'
  | 'missions'
  | 'harvest'
  | 'ranch'
  | 'kitchen'
  | 'settings'
  | 'wheel'
  | 'pointer';

export type FarmSkinKey = 'primary' | 'secondary' | 'chip' | 'panel';

// 가로 3분할 스킨: 왼쪽 끝, 늘어나는 가운데 한 줄, 오른쪽 끝. capRatio는 끝 조각 폭 / 높이다.
export type FarmSkinArt = {
  left: ImageSourcePropType;
  center: ImageSourcePropType;
  right: ImageSourcePropType;
  capRatio: number;
};

export type FarmUiArt = {
  icons: Partial<Record<FarmUiIconKey, ImageSourcePropType>>;
  skins: Partial<Record<FarmSkinKey, FarmSkinArt>>;
};

const EMPTY_FARM_ART: FarmArt = {};

const FarmArtContext = createContext<FarmArt>(EMPTY_FARM_ART);

export function FarmArtProvider({ art, children }: { art?: FarmArt; children: React.ReactNode }) {
  return <FarmArtContext.Provider value={art ?? EMPTY_FARM_ART}>{children}</FarmArtContext.Provider>;
}

export function useFarmArt(): FarmArt {
  return useContext(FarmArtContext);
}

export function useCropArtSource(cropKey: CropKey | null | undefined): ImageSourcePropType | null {
  const art = useFarmArt();
  if (cropKey == null) {
    return null;
  }
  return art.cropIcon?.(cropKey) ?? null;
}

// Emoji glyphs and generated images have different metrics: text sizes by
// fontSize/lineHeight, images by explicit width/height. `size` is the square
// edge for the image path; the emoji path keeps the caller's text style so
// existing layouts don't shift when art is absent.
export function CropGlyph({
  cropKey,
  emoji,
  size,
  textStyle,
}: {
  cropKey: CropKey | null | undefined;
  emoji: string;
  size: number;
  textStyle?: StyleProp<TextStyle>;
}) {
  const source = useCropArtSource(cropKey);
  // Remote art hosts (AppsInToss streams from Firebase Hosting) can 404 before
  // a hosting deploy lands; fall back to the emoji instead of a blank box.
  const [failed, setFailed] = useState(false);

  if (source == null || failed) {
    return <Text style={textStyle}>{emoji}</Text>;
  }
  return (
    <Image
      source={source}
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
