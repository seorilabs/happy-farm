/// <reference types="jest" />

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Xcode Cloud 클론 후 준비 스크립트의 GitHub Packages 인증 경로를 dry-run 으로 검증한다.
// 배경: 저장소 .npmrc 가 @seorilabs 스코프를 npm.pkg.github.com 으로 보내는데, GitHub
// Actions 는 setup-pnpm-workspace 가 NODE_AUTH_TOKEN 을 주입하지만 Xcode Cloud 는 그 경로를
// 타지 않아 pnpm install 이 401 로 죽었다(빌드 #1006016). 이 테스트는 인증이 install 보다
// 먼저 구성되고, 저장소 파일이 아니라 홈 npmrc 에 쓰이며, 토큰이 없으면 install 에 도달하기
// 전에 안내와 함께 종료되는지를 고정한다.
const SCRIPT = path.resolve(__dirname, '../../apps/mobile/ios/ci_scripts/ci_post_clone.sh');
const DOC = path.resolve(__dirname, '../../docs/app-store-release.md');
const REPO_NPMRC = path.resolve(__dirname, '../../.npmrc');

const PNPM_INSTALL_MARKER = 'dry-run: skipped: pnpm install --frozen-lockfile';
const AUTH_STEP_MARKER = 'GitHub Packages 인증';

const tempDirs: string[] = [];

// 스크립트가 기대하는 최소 디렉터리 구조(REPO/apps/mobile/ios)만 갖춘 가짜 체크아웃과
// 빈 홈 디렉터리를 만든다. 홈이 비어 있어야 npmrc 기록을 정확히 관찰할 수 있다.
function makeSandbox(): { repo: string; home: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-post-clone-'));
  tempDirs.push(root);
  const repo = path.join(root, 'repo');
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(repo, 'apps/mobile/ios'), { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  return { repo, home };
}

function runScript(sandbox: { repo: string; home: string }, env: Record<string, string> = {}) {
  return spawnSync('sh', [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CI_POST_CLONE_DRY_RUN: '1',
      CI_PRIMARY_REPOSITORY_PATH: sandbox.repo,
      HOME: sandbox.home,
      GITHUB_PACKAGES_TOKEN: '',
      FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64: '',
      ...env,
    },
  });
}

describe('ci_post_clone.sh GitHub Packages 인증', () => {
  afterAll(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('토큰이 있으면 pnpm install 전에 홈 npmrc 로 인증을 구성한다', () => {
    const sandbox = makeSandbox();
    const token = 'test-token-value';
    const result = runScript(sandbox, { GITHUB_PACKAGES_TOKEN: token });

    expect(result.status).toBe(0);

    // 인증이 홈 npmrc 에 기록된다.
    const homeNpmrc = path.join(sandbox.home, '.npmrc');
    expect(fs.existsSync(homeNpmrc)).toBe(true);
    expect(fs.readFileSync(homeNpmrc, 'utf8')).toContain(
      `//npm.pkg.github.com/:_authToken=${token}`
    );

    // 인증 단계가 의존성 설치보다 먼저 실행된다(순서가 뒤집히면 다시 401 이 난다).
    const authIndex = result.stdout.indexOf(AUTH_STEP_MARKER);
    const installIndex = result.stdout.indexOf(PNPM_INSTALL_MARKER);
    expect(authIndex).toBeGreaterThanOrEqual(0);
    expect(installIndex).toBeGreaterThanOrEqual(0);
    expect(authIndex).toBeLessThan(installIndex);
  });

  test('저장소 .npmrc 는 수정하지 않는다(토큰이 워크스페이스에 남지 않는다)', () => {
    const before = fs.readFileSync(REPO_NPMRC, 'utf8');
    const sandbox = makeSandbox();
    runScript(sandbox, { GITHUB_PACKAGES_TOKEN: 'test-token-value' });

    expect(fs.readFileSync(REPO_NPMRC, 'utf8')).toBe(before);
    // 가짜 체크아웃 안에도 .npmrc 를 만들지 않는다.
    expect(fs.existsSync(path.join(sandbox.repo, '.npmrc'))).toBe(false);
    // 저장소 .npmrc 는 스코프만 지정하고 토큰은 담지 않는다(커밋 사고 방지).
    expect(before).toContain('@seorilabs:registry=https://npm.pkg.github.com');
    expect(before).not.toContain('_authToken');
  });

  test('토큰이 없으면 pnpm install 에 도달하기 전에 조치 안내와 함께 종료한다', () => {
    const sandbox = makeSandbox();
    const result = runScript(sandbox);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('GITHUB_PACKAGES_TOKEN');
    // 무엇을 해야 하는지가 메시지에 있어야 한다(빌드 로그만 보고 조치 가능해야 함).
    expect(result.stderr).toContain('read:packages');
    // 설치까지 진행하면 pnpm 깊숙한 401 로 원인이 가려진다.
    expect(result.stdout).not.toContain(PNPM_INSTALL_MARKER);
    expect(fs.existsSync(path.join(sandbox.home, '.npmrc'))).toBe(false);
  });

  test('스크립트가 필요하다고 선언한 환경변수가 App Store 릴리스 문서에 모두 있다', () => {
    const script = fs.readFileSync(SCRIPT, 'utf8');
    // 헤더의 "필요 환경변수" 블록에서 `#   NAME — 설명` 형태의 이름을 뽑는다.
    const header = script.slice(0, script.indexOf('set -e'));
    const declared = [...header.matchAll(/^#\s{3}([A-Z][A-Z0-9_]+)\s+—/gm)].map((match) => match[1]!);

    expect(declared).toContain('GITHUB_PACKAGES_TOKEN');

    const doc = fs.readFileSync(DOC, 'utf8');
    for (const name of declared) {
      expect(doc).toContain(name);
    }
  });
});
