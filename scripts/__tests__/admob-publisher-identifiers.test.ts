import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// AdMob 공개 식별자 계약. 정본은 중앙 원장(seorilabs/.github#167)이고, 이 저장소의
// 이관 작업은 happy-farm#521이다. 값이 여러 파일(app.json, Info.plist, 스토어 config,
// 광고 어댑터, 릴리스 문서)에 흩어져 있어 한 곳만 갱신하고 나머지가 뒤처지기 쉬우므로
// 원장 값과의 일치와 레거시 게시자 잔존 여부를 함께 못박는다.
const repoRoot = join(__dirname, '..', '..');

// 유지 게시자. 이 계정으로 수익이 집계된다.
const PUBLISHER = 'pub-9932778305312246';
// Foam Party(보관) 전용으로만 남긴 레거시 게시자. 행복 농장 산출물에 남아서는 안 된다.
const LEGACY_PUBLISHER = 'pub-2444587584524186';

// 중앙 원장 기준 행복 농장 값.
const ANDROID_APP_ID = 'ca-app-pub-9932778305312246~5744460813';
const IOS_APP_ID = 'ca-app-pub-9932778305312246~1809085234';
const ANDROID_REWARDED_UNIT_ID = 'ca-app-pub-9932778305312246/7956883150';
const IOS_REWARDED_UNIT_ID = 'ca-app-pub-9932778305312246/4017638142';

// 광고 식별자가 실제로 들어가는 경로. 빌드 산출물은 gitignore 대상이라 제외한다.
const IDENTIFIER_SOURCES = [
  'apps/mobile/app.json',
  'apps/mobile/ios/HappyFarmMobile/Info.plist',
  'apps/mobile/src/ads/config.ts',
  'app-store/app-store.config.json',
  'docs/app-store-release.md',
  'docs/google-play-release.md',
  'README.md',
];

function readSource(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('AdMob 공개 식별자 계약', () => {
  test('앱 ID가 중앙 원장 값과 일치한다', () => {
    const appJson = JSON.parse(readSource('apps/mobile/app.json')) as {
      'react-native-google-mobile-ads': { android_app_id: string; ios_app_id: string };
    };
    const ads = appJson['react-native-google-mobile-ads'];

    expect(ads.android_app_id).toBe(ANDROID_APP_ID);
    expect(ads.ios_app_id).toBe(IOS_APP_ID);
    // 네이티브 iOS는 app.json이 아니라 Info.plist 값으로 초기화된다.
    expect(readSource('apps/mobile/ios/HappyFarmMobile/Info.plist')).toContain(IOS_APP_ID);
  });

  test('보상형 광고 단위가 중앙 원장 값과 일치한다', () => {
    const config = readSource('apps/mobile/src/ads/config.ts');

    expect(config).toContain(ANDROID_REWARDED_UNIT_ID);
    expect(config).toContain(IOS_REWARDED_UNIT_ID);

    const appStoreConfig = JSON.parse(readSource('app-store/app-store.config.json')) as {
      ads?: { iosAppId?: string; iosRewardedAdUnitId?: string };
    };
    expect(appStoreConfig.ads?.iosAppId).toBe(IOS_APP_ID);
    expect(appStoreConfig.ads?.iosRewardedAdUnitId).toBe(IOS_REWARDED_UNIT_ID);
  });

  test('레거시 게시자 식별자가 어디에도 남아 있지 않다', () => {
    // happy-farm#521 인수조건: 최종 산출물에서 이전 게시자 식별자가 제거된다.
    for (const path of IDENTIFIER_SOURCES) {
      expect(readSource(path)).not.toContain(LEGACY_PUBLISHER);
    }
  });

  test('모든 AdMob 식별자가 유지 게시자 소속이다', () => {
    const pattern = /ca-app-(pub-\d+)[~/]\d+/g;
    for (const path of IDENTIFIER_SOURCES) {
      const publishers = [...readSource(path).matchAll(pattern)].map((match) => match[1]);
      for (const publisher of publishers) {
        expect(publisher).toBe(PUBLISHER);
      }
    }
  });
});
