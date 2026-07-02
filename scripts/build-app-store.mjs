#!/usr/bin/env node
// 로컬 iOS archive + App Store Connect 업로드. CI(.github/workflows/deploy-app-store.yml)를
// 그대로 재현해 GitHub Actions macOS 러너(분 10x 소진)를 아낀다.
//
// 전제: 로컬 login 키체인에 `Apple Distribution: Seori Labs (HCDUXX4Z3X)` identity와
//       `AppStore Happy Farm Profile` 프로비저닝 프로파일이 설치돼 있어야 한다.
//       ASC API 키는 ~/.config/seorilabs/app-store-connect.env 에서 읽는다
//       (APP_STORE_CONNECT_API_KEY_ID / _ISSUER_ID / _PRIVATE_KEY_PATH).
//
// 사용:
//   node scripts/build-app-store.mjs --tag v1.6.0             # archive + 업로드
//   node scripts/build-app-store.mjs --tag v1.6.0 --no-upload # archive 만
//   RELEASE_TAG=v1.6.0 node scripts/build-app-store.mjs       # --tag 대신 env 도 가능
//
// 옵션: --tag <vX.Y.Z> | --profile <name> | --no-upload | --skip-pods | --archive-path <p>
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const IOS_WORKSPACE = 'apps/mobile/ios/HappyFarmMobile.xcworkspace';
const IOS_SCHEME = 'HappyFarmMobile';
const IOS_BUNDLE_ID = 'com.seorilabs.happyfarm';
const DEFAULT_PROFILE_NAME = 'AppStore Happy Farm Profile';
const DEFAULT_TEAM_ID = 'HCDUXX4Z3X';
const ASC_ENV_PATH = path.join(os.homedir(), '.config/seorilabs/app-store-connect.env');

function parseArgs(argv) {
  const args = { upload: true, skipPods: false, profile: DEFAULT_PROFILE_NAME };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--no-upload': args.upload = false; break;
      case '--skip-pods': args.skipPods = true; break;
      case '--tag': args.tag = argv[++i]; break;
      case '--profile': args.profile = argv[++i]; break;
      case '--archive-path': args.archivePath = argv[++i]; break;
      case '-h': case '--help': args.help = true; break;
      default: throw new Error(`알 수 없는 옵션: ${arg}`);
    }
  }
  return args;
}

function run(command, cmdArgs, options = {}) {
  const result = spawnSync(command, cmdArgs, {
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    env: options.env ?? process.env,
    cwd: options.cwd,
  });
  if (result.status !== 0) {
    console.error(`\n❌ 실패: ${command} ${cmdArgs.join(' ')}`);
    process.exit(result.status ?? 1);
  }
  return (result.stdout ?? '').trim();
}

// ~/.config/seorilabs/app-store-connect.env 의 `export KEY="value"` 를 파싱($HOME 확장).
function loadAscEnv() {
  const keys = ['APP_STORE_CONNECT_API_KEY_ID', 'APP_STORE_CONNECT_ISSUER_ID', 'APP_STORE_CONNECT_PRIVATE_KEY_PATH'];
  const values = {};
  for (const key of keys) {
    if (process.env[key]) values[key] = process.env[key];
  }
  if (keys.every((key) => values[key])) return values;

  if (!existsSync(ASC_ENV_PATH)) {
    throw new Error(`ASC env 파일 없음: ${ASC_ENV_PATH} (또는 관련 env 변수를 미리 export)`);
  }
  for (const line of readFileSync(ASC_ENV_PATH, 'utf8').split('\n')) {
    const match = /^\s*(?:export\s+)?([A-Z_]+)=(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!keys.includes(key) || values[key]) continue;
    const unquoted = rawValue.trim().replace(/^["']|["']$/g, '');
    values[key] = unquoted.replace(/\$\{?HOME\}?/g, os.homedir());
  }
  for (const key of keys) {
    if (!values[key]) throw new Error(`${ASC_ENV_PATH} 에 ${key} 없음`);
  }
  return values;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    const header = [];
    for (const line of readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1)) {
      if (!line.startsWith('//')) break;
      header.push(line.replace(/^\/\/ ?/, ''));
    }
    console.log(header.join('\n'));
    return;
  }

  const teamId = process.env.APPLE_TEAM_ID || DEFAULT_TEAM_ID;

  // 1) 버전 해석 + releaseInfo.ts 갱신 (태그는 --tag > RELEASE_TAG > GITHUB_REF_NAME 순)
  const resolveArgs = ['scripts/resolve-release-version.mjs', '--write-release-info'];
  if (args.tag) resolveArgs.push('--tag', args.tag);
  const version = JSON.parse(run(process.execPath, resolveArgs, { capture: true }));
  const marketingVersion = version.apple_marketing_version;
  const buildNumber = version.apple_build_number;
  console.log(`▸ App Store 빌드: ${version.release_tag} (v${marketingVersion}, build ${buildNumber})`);

  // 2) CocoaPods
  if (!args.skipPods) {
    console.log('▸ pod install');
    run('bundle', ['exec', 'pod', 'install'], {
      cwd: 'apps/mobile/ios',
      env: { ...process.env, BUNDLE_GEMFILE: path.resolve('apps/mobile/Gemfile') },
    });
  }

  // 3) archive
  const archivePath = args.archivePath
    ? path.resolve(args.archivePath)
    : path.resolve(`apps/mobile/ios/build/HappyFarmMobile-v${marketingVersion}-${buildNumber}.xcarchive`);
  mkdirSync(path.dirname(archivePath), { recursive: true });

  console.log(`▸ xcodebuild archive → ${archivePath}`);
  run('xcodebuild', [
    'archive',
    '-workspace', IOS_WORKSPACE,
    '-scheme', IOS_SCHEME,
    '-configuration', 'Release',
    '-destination', 'generic/platform=iOS',
    '-archivePath', archivePath,
    `MARKETING_VERSION=${marketingVersion}`,
    `CURRENT_PROJECT_VERSION=${buildNumber}`,
    `DEVELOPMENT_TEAM=${teamId}`,
    'CODE_SIGN_STYLE=Manual',
    'CODE_SIGN_IDENTITY=Apple Distribution',
    `IOS_PROVISIONING_PROFILE_NAME=${args.profile}`,
  ]);

  // 4) archive 버전 검증 (CI 와 동일)
  const appInfoPlist = path.join(archivePath, 'Products/Applications/HappyFarmMobile.app/Info.plist');
  const plistBuddy = (key) => run('/usr/libexec/PlistBuddy', ['-c', `Print ${key}`, appInfoPlist], { capture: true });
  const actualMarketing = plistBuddy('CFBundleShortVersionString');
  const actualBuild = plistBuddy('CFBundleVersion');
  if (actualMarketing !== marketingVersion || actualBuild !== buildNumber) {
    console.error(`❌ archive 버전 불일치: ${actualMarketing}/${actualBuild} != ${marketingVersion}/${buildNumber}`);
    process.exit(1);
  }
  console.log(`✔ archive 검증: CFBundleShortVersionString=${actualMarketing}, CFBundleVersion=${actualBuild}`);

  if (!args.upload) {
    console.log(`\n✅ archive 완료 (--no-upload). 경로: ${archivePath}`);
    return;
  }

  // 5) App Store Connect 업로드 (method app-store-connect / destination upload)
  const asc = loadAscEnv();
  if (!existsSync(asc.APP_STORE_CONNECT_PRIVATE_KEY_PATH)) {
    throw new Error(`ASC .p8 키 없음: ${asc.APP_STORE_CONNECT_PRIVATE_KEY_PATH}`);
  }

  const exportOptionsPlist = path.join(os.tmpdir(), `HappyFarm-AppStoreExportOptions-${buildNumber}.plist`);
  writeFileSync(exportOptionsPlist, [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>method</key><string>app-store-connect</string>',
    '  <key>destination</key><string>upload</string>',
    '  <key>manageAppVersionAndBuildNumber</key><false/>',
    '  <key>signingStyle</key><string>manual</string>',
    `  <key>teamID</key><string>${teamId}</string>`,
    '  <key>signingCertificate</key><string>Apple Distribution</string>',
    '  <key>provisioningProfiles</key>',
    `  <dict><key>${IOS_BUNDLE_ID}</key><string>${args.profile}</string></dict>`,
    '  <key>stripSwiftSymbols</key><true/>',
    '  <key>uploadSymbols</key><true/>',
    '</dict>',
    '</plist>',
    '',
  ].join('\n'), 'utf8');
  run('plutil', ['-lint', exportOptionsPlist]);

  console.log('▸ xcodebuild -exportArchive → App Store Connect 업로드');
  run('xcodebuild', [
    '-exportArchive',
    '-archivePath', archivePath,
    '-exportOptionsPlist', exportOptionsPlist,
    '-exportPath', path.join(os.tmpdir(), `HappyFarm-app-store-export-${buildNumber}`),
    '-allowProvisioningUpdates',
    '-authenticationKeyPath', asc.APP_STORE_CONNECT_PRIVATE_KEY_PATH,
    '-authenticationKeyID', asc.APP_STORE_CONNECT_API_KEY_ID,
    '-authenticationKeyIssuerID', asc.APP_STORE_CONNECT_ISSUER_ID,
  ]);

  console.log(`\n✅ 업로드 완료 — App Store Connect 처리(수 분) 후 TestFlight 에 ${version.release_tag} (${buildNumber}) 로 표시됨`);
}

try {
  main();
} catch (error) {
  console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
