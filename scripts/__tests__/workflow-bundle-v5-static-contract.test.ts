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

// 중앙 caller 회귀 테스트.
//
// 배경: caller가 branch 참조로 되돌아가거나 앱 코드 변경에도 중앙 워크플로가 도는 형태로
// 바뀌면 승인 번들 결합이 조용히 깨진다. 파일은 WorkflowBundle v5 generator 산출물이며
// 사람이 편집하지 않는다.
describe('중앙 워크플로 caller', () => {
  const callerPath = '.github/workflows/org-contract.yml';
  const caller = fs.readFileSync(path.join(repositoryRoot, callerPath), 'utf8');

  it('승인 번들의 중앙 워크플로를 40자리 commit SHA로 고정한다', () => {
    expect(caller).toMatch(
      /uses: seorilabs\/\.github\/\.github\/workflows\/js-static-checks-v1\.yml@[0-9a-f]{40}\n/,
    );
  });

  it('branch·tag 참조나 secrets 상속을 쓰지 않는다', () => {
    expect(caller).not.toMatch(/@main\b/);
    expect(caller).not.toMatch(/@v[0-9]/);
    expect(caller).not.toMatch(/secrets:\s*inherit/);
  });

  it('main 대상 PR·push와 수동 실행에만 반응한다', () => {
    // 승인 번들 caller는 main의 PR과 push를 모두 검사한다. 후보 caller처럼 자기 파일
    // 변경에만 반응하면 main에 들어간 뒤의 회귀를 잡지 못한다.
    expect(caller).toMatch(
      /on:\n {2}pull_request:\n {4}branches:\n {6}- main\n {2}push:\n {4}branches:\n {6}- main\n {2}workflow_dispatch: \{\}\n/,
    );
    expect(caller).not.toMatch(/pull_request_target/);
    expect(caller).not.toMatch(/\n {2}schedule:/);
  });

  it('WorkflowBundle generator가 관리하는 caller는 이 파일 하나뿐이다', () => {
    const workflows = fs.readdirSync(path.join(repositoryRoot, '.github/workflows'));
    const generated = workflows.filter((name) => fs
      .readFileSync(path.join(repositoryRoot, '.github/workflows', name), 'utf8')
      .startsWith('# WorkflowBundle v5 generator가 관리합니다.'));
    expect(generated).toEqual(['org-contract.yml']);
  });
});
