// 전 세계 론칭 대상 로케일. 저장 데이터에는 이 stable key만 저장하고,
// 사용자-facing 문자열은 각 locale catalog에서 조회한다.
export const SUPPORTED_LOCALES = ['ko-KR', 'en-US', 'ja', 'zh-Hans', 'zh-Hant', 'de', 'fr', 'es'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

// 전 세계 론칭 기준 기본 로케일이자 미해석 로케일의 최종 폴백. 지원하지 않는 언어의
// 기기/브라우저는 한국어가 아닌 영어로 노출한다(글로벌 기본값). 한국어 기기는
// normalizeLocale에서 'ko'가 명시적으로 'ko-KR'로 매핑되므로 영향받지 않는다.
export const DEFAULT_LOCALE: SupportedLocale = 'en-US';

// 언어 선택 UI(설정 시트)에서 각 언어를 자기 언어 이름(endonym)으로 노출한다.
// 현재 활성 로케일과 무관하게 동일하게 읽히도록 catalog가 아닌 정적 상수로 둔다.
export const LOCALE_ENDONYMS: Record<SupportedLocale, string> = {
  'ko-KR': '한국어',
  'en-US': 'English',
  ja: '日本語',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
};

/**
 * 플랫폼/브라우저가 넘겨준 BCP-47 로케일 문자열을 지원 로케일로 정규화한다.
 * 정확히 일치하는 지원 로케일이 있으면 그대로 쓰고, 없으면 언어(+스크립트/지역)
 * 태그로 가장 가까운 지원 로케일을 고른다. 어느 것에도 맞지 않으면 기본 로케일.
 */
export function normalizeLocale(value: string | null | undefined): SupportedLocale {
  if (value == null) return DEFAULT_LOCALE;

  // 정확 일치 우선(예: 'zh-Hans', 'ko-KR').
  if ((SUPPORTED_LOCALES as readonly string[]).includes(value)) {
    return value as SupportedLocale;
  }

  const lower = value.toLowerCase().replace(/_/g, '-');
  const [language] = lower.split('-');

  // 중국어는 스크립트/지역으로 간체·번체를 가른다.
  if (language === 'zh') {
    if (
      lower.includes('hant') ||
      lower.includes('tw') ||
      lower.includes('hk') ||
      lower.includes('mo')
    ) {
      return 'zh-Hant';
    }
    return 'zh-Hans';
  }

  switch (language) {
    case 'ko':
      return 'ko-KR';
    case 'en':
      return 'en-US';
    case 'ja':
    case 'jp':
      return 'ja';
    case 'de':
      return 'de';
    case 'fr':
      return 'fr';
    case 'es':
      return 'es';
    default:
      return DEFAULT_LOCALE;
  }
}
