// 시간대 환경 연출(낮/노을/밤 배경 톤).
// "하루 중 분(分) → 배경 톤" 순수 결정론 매핑. 디바이스 로컬 시계의 minutesOfDay를 받아
// 하루를 도는 키프레임 사이를 선형 보간(lerp)해 부드럽게 바뀌는 배경색을 돌려준다. 무상태이며
// 같은 입력이면 항상 같은 톤을 주므로 3마켓(UI 비의존)에서 공유·테스트할 수 있다.
// 모든 톤은 밝게 유지해, 어두운 본문 텍스트/시트·카드와의 대비가 항상 충분하도록 한다.

export type EnvironmentPhase = 'night' | 'dawn' | 'day' | 'dusk';

// 계절 앰비언트(#353): 시간대 톤과 독립적인 월(月) 기반 계절 연출. 배경에 계절별
// 낙하 파티클(봄=꽃잎/여름=없음/가을=낙엽/겨울=눈)을 얹기 위한 순수 결정론 매핑으로,
// 게임플레이·경제에 영향이 없다(순수 장식). UI 비의존이라 3마켓 공유·테스트 가능.
export type SeasonKey = 'spring' | 'summer' | 'autumn' | 'winter';
export type SeasonalAmbienceParticle = 'petal' | 'leaf' | 'snow' | 'none';
export type SeasonalAmbience = {
  season: SeasonKey;
  // 여름은 '맑음'이라 낙하 파티클이 없다('none').
  particle: SeasonalAmbienceParticle;
};

// 월(0=1월..11=12월, 로컬 시계) → 계절. 북반구 기준으로 3~5월=봄, 6~8월=여름,
// 9~11월=가을, 12·1·2월=겨울. 12월(11)과 1·2월(0·1)이 모두 겨울로 감싸진다.
const SEASON_BY_MONTH: readonly SeasonKey[] = [
  'winter', // 0 = 1월
  'winter', // 1 = 2월
  'spring', // 2 = 3월
  'spring', // 3 = 4월
  'spring', // 4 = 5월
  'summer', // 5 = 6월
  'summer', // 6 = 7월
  'summer', // 7 = 8월
  'autumn', // 8 = 9월
  'autumn', // 9 = 10월
  'autumn', // 10 = 11월
  'winter', // 11 = 12월
];

const PARTICLE_BY_SEASON: Record<SeasonKey, SeasonalAmbienceParticle> = {
  spring: 'petal',
  summer: 'none',
  autumn: 'leaf',
  winter: 'snow',
};

// 디바이스 로컬 날짜(Date)에서 계절 앰비언트를 결정론적으로 산출한다. 같은 월이면
// 항상 같은 결과를 준다. 비정상 Date(Invalid)는 파티클이 없는 여름으로 폴백해 렌더
// 레이어를 안전하게 억제한다. 월은 방어적으로 [0,11]로 wrap한다.
export function getSeasonalAmbience(date: Date): SeasonalAmbience {
  const month = Number.isFinite(date.getTime()) ? date.getMonth() : 5;
  const season = SEASON_BY_MONTH[((month % 12) + 12) % 12] ?? 'summer';
  return { season, particle: PARTICLE_BY_SEASON[season] };
}

export type EnvironmentTone = {
  phase: EnvironmentPhase;
  // 최상위 컨테이너에 적용할 배경색(#rrggbb).
  backgroundColor: string;
};

const MINUTES_PER_DAY = 24 * 60;

type Rgb = readonly [number, number, number];

type Keyframe = {
  // 하루 중 분(0..1440). 0과 1440은 동일한 자정 톤으로 감싼다.
  minute: number;
  // 이 키프레임에서 시작하는 구간의 시간대 라벨.
  phase: EnvironmentPhase;
  color: Rgb;
};

// 자정(밤) → 새벽 → 낮 → 노을 → 밤으로 순환하는 톤 키프레임. 채널 변화량/구간 길이가 작아
// 분당 색 변화가 1 안팎이라 급변 없이 자연스럽게 이어진다. 모든 색은 밝은 파스텔이라 대비 유지.
const KEYFRAMES: readonly Keyframe[] = [
  { minute: 0, phase: 'night', color: [223, 228, 242] }, // 00:00 #dfe4f2 (차분한 새벽 전 밤)
  { minute: 300, phase: 'night', color: [223, 228, 242] }, // 05:00
  { minute: 390, phase: 'dawn', color: [253, 239, 227] }, // 06:30 #fdefe3 (따뜻한 새벽)
  { minute: 480, phase: 'day', color: [234, 246, 230] }, // 08:00 #eaf6e6 (맑은 낮 — 기존 톤 계열)
  { minute: 990, phase: 'day', color: [234, 246, 230] }, // 16:30
  { minute: 1110, phase: 'dusk', color: [251, 227, 214] }, // 18:30 #fbe3d6 (노을)
  { minute: 1230, phase: 'night', color: [223, 228, 242] }, // 20:30
  { minute: MINUTES_PER_DAY, phase: 'night', color: [223, 228, 242] }, // 24:00 = 00:00 wrap
];

function clampChannel(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return Math.round(value);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((channel) => clampChannel(channel).toString(16).padStart(2, '0')).join('')}`;
}

// 디바이스 로컬 시각(Date)에서 하루 중 분(0..1439)을 뽑는다. UI에서 이 값을 getEnvironmentTone에
// 넘긴다. 자정/낮밤은 사용자 체감이 중요하므로 UTC가 아닌 로컬 시계를 쓴다.
export function getLocalMinutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

// minutesOfDay → 배경 톤. 입력은 [0,1440)로 wrap하며 비정상 값은 자정으로 폴백한다.
export function getEnvironmentTone(minutesOfDay: number): EnvironmentTone {
  const safeMinutes = Number.isFinite(minutesOfDay)
    ? ((minutesOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
    : 0;

  for (let i = 0; i < KEYFRAMES.length - 1; i += 1) {
    const start = KEYFRAMES[i]!;
    const end = KEYFRAMES[i + 1]!;
    if (safeMinutes >= start.minute && safeMinutes < end.minute) {
      const span = end.minute - start.minute;
      const t = span === 0 ? 0 : (safeMinutes - start.minute) / span;
      const color: Rgb = [
        lerp(start.color[0], end.color[0], t),
        lerp(start.color[1], end.color[1], t),
        lerp(start.color[2], end.color[2], t),
      ];
      return { phase: start.phase, backgroundColor: toHex(color) };
    }
  }

  // Unreachable for wrapped input, but keep a defined daytime fallback.
  return { phase: 'day', backgroundColor: toHex(KEYFRAMES[3]!.color) };
}
