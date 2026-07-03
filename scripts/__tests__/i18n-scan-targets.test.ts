import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// @ts-expect-error — .js 수집기 모듈(CommonJS)에는 타입 선언이 없다. 런타임 계약만 검증한다.
import { I18N_SCAN_ROOTS, collectI18nScanTargets, collectScanTargetsUnder } from '../lib/i18n-scan-targets.js';

// check:i18n 스캔 대상 자동 수집 회귀 테스트.
//
// 배경: 과거 check-i18n.mjs 는 스캔 대상을 고정 파일 목록으로 나열해, 새로 추가된
// 컴포넌트/모듈(MissionsSheet, WheelSheet, FarmOnboarding 등)이 검사망에서 조용히
// 빠졌다. 디렉터리 재귀 수집으로 전환한 뒤, 이 계약이 다시 깨지지 않도록 고정한다.

describe('check:i18n 스캔 대상 자동 수집 (collectI18nScanTargets)', () => {
  describe('fixture 트리에서의 수집 규칙', () => {
    let fixtureRoot: string;

    beforeEach(() => {
      fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-scan-fixture-'));
    });

    afterEach(() => {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    });

    const writeFixture = (relativePath: string, content = 'export {};\n') => {
      const absolutePath = path.join(fixtureRoot, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, content);
    };

    it('루트 아래 .ts/.tsx 소스를 재귀적으로 수집한다', () => {
      writeFixture('src/App.tsx');
      writeFixture('src/components/Sheet.tsx');
      writeFixture('src/logic/deep/nested/module.ts');

      const targets = collectScanTargetsUnder(fixtureRoot, 'src');
      expect(targets).toEqual(['src/App.tsx', 'src/components/Sheet.tsx', 'src/logic/deep/nested/module.ts']);
    });

    it('새 파일을 추가하면 목록 갱신 없이 자동으로 스캔 대상이 된다 (고정 목록 회귀 방지)', () => {
      writeFixture('src/App.tsx');
      expect(collectScanTargetsUnder(fixtureRoot, 'src')).toHaveLength(1);

      // 에이전트가 새 컴포넌트를 추가하는 상황을 재현한다.
      writeFixture('src/components/NewSheet.tsx');
      expect(collectScanTargetsUnder(fixtureRoot, 'src')).toContain('src/components/NewSheet.tsx');
    });

    it('i18n 카탈로그 디렉터리는 제외한다 (locale 문자열은 한글이 정상)', () => {
      writeFixture('src/App.tsx');
      writeFixture('src/i18n/index.ts');
      writeFixture('src/i18n/messages.ko-KR.ts');

      const targets = collectScanTargetsUnder(fixtureRoot, 'src');
      expect(targets).toEqual(['src/App.tsx']);
    });

    it('__tests__/__mocks__ 디렉터리와 *.test.* / *.spec.* / *.d.ts 파일은 제외한다', () => {
      writeFixture('src/App.tsx');
      writeFixture('src/__tests__/App.test.tsx');
      writeFixture('src/__mocks__/storage.ts');
      writeFixture('src/logic/module.test.ts');
      writeFixture('src/logic/module.spec.ts');
      writeFixture('src/types/global.d.ts');

      const targets = collectScanTargetsUnder(fixtureRoot, 'src');
      expect(targets).toEqual(['src/App.tsx']);
    });

    it('.ts/.tsx 이외 확장자(json, js, md)는 수집하지 않는다', () => {
      writeFixture('src/App.tsx');
      writeFixture('src/balance.json', '{}\n');
      writeFixture('src/legacy.js');
      writeFixture('src/README.md', '# note\n');

      expect(collectScanTargetsUnder(fixtureRoot, 'src')).toEqual(['src/App.tsx']);
    });

    it('존재하지 않는 루트는 빈 배열을 반환한다 (스캔 자체는 실패하지 않는다)', () => {
      expect(collectScanTargetsUnder(fixtureRoot, 'does-not-exist')).toEqual([]);
    });

    it('여러 루트를 합쳐 수집한다', () => {
      writeFixture('a/src/one.ts');
      writeFixture('b/src/two.tsx');

      const targets = collectI18nScanTargets(fixtureRoot, ['a/src', 'b/src']);
      expect(targets).toEqual(['a/src/one.ts', 'b/src/two.tsx']);
    });
  });

  describe('실제 레포에서의 수집 결과', () => {
    // jest 는 레포 루트(rootDir)에서 실행되므로 process.cwd()가 레포 루트다.
    const repoRoot = process.cwd();
    const targets: string[] = collectI18nScanTargets(repoRoot);

    it('스캔 대상이 비어 있지 않다 (루트 경로 오타/이동 감지)', () => {
      expect(targets.length).toBeGreaterThan(0);
    });

    it('과거 고정 목록에서 빠져 있던 신규 컴포넌트들이 스캔 대상에 포함된다', () => {
      expect(targets).toContain('packages/farm-ui/src/components/MissionsSheet.tsx');
      expect(targets).toContain('packages/farm-ui/src/components/WheelSheet.tsx');
      expect(targets).toContain('packages/farm-ui/src/components/FarmOnboarding.tsx');
    });

    it('앱 셸(apps/ait, apps/mobile) 소스도 스캔 대상에 포함된다', () => {
      expect(targets.some((target) => target.startsWith('apps/ait/src/'))).toBe(true);
      expect(targets.some((target) => target.startsWith('apps/mobile/src/'))).toBe(true);
    });

    it('locale catalog(i18n 디렉터리)는 스캔 대상에 포함되지 않는다', () => {
      expect(targets).not.toContain('packages/farm-ui/src/i18n/index.ts');
      expect(targets.some((target) => target.includes('/i18n/'))).toBe(false);
    });

    it('스캔 루트 상수는 공유 패키지와 앱 셸을 모두 포함한다', () => {
      expect(I18N_SCAN_ROOTS).toEqual(
        expect.arrayContaining(['packages/farm-ui/src', 'packages/farm-core/src', 'apps/ait/src', 'apps/mobile/src']),
      );
    });
  });
});
