/// <reference types="jest" />

import fs from 'node:fs';
import path from 'node:path';

// AC-4(#364): ci_scripts README가 버전 주입 정책을 문서화하고 있는지 고정한다.
const ROOT = path.resolve(__dirname, '../..');

describe('ci_scripts 버전 주입 정책 문서 (#364)', () => {
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
