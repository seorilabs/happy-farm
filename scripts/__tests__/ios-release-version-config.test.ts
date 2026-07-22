/// <reference types="jest" />

import fs from 'node:fs';
import path from 'node:path';

// iOS 릴리즈 버전 기본값·정책 문서 가드(#364).
// - AC-2: project.pbxproj의 MARKETING_VERSION 기본값이 구버전 1.0으로 되돌아가거나
//   app-store.config.json의 선언 버전과 어긋나지 않도록 고정한다(기본값 아카이브 방어선).
// - AC-4: ci_scripts README가 버전 주입 정책을 문서화하고 있는지 고정한다.
const ROOT = path.resolve(__dirname, '../..');

describe('iOS 릴리즈 버전 기본값·문서 (#364)', () => {
  test('pbxproj MARKETING_VERSION 기본값이 1.0이 아니고 app-store.config versionNumber와 일치한다', () => {
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

  test('ci_scripts README가 CI_TAG 유/무 버전 주입 정책을 문서화한다', () => {
    const readme = fs.readFileSync(
      path.join(ROOT, 'apps/mobile/ios/ci_scripts/README.md'),
      'utf8'
    );
    expect(readme).toMatch(/CI_TAG/);
    // 폴백 주입 + 결정 불가 시 실패 정책이 문서에 있다.
    expect(readme).toMatch(/폴백|fallback/i);
    expect(readme).toMatch(/비-제로|non-zero/i);
    // 기본값(1.0) 아카이브 차단 목적을 명시한다.
    expect(readme).toMatch(/1\.0/);
    // dry-run 검증 방법을 안내한다.
    expect(readme).toMatch(/CI_PRE_XCODEBUILD_DRY_RUN/);
  });
});
