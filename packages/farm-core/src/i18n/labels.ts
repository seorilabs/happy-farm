import type {
  AchievementTrackKey,
  AnimalKey,
  AreaKey,
  CropKey,
  DecorationKey,
  MasteryRankKey,
  MutationKey,
  PrestigeSkillKey,
  ProductionRecipeKey,
  RegionArchetypeKey,
  ResearchNodeKey,
  TitleKey,
} from '../types';
import type { CookingDishKey } from '../cooking';
import { deLabels } from './labels/de';
import { enUSLabels } from './labels/en-US';
import { esLabels } from './labels/es';
import { frLabels } from './labels/fr';
import { jaLabels } from './labels/ja';
import { koKRLabels } from './labels/ko-KR';
import type { AreaLabel, CropLabel, DescribedLabel, LabelBundle, SimpleLabel } from './labels/types';
import { zhHansLabels } from './labels/zh-Hans';
import { zhHantLabels } from './labels/zh-Hant';
import { DEFAULT_LOCALE, type SupportedLocale } from './locales';

export type { AreaLabel, CropLabel, DescribedLabel, SimpleLabel } from './labels/types';

// 전 로케일 라벨 번들 조립점. 새 로케일은 여기에 한 줄 추가하면 되고,
// LabelBundle 타입이 각 로케일의 key 커버리지를 컴파일 타임에 강제한다.
const LABEL_BUNDLES: Record<SupportedLocale, LabelBundle> = {
  'ko-KR': koKRLabels,
  'en-US': enUSLabels,
  ja: jaLabels,
  'zh-Hans': zhHansLabels,
  'zh-Hant': zhHantLabels,
  de: deLabels,
  fr: frLabels,
  es: esLabels,
};

function bundle(locale: SupportedLocale): LabelBundle {
  return LABEL_BUNDLES[locale] ?? LABEL_BUNDLES[DEFAULT_LOCALE];
}

export function getCropLabel(cropKey: CropKey, locale: SupportedLocale = DEFAULT_LOCALE): CropLabel {
  const label = bundle(locale).crop[cropKey] ?? LABEL_BUNDLES[DEFAULT_LOCALE].crop[cropKey];
  if (label == null) {
    throw new Error(`Missing crop label: ${cropKey}`);
  }
  return label;
}

export function getAreaLabel(areaKey: AreaKey, locale: SupportedLocale = DEFAULT_LOCALE): AreaLabel {
  const label = bundle(locale).area[areaKey] ?? LABEL_BUNDLES[DEFAULT_LOCALE].area[areaKey];
  if (label == null) {
    throw new Error(`Missing area label: ${areaKey}`);
  }
  return label;
}

export function getDecorationLabel(
  decorationKey: DecorationKey,
  locale: SupportedLocale = DEFAULT_LOCALE
): DescribedLabel {
  const label = bundle(locale).decoration[decorationKey] ?? LABEL_BUNDLES[DEFAULT_LOCALE].decoration[decorationKey];
  if (label == null) {
    throw new Error(`Missing decoration label: ${decorationKey}`);
  }
  return label;
}

export function getAnimalLabel(animalKey: AnimalKey, locale: SupportedLocale = DEFAULT_LOCALE): DescribedLabel {
  const label = bundle(locale).animal[animalKey] ?? LABEL_BUNDLES[DEFAULT_LOCALE].animal[animalKey];
  if (label == null) {
    throw new Error(`Missing animal label: ${animalKey}`);
  }
  return label;
}

export function getProductionRecipeLabel(
  recipeKey: ProductionRecipeKey,
  locale: SupportedLocale = DEFAULT_LOCALE
): DescribedLabel {
  const label = bundle(locale).production[recipeKey] ?? LABEL_BUNDLES[DEFAULT_LOCALE].production[recipeKey];
  if (label == null) {
    throw new Error(`Missing production recipe label: ${recipeKey}`);
  }
  return label;
}

export function getCookingDishLabel(
  dishKey: CookingDishKey,
  locale: SupportedLocale = DEFAULT_LOCALE
): DescribedLabel {
  const label = bundle(locale).cookingDish[dishKey] ?? LABEL_BUNDLES[DEFAULT_LOCALE].cookingDish[dishKey];
  if (label == null) {
    throw new Error(`Missing cooking dish label: ${dishKey}`);
  }
  return label;
}

export function getMasteryRankLabel(rankKey: MasteryRankKey, locale: SupportedLocale = DEFAULT_LOCALE): SimpleLabel {
  const label = bundle(locale).masteryRank[rankKey] ?? LABEL_BUNDLES[DEFAULT_LOCALE].masteryRank[rankKey];
  if (label == null) {
    throw new Error(`Missing mastery rank label: ${rankKey}`);
  }
  return label;
}

export function getMutationLabel(mutationKey: MutationKey, locale: SupportedLocale = DEFAULT_LOCALE): SimpleLabel {
  const label = bundle(locale).mutation[mutationKey] ?? LABEL_BUNDLES[DEFAULT_LOCALE].mutation[mutationKey];
  if (label == null) {
    throw new Error(`Missing mutation label: ${mutationKey}`);
  }
  return label;
}

export function getRegionArchetypeLabel(
  archetypeKey: RegionArchetypeKey,
  locale: SupportedLocale = DEFAULT_LOCALE
): SimpleLabel {
  const label =
    bundle(locale).regionArchetype[archetypeKey] ?? LABEL_BUNDLES[DEFAULT_LOCALE].regionArchetype[archetypeKey];
  if (label == null) {
    throw new Error(`Missing region archetype label: ${archetypeKey}`);
  }
  return label;
}

export function getPrestigeSkillLabel(
  skillKey: PrestigeSkillKey,
  locale: SupportedLocale = DEFAULT_LOCALE
): DescribedLabel {
  const label = bundle(locale).prestigeSkill[skillKey] ?? LABEL_BUNDLES[DEFAULT_LOCALE].prestigeSkill[skillKey];
  if (label == null) {
    throw new Error(`Missing prestige skill label: ${skillKey}`);
  }
  return label;
}

export function getResearchNodeLabel(
  nodeKey: ResearchNodeKey,
  locale: SupportedLocale = DEFAULT_LOCALE
): DescribedLabel {
  const label = bundle(locale).researchNode[nodeKey] ?? LABEL_BUNDLES[DEFAULT_LOCALE].researchNode[nodeKey];
  if (label == null) {
    throw new Error(`Missing research node label: ${nodeKey}`);
  }
  return label;
}

export function getAchievementTrackLabel(
  trackKey: AchievementTrackKey,
  locale: SupportedLocale = DEFAULT_LOCALE
): SimpleLabel {
  const label = bundle(locale).achievementTrack[trackKey] ?? LABEL_BUNDLES[DEFAULT_LOCALE].achievementTrack[trackKey];
  if (label == null) {
    throw new Error(`Missing achievement track label: ${trackKey}`);
  }
  return label;
}

export function getTitleLabel(titleKey: TitleKey, locale: SupportedLocale = DEFAULT_LOCALE): SimpleLabel {
  const label = bundle(locale).title[titleKey] ?? LABEL_BUNDLES[DEFAULT_LOCALE].title[titleKey];
  if (label == null) {
    throw new Error(`Missing title label: ${titleKey}`);
  }
  return label;
}

export function getCropLabels(locale: SupportedLocale = DEFAULT_LOCALE): Record<CropKey, CropLabel> {
  return bundle(locale).crop;
}

export function getAreaLabels(locale: SupportedLocale = DEFAULT_LOCALE): Record<AreaKey, AreaLabel> {
  return bundle(locale).area;
}
