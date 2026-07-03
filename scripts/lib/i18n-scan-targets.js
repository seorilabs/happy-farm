// check:i18n 의 한글 하드코딩 스캔 대상을 "디렉터리 재귀 탐색"으로 수집하는 모듈.
//
// 배경: 과거 check-i18n.mjs 는 스캔 대상 파일을 고정 목록으로 나열했다. 이 방식은
// 에이전트/작업자가 새 컴포넌트나 코어 모듈을 추가하면 그 파일이 검사망에서 조용히
// 빠지는 구조적 구멍이 있었다(실제로 MissionsSheet/WheelSheet/FarmOnboarding 등이
// 목록에 없었다). 그래서 "사용자-facing 문자열이 들어갈 수 있는 소스 루트 전체"를
// 재귀 탐색해 대상 파일을 자동 수집한다. 새 파일은 추가되는 즉시 검사 대상이 된다.
//
// 제외 규칙(한글이 정상적으로 존재하는 곳):
//   - i18n 디렉터리: locale catalog(ko-KR 문자열)가 사는 곳이므로 스캔하지 않는다.
//   - __tests__/__mocks__, *.test.*, *.spec.*: 테스트 fixture 의 한글은 사용자-facing 이 아니다.
//   - *.d.ts: 타입 선언 파일.
//
// hangul-scan.js 와 같은 이유로 CommonJS(.js)로 둔다 — CLI(.mjs, ESM interop)와
// jest(granite babel 프리셋) 양쪽에서 그대로 로드할 수 있다.

const fs = require('node:fs');
const path = require('node:path');

// 사용자-facing 문자열이 들어갈 수 있는 소스 루트 전체.
const I18N_SCAN_ROOTS = ['packages/farm-ui/src', 'packages/farm-core/src', 'apps/ait/src', 'apps/mobile/src'];

const EXCLUDED_DIR_NAMES = new Set(['__tests__', '__mocks__', 'i18n', 'node_modules']);
const SOURCE_FILE_PATTERN = /\.(ts|tsx)$/;
const EXCLUDED_FILE_PATTERN = /(\.test\.|\.spec\.|\.d\.ts$)/;

/**
 * 단일 루트 아래의 스캔 대상 파일을 재귀 수집한다.
 * @param {string} rootDir 절대 경로 기준 디렉터리(레포 루트)
 * @param {string} relativeRoot rootDir 기준 상대 루트(예: 'packages/farm-ui/src')
 * @returns {string[]} rootDir 기준 상대 경로 목록(정렬됨, posix 구분자)
 */
function collectScanTargetsUnder(rootDir, relativeRoot) {
  const targets = [];
  const absoluteRoot = path.join(rootDir, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) {
    return targets;
  }

  const walk = (absoluteDir) => {
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      const absolutePath = path.join(absoluteDir, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
        walk(absolutePath);
      } else if (
        entry.isFile() &&
        SOURCE_FILE_PATTERN.test(entry.name) &&
        !EXCLUDED_FILE_PATTERN.test(entry.name)
      ) {
        targets.push(path.relative(rootDir, absolutePath).split(path.sep).join('/'));
      }
    }
  };

  walk(absoluteRoot);
  return targets.sort();
}

/**
 * 모든 스캔 루트의 대상 파일을 수집한다.
 * @param {string} rootDir 레포 루트 절대 경로
 * @param {string[]} [roots] 스캔 루트 목록(기본: I18N_SCAN_ROOTS)
 * @returns {string[]} rootDir 기준 상대 경로 목록(루트 순서대로, 루트 내 정렬)
 */
function collectI18nScanTargets(rootDir, roots = I18N_SCAN_ROOTS) {
  return roots.flatMap((relativeRoot) => collectScanTargetsUnder(rootDir, relativeRoot));
}

module.exports = { I18N_SCAN_ROOTS, collectI18nScanTargets, collectScanTargetsUnder };
