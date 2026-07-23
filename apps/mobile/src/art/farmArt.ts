import type { CropKey } from '../../../../packages/farm-core/src';
import type { FarmArt } from '../../../../packages/farm-ui/src';

// Metro resolves static asset imports at build time, so the crop map is
// spelled out. Regenerate after adding crops: keys mirror balance.json
// crops[].key and files mirror assets/art/crop_<key>.png (copied into
// ./assets).
import crop_carrot from './assets/crop_carrot.png';
import crop_wheat from './assets/crop_wheat.png';
import crop_potato from './assets/crop_potato.png';
import crop_onion from './assets/crop_onion.png';
import crop_sweet_potato from './assets/crop_sweet_potato.png';
import crop_corn from './assets/crop_corn.png';
import crop_tomato from './assets/crop_tomato.png';
import crop_pepper from './assets/crop_pepper.png';
import crop_mushroom from './assets/crop_mushroom.png';
import crop_rice from './assets/crop_rice.png';
import crop_strawberry from './assets/crop_strawberry.png';
import crop_blueberry from './assets/crop_blueberry.png';
import crop_grape from './assets/crop_grape.png';
import crop_watermelon from './assets/crop_watermelon.png';
import crop_melon from './assets/crop_melon.png';
import crop_sunflower from './assets/crop_sunflower.png';
import crop_pumpkin from './assets/crop_pumpkin.png';
import crop_apple from './assets/crop_apple.png';
import crop_pear from './assets/crop_pear.png';
import crop_peach from './assets/crop_peach.png';
import crop_cherry from './assets/crop_cherry.png';
import crop_mango from './assets/crop_mango.png';
import crop_pineapple from './assets/crop_pineapple.png';
import crop_coconut from './assets/crop_coconut.png';
import crop_kiwi from './assets/crop_kiwi.png';
import crop_avocado from './assets/crop_avocado.png';
import crop_cactus from './assets/crop_cactus.png';
import crop_bamboo from './assets/crop_bamboo.png';
import crop_ginseng from './assets/crop_ginseng.png';
import crop_crystal_flower from './assets/crop_crystal_flower.png';
import crop_diamond from './assets/crop_diamond.png';
import crop_starfruit from './assets/crop_starfruit.png';
import crop_moonflower from './assets/crop_moonflower.png';
import crop_rainbow_tree from './assets/crop_rainbow_tree.png';
import crop_world_tree from './assets/crop_world_tree.png';
import crop_crystalberry from './assets/crop_crystalberry.png';
import crop_sun_grape from './assets/crop_sun_grape.png';
import crop_royal_potato from './assets/crop_royal_potato.png';
import crop_frost_blueberry from './assets/crop_frost_blueberry.png';
import crop_ember_pepper from './assets/crop_ember_pepper.png';
import crop_cloud_rice from './assets/crop_cloud_rice.png';
import crop_prism_melon from './assets/crop_prism_melon.png';
import crop_dragon_mango from './assets/crop_dragon_mango.png';
import crop_star_pineapple from './assets/crop_star_pineapple.png';
import crop_moon_peach from './assets/crop_moon_peach.png';
import crop_aurora_kiwi from './assets/crop_aurora_kiwi.png';
import crop_sacred_rice from './assets/crop_sacred_rice.png';
import stage_budding from './assets/stage_budding.png';
import stage_mature from './assets/stage_mature.png';
import stage_sapling from './assets/stage_sapling.png';
import stage_sprout from './assets/stage_sprout.png';

const cropArt: Record<CropKey, number> = {
  carrot: crop_carrot,
  wheat: crop_wheat,
  potato: crop_potato,
  onion: crop_onion,
  sweet_potato: crop_sweet_potato,
  corn: crop_corn,
  tomato: crop_tomato,
  pepper: crop_pepper,
  mushroom: crop_mushroom,
  rice: crop_rice,
  strawberry: crop_strawberry,
  blueberry: crop_blueberry,
  grape: crop_grape,
  watermelon: crop_watermelon,
  melon: crop_melon,
  sunflower: crop_sunflower,
  pumpkin: crop_pumpkin,
  apple: crop_apple,
  pear: crop_pear,
  peach: crop_peach,
  cherry: crop_cherry,
  mango: crop_mango,
  pineapple: crop_pineapple,
  coconut: crop_coconut,
  kiwi: crop_kiwi,
  avocado: crop_avocado,
  cactus: crop_cactus,
  bamboo: crop_bamboo,
  ginseng: crop_ginseng,
  crystal_flower: crop_crystal_flower,
  diamond: crop_diamond,
  starfruit: crop_starfruit,
  moonflower: crop_moonflower,
  rainbow_tree: crop_rainbow_tree,
  world_tree: crop_world_tree,
  crystalberry: crop_crystalberry,
  sun_grape: crop_sun_grape,
  royal_potato: crop_royal_potato,
  frost_blueberry: crop_frost_blueberry,
  ember_pepper: crop_ember_pepper,
  cloud_rice: crop_cloud_rice,
  prism_melon: crop_prism_melon,
  dragon_mango: crop_dragon_mango,
  star_pineapple: crop_star_pineapple,
  moon_peach: crop_moon_peach,
  aurora_kiwi: crop_aurora_kiwi,
  sacred_rice: crop_sacred_rice,
};

const stageArt = {
  sprout: stage_sprout,
  sapling: stage_sapling,
  budding: stage_budding,
  mature: stage_mature,
} as const;

export const mobileFarmArt: FarmArt = {
  cropIcon: (cropKey) => cropArt[cropKey] ?? null,
  stageIcon: (stage) => stageArt[stage],
};
