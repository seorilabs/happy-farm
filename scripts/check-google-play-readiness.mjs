#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const jsonMode = process.argv.includes('--json');
const placeholderTexts = new Set(['', '확정 필요', 'TBD', 'TODO', 'FIXME', 'N/A']);
const ignoredDirectories = new Set(['.git', '.granite', '.swc', 'build', 'coverage', 'dist', 'node_modules']);
const result = {
  status: 'pass',
  passes: [],
  warnings: [],
  failures: [],
};

function repoPath(path) {
  return join(root, path);
}

function isConcrete(value) {
  if (typeof value !== 'string') {
    return value != null;
  }
  return !placeholderTexts.has(value.trim());
}

function add(kind, message, detail) {
  result[kind].push(detail == null ? { message } : { message, detail });
}

function pass(message, detail) {
  add('passes', message, detail);
}

function warn(message, detail) {
  add('warnings', message, detail);
}

function fail(message, detail) {
  add('failures', message, detail);
}

function valueAt(config, path) {
  const parts = path.split('.');
  let value = config;
  for (const part of parts) {
    value = value?.[part];
  }
  return value;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(repoPath(path), 'utf8'));
  } catch (error) {
    fail(`${path}를 읽을 수 없습니다.`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

function collectFiles(startPath, predicate = () => true) {
  const absoluteStart = repoPath(startPath);
  if (!existsSync(absoluteStart)) {
    return [];
  }

  const files = [];
  const stack = [absoluteStart];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current == null) {
      continue;
    }

    const stat = statSync(current);
    if (stat.isDirectory()) {
      for (const child of readdirSync(current)) {
        if (ignoredDirectories.has(child)) {
          continue;
        }
        stack.push(join(current, child));
      }
      continue;
    }

    const rel = relative(root, current);
    if (predicate(rel)) {
      files.push(rel);
    }
  }
  return files.sort();
}

function collectFilesFrom(startPaths, predicate = () => true) {
  return startPaths.flatMap((startPath) => collectFiles(startPath, predicate)).sort();
}

function parseGradleValue(contents, key) {
  const quoted = contents.match(new RegExp(`${key}\\s*[= ]\\s*["']([^"']+)["']`));
  if (quoted != null) {
    return quoted[1];
  }

  const numeric = contents.match(new RegExp(`${key}\\s*[= ]\\s*(\\d+)`));
  return numeric?.[1] ?? null;
}

function parseGradleNumber(contents, keys) {
  for (const key of keys) {
    const value = Number.parseInt(parseGradleValue(contents, key) ?? '', 10);
    if (!Number.isNaN(value)) {
      return value;
    }
  }
  return Number.NaN;
}

function extractGradleBlock(contents, blockName) {
  const blockPattern = new RegExp(`(^|\\s)${blockName}\\s*\\{`, 'm');
  const match = blockPattern.exec(contents);
  if (match == null) {
    return null;
  }

  const openBraceIndex = contents.indexOf('{', match.index);
  let depth = 0;
  for (let index = openBraceIndex; index < contents.length; index += 1) {
    const char = contents[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return contents.slice(openBraceIndex + 1, index);
      }
    }
  }
  return null;
}

function getReleaseBuildTypeBlock(contents) {
  const buildTypesBlock = extractGradleBlock(contents, 'buildTypes');
  return buildTypesBlock == null ? null : extractGradleBlock(buildTypesBlock, 'release');
}

function hasDebugReleaseSigning(contents) {
  const releaseBuildTypeBlock = getReleaseBuildTypeBlock(contents);
  return releaseBuildTypeBlock != null && /signingConfig\s+signingConfigs\.debug/.test(releaseBuildTypeBlock);
}

function hasReleaseSigningConfig(contents) {
  const releaseBuildTypeBlock = getReleaseBuildTypeBlock(contents);
  return releaseBuildTypeBlock != null && /signingConfig\s+signingConfigs\./.test(releaseBuildTypeBlock);
}

function hasDynamicVersionCode(contents) {
  return /versionCodeOverride|GOOGLE_PLAY_VERSION_CODE|resolveVersionCode/.test(contents);
}

function assertValue(label, value, validator = isConcrete) {
  if (!validator(value)) {
    fail(`${label} 값이 확정되지 않았습니다.`, value == null ? 'missing' : String(value));
    return null;
  }
  pass(`${label} 값이 있습니다.`, String(value));
  return value;
}

function assertField(config, path, validator = isConcrete) {
  return assertValue(path, valueAt(config, path), validator);
}

function listingValue(config, key, locale) {
  const listing = config.storeListing ?? {};
  const currentSchemaKey = key === 'title' ? 'appName' : key;
  return listing[currentSchemaKey]?.[locale] ?? listing[locale]?.[key];
}

function releaseNote(config, locale) {
  const notes = config.release?.notes ?? config.release?.releaseNotes ?? {};
  if (typeof notes !== 'object' || notes == null) {
    return null;
  }
  return notes[locale] ?? Object.values(notes).find((value) => isConcrete(value)) ?? null;
}

function assetValue(assets, key, legacyKey) {
  return assets[key] ?? (legacyKey == null ? undefined : assets[legacyKey]);
}

function checkAssetPaths(key, value) {
  const values = Array.isArray(value) ? value : [value];
  if (values.length === 0 || !isConcrete(value)) {
    fail(`assets.${key} 경로가 확정되지 않았습니다.`, value == null ? 'missing' : String(value));
    return;
  }

  for (const assetPath of values) {
    if (!isConcrete(assetPath)) {
      fail(`assets.${key} 경로가 확정되지 않았습니다.`, String(assetPath));
    } else if (!existsSync(repoPath(assetPath))) {
      fail(`assets.${key} 파일이 없습니다.`, assetPath);
    } else {
      pass(`assets.${key} 파일이 있습니다.`, assetPath);
    }
  }
}

function yesLike(value) {
  return typeof value === 'string' && ['yes', 'true', 'y', '예'].includes(value.trim().toLowerCase());
}

const pkg = readJson('package.json');
if (pkg != null) {
  pass('package.json을 읽었습니다.', pkg.name);
  if (pkg.scripts?.['check:play'] == null) {
    warn('package.json에 check:play 스크립트가 없습니다.');
  }
}

const configPath = 'play-store/google-play.config.json';
const config = existsSync(repoPath(configPath)) ? readJson(configPath) : null;
if (config == null) {
  fail(`${configPath}가 없습니다.`);
} else {
  pass(`${configPath}를 읽었습니다.`);

  const packageName = assertField(config, 'packageName', (value) => {
    return typeof value === 'string' && /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(value);
  });
  if (packageName == null && isConcrete(config.suggestedPackageName)) {
    warn('packageName 확정 전 후보값이 있습니다.', config.suggestedPackageName);
  }

  assertField(config, 'defaultLanguage');
  assertField(config, 'appType', (value) => value === 'app' || value === 'game');
  assertField(config, 'freeOrPaid', (value) => value === 'free' || value === 'paid');
  assertField(config, 'contactEmail', (value) => typeof value === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value));
  assertField(config, 'privacyPolicyUrl', (value) => typeof value === 'string' && /^https:\/\//.test(value));
  assertField(config, 'release.name');

  const defaultLanguage = typeof config.defaultLanguage === 'string' ? config.defaultLanguage : 'ko-KR';
  assertValue(`storeListing.appName.${defaultLanguage}`, listingValue(config, 'title', defaultLanguage));
  assertValue(
    `storeListing.shortDescription.${defaultLanguage}`,
    listingValue(config, 'shortDescription', defaultLanguage),
    (value) => typeof value === 'string' && value.length > 0 && value.length <= 80,
  );
  assertValue(
    `storeListing.fullDescription.${defaultLanguage}`,
    listingValue(config, 'fullDescription', defaultLanguage),
    (value) => typeof value === 'string' && value.length > 0 && value.length <= 4000,
  );
  assertValue(`release.notes.${defaultLanguage}`, releaseNote(config, defaultLanguage));

  for (const declaration of ['contentRating', 'targetAudience', 'dataSafety', 'ads']) {
    assertField(config, `contentDeclarations.${declaration}`);
  }
  const koreaDistribution = config.contentDeclarations?.koreaDistribution ?? config.contentDeclarations?.koreaGameDistribution;
  assertValue('contentDeclarations.koreaDistribution', koreaDistribution);
  if (config.appType === 'game' && yesLike(koreaDistribution)) {
    assertField(config, 'contentDeclarations.koreaGameRating');
  }

  const assets = config.assets ?? {};
  for (const [key, value] of [
    ['playIcon', assetValue(assets, 'playIcon', 'appIcon')],
    ['featureGraphic', assetValue(assets, 'featureGraphic')],
    ['phoneScreenshots', assetValue(assets, 'phoneScreenshots')],
  ]) {
    checkAssetPaths(key, value);
  }
  for (const key of ['sevenInchTabletScreenshots', 'tenInchTabletScreenshots']) {
    const value = assets[key];
    if (Array.isArray(value) && value.length > 0) {
      checkAssetPaths(key, value);
    }
  }
}

const androidProjects = [
  {
    appBuildPath: 'android/app/build.gradle',
    rootBuildPath: 'android/build.gradle',
    bundleRoot: 'android/app/build/outputs/bundle',
    sourceRoots: ['src', 'packages/farm-core'],
  },
  {
    appBuildPath: 'android/app/build.gradle.kts',
    rootBuildPath: 'android/build.gradle.kts',
    bundleRoot: 'android/app/build/outputs/bundle',
    sourceRoots: ['src', 'packages/farm-core'],
  },
  {
    appBuildPath: 'apps/mobile/android/app/build.gradle',
    rootBuildPath: 'apps/mobile/android/build.gradle',
    bundleRoot: 'apps/mobile/android/app/build/outputs/bundle',
    sourceRoots: ['apps/mobile', 'packages/farm-core', 'packages/farm-ui'],
  },
  {
    appBuildPath: 'apps/mobile/android/app/build.gradle.kts',
    rootBuildPath: 'apps/mobile/android/build.gradle.kts',
    bundleRoot: 'apps/mobile/android/app/build/outputs/bundle',
    sourceRoots: ['apps/mobile', 'packages/farm-core', 'packages/farm-ui'],
  },
];
const androidProject = androidProjects.find((candidate) => existsSync(repoPath(candidate.appBuildPath)));
const appBuildPath = androidProject?.appBuildPath;
const androidRootExists = androidProject != null;

if (!androidRootExists || appBuildPath == null) {
  fail('Android 네이티브 프로젝트가 없습니다.', 'apps/mobile/android/app/build.gradle 또는 build.gradle.kts 필요');
} else {
  pass('Android 네이티브 프로젝트가 있습니다.', appBuildPath);
  const appBuildContents = readFileSync(repoPath(appBuildPath), 'utf8');
  const rootBuildContents =
    androidProject.rootBuildPath != null && existsSync(repoPath(androidProject.rootBuildPath))
      ? readFileSync(repoPath(androidProject.rootBuildPath), 'utf8')
      : '';
  const applicationId = parseGradleValue(appBuildContents, 'applicationId');
  const targetSdk = parseGradleNumber(appBuildContents, ['targetSdk', 'targetSdkVersion']) || parseGradleNumber(rootBuildContents, ['targetSdk', 'targetSdkVersion']);
  const versionCode = parseGradleNumber(appBuildContents, ['versionCode']);

  if (applicationId == null) {
    fail('Android applicationId를 찾지 못했습니다.', appBuildPath);
  } else {
    pass('Android applicationId를 찾았습니다.', applicationId);
    if (typeof config?.packageName === 'string' && /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(config.packageName) && config.packageName !== applicationId) {
      fail('Google Play packageName과 Android applicationId가 다릅니다.', `${config.packageName} != ${applicationId}`);
    }
  }

  if (Number.isNaN(targetSdk)) {
    fail('Android targetSdk를 찾지 못했습니다.', appBuildPath);
  } else if (targetSdk < 35) {
    fail('Google Play 신규 앱 제출 기준 targetSdk가 낮습니다.', `targetSdk=${targetSdk}, required>=35`);
  } else {
    pass('Google Play 신규 앱 제출 기준 targetSdk를 충족합니다.', String(targetSdk));
  }

  if ((Number.isNaN(versionCode) || versionCode <= 0) && !hasDynamicVersionCode(appBuildContents)) {
    fail('Android versionCode가 유효하지 않습니다.', appBuildPath);
  } else if (hasDynamicVersionCode(appBuildContents)) {
    pass('Android versionCode 자동 주입 설정이 있습니다.', 'versionCodeOverride 또는 GOOGLE_PLAY_VERSION_CODE');
  } else {
    pass('Android versionCode가 유효합니다.', String(versionCode));
  }

  if (!hasReleaseSigningConfig(appBuildContents)) {
    fail('Android release signing 설정이 없습니다.', appBuildPath);
  } else if (hasDebugReleaseSigning(appBuildContents)) {
    fail('Android release 빌드가 debug keystore로 서명됩니다.', 'upload key 기반 release signing 설정 필요');
  } else {
    pass('Android release signing 설정이 있습니다.');
  }
}

const aabSearchRoots = androidProject == null ? androidProjects.map((project) => project.bundleRoot) : [androidProject.bundleRoot];
const aabFiles = collectFilesFrom(aabSearchRoots, (path) => path.endsWith('.aab'));
if (aabFiles.length === 0) {
  fail('Android App Bundle(.aab)이 없습니다.', '예상 예: apps/mobile/android/app/build/outputs/bundle/release/app-release.aab');
} else {
  pass('Android App Bundle(.aab)을 찾았습니다.', aabFiles.join(', '));
}

const nativeSourceRoots = androidProject?.sourceRoots ?? ['apps/mobile', 'packages/farm-core', 'packages/farm-ui'];
const sourceFiles = collectFilesFrom(nativeSourceRoots, (path) => {
  return /\.(ts|tsx|js|jsx)$/.test(path) && !path.includes('__tests__') && !/\.(test|spec)\./.test(path);
});
const appsInTossImports = sourceFiles.filter((path) => readFileSync(repoPath(path), 'utf8').includes('@apps-in-toss/framework'));
if (appsInTossImports.length > 0) {
  fail('Google Play 네이티브 런타임에서 확인되지 않은 AppsInToss API import가 남아 있습니다.', appsInTossImports.join(', '));
} else {
  pass('앱 소스에서 AppsInToss framework import를 찾지 못했습니다.');
}

const adPlaceholderFiles = sourceFiles.filter((path) => {
  const contents = readFileSync(repoPath(path), 'utf8');
  return /AD_GROUP_ID\s*=\s*''/.test(contents);
});
if (adPlaceholderFiles.length > 0) {
  fail('광고 ID placeholder가 남아 있습니다.', adPlaceholderFiles.join(', '));
}

result.status = result.failures.length > 0 ? 'fail' : result.warnings.length > 0 ? 'warn' : 'pass';

if (jsonMode) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  const statusLabel = result.status.toUpperCase();
  process.stdout.write(`Google Play readiness: ${statusLabel}\n`);
  for (const [label, items] of [
    ['FAIL', result.failures],
    ['WARN', result.warnings],
    ['PASS', result.passes],
  ]) {
    for (const item of items) {
      const suffix = item.detail == null ? '' : ` (${item.detail})`;
      process.stdout.write(`${label} ${item.message}${suffix}\n`);
    }
  }
}

process.exit(result.failures.length > 0 ? 1 : 0);
