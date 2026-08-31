/// <reference types="jest" />

import fs from 'node:fs';
import path from 'node:path';

// project.pbxproj 기본값은 build authority가 아니다. release archive는 중앙 exact tag binding이
// 덮어쓰며 app-store config에는 경쟁하는 version 값을 두지 않는다.
const ROOT = path.resolve(__dirname, '../..');

describe('pbxproj MARKETING_VERSION 기본값 (#364)', () => {
  test('프로젝트 기본값은 형식만 유효하고 app-store config는 version authority를 갖지 않는다', () => {
    const pbxproj = fs.readFileSync(
      path.join(ROOT, 'apps/mobile/ios/HappyFarmMobile.xcodeproj/project.pbxproj'),
      'utf8'
    );
    const config = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'app-store/app-store.config.json'), 'utf8')
    );
    const versions = [...pbxproj.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((match) =>
      match[1]!.trim()
    );
    expect(versions.length).toBeGreaterThan(0);
    for (const version of versions) {
      expect(version).toMatch(/^\d+\.\d+(?:\.\d+)?$/);
    }
    expect(config).not.toHaveProperty('version');
    expect(config.versioning.source).toBe('github_release_tag');
  });
});
