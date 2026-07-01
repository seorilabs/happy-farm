import fs from 'node:fs';
import path from 'node:path';

// @ts-expect-error — .js 스캐너 모듈(CommonJS)에는 타입 선언이 없다. 런타임 계약만 검증한다.
import { scanHardcodedHangul, hasHardcodedHangul } from '../lib/hangul-scan.js';

// check:i18n(scripts/check-i18n.mjs)의 한글 하드코딩 검출 상태 기계 회귀 테스트.
//
// 배경: 과거 assertNoHangul은 라인 단위로 // 와 /* */ 위치만 찾아 잘라내는 방식이라
// 문자열 리터럴과 주석을 구분하지 못했다. 그래서 `const s = "안녕 // 메모"`처럼 문자열
// 안에 //가 들어가면 // 뒤(한글 포함)를 주석으로 오인해 잘라내, 실제 하드코딩 한글을
// 놓쳤다. 이제 문자 단위 상태 기계로 문자열/템플릿 리터럴과 주석을 구분한다.
// 이 테스트는 그 동작 계약이 다시 깨지지 않도록 고정한다.

describe('check:i18n 한글 하드코딩 스캐너 (scanHardcodedHangul)', () => {
  describe('주석 안의 한글은 위반이 아니다 (ALLOWED)', () => {
    it('한글 라인 주석 `// 한글 주석`', () => {
      expect(hasHardcodedHangul('// 한글 주석')).toBe(false);
    });

    it('코드 뒤 트레일링 라인 주석 `const y = 1; // 한글`', () => {
      expect(hasHardcodedHangul('const y = 1; // 한글')).toBe(false);
    });

    it('한글 블록 주석 `/* 한글 */`', () => {
      expect(hasHardcodedHangul('/* 한글 */')).toBe(false);
    });

    it('한글 JSDoc `/** 한글 */`', () => {
      expect(hasHardcodedHangul('/** 한글 */')).toBe(false);
    });

    it('여러 줄 블록 주석 안의 한글', () => {
      const src = ['/*', ' * 여러 줄에 걸친', ' * 한글 블록 주석', ' */', 'const x = 1;'].join('\n');
      expect(hasHardcodedHangul(src)).toBe(false);
    });

    it('라인 주석 안의 따옴표는 문자열 시작으로 오인하지 않는다', () => {
      // 실제 코드베이스(research.ts, FarmGame.tsx)에 존재하는 패턴.
      expect(hasHardcodedHangul('// 현재 기회를 "확인됨"으로 표시해 배지를 해제한다.')).toBe(false);
    });

    it('블록 주석 안의 따옴표(영문)도 문자열로 오인하지 않는다', () => {
      const src = ['{/* The whole asset block scales as one unit for a', '    consistent "cha-ching" on harvest. */}', 'const z = 1;'].join(
        '\n',
      );
      expect(hasHardcodedHangul(src)).toBe(false);
    });
  });

  describe('문자열/템플릿 리터럴 안의 한글은 위반이다 (BLOCKED)', () => {
    it('일반 문자열 `const x = "안녕";`', () => {
      const { violations } = scanHardcodedHangul('const x = "안녕";');
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].line).toBe(1);
    });

    it('문자열 안에 //가 있어도 한글을 검출한다 `const s = "한글 // 메모";`', () => {
      // 회귀 방지의 핵심 케이스: 과거 구현은 // 뒤를 잘라내 이 한글을 놓쳤다.
      const { violations } = scanHardcodedHangul('const s = "한글 // 메모";');
      expect(violations.length).toBeGreaterThan(0);
    });

    it('작은따옴표 문자열 `const x = \'안녕\';`', () => {
      expect(hasHardcodedHangul("const x = '안녕';")).toBe(true);
    });

    it('템플릿 리터럴 `const t = `가나다`;`', () => {
      expect(hasHardcodedHangul('const t = `가나다`;')).toBe(true);
    });

    it('escape 처리된 따옴표 뒤의 한글도 여전히 문자열 안이면 검출한다', () => {
      // "a\"b 한글" → 닫는 따옴표는 escape된 것이 아니라 맨 끝에 있으므로 한글은 문자열 안이다.
      expect(hasHardcodedHangul('const s = "a\\"b 한글";')).toBe(true);
    });

    it('위반 라인 번호를 여러 줄에서 정확히 보고한다', () => {
      const src = ['const a = 1;', 'const b = 2;', 'const c = "안녕";'].join('\n');
      const { violations } = scanHardcodedHangul(src);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].line).toBe(3);
    });
  });

  describe('한글이 없는 코드는 통과한다', () => {
    it('영문 문자열 `const e = "hello";`', () => {
      expect(hasHardcodedHangul('const e = "hello";')).toBe(false);
    });

    it('영문 주석/코드 혼합', () => {
      const src = ['// English comment', 'const value = "world"; /* block */'].join('\n');
      expect(hasHardcodedHangul(src)).toBe(false);
    });
  });

  describe('실제 check:i18n 대상 파일은 위반이 없어야 한다 (모두 주석 안 한글)', () => {
    // check-i18n.mjs가 검사하는 파일 중 한글 주석이 존재하는 대표 파일들.
    // 이들은 전부 주석 안 한글이므로 위반이 0이어야 한다(회귀 방지).
    // jest는 rootDir(레포 루트)에서 실행되므로 process.cwd()가 레포 루트다.
    const repoRoot = process.cwd();
    const targets = [
      'packages/farm-ui/src/FarmGame.tsx',
      'packages/farm-core/src/research.ts',
      'packages/farm-core/src/types.ts',
      'packages/farm-core/src/constants.ts',
    ];

    for (const rel of targets) {
      it(`${rel} 은 하드코딩 한글 문자열이 없다`, () => {
        const abs = path.join(repoRoot, rel);
        const source = fs.readFileSync(abs, 'utf8');
        const { violations } = scanHardcodedHangul(source);
        expect(violations).toEqual([]);
      });
    }
  });
});
