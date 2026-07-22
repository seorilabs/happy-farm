/// <reference types="jest" />

import fs from 'node:fs';
import path from 'node:path';

// AC-2(#364): project.pbxproj의 MARKETING_VERSION 기본값이 구버전 1.0으로 되돌아가거나
// app-store.config.json의 선언 버전과 어긋나지 않도록 고정한다(기본값 아카이브 방어선).
const ROOT = path.resolve(__dirname, '../..');

describe('pbxproj MARKETING_VERSION 기본값 (#364)', () => {
  test('기본값이 1.0이 아니고 app-store.config versionNumber와 일치한다', () => {
    const pbxproj = fs.readFileSync(
      path.join(ROOT, 'apps/mobile/ios/HappyFarmMobile.xcodeproj/project.pbxproj'),
      'utf8'
    );
    const config = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'app-store/app-store.config.json'), 'utf8')
    );
    const expected = config.version.versionNumber as string;

    const versions = [...pbxproj.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((match) =>
      match[1]!.trim()
    );
    expect(versions.length).toBeGreaterThan(0);
    for (const version of versions) {
      // 5개월 전 구버전 표기(1.0)가 그대로 아카이브되던 회귀(#364)를 막는다.
      expect(version).not.toBe('1.0');
      // 방어선 2중화: 기본값을 스토어 config 선언 버전과 일치시킨다.
      expect(version).toBe(expected);
    }
  });
});
