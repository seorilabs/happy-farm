#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const jsonMode = process.argv.includes('--json');
const placeholderTexts = new Set(['', '확정 필요', 'TBD', 'TODO', 'FIXME', 'N/A']);
const result = {
  status: 'pass',
  passes: [],
  warnings: [],
  failures: [],
};

function repoPath(path) {
  return join(root, path);
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

function isConcrete(value) {
  if (typeof value !== 'string') {
    return value != null;
  }
  return !placeholderTexts.has(value.trim());
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(repoPath(path), 'utf8'));
  } catch (error) {
    fail(`${path}를 읽을 수 없습니다.`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

function valueAt(config, path) {
  const parts = path.split('.');
  let value = config;
  for (const part of parts) {
    value = value?.[part];
  }
  return value;
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

function localizedValue(config, group, key, locale) {
  const values = config[group]?.[key];
  if (values == null) {
    return null;
  }
  return typeof values === 'object' ? values[locale] : values;
}

function yesLike(value) {
  return typeof value === 'string' && ['yes', 'true', 'y', '예'].includes(value.trim().toLowerCase());
}

function readText(path) {
  try {
    return readFileSync(repoPath(path), 'utf8');
  } catch {
    return null;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePbxValue(contents, key) {
  const escapedKey = escapeRegExp(key);
  const match = contents.match(new RegExp(`"?${escapedKey}"?\\s*=\\s*([^;]+);`));
  return match?.[1]?.replace(/^"|"$/g, '').trim() ?? null;
}

function parseBuildSettingValue(contents, key) {
  const escapedKey = escapeRegExp(key);
  const match = contents.match(new RegExp(`"?${escapedKey}"?\\s*=\\s*([^;]+);`));
  return match?.[1]?.replace(/^"|"$/g, '').trim() ?? null;
}

function getBuildSettingBlocks(contents, configName) {
  const blocks = [];
  const pattern = /buildSettings = \{([\s\S]*?)\n\t\t\t\};\n\t\t\tname = ([^;]+);/g;
  let match;
  while ((match = pattern.exec(contents)) != null) {
    const name = match[2]?.replace(/^"|"$/g, '').trim();
    if (name === configName) {
      blocks.push(match[1]);
    }
  }
  return blocks;
}

function getTargetBuildSettings(contents, configName, bundleId) {
  const blocks = getBuildSettingBlocks(contents, configName);
  return (
    blocks.find((block) => parseBuildSettingValue(block, 'PRODUCT_BUNDLE_IDENTIFIER') === bundleId) ??
    blocks.find((block) => parseBuildSettingValue(block, 'PRODUCT_NAME') === 'HappyFarmMobile') ??
    blocks[0] ??
    null
  );
}

function hasManualTargetProvisioningStyle(contents) {
  return /TargetAttributes = \{[\s\S]*?13B07F861A680F5B00A75B9A = \{[\s\S]*?ProvisioningStyle = Manual;[\s\S]*?\};[\s\S]*?\};/.test(
    contents
  );
}

function plistValue(contents, key) {
  const match = contents.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`));
  return match?.[1] ?? null;
}

function plistBooleanValue(contents, key) {
  const match = contents.match(new RegExp(`<key>${key}</key>\\s*<(true|false)\\/>`));
  if (match?.[1] === 'true') {
    return true;
  }
  if (match?.[1] === 'false') {
    return false;
  }
  return null;
}

function plistHasEmptyUsageDescription(contents) {
  return /<key>NS[A-Za-z]+UsageDescription<\/key>\s*<string>\s*<\/string>/.test(contents);
}

function utf8ByteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

function readPngSize(path) {
  if (!existsSync(repoPath(path))) {
    return null;
  }

  const buffer = readFileSync(repoPath(path));
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') {
    return null;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function assertAsset(path, label, expectedSizes = []) {
  if (!isConcrete(path)) {
    fail(`${label} 경로가 확정되지 않았습니다.`, path == null ? 'missing' : String(path));
    return;
  }
  if (!existsSync(repoPath(path))) {
    fail(`${label} 파일이 없습니다.`, path);
    return;
  }

  if (expectedSizes.length === 0) {
    pass(`${label} 파일이 있습니다.`, path);
    return;
  }

  const size = readPngSize(path);
  if (size == null) {
    fail(`${label} PNG 크기를 읽을 수 없습니다.`, path);
    return;
  }

  const valid = expectedSizes.some(([width, height]) => size.width === width && size.height === height);
  if (!valid) {
    fail(
      `${label} 크기가 App Store 요구 규격과 다릅니다.`,
      `${path}: ${size.width}x${size.height}, expected ${expectedSizes.map(([width, height]) => `${width}x${height}`).join(' or ')}`
    );
    return;
  }

  pass(`${label} 크기가 유효합니다.`, `${path}: ${size.width}x${size.height}`);
}

function assertAssetList(paths, label, expectedSizes) {
  if (!Array.isArray(paths) || paths.length === 0) {
    fail(`${label} 목록이 비어 있습니다.`, '1~10개 필요');
    return;
  }
  if (paths.length > 10) {
    fail(`${label} 개수가 너무 많습니다.`, `${paths.length}/10`);
  }
  for (const [index, path] of paths.entries()) {
    assertAsset(path, `${label}[${index}]`, expectedSizes);
  }
}

function assetListExists(paths) {
  return (
    Array.isArray(paths) && paths.length > 0 && paths.every((path) => isConcrete(path) && existsSync(repoPath(path)))
  );
}

function assertAnyIphoneScreenshotSet(config) {
  const acceptedSizes = [
    [1260, 2736],
    [2736, 1260],
    [1290, 2796],
    [2796, 1290],
    [1320, 2868],
    [2868, 1320],
    [1242, 2688],
    [2688, 1242],
    [1284, 2778],
    [2778, 1284],
  ];

  const preferred = config.assets?.iphoneScreenshots69;
  const fallback = config.assets?.iphoneScreenshots65;
  if (assetListExists(preferred)) {
    assertAssetList(preferred, 'assets.iphoneScreenshots69', acceptedSizes);
    return;
  }
  if (assetListExists(fallback)) {
    assertAssetList(fallback, 'assets.iphoneScreenshots65', acceptedSizes);
    return;
  }

  const expectedPaths = [preferred, fallback].filter(Array.isArray).flat().filter(isConcrete);
  fail(
    'iPhone screenshot 파일이 없습니다.',
    expectedPaths.length > 0 ? expectedPaths.join(', ') : 'assets.iphoneScreenshots69 또는 assets.iphoneScreenshots65'
  );
}

function checkAppIconSet(path) {
  const iconSet = readJson(path);
  if (iconSet == null) {
    return;
  }

  const images = Array.isArray(iconSet.images) ? iconSet.images : [];
  const missingNames = images.filter((image) => !isConcrete(image.filename));
  if (missingNames.length > 0) {
    fail('iOS AppIcon.appiconset에 filename이 없는 슬롯이 있습니다.', `${missingNames.length} slots`);
  } else {
    pass('iOS AppIcon.appiconset filename이 모두 지정되어 있습니다.');
  }

  for (const image of images) {
    if (!isConcrete(image.filename)) {
      continue;
    }
    const imagePath = path.replace(/Contents\.json$/, image.filename);
    if (!existsSync(repoPath(imagePath))) {
      fail('iOS AppIcon.appiconset 파일이 없습니다.', imagePath);
      continue;
    }

    const size = readPngSize(imagePath);
    const expected = expectedIconPixelSize(image);
    if (size != null && expected != null && (size.width !== expected || size.height !== expected)) {
      fail('iOS AppIcon.appiconset 파일 크기가 슬롯과 다릅니다.', `${imagePath}: ${size.width}x${size.height}, expected ${expected}x${expected}`);
    }
  }

  const iPadIconPixels = new Set(
    images
      .filter((image) => image.idiom === 'ipad' && isConcrete(image.filename))
      .map((image) => expectedIconPixelSize(image))
      .filter((size) => typeof size === 'number')
  );
  for (const requiredSize of [152, 167]) {
    if (!iPadIconPixels.has(requiredSize)) {
      fail('iPad App Store 필수 앱 아이콘 슬롯이 없습니다.', `${requiredSize}x${requiredSize}`);
    }
  }
  if (iPadIconPixels.has(152) && iPadIconPixels.has(167)) {
    pass('iPad App Store 필수 앱 아이콘 슬롯이 있습니다.', '152x152, 167x167');
  }
}

function expectedIconPixelSize(image) {
  if (typeof image.size !== 'string' || typeof image.scale !== 'string') {
    return null;
  }
  const pointSize = Number(image.size.split('x')[0]);
  const scale = Number(image.scale.replace('x', ''));
  if (!Number.isFinite(pointSize) || !Number.isFinite(scale)) {
    return null;
  }
  return Math.round(pointSize * scale);
}

const pkg = readJson('package.json');
if (pkg != null) {
  pass('package.json을 읽었습니다.', pkg.name);
  if (pkg.scripts?.['check:app-store'] == null) {
    warn('package.json에 check:app-store 스크립트가 없습니다.');
  }
}

const configPath = 'app-store/app-store.config.json';
const config = existsSync(repoPath(configPath)) ? readJson(configPath) : null;
if (config == null) {
  fail(`${configPath}가 없습니다.`);
} else {
  pass(`${configPath}를 읽었습니다.`);

  const bundleId = assertField(config, 'bundleId', (value) => {
    return typeof value === 'string' && /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(value);
  });
  const appleTeamId = assertField(config, 'appleTeamId', (value) => {
    return typeof value === 'string' && /^[A-Z0-9]{10}$/.test(value);
  });
  assertField(config, 'sku');
  assertField(config, 'primaryLanguage');
  assertField(config, 'appType', (value) => value === 'app' || value === 'game');
  assertField(config, 'freeOrPaid', (value) => value === 'free' || value === 'paid');
  assertField(config, 'contactEmail', (value) => typeof value === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value));
  assertField(config, 'privacyPolicyUrl', (value) => typeof value === 'string' && /^https:\/\//.test(value));
  assertField(config, 'supportUrl', (value) => typeof value === 'string' && /^https:\/\//.test(value));
  if (isConcrete(config.marketingUrl)) {
    assertField(config, 'marketingUrl', (value) => typeof value === 'string' && /^https:\/\//.test(value));
  } else {
    warn('marketingUrl 값이 확정되지 않았습니다.', '선택 항목이지만 App Store Connect 입력 화면에 보입니다.');
  }
  assertField(config, 'copyright');
  assertField(config, 'versioning.source', (value) => value === 'github_release_tag');
  if (Object.prototype.hasOwnProperty.call(config, 'version')) {
    fail('app-store config에 로컬 version authority가 남아 있습니다.', 'GitHub vX.Y.Z tag만 사용');
  } else {
    pass('app-store config에 로컬 version authority가 없습니다.');
  }
  assertField(config, 'categories.primary');
  assertField(config, 'contentDeclarations.ageRating');
  assertField(config, 'contentDeclarations.koreaGameRating');
  assertField(config, 'appPrivacy.status', (value) => value === 'completed');
  assertField(config, 'review.contactPhone');
  assertField(config, 'testFlight.betaAppDescription');
  assertField(
    config,
    'testFlight.feedbackEmail',
    (value) => typeof value === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
  );

  const locale = typeof config.primaryLanguage === 'string' ? config.primaryLanguage : 'ko-KR';
  assertValue(`storeListing.appName.${locale}`, localizedValue(config, 'storeListing', 'appName', locale), (value) => {
    return typeof value === 'string' && value.length >= 2 && value.length <= 30;
  });
  assertValue(
    `storeListing.subtitle.${locale}`,
    localizedValue(config, 'storeListing', 'subtitle', locale),
    (value) => {
      return typeof value === 'string' && value.length > 0 && value.length <= 30;
    }
  );
  assertValue(
    `storeListing.promotionalText.${locale}`,
    localizedValue(config, 'storeListing', 'promotionalText', locale),
    (value) => {
      return typeof value === 'string' && value.length > 0 && [...value].length <= 170;
    }
  );
  assertValue(
    `storeListing.description.${locale}`,
    localizedValue(config, 'storeListing', 'description', locale),
    (value) => {
      return typeof value === 'string' && value.length > 0 && value.length <= 4000;
    }
  );
  assertValue(
    `storeListing.keywords.${locale}`,
    localizedValue(config, 'storeListing', 'keywords', locale),
    (value) => {
      return typeof value === 'string' && value.length > 0 && utf8ByteLength(value) <= 100;
    }
  );

  assertAsset(config.assets?.appIcon1024, 'assets.appIcon1024', [[1024, 1024]]);
  assertAnyIphoneScreenshotSet(config);

  const pbxContents = readText('apps/mobile/ios/HappyFarmMobile.xcodeproj/project.pbxproj');
  const targetedDeviceFamily = pbxContents == null ? null : parsePbxValue(pbxContents, 'TARGETED_DEVICE_FAMILY');
  if (targetedDeviceFamily?.includes('2')) {
    assertAssetList(config.assets?.ipadScreenshots13, 'assets.ipadScreenshots13', [
      [2064, 2752],
      [2752, 2064],
      [2048, 2732],
      [2732, 2048],
    ]);
  }

  const routingCoverageFile = config.platformVersionInformation?.routingAppCoverageFile;
  if (routingCoverageFile === 'not_applicable') {
    pass('routing app coverage file이 필요 없는 앱으로 표시되어 있습니다.');
  } else if (isConcrete(routingCoverageFile)) {
    if (!String(routingCoverageFile).endsWith('.geojson')) {
      fail('routing app coverage file 확장자가 .geojson이 아닙니다.', String(routingCoverageFile));
    } else if (!existsSync(repoPath(routingCoverageFile))) {
      fail('routing app coverage file이 없습니다.', String(routingCoverageFile));
    } else {
      pass('routing app coverage file이 있습니다.', String(routingCoverageFile));
    }
  }

  if (!isConcrete(config.automation?.workflow)) {
    fail('automation.workflow 값이 확정되지 않았습니다.', 'App Store 빌드/업로드 자동화 경로 필요');
  } else if (!existsSync(repoPath(config.automation.workflow))) {
    fail('automation.workflow 파일이 없습니다.', config.automation.workflow);
  } else {
    pass('automation.workflow 파일이 있습니다.', config.automation.workflow);
  }

  const appJson = readJson('apps/mobile/app.json');
  if (
    yesLike(config.contentDeclarations?.ads) &&
    typeof appJson?.['react-native-google-mobile-ads']?.ios_app_id === 'string'
  ) {
    const iosAdMobAppId = appJson['react-native-google-mobile-ads'].ios_app_id;
    if (iosAdMobAppId.startsWith('ca-app-pub-3940256099942544~')) {
      fail('iOS AdMob app id가 Google sample/test id입니다.', iosAdMobAppId);
    } else if (isConcrete(config.ads?.iosAppId) && iosAdMobAppId !== config.ads.iosAppId) {
      fail('iOS AdMob app id가 App Store config와 다릅니다.', `${config.ads.iosAppId} != ${iosAdMobAppId}`);
    } else {
      pass('iOS AdMob app id가 sample/test id가 아닙니다.', iosAdMobAppId);
    }
  }

  const adConfigContents = readText('apps/mobile/src/ads/config.ts');
  if (yesLike(config.contentDeclarations?.ads) && adConfigContents != null) {
    const expectedRewardedAdUnitId = config.ads?.iosRewardedAdUnitId;
    if (!isConcrete(expectedRewardedAdUnitId)) {
      fail('ads.iosRewardedAdUnitId 값이 확정되지 않았습니다.', 'iOS 보상형 광고 단위 ID 필요');
    } else if (!adConfigContents.includes(`ios: '${expectedRewardedAdUnitId}'`)) {
      fail('iOS 보상형 광고 단위 ID가 앱 설정과 다릅니다.', String(expectedRewardedAdUnitId));
    } else {
      pass('iOS 보상형 광고 단위 ID가 앱 설정에 있습니다.', String(expectedRewardedAdUnitId));
    }
  }

  if (bundleId != null && pbxContents != null) {
    const productBundleId = parsePbxValue(pbxContents, 'PRODUCT_BUNDLE_IDENTIFIER');
    if (productBundleId !== bundleId) {
      fail('App Store bundleId와 Xcode PRODUCT_BUNDLE_IDENTIFIER가 다릅니다.', `${bundleId} != ${productBundleId}`);
    } else {
      pass('App Store bundleId와 Xcode PRODUCT_BUNDLE_IDENTIFIER가 일치합니다.', bundleId);
    }

    const developmentTeam = parsePbxValue(pbxContents, 'DEVELOPMENT_TEAM');
    if (!isConcrete(developmentTeam)) {
      fail('Xcode DEVELOPMENT_TEAM이 설정되지 않았습니다.', 'Apple Developer Team ID 필요');
    } else if (appleTeamId != null && developmentTeam !== appleTeamId) {
      fail('App Store appleTeamId와 Xcode DEVELOPMENT_TEAM이 다릅니다.', `${appleTeamId} != ${developmentTeam}`);
    } else {
      pass('Xcode DEVELOPMENT_TEAM이 있습니다.', developmentTeam);
    }

    const releaseSettings = getTargetBuildSettings(pbxContents, 'Release', bundleId);
    if (releaseSettings == null) {
      fail('Xcode Release build settings를 찾지 못했습니다.', 'HappyFarmMobile target');
    } else {
      const releaseCodeSignIdentity = parseBuildSettingValue(releaseSettings, 'CODE_SIGN_IDENTITY');
      const releaseSdkCodeSignIdentity = parseBuildSettingValue(
        releaseSettings,
        'CODE_SIGN_IDENTITY[sdk=iphoneos*]'
      );
      const releaseProfile = parseBuildSettingValue(releaseSettings, 'PROVISIONING_PROFILE_SPECIFIER');
      const releaseSigningStyle = parseBuildSettingValue(releaseSettings, 'CODE_SIGN_STYLE');
      const expectedProfile = config.signing?.releaseProvisioningProfile;
      const effectiveReleaseCodeSignIdentity = releaseSdkCodeSignIdentity ?? releaseCodeSignIdentity;

      if (
        typeof effectiveReleaseCodeSignIdentity !== 'string' ||
        !effectiveReleaseCodeSignIdentity.includes('Apple Distribution')
      ) {
        fail(
          'Xcode Release signing certificate가 Apple Distribution이 아닙니다.',
          effectiveReleaseCodeSignIdentity ?? 'missing'
        );
      } else {
        pass('Xcode Release signing certificate가 Apple Distribution입니다.', effectiveReleaseCodeSignIdentity);
      }

      const profileUsesCiVariable = releaseProfile === '$(IOS_PROVISIONING_PROFILE_NAME)';
      if (isConcrete(expectedProfile) && releaseProfile !== expectedProfile) {
        if (profileUsesCiVariable) {
          pass('Xcode Release provisioning profile이 CI profile name 변수를 사용합니다.', releaseProfile);
        } else {
          fail(
            'Xcode Release provisioning profile이 App Store config와 다릅니다.',
            `${expectedProfile} != ${releaseProfile}`
          );
        }
      } else if (!isConcrete(releaseProfile)) {
        fail('Xcode Release provisioning profile이 설정되지 않았습니다.', 'App Store provisioning profile 필요');
      } else {
        pass('Xcode Release provisioning profile이 설정되어 있습니다.', releaseProfile);
      }

      if (releaseSigningStyle !== 'Manual') {
        warn('Xcode Release signing style이 Manual이 아닙니다.', releaseSigningStyle ?? 'missing');
      } else {
        pass('Xcode Release signing style이 Manual입니다.');
      }

      if (hasManualTargetProvisioningStyle(pbxContents)) {
        pass('Xcode target provisioning style이 Manual입니다.');
      } else {
        fail('Xcode target provisioning style이 Manual이 아닙니다.', 'TargetAttributes ProvisioningStyle 확인 필요');
      }
    }

    const marketingVersion = parsePbxValue(pbxContents, 'MARKETING_VERSION');
    const buildNumber = parsePbxValue(pbxContents, 'CURRENT_PROJECT_VERSION');
    assertValue(
      'Xcode MARKETING_VERSION',
      marketingVersion,
      (value) => typeof value === 'string' && /^\d+\.\d+(\.\d+)?$/.test(value)
    );
    assertValue(
      'Xcode CURRENT_PROJECT_VERSION',
      buildNumber,
      (value) => typeof value === 'string' && /^\d+$/.test(value)
    );
  }

  const infoPlist = readText('apps/mobile/ios/HappyFarmMobile/Info.plist');
  if (infoPlist == null) {
    fail('iOS Info.plist가 없습니다.', 'apps/mobile/ios/HappyFarmMobile/Info.plist');
  } else {
    const displayName = plistValue(infoPlist, 'CFBundleDisplayName');
    const appName = localizedValue(config, 'storeListing', 'appName', locale);
    if (displayName !== appName) {
      fail('CFBundleDisplayName과 App Store 앱 이름이 다릅니다.', `${displayName} != ${appName}`);
    } else {
      pass('CFBundleDisplayName과 App Store 앱 이름이 일치합니다.', displayName);
    }

    if (plistHasEmptyUsageDescription(infoPlist)) {
      fail('빈 iOS privacy usage description이 있습니다.', 'Info.plist');
    } else {
      pass('빈 iOS privacy usage description이 없습니다.');
    }

    const gadApplicationIdentifier = plistValue(infoPlist, 'GADApplicationIdentifier');
    if (yesLike(config.contentDeclarations?.ads)) {
      if (!isConcrete(gadApplicationIdentifier)) {
        fail('Info.plist GADApplicationIdentifier가 없습니다.', 'AdMob iOS app id 필요');
      } else if (isConcrete(config.ads?.iosAppId) && gadApplicationIdentifier !== config.ads.iosAppId) {
        fail(
          'Info.plist GADApplicationIdentifier가 App Store config와 다릅니다.',
          `${config.ads.iosAppId} != ${gadApplicationIdentifier}`
        );
      } else {
        pass('Info.plist GADApplicationIdentifier가 설정되어 있습니다.', gadApplicationIdentifier);
      }

      if (!infoPlist.includes('cstr6suwn9.skadnetwork')) {
        fail('Info.plist SKAdNetworkItems에 Google SKAdNetworkIdentifier가 없습니다.', 'cstr6suwn9.skadnetwork');
      } else {
        pass('Info.plist SKAdNetworkItems에 Google SKAdNetworkIdentifier가 있습니다.');
      }
    }

    const usesNonExemptEncryption = plistBooleanValue(infoPlist, 'ITSAppUsesNonExemptEncryption');
    if (usesNonExemptEncryption !== false) {
      fail('Info.plist ITSAppUsesNonExemptEncryption이 false가 아닙니다.', String(usesNonExemptEncryption));
    } else {
      pass('Info.plist ITSAppUsesNonExemptEncryption이 false입니다.');
    }
  }
}

if (existsSync(repoPath('apps/mobile/ios/HappyFarmMobile/PrivacyInfo.xcprivacy'))) {
  pass('iOS PrivacyInfo.xcprivacy가 있습니다.');
} else {
  fail('iOS PrivacyInfo.xcprivacy가 없습니다.');
}

checkAppIconSet('apps/mobile/ios/HappyFarmMobile/Images.xcassets/AppIcon.appiconset/Contents.json');

if (existsSync(repoPath('apps/mobile/ios/HappyFarmMobile/GoogleService-Info.plist'))) {
  pass('Firebase iOS GoogleService-Info.plist가 있습니다.');
} else {
  warn('Firebase iOS GoogleService-Info.plist가 없습니다.', 'CI secret 또는 로컬 파일로 복원 필요');
}

result.status = result.failures.length > 0 ? 'fail' : result.warnings.length > 0 ? 'warn' : 'pass';

if (jsonMode) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  const statusLabel = result.status.toUpperCase();
  process.stdout.write(`App Store readiness: ${statusLabel}\n`);
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
