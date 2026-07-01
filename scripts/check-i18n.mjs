import fs from 'node:fs';
import path from 'node:path';

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
  const lines = content.split(/\r?\n/);
  // 검사 대상은 "사용자-facing 문자열"이다. 한글 주석은 위반이 아니므로,
  // 라인 검사 전에 // 라인 주석과 /* */ 블록 주석(여러 줄 포함)을 제거해
  // 코드/문자열 리터럴에 남은 한글만 위반으로 잡는다.
  let inBlockComment = false;
  lines.forEach((line, index) => {
    let code = '';
    let i = 0;
    while (i < line.length) {
      if (inBlockComment) {
        const end = line.indexOf('*/', i);
        if (end === -1) {
          i = line.length;
        } else {
          inBlockComment = false;
          i = end + 2;
        }
        continue;
      }
      if (line.startsWith('//', i)) {
        break; // 라인 나머지는 주석
      }
      if (line.startsWith('/*', i)) {
        inBlockComment = true;
        i += 2;
        continue;
      }
      code += line[i];
      i += 1;
    }
    if (/[가-힣]/.test(code)) {
      failures.push(`${relativePath}:${index + 1} 사용자-facing 문자열은 locale catalog를 사용해야 합니다.`);
    }
  });
  passes.push(`${relativePath}에 한글 UI 하드코딩이 없습니다.`);
}

const playConfig = readJson('play-store/google-play.config.json');
requireLocaleMap('play-store', 'storeListing.appName', playConfig.storeListing?.appName);
requireLocaleMap('play-store', 'storeListing.shortDescription', playConfig.storeListing?.shortDescription);
requireLocaleMap('play-store', 'storeListing.fullDescription', playConfig.storeListing?.fullDescription);
requireLocaleMap('play-store', 'release.notes', playConfig.release?.notes);

const appStoreConfig = readJson('app-store/app-store.config.json');
requireLocaleMap('app-store', 'storeListing.appName', appStoreConfig.storeListing?.appName);
requireLocaleMap('app-store', 'storeListing.subtitle', appStoreConfig.storeListing?.subtitle);
requireLocaleMap('app-store', 'storeListing.promotionalText', appStoreConfig.storeListing?.promotionalText);
requireLocaleMap('app-store', 'storeListing.description', appStoreConfig.storeListing?.description);
requireLocaleMap('app-store', 'storeListing.keywords', appStoreConfig.storeListing?.keywords);
requireLocaleMap('app-store', 'version.releaseNotes', appStoreConfig.version?.releaseNotes);

assertNoHangul('packages/farm-ui/src/FarmGame.tsx');
assertNoHangul('packages/farm-ui/src/components/SheetParts.tsx');
assertNoHangul('packages/farm-ui/src/components/CollectionSheet.tsx');
assertNoHangul('packages/farm-ui/src/components/AchievementsSheet.tsx');
assertNoHangul('packages/farm-ui/src/components/LabSheet.tsx');
assertNoHangul('packages/farm-ui/src/components/ChainMapSheet.tsx');
assertNoHangul('packages/farm-core/src/constants.ts');
assertNoHangul('packages/farm-core/src/achievements.ts');
assertNoHangul('packages/farm-core/src/prestige.ts');
assertNoHangul('packages/farm-core/src/research.ts');
assertNoHangul('packages/farm-core/src/types.ts');
assertNoHangul('packages/farm-core/src/harvest.ts');
assertNoHangul('packages/farm-core/src/mastery.ts');
assertNoHangul('packages/farm-core/src/modifiers.ts');

const result = {
  status: failures.length > 0 ? 'fail' : 'pass',
  passes,
  failures,
};

console.log(JSON.stringify(result, null, 2));

if (failures.length > 0) {
  process.exit(1);
}
