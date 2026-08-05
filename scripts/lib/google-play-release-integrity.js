const REQUIRED_AUDIO_RESOURCE_NAMES = Object.freeze([
  'farm_bgm_loop',
  'harvest_coin',
  'sfx_plant',
  'sfx_wheel_spin',
  'sting_mutation',
  'sting_reward',
  'sting_unlock',
]);

const PROGUARD_MAP_ENTRY = 'BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map';

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

function validateReleaseBuildConfiguration(contents) {
  const failures = [];
  const releaseBlock = getReleaseBuildTypeBlock(contents);

  if (releaseBlock == null) {
    return ['Android release buildType 블록을 찾지 못했습니다.'];
  }
  if (!/\bminifyEnabled\s+true\b/.test(releaseBlock)) {
    failures.push('Android release buildType에 minifyEnabled true가 필요합니다.');
  }
  if (!/\bshrinkResources\s+true\b/.test(releaseBlock)) {
    failures.push('Android release buildType에 shrinkResources true가 필요합니다.');
  }
  if (!/getDefaultProguardFile\(\s*["']proguard-android-optimize\.txt["']\s*\)/.test(releaseBlock)) {
    failures.push('Android release buildType에 최적화된 기본 R8 규칙이 필요합니다.');
  }

  return failures;
}

function validateNativeLibraryPackagingConfiguration(contents) {
  const packagingBlock =
    extractGradleBlock(contents, 'packagingOptions') ?? extractGradleBlock(contents, 'packaging');
  if (packagingBlock == null) {
    return ['Android native library packaging 블록을 찾지 못했습니다.'];
  }

  const jniLibsBlock = extractGradleBlock(packagingBlock, 'jniLibs');
  if (jniLibsBlock == null) {
    return ['Android native library packaging에 jniLibs 블록이 필요합니다.'];
  }
  if (!/\buseLegacyPackaging\s*(?:=\s*)?true\b/.test(jniLibsBlock)) {
    return ['Android native library packaging에 useLegacyPackaging true가 필요합니다.'];
  }

  return [];
}

function parseKeptResources(contents) {
  const match = /tools:keep\s*=\s*(["'])([\s\S]*?)\1/.exec(contents);
  if (match == null) {
    return new Set();
  }

  return new Set(
    match[2]
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function validateAudioKeepFile(contents) {
  const keptResources = parseKeptResources(contents);
  return REQUIRED_AUDIO_RESOURCE_NAMES.filter((name) => !keptResources.has(`@raw/${name}`)).map(
    (name) => `동적 음원 @raw/${name} 보존 규칙이 없습니다.`
  );
}

function validateAabEntries(entries, artAssetFileNames = []) {
  const failures = [];
  const entrySet = new Set(entries.map((entry) => entry.trim()).filter(Boolean));

  if (!entrySet.has(PROGUARD_MAP_ENTRY)) {
    failures.push(`AAB에 R8 가독화 파일이 없습니다: ${PROGUARD_MAP_ENTRY}`);
  }

  for (const name of REQUIRED_AUDIO_RESOURCE_NAMES) {
    const entry = `base/res/raw/${name}.wav`;
    if (!entrySet.has(entry)) {
      failures.push(`AAB에서 필수 음원을 찾지 못했습니다: ${entry}`);
    }
  }

  for (const fileName of artAssetFileNames) {
    const expectedSuffix = `/src_art_assets_${fileName}`;
    const found = entries.some((entry) => entry.startsWith('base/res/drawable') && entry.endsWith(expectedSuffix));
    if (!found) {
      failures.push(`AAB에서 필수 작물 이미지를 찾지 못했습니다: ${fileName}`);
    }
  }

  return failures;
}

module.exports = {
  PROGUARD_MAP_ENTRY,
  REQUIRED_AUDIO_RESOURCE_NAMES,
  extractGradleBlock,
  getReleaseBuildTypeBlock,
  parseKeptResources,
  validateAabEntries,
  validateAudioKeepFile,
  validateNativeLibraryPackagingConfiguration,
  validateReleaseBuildConfiguration,
};
