/// <reference types="jest" />

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRIPT = path.resolve(__dirname, '../../apps/mobile/ios/ci_scripts/ci_pre_xcodebuild.sh');
const tempDirs: string[] = [];

function createFixture(tag = 'v1.8.1') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-xcode-authority-'));
  tempDirs.push(root);
  const repo = path.join(root, 'repo');
  const authority = path.join(root, 'authority');
  const plist = path.join(repo, 'apps/mobile/ios/HappyFarmMobile/Info.plist');
  fs.mkdirSync(path.dirname(plist), { recursive: true });
  fs.mkdirSync(authority, { recursive: true });
  fs.writeFileSync(plist, '<?xml version="1.0"?><plist><dict/></plist>');

  spawnSync('git', ['init', '-q', repo]);
  spawnSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.']);
  spawnSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init']);
  spawnSync('git', ['-C', repo, 'tag', tag]);
  const sourceSha = spawnSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

  fs.writeFileSync(path.join(authority, 'tag-version-authority.mjs'), 'export {};\n');
  fs.writeFileSync(
    path.join(authority, 'xcode-cloud-apply-tag-version.mjs'),
    [
      'const args = new Map();',
      'for (let i = 2; i < process.argv.length; i += 2) {',
      '  if (process.argv[i] === "--dry-run") break;',
      '  args.set(process.argv[i], process.argv[i + 1]);',
      '}',
      'const tag = args.get("--tag");',
      'const match = /^v(\\d+)\\.(\\d+)\\.(\\d+)$/.exec(tag);',
      'if (!match) process.exit(1);',
      'const encodedVersion = Number(match[1]) * 1000000 + Number(match[2]) * 1000 + Number(match[3]);',
      // 실제 정본은 Apple build number로 Xcode Cloud의 CI_BUILD_NUMBER를 돌려준다.
      // 태그 파생 encodedVersion은 runtime versionCode로만 남는다.
      'const appleBuildNumber = Number(process.env.CI_BUILD_NUMBER);',
      `process.stdout.write(JSON.stringify({ tag, sourceSha: ${JSON.stringify(sourceSha)}, runtimeVersionCode: 1000000000 + encodedVersion, appleMarketingVersion: tag.slice(1), appleBuildNumber }));`,
      '',
    ].join('\n')
  );
  return { repo, authority };
}

/** 태그 파생 encodedVersion을 Apple build number로 돌려주던 낡은 중앙 pin을 흉내낸다. */
function useStaleAuthority(authority: string) {
  fs.writeFileSync(
    path.join(authority, 'xcode-cloud-apply-tag-version.mjs'),
    [
      'const args = new Map();',
      'for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);',
      'const tag = args.get("--tag");',
      'const match = /^v(\\d+)\\.(\\d+)\\.(\\d+)$/.exec(tag);',
      'const encodedVersion = Number(match[1]) * 1000000 + Number(match[2]) * 1000 + Number(match[3]);',
      'process.stdout.write(JSON.stringify({ tag, sourceSha: "0".repeat(40), runtimeVersionCode: 1000000000 + encodedVersion, appleMarketingVersion: tag.slice(1), appleBuildNumber: encodedVersion }));',
      '',
    ].join('\n')
  );
}

function runScript(env: Record<string, string>) {
  return spawnSync('sh', [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, CI_PRE_XCODEBUILD_DRY_RUN: '1', CI_BUILD_NUMBER: '42', ...env },
  });
}

afterAll(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Xcode Cloud 중앙 태그 버전 주입', () => {
  test('exact CI_TAG를 중앙 helper에 전달한다', () => {
    const fixture = createFixture();
    const result = runScript({
      CI_TAG: 'v1.8.1',
      CI_PRIMARY_REPOSITORY_PATH: fixture.repo,
      SEORI_RELEASE_AUTHORITY_DIR: fixture.authority,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('marketing=1.8.1');
    // Apple build number는 Xcode Cloud가 준 값이고, 태그 파생값은 runtime versionCode로만 남는다.
    expect(result.stdout).toContain('build=42');
    expect(result.stdout).toContain('runtime=1001008001');
  });

  test('CI_TAG가 없으면 최신 태그를 추측하지 않고 archive를 차단한다', () => {
    const fixture = createFixture('v1.5.0');
    const result = runScript({
      CI_TAG: '',
      CI_PRIMARY_REPOSITORY_PATH: fixture.repo,
      SEORI_RELEASE_AUTHORITY_DIR: fixture.authority,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('exact vX.Y.Z tag');
    expect(result.stdout).not.toContain('marketing=');
  });

  test('production 경로는 불변 중앙 SHA와 두 checksum을 고정한다', () => {
    const script = fs.readFileSync(SCRIPT, 'utf8');
    expect(script).toContain('6db01149a7700c0557bbeaf2e045aac7df0e78f2');
    expect(script).toContain('1da1dce81a5194a37f7a31475c29d899d95eb6da9ae1460927fe439aa329752c');
    expect(script).toContain('ca9ef5b4fe326323840b171f9e6ed069cb182d2aee8e88b72e352c57514d466b');
    expect(script).toContain('raw.githubusercontent.com/seorilabs/.github');
    // 태그 파생 build number를 돌려주던 pin으로 되돌아가면 archive가 다시 어긋난다.
    expect(script).not.toContain('ab9305632698fcb949d4c9df58cf18dbce73bef8');
    expect(script).not.toContain('b399afde0016e23947e173437e266aa83071079d1345b41ff580ebfe63357d6f');
  });

  test.each([
    ['없으면', ''],
    ['0이면', '0'],
    ['정수가 아니면', 'abc'],
    ['leading zero면', '042'],
  ])('CI_BUILD_NUMBER가 %s archive를 시작하지 않는다', (_label, value) => {
    const fixture = createFixture('v1.8.1');
    const result = runScript({
      CI_TAG: 'v1.8.1',
      CI_BUILD_NUMBER: value,
      CI_PRIMARY_REPOSITORY_PATH: fixture.repo,
      SEORI_RELEASE_AUTHORITY_DIR: fixture.authority,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('CI_BUILD_NUMBER는 1 이상의 정수여야 합니다');
    expect(result.stdout).not.toContain('marketing=');
  });

  test('중앙 binding이 태그 파생 build number를 돌려주면 pin 갱신을 요구하며 막는다', () => {
    const fixture = createFixture('v1.8.1');
    useStaleAuthority(fixture.authority);
    const result = runScript({
      CI_TAG: 'v1.8.1',
      CI_BUILD_NUMBER: '42',
      CI_PRIMARY_REPOSITORY_PATH: fixture.repo,
      SEORI_RELEASE_AUTHORITY_DIR: fixture.authority,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('binding=1008001');
    expect(result.stderr).toContain('CI_BUILD_NUMBER=42');
    expect(result.stderr).toContain('AUTHORITY_SHA');
    expect(result.stdout).not.toContain('marketing=');
  });

  test('GitHub와 Xcode Cloud 모두 공통 runtime versionCode를 투영한다', () => {
    const workflow = fs.readFileSync(
      path.resolve(__dirname, '../../.github/workflows/deploy-app-store.yml'),
      'utf8'
    );
    const script = fs.readFileSync(SCRIPT, 'utf8');
    expect(workflow).toContain(
      'SEORI_RELEASE_VERSION_CODE: ${{ needs.resolve.outputs.android_version_code }}'
    );
    expect(script).toContain('JSON.parse(process.argv[1]).runtimeVersionCode');
    expect(script).toContain('SEORI_RELEASE_VERSION_CODE="$runtime_code"');
  });
});
