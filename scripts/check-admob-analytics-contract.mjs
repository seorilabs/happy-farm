import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];
const fileContents = new Map();
const read = (path) => {
  if (fileContents.has(path)) return fileContents.get(path);
  const absolutePath = join(root, path);
  if (!existsSync(absolutePath)) {
    failures.push(`필수 계약 파일이 없습니다: ${path}`);
    fileContents.set(path, null);
    return null;
  }
  const contents = readFileSync(absolutePath, 'utf8');
  fileContents.set(path, contents);
  return contents;
};
const expectText = (path, expected, message) => {
  const contents = read(path);
  if (contents !== null && !contents.includes(expected)) failures.push(`${message}: ${path}`);
};
const rejectText = (path, rejected, message) => {
  const contents = read(path);
  if (contents !== null && contents.includes(rejected)) failures.push(`${message}: ${path}`);
};

const publisher = '9932778305312246';
const productionIdentifiers = {
  'apps/mobile/app.json': [
    `ca-app-pub-${publisher}~5744460813`,
    `ca-app-pub-${publisher}~1809085234`,
  ],
  'apps/mobile/ios/HappyFarmMobile/Info.plist': [
    `ca-app-pub-${publisher}~1809085234`,
  ],
  'app-store/app-store.config.json': [
    `ca-app-pub-${publisher}~1809085234`,
    `ca-app-pub-${publisher}/4017638142`,
  ],
  'apps/mobile/src/ads/config.ts': [
    `ca-app-pub-${publisher}/7956883150`,
    `ca-app-pub-${publisher}/4017638142`,
    // 전면 단위. 지면 배선만 있고 값이 비면 노출이 조용히 0회로 돌아가므로
    // 보상형과 같이 원장 값으로 못박는다.
    `ca-app-pub-${publisher}/2237490915`,
    `ca-app-pub-${publisher}/6470968134`,
  ],
  // 릴리스 문서도 원장 값을 그대로 적는다. 문서만 뒤처지면 이를 보고 설정을 맞출 때
  // 레거시 계정으로 되돌아간다(happy-farm#521).
  'docs/app-store-release.md': [
    `ca-app-pub-${publisher}~1809085234`,
    `ca-app-pub-${publisher}/4017638142`,
  ],
};

// 레거시 Publisher가 되살아나선 안 되는 경로. 식별자를 직접 적지 않는 문서도
// 포함한다 — #521 인수조건은 "최종 산출물에서 이전 게시자 식별자가 제거된다"다.
const legacyPublisherFreePaths = [
  ...Object.keys(productionIdentifiers),
  'docs/google-play-release.md',
  'README.md',
];

for (const [path, identifiers] of Object.entries(productionIdentifiers)) {
  for (const identifier of identifiers) {
    expectText(path, identifier, `중앙 AdMob 원장 식별자가 없습니다 (${identifier})`);
  }
}

for (const path of legacyPublisherFreePaths) {
  rejectText(path, 'ca-app-pub-2444587584524186', '이전 Publisher 식별자가 남아 있습니다');
  rejectText(path, 'ca-app-pub-3940256099942544', 'Google 테스트 Publisher가 프로덕션 설정에 있습니다');
}

expectText('apps/mobile/src/ads/config.ts', 'TestIds.REWARDED', 'debug 보상형 테스트 ID를 유지해야 합니다');
expectText('apps/mobile/src/ads/config.ts', 'TestIds.INTERSTITIAL', 'debug 전면 테스트 ID를 유지해야 합니다');
expectText('apps/mobile/android/app/build.gradle', 'com.seorilabs.happyfarm', 'Android package가 원장과 다릅니다');
expectText(
  'apps/mobile/ios/HappyFarmMobile.xcodeproj/project.pbxproj',
  'PRODUCT_BUNDLE_IDENTIFIER = com.seorilabs.happyfarm;',
  'iOS bundle ID가 원장과 다릅니다',
);

for (const placement of [
  'shop_gold_reward',
  'shop_plot_discount',
  'growth_ad_sheet',
  'harvest_bonus_sheet',
  'return_offline_bonus',
  'wheel_bonus_spin',
  'cooking_speed_up',
]) {
  expectText('packages/farm-core/src/ads.ts', `'${placement}'`, `rewarded placement가 빠졌습니다 (${placement})`);
}

for (const marker of ['app_market', 'runtime_platform', 'release_version']) {
  expectText('packages/farm-core/src/analytics.ts', `'${marker}'`, `표준 Analytics 파라미터가 없습니다 (${marker})`);
}
expectText(
  'apps/mobile/src/firebase/analytics.ts',
  'withStandardAnalyticsParams',
  '네이티브 Firebase Analytics가 표준 차원을 사용하지 않습니다',
);
for (const marker of [
  "appMarket: 'apps_in_toss'",
  "runtimePlatform: 'web'",
  'session_id: analyticsSessionId',
  'engagement_time_msec: 1',
  'ga4ClientId: getAppsInTossGa4ClientId()',
  'analyticsConsent: false',
]) {
  expectText('apps/ait/src/platformEvents.ts', marker, `AIT Platform relay 계약이 없습니다 (${marker})`);
}
expectText(
  'apps/ait/src/firebaseWeb/analyticsIdentity.ts',
  "GA4_CLIENT_ID_STORAGE_KEY = 'ait_ga4_client_id'",
  '기존 GA4 client ID 연속성을 보존하지 않습니다',
);

for (const removedPath of [
  'apps/ait/src/firebaseWeb/measurementProtocol.ts',
  'apps/ait/src/firebaseWeb/mpSecret.generated.ts',
  'scripts/check-ait-mp-secret.mjs',
  'scripts/write-ait-mp-config.mjs',
]) {
  if (existsSync(join(root, removedPath))) failures.push(`직접 GA4 MP 경로가 남아 있습니다: ${removedPath}`);
}
for (const workflow of ['.github/workflows/deploy-apps-in-toss.yml', '.github/workflows/deploy-all.yml']) {
  rejectText(workflow, 'GA4_MP_API_SECRET', 'AIT 배포 workflow가 클라이언트 MP secret을 요구합니다');
}
expectText(
  '.github/workflows/deploy-apps-in-toss.yml',
  'pnpm check:admob-analytics',
  'AIT release가 AdMob·Analytics 계약을 검사하지 않습니다',
);
expectText(
  '.github/workflows/deploy-google-play.yml',
  'node scripts/check-admob-analytics-contract.mjs',
  'Google Play release가 AdMob·Analytics 계약을 검사하지 않습니다',
);
expectText(
  'apps/mobile/package.json',
  'check:admob-analytics',
  '모바일 release 검사가 AdMob·Analytics 계약을 포함하지 않습니다',
);

expectText('apps/mobile/src/platformEvents.ts', 'presenceEnabled: false', 'Mobile Presence opt-in이 false가 아닙니다');
expectText('apps/ait/src/platformEvents.ts', 'presenceEnabled: false', 'AIT Presence opt-in이 false가 아닙니다');

if (failures.length > 0) {
  console.error('[admob-analytics-contract] FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[admob-analytics-contract] OK');
