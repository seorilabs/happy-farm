// AppsInToss Granite 번들에서 런타임 예외로 변환되는 소스/산출물 패턴을 검출한다.
// CommonJS로 두어 Jest와 ESM CLI 양쪽에서 같은 판정기를 재사용한다.

const fs = require('node:fs');
const path = require('node:path');

const AIT_RUNTIME_SOURCE_ROOTS = ['apps/ait/src', 'packages/farm-core/src', 'packages/farm-ui/src'];
const EXCLUDED_DIR_NAMES = new Set(['__tests__', '__mocks__', 'node_modules']);
const SOURCE_FILE_PATTERN = /\.(js|jsx|ts|tsx)$/;
const EXCLUDED_FILE_PATTERN = /(\.test\.|\.spec\.|\.d\.ts$)/;
const AIT_BUNDLE_FILE_PATTERN = /^bundle\.(ios|android)(\.[^.]+)*\.js$/;

function toRelativePath(rootDir, absolutePath) {
  return path.relative(rootDir, absolutePath).split(path.sep).join('/');
}

function collectFilesUnder(rootDir, relativeRoot, includeFile) {
  const targets = [];
  const absoluteRoot = path.join(rootDir, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) {
    return targets;
  }

  const walk = (absoluteDir) => {
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      const absolutePath = path.join(absoluteDir, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIR_NAMES.has(entry.name)) {
          walk(absolutePath);
        }
      } else if (entry.isFile() && includeFile(entry.name)) {
        targets.push(toRelativePath(rootDir, absolutePath));
      }
    }
  };

  walk(absoluteRoot);
  return targets.sort();
}

function collectAitRuntimeSourceTargets(rootDir, roots = AIT_RUNTIME_SOURCE_ROOTS) {
  return roots.flatMap((relativeRoot) =>
    collectFilesUnder(
      rootDir,
      relativeRoot,
      (fileName) => SOURCE_FILE_PATTERN.test(fileName) && !EXCLUDED_FILE_PATTERN.test(fileName)
    )
  );
}

function collectAitBundleTargets(rootDir, relativeRoot = 'apps/ait/dist') {
  return collectFilesUnder(rootDir, relativeRoot, (fileName) => AIT_BUNDLE_FILE_PATTERN.test(fileName));
}

function lineNumberAt(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function collectPatternViolations(source, filePath, patterns, message) {
  const violations = [];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) != null) {
      violations.push({
        file: filePath,
        line: lineNumberAt(source, match.index),
        message,
        snippet: match[0],
      });
    }
  }
  return violations;
}

function findAitSourceRuntimeViolations(source, filePath = '(source)') {
  return collectPatternViolations(
    source,
    filePath,
    [/(?:\bBigInt\s*\([^)]*\)\s*\*\*|\*\*\s*\bBigInt\s*\()/g],
    'BigInt 지수 연산은 Granite 번들에서 Math.pow로 변환되어 AIT 런타임에서 실패합니다.'
  );
}

function findAitBundleRuntimeViolations(source, filePath = '(bundle)') {
  const violations = collectPatternViolations(
    source,
    filePath,
    [/Math\.pow\s*\([^;\n]{0,240}\bBigInt\s*\(/g],
    '번들에 Math.pow와 BigInt 조합이 포함되어 AIT 시작 시 TypeError가 발생합니다.'
  );

  if (
    /^apps\/ait\/dist\/bundle\.android(?:\.[^.]+)*\.js$/.test(filePath) &&
    !source.includes('disableAudioFocus')
  ) {
    violations.push({
      file: filePath,
      line: 0,
      message: 'Android AIT 번들에 동시 BGM/SFX 재생용 disableAudioFocus 연결이 없습니다.',
      snippet: '',
    });
  }

  return violations;
}

module.exports = {
  AIT_RUNTIME_SOURCE_ROOTS,
  collectAitBundleTargets,
  collectAitRuntimeSourceTargets,
  findAitBundleRuntimeViolations,
  findAitSourceRuntimeViolations,
};
