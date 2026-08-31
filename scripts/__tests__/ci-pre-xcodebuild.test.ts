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
      `process.stdout.write(JSON.stringify({ tag, sourceSha: ${JSON.stringify(sourceSha)}, appleMarketingVersion: tag.slice(1), appleBuildNumber: Number(match[1]) * 1000000 + Number(match[2]) * 1000 + Number(match[3]) }));`,
      '',
    ].join('\n')
  );
  return { repo, authority };
}

function runScript(env: Record<string, string>) {
  return spawnSync('sh', [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, CI_PRE_XCODEBUILD_DRY_RUN: '1', ...env },
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
    expect(result.stdout).toContain('build=1008001');
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
    expect(script).toContain('8a11a145fed35479a4a89ebc7ca97edd0a0f05fd');
    expect(script).toContain('a8436ec24933dfdb3dde38211e70e05df4f085d1f8d8fe0809d32c093de1a11e');
    expect(script).toContain('ca9ef5b4fe326323840b171f9e6ed069cb182d2aee8e88b72e352c57514d466b');
    expect(script).toContain('raw.githubusercontent.com/seorilabs/.github');
  });
});
