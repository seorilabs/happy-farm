import fs from 'node:fs';
import path from 'node:path';

import { scanHardcodedHangul } from './lib/hangul-scan.js';
import { I18N_SCAN_ROOTS, collectI18nScanTargets } from './lib/i18n-scan-targets.js';
import {
  APP_STORE_TEXT_LIMITS,
  PLAY_STORE_TEXT_LIMITS,
  collectStoreTextLimitViolations,
} from './lib/store-text-limits.js';

const root = process.cwd();
const requiredLocales = ['ko-KR', 'en-US'];
const failures = [];
const passes = [];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function requireLocaleMap(configName, mapPath, value) {
  for (const locale of requiredLocales) {
    const localeValue = value?.[locale];
    if (typeof localeValue !== 'string' || localeValue.trim() === '') {
      failures.push(`${configName}.${mapPath}.${locale} 값이 없습니다.`);
    } else {
      passes.push(`${configName}.${mapPath}.${locale} 값이 있습니다.`);
    }
  }
}

function assertNoHangul(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  // 검사 대상은 "사용자-facing 문자열 리터럴"이다. 한글 주석(// 라인, /* */ 블록,
  // /** */ JSDoc)은 위반이 아니다. 문자열 리터럴과 주석은 라인 단위 패턴 매칭으로는
  // 구분할 수 없으므로(예: const s = "안녕 // 메모"에서 // 뒤를 자르면 문자열 안의
  // 한글을 놓친다), 파일 전체를 문자 단위 상태 기계로 스캔한다. 자세한 규칙은
  // scripts/lib/hangul-scan.js 참고. 한글은 문자열/템플릿 리터럴 안에서만 위반이다.
  const { violations } = scanHardcodedHangul(content);
  for (const violation of violations) {
    failures.push(
      `${relativePath}:${violation.line} 사용자-facing 문자열은 locale catalog를 사용해야 합니다. (하드코딩 한글: ${violation.snippet})`,
    );
  }
  // 파일 단위 통과 메시지는 위반이 하나도 없을 때만 남긴다(집계 정확도).
  if (violations.length === 0) {
    passes.push(`${relativePath}에 한글 UI 하드코딩이 없습니다.`);
  }
}

// 마켓별 스토어 문구 글자수 제한 가드. 제한 초과는 콘솔 제출 단계에서야 드러나므로
// 번역 추가/수정 시점에 미리 실패시킨다.
function assertStoreTextLimits(configName, config, limits) {
  const result = collectStoreTextLimitViolations(configName, config, limits);
  failures.push(...result.violations);
  passes.push(...result.passes);
}

const playConfig = readJson('play-store/google-play.config.json');
requireLocaleMap('play-store', 'storeListing.appName', playConfig.storeListing?.appName);
requireLocaleMap('play-store', 'storeListing.shortDescription', playConfig.storeListing?.shortDescription);
requireLocaleMap('play-store', 'storeListing.fullDescription', playConfig.storeListing?.fullDescription);
requireLocaleMap('play-store', 'release.notes', playConfig.release?.notes);
assertStoreTextLimits('play-store', playConfig, PLAY_STORE_TEXT_LIMITS);

const appStoreConfig = readJson('app-store/app-store.config.json');
requireLocaleMap('app-store', 'storeListing.appName', appStoreConfig.storeListing?.appName);
requireLocaleMap('app-store', 'storeListing.subtitle', appStoreConfig.storeListing?.subtitle);
requireLocaleMap('app-store', 'storeListing.promotionalText', appStoreConfig.storeListing?.promotionalText);
requireLocaleMap('app-store', 'storeListing.description', appStoreConfig.storeListing?.description);
requireLocaleMap('app-store', 'storeListing.keywords', appStoreConfig.storeListing?.keywords);
requireLocaleMap('app-store', 'version.releaseNotes', appStoreConfig.version?.releaseNotes);
assertStoreTextLimits('app-store', appStoreConfig, APP_STORE_TEXT_LIMITS);

// 한글 하드코딩 스캔은 고정 파일 목록 대신 소스 루트 재귀 탐색으로 대상을 수집한다.
// 새로 추가되는 컴포넌트/모듈이 검사망에서 빠지지 않도록 하기 위함이다(제외 규칙은
// scripts/lib/i18n-scan-targets.js 참고 — i18n 카탈로그/테스트/타입 선언만 제외).
const scanTargets = collectI18nScanTargets(root);
if (scanTargets.length === 0) {
  failures.push(`한글 하드코딩 스캔 대상이 0개입니다. 스캔 루트(${I18N_SCAN_ROOTS.join(', ')})를 확인하세요.`);
}
for (const target of scanTargets) {
  assertNoHangul(target);
}

const result = {
  status: failures.length > 0 ? 'fail' : 'pass',
  passes,
  failures,
};

console.log(JSON.stringify(result, null, 2));

if (failures.length > 0) {
  process.exit(1);
}
