/// <reference types="jest" />

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// iOS Xcode Cloud 버전 주입 스크립트(#364)의 CI_TAG 유/무 두 경로를 dry-run으로 검증한다.
// agvtool(macOS 전용)은 dry-run 모드에서 건너뛰고, 산출된 marketing/build 버전만 확인한다.
// 목적: 어떤 경로로도 project.pbxproj 기본값(구버전, 예: 1.0)이 그대로 아카이브되지 않음을
// 고정한다.
const SCRIPT = path.resolve(__dirname, '../../apps/mobile/ios/ci_scripts/ci_pre_xcodebuild.sh');

function runScript(env: Record<string, string>) {
  return spawnSync('sh', [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, CI_PRE_XCODEBUILD_DRY_RUN: '1', ...env },
  });
}

// 태그를 (선택적으로) 하나 단 임시 git 저장소를 만든다. git describe 폴백 대상으로 쓴다.
function makeTempRepo(tag?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-xcode-'));
  const git = (args: string[]) =>
    spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  git(['init', '-q']);
  git(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init']);
  if (tag != null) {
    git(['tag', tag]);
  }
  return dir;
}

describe('ci_pre_xcodebuild.sh 버전 주입 (#364)', () => {
  const tempDirs: string[] = [];
  afterAll(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('dry-run으로 CI_TAG 유/무 두 경로를 모두 검증한다(유→태그 버전, 무→최신 태그 폴백)', () => {
    // 유(태그) 경로: CI_TAG를 그대로 사용해 그 버전을 산출한다.
    const withTag = runScript({ CI_TAG: 'v1.6.2' });
    expect(withTag.status).toBe(0);
    expect(withTag.stdout).toContain('marketing=1.6.2');

    // 무(폴백) 경로: CI_TAG가 없으면 저장소의 최신 릴리즈 태그로 폴백 주입한다.
    const repo = makeTempRepo('v1.4.3');
    tempDirs.push(repo);
    const withoutTag = runScript({ CI_TAG: '', CI_PRIMARY_REPOSITORY_PATH: repo });
    expect(withoutTag.status).toBe(0);
    expect(withoutTag.stdout).toContain('marketing=1.4.3');
  });

  test('CI_TAG(vX.Y.Z)가 있으면 그 태그로 marketing/build를 산출한다', () => {
    const result = runScript({ CI_TAG: 'v1.8.1' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('marketing=1.8.1');
    // build number = major*1_000_000 + minor*1_000 + patch (resolve-release-version.mjs와 동일).
    expect(result.stdout).toContain('build=1008001');
  });

  test('CI_TAG가 없으면 저장소의 최신 릴리즈 태그로 폴백 주입한다', () => {
    const repo = makeTempRepo('v1.5.0');
    tempDirs.push(repo);
    const result = runScript({ CI_TAG: '', CI_PRIMARY_REPOSITORY_PATH: repo });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('폴백 태그=v1.5.0');
    expect(result.stdout).toContain('marketing=1.5.0');
    expect(result.stdout).toContain('build=1005000');
  });

  test('CI_TAG도 없고 태그도 하나도 없으면 비-제로 종료로 기본값 아카이브를 차단한다', () => {
    const repo = makeTempRepo();
    tempDirs.push(repo);
    const result = runScript({ CI_TAG: '', CI_PRIMARY_REPOSITORY_PATH: repo });
    expect(result.status).not.toBe(0);
    // 버전 산출/agvtool 단계에 도달하지 않는다(기본값 1.0 아카이브 불가).
    expect(result.stdout).not.toContain('marketing=');
  });
});
