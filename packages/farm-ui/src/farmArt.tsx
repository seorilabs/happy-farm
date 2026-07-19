import React, { createContext, useContext, useState } from 'react';
import {
  Image,
  Text,
  type ImageSourcePropType,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import type { CropKey } from '../../farm-core/src';

// Growth-stage art shared by every crop; budding/mature reuse the crop's own
// icon (see getCropGrowthStage), so only the two generic stages need art.
export type FarmStageArtKey = 'sprout' | 'sapling';

// Host-provided image resolvers for the generated art set
// (assets/art/asset-manifest.json). Every resolver may return null and the
// whole prop is optional: callers fall back to the original emoji glyph, so a
// host without art (or with a partial set) keeps working unchanged.
export type FarmArt = {
  cropIcon?: (cropKey: CropKey) => ImageSourcePropType | null;
  stageIcon?: (stage: FarmStageArtKey) => ImageSourcePropType | null;
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
