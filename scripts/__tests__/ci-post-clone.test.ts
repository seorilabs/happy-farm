/// <reference types="jest" />

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Xcode Cloud 클론 후 준비 스크립트를 dry-run 으로 검증한다.
//
// 배경: @seorilabs/platform-sdk 는 GitHub Packages 비공개 패키지였고, 저장소 .npmrc 가
// @seorilabs 스코프를 npm.pkg.github.com 으로 보냈다. Xcode Cloud 는 GitHub Actions 의
// NODE_AUTH_TOKEN 경로를 타지 않아 pnpm install 이 401 로 죽었고(빌드 #1006016), 그래서
// 이 스크립트가 GITHUB_PACKAGES_TOKEN 으로 홈 npmrc 에 인증을 구성했다.
//
// Platform #113 이후 이 패키지는 공개 npm 에 있다. 인증이 필요 없어졌을 뿐 아니라,
// 토큰 가드가 남아 있으면 쓰지도 않는 시크릿이 없다는 이유로 iOS 빌드가 멈춘다.
// 아래 테스트는 그 경로가 다시 들어오지 않는지를 고정한다.
const SCRIPT = path.resolve(__dirname, '../../apps/mobile/ios/ci_scripts/ci_post_clone.sh');
const DOC = path.resolve(__dirname, '../../docs/app-store-release.md');
const REPO_ROOT = path.resolve(__dirname, '../..');

const PNPM_INSTALL_MARKER = 'dry-run: skipped: pnpm install --frozen-lockfile';

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
      FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64: '',
      ...env,
    },
  });
}

describe('ci_post_clone.sh', () => {
  afterAll(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('레지스트리 토큰 없이 의존성 설치까지 진행한다', () => {
    const sandbox = makeSandbox();
    const result = runScript(sandbox);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(PNPM_INSTALL_MARKER);
  });

  test('홈 npmrc 에 레지스트리 인증을 쓰지 않는다', () => {
    const sandbox = makeSandbox();
    runScript(sandbox);

    // 공개 패키지라 인증이 필요 없다. 홈 npmrc 를 만들면 토큰이 러너에 남는다.
    expect(fs.existsSync(path.join(sandbox.home, '.npmrc'))).toBe(false);
    // 가짜 체크아웃 안에도 .npmrc 를 만들지 않는다.
    expect(fs.existsSync(path.join(sandbox.repo, '.npmrc'))).toBe(false);
  });

  test('저장소가 @seorilabs 스코프를 비공개 레지스트리로 보내지 않는다', () => {
    // 스코프 override 가 되살아나면 공개 npm 의 최신 SDK 를 못 받고 다시 토큰이 필요해진다.
    const repoNpmrc = path.join(REPO_ROOT, '.npmrc');
    const contents = fs.existsSync(repoNpmrc) ? fs.readFileSync(repoNpmrc, 'utf8') : '';
    expect(contents).not.toContain('npm.pkg.github.com');

    const script = fs.readFileSync(SCRIPT, 'utf8');
    expect(script).not.toContain('npm.pkg.github.com');
    expect(script).not.toContain('GITHUB_PACKAGES_TOKEN');
  });

  test('스크립트가 필요하다고 선언한 환경변수가 App Store 릴리스 문서에 모두 있다', () => {
    const script = fs.readFileSync(SCRIPT, 'utf8');
    // 헤더의 "필요 환경변수" 블록에서 `#   NAME — 설명` 형태의 이름을 뽑는다.
    const header = script.slice(0, script.indexOf('set -e'));
    const declared = [...header.matchAll(/^#\s{3}([A-Z][A-Z0-9_]+)\s+—/gm)].map((match) => match[1]!);

    expect(declared).toContain('FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64');

    const doc = fs.readFileSync(DOC, 'utf8');
    for (const name of declared) {
      expect(doc).toContain(name);
    }
  });

  test('문서에 더 이상 GitHub Packages 토큰을 요구하지 않는다', () => {
    const doc = fs.readFileSync(DOC, 'utf8');
    expect(doc).not.toContain('GITHUB_PACKAGES_TOKEN');
  });

  test('어떤 워크플로도 @seorilabs 스코프를 비공개 레지스트리로 보내지 않는다', () => {
    // 한 곳만 남아도 pnpm 이 그 경로로 0.5.0 을 찾다가 404 로 죽는다.
    // 실제로 static-checks 의 npm_registry_url 을 놓쳐서 밟았다.
    const workflowDir = path.join(REPO_ROOT, '.github');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (full.endsWith('.yml') || full.endsWith('.yaml')) files.push(full);
      }
    };
    walk(workflowDir);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const contents = fs.readFileSync(file, 'utf8');
      expect([file, contents.includes('npm.pkg.github.com')]).toEqual([file, false]);
      expect([file, contents.includes('NODE_AUTH_TOKEN')]).toEqual([file, false]);
    }
  });
});
