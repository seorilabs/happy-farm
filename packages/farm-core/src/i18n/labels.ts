import type { AreaKey, CropKey } from '../types';
import { DEFAULT_LOCALE, type SupportedLocale } from './locales';

type CropLabel = {
  name: string;
};

type AreaLabel = {
  name: string;
  target: string;
  description: string;
};

const KO_CROP_LABELS = {
  carrot: { name: '당근' },
  wheat: { name: '밀' },
  potato: { name: '감자' },
  onion: { name: '양파' },
  sweet_potato: { name: '고구마' },
  corn: { name: '옥수수' },
  tomato: { name: '토마토' },
  pepper: { name: '고추' },
  mushroom: { name: '버섯' },
  rice: { name: '쌀' },
  strawberry: { name: '딸기' },
  blueberry: { name: '블루베리' },
  grape: { name: '포도' },
  watermelon: { name: '수박' },
  melon: { name: '멜론' },
  sunflower: { name: '해바라기' },
  pumpkin: { name: '황금호박' },
  apple: { name: '사과나무' },
  pear: { name: '배나무' },
  peach: { name: '복숭아나무' },
  cherry: { name: '체리나무' },
  mango: { name: '망고나무' },
  pineapple: { name: '파인애플' },
  coconut: { name: '코코넛' },
  kiwi: { name: '키위' },
  avocado: { name: '아보카도' },
  cactus: { name: '선인장' },
  bamboo: { name: '대나무' },
  ginseng: { name: '천년인삼' },
  crystal_flower: { name: '수정꽃' },
  diamond: { name: '보석나무' },
  starfruit: { name: '별빛열매' },
  moonflower: { name: '달빛꽃' },
  rainbow_tree: { name: '무지개나무' },
  world_tree: { name: '세계수' },
} satisfies Record<CropKey, CropLabel>;

const EN_CROP_LABELS = {
  carrot: { name: 'Carrot' },
  wheat: { name: 'Wheat' },
  potato: { name: 'Potato' },
  onion: { name: 'Onion' },
  sweet_potato: { name: 'Sweet Potato' },
  corn: { name: 'Corn' },
  tomato: { name: 'Tomato' },
  pepper: { name: 'Pepper' },
  mushroom: { name: 'Mushroom' },
  rice: { name: 'Rice' },
  strawberry: { name: 'Strawberry' },
  blueberry: { name: 'Blueberry' },
  grape: { name: 'Grape' },
  watermelon: { name: 'Watermelon' },
  melon: { name: 'Melon' },
  sunflower: { name: 'Sunflower' },
  pumpkin: { name: 'Golden Pumpkin' },
  apple: { name: 'Apple Tree' },
  pear: { name: 'Pear Tree' },
  peach: { name: 'Peach Tree' },
  cherry: { name: 'Cherry Tree' },
  mango: { name: 'Mango Tree' },
  pineapple: { name: 'Pineapple' },
  coconut: { name: 'Coconut' },
  kiwi: { name: 'Kiwi' },
  avocado: { name: 'Avocado' },
  cactus: { name: 'Cactus' },
  bamboo: { name: 'Bamboo' },
  ginseng: { name: 'Ancient Ginseng' },
  crystal_flower: { name: 'Crystal Flower' },
  diamond: { name: 'Gem Tree' },
  starfruit: { name: 'Starlight Fruit' },
  moonflower: { name: 'Moonflower' },
  rainbow_tree: { name: 'Rainbow Tree' },
  world_tree: { name: 'World Tree' },
} satisfies Record<CropKey, CropLabel>;

const KO_AREA_LABELS = {
  starter_field: {
    name: '초보 밭',
    target: '0~10분',
    description: '짧은 성장 시간으로 심기-수확 재미를 학습시키는 구역',
  },
  vegetable_field: {
    name: '채소 밭',
    target: '10~30분',
    description: '초반 이후 작물 다양성을 체감시키는 구역',
  },
  fruit_field: {
    name: '풍요 밭',
    target: '30분~2시간',
    description: '과일과 꽃 작물로 재방문과 광고 보상이 의미 있어지는 중반 구역',
  },
  orchard: {
    name: '과수원',
    target: '2시간~1일',
    description: '긴 성장 시간과 큰 보상을 제공하는 장기 작물 구역',
  },
  greenhouse: {
    name: '온실',
    target: '1~3일',
    description: '희귀 작물과 자동화 업그레이드의 명분이 되는 구역',
  },
  mystic_field: {
    name: '신비 밭',
    target: '3~7일',
    description: '최상위 작물과 컬렉션 목표를 제공하는 구역',
  },
  legend_field: {
    name: '전설 구역',
    target: '7일 이상',
    description: '프레스티지와 시즌 운영의 장기 목표 구역',
  },
} satisfies Record<AreaKey, AreaLabel>;

const EN_AREA_LABELS = {
  starter_field: {
    name: 'Starter Field',
    target: '0-10 min',
    description: 'A quick-growing area that teaches the plant-grow-harvest loop.',
  },
  vegetable_field: {
    name: 'Vegetable Field',
    target: '10-30 min',
    description: 'An early expansion area for more crop variety.',
  },
  fruit_field: {
    name: 'Bloom Field',
    target: '30 min-2 hr',
    description: 'A mid-game area where fruit, flowers, return visits, and ad rewards matter.',
  },
  orchard: {
    name: 'Orchard',
    target: '2 hr-1 day',
    description: 'A long-term crop area with slower growth and larger payouts.',
  },
  greenhouse: {
    name: 'Greenhouse',
    target: '1-3 days',
    description: 'A rare crop area that supports automation and long-term goals.',
  },
  mystic_field: {
    name: 'Mystic Field',
    target: '3-7 days',
    description: 'A high-end area for collection goals and premium crops.',
  },
  legend_field: {
    name: 'Legend Field',
    target: '7+ days',
    description: 'A prestige area for the longest lifecycle goals.',
  },
} satisfies Record<AreaKey, AreaLabel>;

const CROP_LABELS: Record<SupportedLocale, Record<CropKey, CropLabel>> = {
  'ko-KR': KO_CROP_LABELS,
  'en-US': EN_CROP_LABELS,
};

const AREA_LABELS: Record<SupportedLocale, Record<AreaKey, AreaLabel>> = {
  'ko-KR': KO_AREA_LABELS,
  'en-US': EN_AREA_LABELS,
};

export function getCropLabel(cropKey: CropKey, locale: SupportedLocale = DEFAULT_LOCALE): CropLabel {
  const labels = CROP_LABELS[locale] ?? CROP_LABELS[DEFAULT_LOCALE];
  const label = labels[cropKey] ?? CROP_LABELS[DEFAULT_LOCALE][cropKey];
  if (label == null) {
    throw new Error(`Missing crop label: ${cropKey}`);
  }
  return label;
}

export function getAreaLabel(areaKey: AreaKey, locale: SupportedLocale = DEFAULT_LOCALE): AreaLabel {
  const labels = AREA_LABELS[locale] ?? AREA_LABELS[DEFAULT_LOCALE];
  const label = labels[areaKey] ?? AREA_LABELS[DEFAULT_LOCALE][areaKey];
  if (label == null) {
    throw new Error(`Missing area label: ${areaKey}`);
  }
  return label;
}

export function getCropLabels(locale: SupportedLocale = DEFAULT_LOCALE): Record<CropKey, CropLabel> {
  return CROP_LABELS[locale] ?? CROP_LABELS[DEFAULT_LOCALE];
}

export function getAreaLabels(locale: SupportedLocale = DEFAULT_LOCALE): Record<AreaKey, AreaLabel> {
  return AREA_LABELS[locale] ?? AREA_LABELS[DEFAULT_LOCALE];
}
