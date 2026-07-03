// 스토어 메타데이터(콘솔 등록 문구)의 마켓별 글자수 제한 가드.
//
// Apple App Store / Google Play 콘솔은 필드별 최대 글자수를 강제한다. 제한을 넘는
// 문구는 콘솔 등록/심사 제출 단계에서야 거절되므로, check:i18n 단계에서 미리 잡아
// 번역 추가·수정 시 제한 초과가 레포에 들어오지 못하게 한다(하네싱 Layer 3).
//
// 제한값 출처(2026-07 기준 콘솔 스펙):
//   - Google Play: 앱 이름 30, 간단한 설명 80, 자세한 설명 4000, 출시 노트 500
//   - App Store: 이름 30, 부제 30, 프로모션 텍스트 170, 설명 4000, 키워드 100, 새로운 기능 4000
//
// hangul-scan.js 와 같은 이유로 CommonJS(.js)로 둔다(CLI + jest 겸용).

// Google Play 콘솔 필드별 최대 글자수. 키는 config JSON 안의 dot-path.
const PLAY_STORE_TEXT_LIMITS = [
  { path: 'storeListing.appName', limit: 30 },
  { path: 'storeListing.shortDescription', limit: 80 },
  { path: 'storeListing.fullDescription', limit: 4000 },
  { path: 'release.notes', limit: 500 },
];

// App Store Connect 필드별 최대 글자수.
const APP_STORE_TEXT_LIMITS = [
  { path: 'storeListing.appName', limit: 30 },
  { path: 'storeListing.subtitle', limit: 30 },
  { path: 'storeListing.promotionalText', limit: 170 },
  { path: 'storeListing.description', limit: 4000 },
  { path: 'storeListing.keywords', limit: 100 },
  { path: 'version.releaseNotes', limit: 4000 },
];

/**
 * 사용자 눈에 보이는 글자수(코드 포인트 수)를 센다.
 * String.prototype.length 는 UTF-16 코드 유닛 수라 서로게이트 쌍(이모지 등)을
 * 2로 세므로, 스토어 콘솔이 세는 방식(문자 수)에 맞춰 코드 포인트로 센다.
 * @param {string} value
 * @returns {number}
 */
function countTextLength(value) {
  return [...value].length;
}

/**
 * config 객체에서 dot-path 로 값을 찾는다. 없으면 undefined.
 * @param {object} config
 * @param {string} dotPath 예: 'storeListing.appName'
 */
function resolvePath(config, dotPath) {
  return dotPath.split('.').reduce((value, key) => (value == null ? undefined : value[key]), config);
}

/**
 * locale map 형태({ 'ko-KR': string, 'en-US': string, ... }) 필드들의 글자수 제한
 * 위반을 수집한다. 값 존재 여부는 기존 requireLocaleMap 검사가 담당하므로,
 * 여기서는 문자열로 존재하는 값의 길이만 본다.
 * @param {string} configName 리포트용 config 이름(예: 'play-store')
 * @param {object} config 파싱된 config JSON
 * @param {Array<{ path: string, limit: number }>} limits
 * @returns {{ violations: string[], passes: string[] }}
 */
function collectStoreTextLimitViolations(configName, config, limits) {
  const violations = [];
  const passes = [];

  for (const { path: dotPath, limit } of limits) {
    const localeMap = resolvePath(config, dotPath);
    if (localeMap == null || typeof localeMap !== 'object') {
      // 필드 자체의 부재는 locale map 존재 검사(requireLocaleMap)가 실패로 잡는다.
      continue;
    }
    for (const [locale, value] of Object.entries(localeMap)) {
      if (typeof value !== 'string') continue;
      const length = countTextLength(value);
      if (length > limit) {
        violations.push(
          `${configName}.${dotPath}.${locale} 글자수 ${length}자가 제한 ${limit}자를 초과합니다.`,
        );
      } else {
        passes.push(`${configName}.${dotPath}.${locale} 글자수 ${length}/${limit}자.`);
      }
    }
  }

  return { violations, passes };
}

module.exports = {
  PLAY_STORE_TEXT_LIMITS,
  APP_STORE_TEXT_LIMITS,
  countTextLength,
  collectStoreTextLimitViolations,
};
