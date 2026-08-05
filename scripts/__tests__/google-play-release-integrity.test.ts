import fs from 'node:fs';
import path from 'node:path';

// @ts-expect-error — .js 검증 모듈(CommonJS)에는 타입 선언이 없다. 런타임 계약만 검증한다.
import {
  PROGUARD_MAP_ENTRY,
  REQUIRED_AUDIO_RESOURCE_NAMES,
  validateAabEntries,
  validateAudioKeepFile,
  validateNativeLibraryPackagingConfiguration,
  validateReleaseBuildConfiguration,
} from '../lib/google-play-release-integrity.js';

const optimizedReleaseBlock = `
android {
  buildTypes {
    debug {
      minifyEnabled false
    }
    release {
      minifyEnabled true
      shrinkResources true
      proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"
    }
  }
}
`;

const extractedNativeLibraryPackaging = `
android {
  packagingOptions {
    jniLibs {
      useLegacyPackaging = true
    }
  }
}
`;

describe('Google Play release 무결성 검사', () => {
  describe('R8 release 설정', () => {
    it('release 블록의 코드·리소스 최적화 설정을 통과시킨다', () => {
      expect(validateReleaseBuildConfiguration(optimizedReleaseBlock)).toEqual([]);
    });

    it('debug 블록만 최적화되어 있으면 실패한다', () => {
      const contents = optimizedReleaseBlock
        .replace('minifyEnabled false', 'minifyEnabled true')
        .replace('minifyEnabled true\n      shrinkResources true', 'minifyEnabled false\n      shrinkResources false');

      expect(validateReleaseBuildConfiguration(contents)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('minifyEnabled true'),
          expect.stringContaining('shrinkResources true'),
        ])
      );
    });

    it.each([
      ['minifyEnabled true', 'minifyEnabled false'],
      ['shrinkResources true', 'shrinkResources false'],
      ['proguard-android-optimize.txt', 'proguard-android.txt'],
    ])('%s 설정이 빠지면 실패한다', (enabledSetting, disabledSetting) => {
      expect(
        validateReleaseBuildConfiguration(optimizedReleaseBlock.replace(enabledSetting, disabledSetting))
      ).not.toEqual([]);
    });
  });

  describe('native library 패키징', () => {
    it('설치 시 native library를 추출하는 설정을 통과시킨다', () => {
      expect(validateNativeLibraryPackagingConfiguration(extractedNativeLibraryPackaging)).toEqual([]);
    });

    it.each([
      ['', 'packaging 블록'],
      [
        extractedNativeLibraryPackaging.replace('useLegacyPackaging = true', 'useLegacyPackaging = false'),
        'useLegacyPackaging true',
      ],
    ])('잘못된 패키징 설정을 거부한다', (contents, expectedMessage) => {
      expect(validateNativeLibraryPackagingConfiguration(contents).join('\n')).toContain(expectedMessage);
    });
  });

  describe('동적 WAV 리소스 보존', () => {
    const completeKeepFile = `<resources xmlns:tools="http://schemas.android.com/tools"
      tools:keep="${REQUIRED_AUDIO_RESOURCE_NAMES.map((name: string) => `@raw/${name}`).join(',\n        ')}" />`;

    it('순서와 줄바꿈에 관계없이 7개 음원을 모두 인식한다', () => {
      expect(validateAudioKeepFile(completeKeepFile)).toEqual([]);
    });

    it('음원이 하나라도 빠지면 실패한다', () => {
      expect(validateAudioKeepFile(completeKeepFile.replace('@raw/sting_unlock', ''))).toContain(
        '동적 음원 @raw/sting_unlock 보존 규칙이 없습니다.'
      );
    });
  });

  describe('AAB 산출물', () => {
    const completeEntries = [
      PROGUARD_MAP_ENTRY,
      ...REQUIRED_AUDIO_RESOURCE_NAMES.map((name: string) => `base/res/raw/${name}.wav`),
      'base/res/drawable-hdpi-v4/src_art_assets_crop_carrot.png',
    ];

    it('mapping, 음원, 작물 이미지가 모두 있으면 통과한다', () => {
      expect(validateAabEntries(completeEntries, ['crop_carrot.png'])).toEqual([]);
    });

    it.each([
      [PROGUARD_MAP_ENTRY, 'R8 가독화 파일'],
      ['base/res/raw/sfx_plant.wav', '필수 음원'],
      ['base/res/drawable-hdpi-v4/src_art_assets_crop_carrot.png', '필수 작물 이미지'],
    ])('%s 항목이 빠지면 실패한다', (missingEntry, expectedMessage) => {
      expect(
        validateAabEntries(
          completeEntries.filter((entry: string) => entry !== missingEntry),
          ['crop_carrot.png']
        ).join('\n')
      ).toContain(expectedMessage);
    });
  });

  it('저장소의 실제 release 설정과 음원 keep 파일이 유효하다', () => {
    const root = process.cwd();
    const gradle = fs.readFileSync(path.join(root, 'apps/mobile/android/app/build.gradle'), 'utf8');
    const keepFile = fs.readFileSync(
      path.join(root, 'apps/mobile/android/app/src/main/res/raw/com_seorilabs_happyfarm_audio_keep.xml'),
      'utf8'
    );

    expect(validateReleaseBuildConfiguration(gradle)).toEqual([]);
    expect(validateNativeLibraryPackagingConfiguration(gradle)).toEqual([]);
    expect(validateAudioKeepFile(keepFile)).toEqual([]);
  });
});
