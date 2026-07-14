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
} from '../../types';

export type CropLabel = {
  name: string;
  // 도감(컬렉션)에서 노출하는 한 줄 플레이버 텍스트. 수집 동기·세계관 보강용이며
  // 발견한 작물에만 표시된다(미발견은 잠금 표현 유지). 모든 지원 로케일 필수.
  description: string;
};

export type AreaLabel = {
  name: string;
  target: string;
  description: string;
};

export type SimpleLabel = {
  name: string;
};

export type DescribedLabel = {
  name: string;
  description: string;
};

// 한 로케일이 제공해야 하는 전체 라벨 카탈로그. 각 Record는 key 집합 누락 시
// 컴파일 에러가 나므로(예: 신규 작물 추가), 로케일 간 커버리지가 타입으로 강제된다.
export type LabelBundle = {
  crop: Record<CropKey, CropLabel>;
  area: Record<AreaKey, AreaLabel>;
  decoration: Record<DecorationKey, DescribedLabel>;
  animal: Record<AnimalKey, DescribedLabel>;
  production: Record<ProductionRecipeKey, DescribedLabel>;
  masteryRank: Record<MasteryRankKey, SimpleLabel>;
  mutation: Record<MutationKey, SimpleLabel>;
  regionArchetype: Record<RegionArchetypeKey, SimpleLabel>;
  prestigeSkill: Record<PrestigeSkillKey, DescribedLabel>;
  researchNode: Record<ResearchNodeKey, DescribedLabel>;
  achievementTrack: Record<AchievementTrackKey, SimpleLabel>;
  title: Record<TitleKey, SimpleLabel>;
};
