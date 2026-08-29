import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// 중앙 WorkflowBundle v5(seorilabs/.github) 정적 preflight 계약 회귀 테스트.
//
// 배경: PR #492 canary에서 PACKAGE_MANAGER_VERSION_MISMATCH와
// STATIC_PREFLIGHT_FAILED(실제 원인 QUALITY_SCRIPT_MISSING_test:core)가 발생했다.
// 중앙 스크립트는 루트 package.json의 정확한 packageManager 값과, react-native
// profile의 commandDirectory(apps/mobile) package.json에 test:core/check:architecture
// /check:release 스크립트가 있는지를 강제한다. 스크립트 존재만으로는 위임 대상이
// 끊어져도 잡지 못하므로, 실제 CI가 하는 것과 동일하게 apps/mobile에서 세 스크립트를
// 직접 실행해 성공을 확인한다.

const repositoryRoot = path.resolve(__dirname, '../..');
const mobileRoot = path.join(repositoryRoot, 'apps/mobile');

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8'));
}

function runMobileScript(script: string) {
  return spawnSync('pnpm', ['run', script], { cwd: mobileRoot, encoding: 'utf8' });
}

describe('WorkflowBundle v5 정적 preflight 계약', () => {
  it('루트 package.json이 중앙 고정 pnpm 버전을 exact로 선언한다', () => {
    const rootPackage = readJson('package.json');
    expect(rootPackage.packageManager).toBe('pnpm@11.3.0');
  });

  it('apps/mobile package.json이 react-native profile 필수 스크립트를 모두 선언한다', () => {
    const mobilePackage = readJson('apps/mobile/package.json') as { scripts?: Record<string, string> };
    for (const script of ['test:core', 'check:architecture', 'check:release']) {
      expect(typeof mobilePackage.scripts?.[script]).toBe('string');
      expect(mobilePackage.scripts?.[script]?.trim()).not.toBe('');
    }
  });

  it('apps/mobile에서 pnpm test:core 실행이 성공한다', () => {
    const result = runMobileScript('test:core');
    expect(result.status).toBe(0);
  }, 30_000);

  it('apps/mobile에서 pnpm check:architecture 실행이 성공한다', () => {
    const result = runMobileScript('check:architecture');
    expect(result.status).toBe(0);
  }, 30_000);

  it('apps/mobile에서 pnpm check:release 실행이 성공한다', () => {
    const result = runMobileScript('check:release');
    expect(result.status).toBe(0);
  }, 30_000);
});
