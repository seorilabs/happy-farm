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
import { DEFAULT_LOCALE, type SupportedLocale } from './locales';

type CropLabel = {
  name: string;
  // 도감(컬렉션)에서 노출하는 한 줄 플레이버 텍스트. 수집 동기·세계관 보강용이며
  // 발견한 작물에만 표시된다(미발견은 잠금 표현 유지). ko/en 두 로케일 필수.
  description: string;
};

type AreaLabel = {
  name: string;
  target: string;
  description: string;
};

type SimpleLabel = {
  name: string;
};

type DescribedLabel = {
  name: string;
  description: string;
};

const KO_CROP_LABELS = {
  carrot: { name: '당근', description: '아삭한 주황 뿌리채소, 농장의 첫 친구예요.' },
  wheat: { name: '밀', description: '황금빛 들녘을 채우는 기본 곡식이에요.' },
  potato: { name: '감자', description: '흙 속에서 묵직하게 자라는 든든한 뿌리예요.' },
  onion: { name: '양파', description: '매콤한 향에 썰면 눈물이 핑 도는 채소예요.' },
  sweet_potato: { name: '고구마', description: '가을에 달콤하게 익는 별미 뿌리예요.' },
  corn: { name: '옥수수', description: '톡톡 씹히는 노란 알갱이가 가득해요.' },
  tomato: { name: '토마토', description: '새콤달콤 붉게 여무는 텃밭의 인기 열매예요.' },
  pepper: { name: '고추', description: '작지만 화끈한 매운맛을 품고 있어요.' },
  mushroom: { name: '버섯', description: '그늘에서 조용히 피어나는 숲속 별미예요.' },
  rice: { name: '쌀', description: '물 댄 논에서 자라는 소중한 주식이에요.' },
  strawberry: { name: '딸기', description: '향긋한 붉은 보석 같은 봄 열매예요.' },
  blueberry: { name: '블루베리', description: '톡 터지는 새파란 알맹이가 매력이에요.' },
  grape: { name: '포도', description: '주렁주렁 달린 보랏빛 송이가 탐스러워요.' },
  watermelon: { name: '수박', description: '여름 더위를 식혀 주는 시원한 과일이에요.' },
  melon: { name: '멜론', description: '그물무늬 껍질 속에 달콤한 과육이 가득해요.' },
  sunflower: { name: '해바라기', description: '해를 따라 고개를 돌리는 노란 꽃이에요.' },
  pumpkin: { name: '황금호박', description: '반짝이는 황금빛으로 크게 여무는 호박이에요.' },
  apple: { name: '사과나무', description: '새빨간 열매가 조롱조롱 열리는 과수예요.' },
  pear: { name: '배나무', description: '시원하고 달큰한 즙이 가득 찬 열매예요.' },
  peach: { name: '복숭아나무', description: '보드라운 분홍빛 여름 과일이 열려요.' },
  cherry: { name: '체리나무', description: '앙증맞은 붉은 알이 짝지어 달려요.' },
  mango: { name: '망고나무', description: '진한 향이 감도는 열대 황금과일이에요.' },
  pineapple: { name: '파인애플', description: '뾰족한 왕관을 쓴 새콤달콤한 열매예요.' },
  coconut: { name: '코코넛', description: '단단한 껍질 속에 시원한 즙을 담고 있어요.' },
  kiwi: { name: '키위', description: '털옷 속에 초록빛 새콤한 속살이 숨어 있어요.' },
  avocado: { name: '아보카도', description: '부드러운 초록 과육의 숲속 버터예요.' },
  cactus: { name: '선인장', description: '사막에서 물을 품고 견디는 가시 식물이에요.' },
  bamboo: { name: '대나무', description: '하루가 다르게 쭉쭉 자라는 초록 줄기예요.' },
  ginseng: { name: '천년인삼', description: '천 년의 정기를 품은 귀한 약초 뿌리예요.' },
  crystal_flower: { name: '수정꽃', description: '유리처럼 맑게 빛나는 신비한 꽃이에요.' },
  diamond: { name: '보석나무', description: '가지마다 보석이 맺히는 전설의 나무예요.' },
  starfruit: { name: '별빛열매', description: '자르면 단면에 별 모양이 떠오르는 열매예요.' },
  moonflower: { name: '달빛꽃', description: '달빛 아래서만 살며시 피어나는 꽃이에요.' },
  rainbow_tree: { name: '무지개나무', description: '일곱 빛깔로 곱게 물드는 나무예요.' },
  world_tree: { name: '세계수', description: '세상을 떠받친다는 전설의 거대한 나무예요.' },
  crystalberry: { name: '수정베리', description: '수정처럼 투명하게 익어 가는 열매예요.' },
  sun_grape: { name: '태양포도', description: '햇살을 머금어 뜨겁게 빛나는 포도송이예요.' },
  royal_potato: { name: '왕실감자', description: '옛날 왕에게 진상되던 귀한 감자예요.' },
  frost_blueberry: { name: '서리블루베리', description: '서리를 맞아 단맛이 더 깊어진 열매예요.' },
  ember_pepper: { name: '불꽃고추', description: '불씨를 품은 듯 타오르는 매운맛이에요.' },
  cloud_rice: { name: '구름쌀', description: '구름처럼 폭신하게 부풀어 오르는 쌀이에요.' },
  prism_melon: { name: '프리즘멜론', description: '빛을 굴절시켜 영롱하게 반짝이는 멜론이에요.' },
  dragon_mango: { name: '용옥망고', description: '용의 기운을 품었다는 전설의 망고예요.' },
  star_pineapple: { name: '별빛파인애플', description: '밤하늘 별빛을 담아낸 파인애플이에요.' },
  moon_peach: { name: '달빛복숭아', description: '달의 정기로 은은하게 익는 복숭아예요.' },
  aurora_kiwi: { name: '오로라키위', description: '오로라 빛으로 곱게 물드는 키위예요.' },
  sacred_rice: { name: '신성한쌀', description: '제단에 오르던 신성한 곡식이에요.' },
} satisfies Record<CropKey, CropLabel>;

const EN_CROP_LABELS = {
  carrot: { name: 'Carrot', description: "A crisp orange root; every farm's first friend." },
  wheat: { name: 'Wheat', description: 'The golden staple that fills the fields.' },
  potato: { name: 'Potato', description: 'A hearty root that grows heavy underground.' },
  onion: { name: 'Onion', description: "Pungent and sharp; it'll bring a tear." },
  sweet_potato: { name: 'Sweet Potato', description: 'An autumn treat that ripens sweet.' },
  corn: { name: 'Corn', description: 'Bright yellow kernels that pop with flavor.' },
  tomato: { name: 'Tomato', description: 'A tangy-sweet fruit ripening red.' },
  pepper: { name: 'Pepper', description: 'Small but fiery hot.' },
  mushroom: { name: 'Mushroom', description: 'A delicacy that quietly sprouts in the shade.' },
  rice: { name: 'Rice', description: 'The staple grain grown in flooded paddies.' },
  strawberry: { name: 'Strawberry', description: 'A fragrant red jewel of a berry.' },
  blueberry: { name: 'Blueberry', description: 'Deep-blue beads that burst on the tongue.' },
  grape: { name: 'Grape', description: 'Purple clusters hanging heavy on the vine.' },
  watermelon: { name: 'Watermelon', description: 'A cool fruit that beats the summer heat.' },
  melon: { name: 'Melon', description: 'Sweet flesh beneath a netted rind.' },
  sunflower: { name: 'Sunflower', description: 'A yellow bloom that follows the sun.' },
  pumpkin: { name: 'Golden Pumpkin', description: 'A giant gourd gleaming golden.' },
  apple: { name: 'Apple Tree', description: 'An orchard tree bearing bright red fruit.' },
  pear: { name: 'Pear Tree', description: 'Crisp and dripping with sweet juice.' },
  peach: { name: 'Peach Tree', description: 'A soft, pink fruit of summer.' },
  cherry: { name: 'Cherry Tree', description: 'Dainty red beads dangling in pairs.' },
  mango: { name: 'Mango Tree', description: 'A golden tropical fruit with a rich aroma.' },
  pineapple: { name: 'Pineapple', description: 'A tart fruit crowned with spiky leaves.' },
  coconut: { name: 'Coconut', description: 'Cool juice sealed inside a hard shell.' },
  kiwi: { name: 'Kiwi', description: 'Tangy green flesh under a fuzzy coat.' },
  avocado: { name: 'Avocado', description: 'Smooth green flesh; butter of the forest.' },
  cactus: { name: 'Cactus', description: 'A thorny plant that hoards water in the desert.' },
  bamboo: { name: 'Bamboo', description: 'A green stalk that shoots up by the day.' },
  ginseng: { name: 'Ancient Ginseng', description: "A precious root holding a thousand years' vigor." },
  crystal_flower: { name: 'Crystal Flower', description: 'A bloom that shines clear as glass.' },
  diamond: { name: 'Gem Tree', description: 'A mystic tree that fruits with gems on every branch.' },
  starfruit: { name: 'Starlight Fruit', description: 'Slice it and a star appears.' },
  moonflower: { name: 'Moonflower', description: 'A flower that blooms only under moonlight.' },
  rainbow_tree: { name: 'Rainbow Tree', description: 'A tree that turns seven colors.' },
  world_tree: { name: 'World Tree', description: 'The legendary great tree that upholds the world.' },
  crystalberry: { name: 'Crystalberry', description: 'A berry that ripens clear as crystal.' },
  sun_grape: { name: 'Sun Grape', description: 'A cluster glowing hot with captured sunlight.' },
  royal_potato: { name: 'Royal Potato', description: 'A prized potato once served to kings.' },
  frost_blueberry: { name: 'Frost Blueberry', description: 'A berry made sweeter by the frost.' },
  ember_pepper: { name: 'Ember Pepper', description: 'A heat that blazes as if holding an ember.' },
  cloud_rice: { name: 'Cloud Rice', description: 'Rice that puffs up soft as a cloud.' },
  prism_melon: { name: 'Prism Melon', description: 'An iridescent melon that bends the light.' },
  dragon_mango: { name: 'Dragon Mango', description: "A legendary mango imbued with a dragon's power." },
  star_pineapple: { name: 'Star Pineapple', description: "A pineapple holding the night sky's stars." },
  moon_peach: { name: 'Moon Peach', description: 'A gentle peach ripened by the moon.' },
  aurora_kiwi: { name: 'Aurora Kiwi', description: "A kiwi tinted with the aurora's hues." },
  sacred_rice: { name: 'Sacred Rice', description: 'A holy grain once offered on altars.' },
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
  hybrid_greenhouse: {
    name: '교배 온실',
    target: '연구 해금',
    description: '연구로 해금한 신품종을 재배하는 특수 구역',
  },
} satisfies Record<AreaKey, AreaLabel>;

const KO_DECORATION_LABELS = {
  signpost: { name: '표지판', description: '농장 입구를 알리는 아담한 표지판' },
  fence: { name: '울타리', description: '구역을 정돈해 주는 나무 울타리' },
  scarecrow: { name: '허수아비', description: '밭을 지키는 든든한 허수아비' },
  flowerbed: { name: '꽃밭', description: '농장을 화사하게 물들이는 꽃밭' },
  pond: { name: '연못', description: '잔잔한 분위기를 더하는 작은 연못' },
  lantern: { name: '등불', description: '저녁 농장을 밝히는 따뜻한 등불' },
  well: { name: '우물', description: '농장의 중심을 잡아 주는 오래된 우물' },
  windmill: { name: '풍차', description: '바람을 타고 도는 그림 같은 풍차' },
  barn: { name: '헛간', description: '수확물이 가득한 붉은 지붕 헛간' },
  hot_spring: { name: '온천', description: '김이 모락모락 피어오르는 노천 온천' },
  golden_statue: { name: '황금 동상', description: '농장의 번영을 기리는 눈부신 황금 동상' },
  rainbow_fountain: { name: '무지개 분수', description: '물줄기마다 무지개가 걸리는 전설의 분수' },
} satisfies Record<DecorationKey, DescribedLabel>;

const KO_ANIMAL_LABELS = {
  chicken: { name: '닭', description: '20분마다 달걀을 낳는 든든한 첫 가축' },
  cow: { name: '젖소', description: '1시간마다 우유를 내는 농장의 큰 일꾼' },
  duck: { name: '오리', description: '30분마다 보드라운 깃털을 내주는 물가의 가축' },
  sheep: { name: '양', description: '90분마다 포근한 양털을 자아내는 목장 친구' },
  pig: { name: '돼지', description: '2시간마다 값진 송로버섯을 찾아내는 코 좋은 가축' },
  bee: { name: '꿀벌', description: '3시간마다 달콤한 꿀을 모아 오는 부지런한 일꾼' },
} satisfies Record<AnimalKey, DescribedLabel>;

const EN_ANIMAL_LABELS = {
  chicken: { name: 'Chicken', description: 'A trusty first animal that lays an egg every 20 minutes.' },
  cow: { name: 'Cow', description: 'A big farm helper that gives milk every hour.' },
  duck: { name: 'Duck', description: 'A waterside animal that offers soft down every 30 minutes.' },
  sheep: { name: 'Sheep', description: 'A pasture friend that spins cozy wool every 90 minutes.' },
  pig: { name: 'Pig', description: 'A keen-nosed animal that roots out prized truffles every 2 hours.' },
  bee: { name: 'Bee', description: 'A busy worker that gathers sweet honey every 3 hours.' },
} satisfies Record<AnimalKey, DescribedLabel>;

const KO_PRODUCTION_LABELS = {
  bread: { name: '빵', description: '밀을 구워 만든 든든한 빵' },
  juice: { name: '주스', description: '토마토를 짜서 만든 새콤한 주스' },
  pie: { name: '파이', description: '딸기를 듬뿍 올린 달콤한 파이' },
  pumpkin_tart: { name: '호박 타르트', description: '황금호박과 밀로 구운 고소한 타르트' },
  sunflower_oil: { name: '해바라기유', description: '해바라기씨를 짜서 만든 고급 기름' },
  melon_sorbet: { name: '멜론 소르베', description: '멜론과 호박을 갈아 얼린 시원한 디저트' },
  apple_cider: { name: '사과 사이다', description: '사과와 포도를 발효시킨 향긋한 사이다' },
  pear_jam: { name: '배 잼', description: '배를 오래 졸여 만든 진한 잼' },
  peach_compote: { name: '복숭아 콩포트', description: '복숭아를 설탕에 조린 달콤한 콩포트' },
  cherry_wine: { name: '체리 와인', description: '체리를 오래 숙성시킨 깊은 맛의 와인' },
  mango_pudding: { name: '망고 푸딩', description: '망고를 듬뿍 넣어 굳힌 부드러운 푸딩' },
} satisfies Record<ProductionRecipeKey, DescribedLabel>;

const EN_PRODUCTION_LABELS = {
  bread: { name: 'Bread', description: 'Hearty bread baked from wheat.' },
  juice: { name: 'Juice', description: 'Tangy juice pressed from tomatoes.' },
  pie: { name: 'Pie', description: 'A sweet pie piled with strawberries.' },
  pumpkin_tart: { name: 'Pumpkin Tart', description: 'A savory tart baked from golden pumpkin and wheat.' },
  sunflower_oil: { name: 'Sunflower Oil', description: 'Premium oil pressed from sunflower seeds.' },
  melon_sorbet: { name: 'Melon Sorbet', description: 'A cool frozen dessert blended from melon and pumpkin.' },
  apple_cider: { name: 'Apple Cider', description: 'Fragrant cider fermented from apples and grapes.' },
  pear_jam: { name: 'Pear Jam', description: 'Rich jam simmered slowly from pears.' },
  peach_compote: { name: 'Peach Compote', description: 'A sweet compote of peaches candied in sugar.' },
  cherry_wine: { name: 'Cherry Wine', description: 'Deep, aged wine matured from cherries.' },
  mango_pudding: { name: 'Mango Pudding', description: 'A smooth pudding set with plenty of mango.' },
} satisfies Record<ProductionRecipeKey, DescribedLabel>;

const EN_DECORATION_LABELS = {
  signpost: { name: 'Signpost', description: 'A tidy sign marking your farm entrance.' },
  fence: { name: 'Fence', description: 'A wooden fence that tidies up an area.' },
  scarecrow: { name: 'Scarecrow', description: 'A trusty scarecrow watching over the field.' },
  flowerbed: { name: 'Flower Bed', description: 'A bright flower bed that livens up the farm.' },
  pond: { name: 'Pond', description: 'A small pond that adds a calm touch.' },
  lantern: { name: 'Lantern', description: 'A warm lantern that lights the evening farm.' },
  well: { name: 'Well', description: 'An old well that anchors the heart of the farm.' },
  windmill: { name: 'Windmill', description: 'A picturesque windmill turning in the breeze.' },
  barn: { name: 'Barn', description: 'A red-roofed barn brimming with the harvest.' },
  hot_spring: { name: 'Hot Spring', description: 'An open-air spring with steam drifting up.' },
  golden_statue: { name: 'Golden Statue', description: 'A dazzling statue honoring your farm prosperity.' },
  rainbow_fountain: { name: 'Rainbow Fountain', description: 'A legendary fountain with a rainbow in every jet.' },
} satisfies Record<DecorationKey, DescribedLabel>;

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
  hybrid_greenhouse: {
    name: 'Hybrid Greenhouse',
    target: 'Research unlock',
    description: 'A special area for crossbred crops unlocked through research.',
  },
} satisfies Record<AreaKey, AreaLabel>;

const KO_MASTERY_RANK_LABELS = {
  bronze: { name: '브론즈' },
  silver: { name: '실버' },
  gold: { name: '골드' },
  prism: { name: '프리즘' },
} satisfies Record<MasteryRankKey, SimpleLabel>;

const EN_MASTERY_RANK_LABELS = {
  bronze: { name: 'Bronze' },
  silver: { name: 'Silver' },
  gold: { name: 'Gold' },
  prism: { name: 'Prism' },
} satisfies Record<MasteryRankKey, SimpleLabel>;

const KO_MUTATION_LABELS = {
  golden: { name: '황금' },
  rainbow: { name: '무지개' },
  giant: { name: '거대' },
  prism: { name: '프리즘' },
} satisfies Record<MutationKey, SimpleLabel>;

const EN_MUTATION_LABELS = {
  golden: { name: 'Golden' },
  rainbow: { name: 'Rainbow' },
  giant: { name: 'Giant' },
  prism: { name: 'Prism' },
} satisfies Record<MutationKey, SimpleLabel>;

const KO_REGION_ARCHETYPE_LABELS = {
  plains: { name: '평원' },
  highlands: { name: '고원' },
  desert: { name: '사막' },
  tundra: { name: '설원' },
  volcano: { name: '화산섬' },
} satisfies Record<RegionArchetypeKey, SimpleLabel>;

const EN_REGION_ARCHETYPE_LABELS = {
  plains: { name: 'Plains' },
  highlands: { name: 'Highlands' },
  desert: { name: 'Desert' },
  tundra: { name: 'Tundra' },
  volcano: { name: 'Volcanic Isle' },
} satisfies Record<RegionArchetypeKey, SimpleLabel>;

const REGION_ARCHETYPE_LABELS: Record<SupportedLocale, Record<RegionArchetypeKey, SimpleLabel>> = {
  'ko-KR': KO_REGION_ARCHETYPE_LABELS,
  'en-US': EN_REGION_ARCHETYPE_LABELS,
};

const KO_PRESTIGE_SKILL_LABELS = {
  starting_capital: { name: '시작 자금', description: '개척 후 시작 골드가 레벨당 10만G 늘어나요.' },
  global_profit: { name: '전역 판로', description: '모든 판매 수익이 레벨당 10% 늘어나요.' },
  global_speed: { name: '전역 성장', description: '모든 작물이 레벨당 5% 더 빨리 자라요.' },
  chain_yield: { name: '체인 운영', description: '운영 농장 수익이 레벨당 20% 늘어나요.' },
  offline_cap: { name: '야간 창고', description: '오프라인 수익 누적 상한이 레벨당 4시간 늘어나요.' },
  ad_amplifier: { name: '광고 증폭', description: '수확 부스트 배수가 레벨당 0.5 늘어나요.' },
} satisfies Record<PrestigeSkillKey, DescribedLabel>;

const EN_PRESTIGE_SKILL_LABELS = {
  starting_capital: { name: 'Seed Capital', description: '+100K starting gold per level after pioneering.' },
  global_profit: { name: 'Global Markets', description: '+10% sale profit per level, everywhere.' },
  global_speed: { name: 'Global Growth', description: 'All crops grow 5% faster per level.' },
  chain_yield: { name: 'Chain Operations', description: '+20% chain farm income per level.' },
  offline_cap: { name: 'Night Warehouse', description: '+4h offline income cap per level.' },
  ad_amplifier: { name: 'Ad Amplifier', description: '+0.5 harvest boost multiplier per level.' },
} satisfies Record<PrestigeSkillKey, DescribedLabel>;

const PRESTIGE_SKILL_LABELS: Record<SupportedLocale, Record<PrestigeSkillKey, DescribedLabel>> = {
  'ko-KR': KO_PRESTIGE_SKILL_LABELS,
  'en-US': EN_PRESTIGE_SKILL_LABELS,
};

const KO_RESEARCH_NODE_LABELS = {
  auto_harvest: { name: '자동 수확', description: '다 자란 작물을 자동으로 수확해요.' },
  auto_replant: { name: '자동 파종', description: '수확한 자리에 같은 작물을 자동으로 심어요.' },
  breeding_lab: { name: '교배 연구', description: '두 작물을 교배해 신품종을 만들어요.' },
  breeding_advanced: { name: '고급 교배', description: '희귀 작물 교배 조합을 해금해요.' },
  donation_amplifier: { name: '헌납 증폭', description: '헌납으로 받는 연구 포인트가 50% 늘어나요.' },
} satisfies Record<ResearchNodeKey, DescribedLabel>;

const EN_RESEARCH_NODE_LABELS = {
  auto_harvest: { name: 'Auto Harvest', description: 'Automatically harvests fully grown crops.' },
  auto_replant: { name: 'Auto Replant', description: 'Replants the same crop after each harvest.' },
  breeding_lab: { name: 'Breeding Lab', description: 'Crossbreed two crops into new varieties.' },
  breeding_advanced: { name: 'Advanced Breeding', description: 'Unlocks rare crossbreeding combos.' },
  donation_amplifier: { name: 'Donation Amplifier', description: 'Donations grant 50% more research points.' },
} satisfies Record<ResearchNodeKey, DescribedLabel>;

const RESEARCH_NODE_LABELS: Record<SupportedLocale, Record<ResearchNodeKey, DescribedLabel>> = {
  'ko-KR': KO_RESEARCH_NODE_LABELS,
  'en-US': EN_RESEARCH_NODE_LABELS,
};

const KO_ACHIEVEMENT_TRACK_LABELS = {
  harvest_total: { name: '누적 수확' },
  gold_earned: { name: '누적 골드' },
  mutation_hunter: { name: '변이 발견' },
  prestige_pioneer: { name: '농장 개척' },
  research_devotee: { name: '연구 공헌' },
  breed_collector: { name: '신품종 교배' },
  collection_curator: { name: '도감 수집' },
  attendance_devotee: { name: '연속 출석' },
} satisfies Record<AchievementTrackKey, SimpleLabel>;

const EN_ACHIEVEMENT_TRACK_LABELS = {
  harvest_total: { name: 'Total Harvests' },
  gold_earned: { name: 'Gold Earned' },
  mutation_hunter: { name: 'Mutations Found' },
  prestige_pioneer: { name: 'Farms Pioneered' },
  research_devotee: { name: 'Research Points' },
  breed_collector: { name: 'New Breeds' },
  collection_curator: { name: 'Collection' },
  attendance_devotee: { name: 'Daily Streak' },
} satisfies Record<AchievementTrackKey, SimpleLabel>;

const KO_TITLE_LABELS = {
  harvest_master: { name: '수확의 달인' },
  gold_baron: { name: '황금 부농' },
  mutation_seeker: { name: '변이 사냥꾼' },
  frontier_legend: { name: '개척의 전설' },
  lab_director: { name: '연구소장' },
  gene_artisan: { name: '교배 장인' },
  master_curator: { name: '도감 마스터' },
  loyal_farmer: { name: '개근 농부' },
} satisfies Record<TitleKey, SimpleLabel>;

const EN_TITLE_LABELS = {
  harvest_master: { name: 'Master Harvester' },
  gold_baron: { name: 'Gold Baron' },
  mutation_seeker: { name: 'Mutation Hunter' },
  frontier_legend: { name: 'Frontier Legend' },
  lab_director: { name: 'Lab Director' },
  gene_artisan: { name: 'Gene Artisan' },
  master_curator: { name: 'Master Curator' },
  loyal_farmer: { name: 'Loyal Farmer' },
} satisfies Record<TitleKey, SimpleLabel>;

const ACHIEVEMENT_TRACK_LABELS: Record<SupportedLocale, Record<AchievementTrackKey, SimpleLabel>> = {
  'ko-KR': KO_ACHIEVEMENT_TRACK_LABELS,
  'en-US': EN_ACHIEVEMENT_TRACK_LABELS,
};

const TITLE_LABELS: Record<SupportedLocale, Record<TitleKey, SimpleLabel>> = {
  'ko-KR': KO_TITLE_LABELS,
  'en-US': EN_TITLE_LABELS,
};

const MASTERY_RANK_LABELS: Record<SupportedLocale, Record<MasteryRankKey, SimpleLabel>> = {
  'ko-KR': KO_MASTERY_RANK_LABELS,
  'en-US': EN_MASTERY_RANK_LABELS,
};

const MUTATION_LABELS: Record<SupportedLocale, Record<MutationKey, SimpleLabel>> = {
  'ko-KR': KO_MUTATION_LABELS,
  'en-US': EN_MUTATION_LABELS,
};

const CROP_LABELS: Record<SupportedLocale, Record<CropKey, CropLabel>> = {
  'ko-KR': KO_CROP_LABELS,
  'en-US': EN_CROP_LABELS,
};

const AREA_LABELS: Record<SupportedLocale, Record<AreaKey, AreaLabel>> = {
  'ko-KR': KO_AREA_LABELS,
  'en-US': EN_AREA_LABELS,
};

const DECORATION_LABELS: Record<SupportedLocale, Record<DecorationKey, DescribedLabel>> = {
  'ko-KR': KO_DECORATION_LABELS,
  'en-US': EN_DECORATION_LABELS,
};

const ANIMAL_LABELS: Record<SupportedLocale, Record<AnimalKey, DescribedLabel>> = {
  'ko-KR': KO_ANIMAL_LABELS,
  'en-US': EN_ANIMAL_LABELS,
};

const PRODUCTION_LABELS: Record<SupportedLocale, Record<ProductionRecipeKey, DescribedLabel>> = {
  'ko-KR': KO_PRODUCTION_LABELS,
  'en-US': EN_PRODUCTION_LABELS,
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

export function getDecorationLabel(
  decorationKey: DecorationKey,
  locale: SupportedLocale = DEFAULT_LOCALE
): DescribedLabel {
  const labels = DECORATION_LABELS[locale] ?? DECORATION_LABELS[DEFAULT_LOCALE];
  const label = labels[decorationKey] ?? DECORATION_LABELS[DEFAULT_LOCALE][decorationKey];
  if (label == null) {
    throw new Error(`Missing decoration label: ${decorationKey}`);
  }
  return label;
}

export function getAnimalLabel(animalKey: AnimalKey, locale: SupportedLocale = DEFAULT_LOCALE): DescribedLabel {
  const labels = ANIMAL_LABELS[locale] ?? ANIMAL_LABELS[DEFAULT_LOCALE];
  const label = labels[animalKey] ?? ANIMAL_LABELS[DEFAULT_LOCALE][animalKey];
  if (label == null) {
    throw new Error(`Missing animal label: ${animalKey}`);
  }
  return label;
}

export function getProductionRecipeLabel(
  recipeKey: ProductionRecipeKey,
  locale: SupportedLocale = DEFAULT_LOCALE
): DescribedLabel {
  const labels = PRODUCTION_LABELS[locale] ?? PRODUCTION_LABELS[DEFAULT_LOCALE];
  const label = labels[recipeKey] ?? PRODUCTION_LABELS[DEFAULT_LOCALE][recipeKey];
  if (label == null) {
    throw new Error(`Missing production recipe label: ${recipeKey}`);
  }
  return label;
}

export function getMasteryRankLabel(rankKey: MasteryRankKey, locale: SupportedLocale = DEFAULT_LOCALE): SimpleLabel {
  const labels = MASTERY_RANK_LABELS[locale] ?? MASTERY_RANK_LABELS[DEFAULT_LOCALE];
  const label = labels[rankKey] ?? MASTERY_RANK_LABELS[DEFAULT_LOCALE][rankKey];
  if (label == null) {
    throw new Error(`Missing mastery rank label: ${rankKey}`);
  }
  return label;
}

export function getMutationLabel(mutationKey: MutationKey, locale: SupportedLocale = DEFAULT_LOCALE): SimpleLabel {
  const labels = MUTATION_LABELS[locale] ?? MUTATION_LABELS[DEFAULT_LOCALE];
  const label = labels[mutationKey] ?? MUTATION_LABELS[DEFAULT_LOCALE][mutationKey];
  if (label == null) {
    throw new Error(`Missing mutation label: ${mutationKey}`);
  }
  return label;
}

export function getRegionArchetypeLabel(
  archetypeKey: RegionArchetypeKey,
  locale: SupportedLocale = DEFAULT_LOCALE
): SimpleLabel {
  const labels = REGION_ARCHETYPE_LABELS[locale] ?? REGION_ARCHETYPE_LABELS[DEFAULT_LOCALE];
  const label = labels[archetypeKey] ?? REGION_ARCHETYPE_LABELS[DEFAULT_LOCALE][archetypeKey];
  if (label == null) {
    throw new Error(`Missing region archetype label: ${archetypeKey}`);
  }
  return label;
}

export function getPrestigeSkillLabel(
  skillKey: PrestigeSkillKey,
  locale: SupportedLocale = DEFAULT_LOCALE
): DescribedLabel {
  const labels = PRESTIGE_SKILL_LABELS[locale] ?? PRESTIGE_SKILL_LABELS[DEFAULT_LOCALE];
  const label = labels[skillKey] ?? PRESTIGE_SKILL_LABELS[DEFAULT_LOCALE][skillKey];
  if (label == null) {
    throw new Error(`Missing prestige skill label: ${skillKey}`);
  }
  return label;
}

export function getResearchNodeLabel(
  nodeKey: ResearchNodeKey,
  locale: SupportedLocale = DEFAULT_LOCALE
): DescribedLabel {
  const labels = RESEARCH_NODE_LABELS[locale] ?? RESEARCH_NODE_LABELS[DEFAULT_LOCALE];
  const label = labels[nodeKey] ?? RESEARCH_NODE_LABELS[DEFAULT_LOCALE][nodeKey];
  if (label == null) {
    throw new Error(`Missing research node label: ${nodeKey}`);
  }
  return label;
}

export function getAchievementTrackLabel(
  trackKey: AchievementTrackKey,
  locale: SupportedLocale = DEFAULT_LOCALE
): SimpleLabel {
  const labels = ACHIEVEMENT_TRACK_LABELS[locale] ?? ACHIEVEMENT_TRACK_LABELS[DEFAULT_LOCALE];
  const label = labels[trackKey] ?? ACHIEVEMENT_TRACK_LABELS[DEFAULT_LOCALE][trackKey];
  if (label == null) {
    throw new Error(`Missing achievement track label: ${trackKey}`);
  }
  return label;
}

export function getTitleLabel(titleKey: TitleKey, locale: SupportedLocale = DEFAULT_LOCALE): SimpleLabel {
  const labels = TITLE_LABELS[locale] ?? TITLE_LABELS[DEFAULT_LOCALE];
  const label = labels[titleKey] ?? TITLE_LABELS[DEFAULT_LOCALE][titleKey];
  if (label == null) {
    throw new Error(`Missing title label: ${titleKey}`);
  }
  return label;
}

export function getCropLabels(locale: SupportedLocale = DEFAULT_LOCALE): Record<CropKey, CropLabel> {
  return CROP_LABELS[locale] ?? CROP_LABELS[DEFAULT_LOCALE];
}

export function getAreaLabels(locale: SupportedLocale = DEFAULT_LOCALE): Record<AreaKey, AreaLabel> {
  return AREA_LABELS[locale] ?? AREA_LABELS[DEFAULT_LOCALE];
}
