import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const verifier = path.resolve(__dirname, '../verify-runtime-release.mjs');
const generator = path.resolve(__dirname, '../write-release-info.mjs');
const env = {
  ...process.env,
  SEORI_RELEASE_TAG: 'v1.2.3',
  SEORI_RELEASE_VERSION: '1.2.3',
  SEORI_RELEASE_VERSION_CODE: '1001002003',
  SEORI_RELEASE_SOURCE_SHA: 'a'.repeat(40),
};
let root: string;

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-runtime-artifact-')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function write(relative: string, value: string) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
  return file;
}

function run(script: string, args: string[] = []) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, env, encoding: 'utf8' });
}

function androidFixture() {
  expect(run(generator).status).toBe(0);
  const source = 'packages/farm-core/src/releaseInfo.ts';
  const map = write('app/build/intermediates/sourcemaps/react/release/index.android.bundle.packager.map', JSON.stringify({
    sources: ['../../' + source],
    sourcesContent: [fs.readFileSync(path.join(root, source), 'utf8')],
  }));
  const bundle = write('app/build/generated/assets/react/release/index.android.bundle', 'current-bundle');
  const entry = 'base/assets/index.android.bundle';
  write(entry, 'current-bundle');
  const aab = path.join(root, 'candidate.aab');
  expect(spawnSync('zip', ['-q', aab, entry], { cwd: root }).status).toBe(0);
  return { verify: () => run(verifier, ['--aab', aab, root]), map, bundle };
}

test('현재 빌드에서 생성된 AAB와 중앙 버전 투영만 통과한다', () => {
  const { verify } = androidFixture();
  const result = verify();
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('runtime release 1.2.3');
});

test('AAB가 현재 Gradle 번들과 다르면 실패한다', () => {
  const { verify, bundle } = androidFixture();
  fs.writeFileSync(bundle, 'new-bundle');
  expect(verify().stderr).toContain('AAB bundle differs');
  expect(verify().status).not.toBe(0);
});

test('Metro 번들에 0.0.0이 들어가 있으면 생성 파일이 정확해도 실패한다', () => {
  const { verify, map } = androidFixture();
  const parsed = JSON.parse(fs.readFileSync(map, 'utf8'));
  parsed.sourcesContent[0] = parsed.sourcesContent[0].replace('versionName: "1.2.3"', 'versionName: "0.0.0"');
  fs.writeFileSync(map, JSON.stringify(parsed));
  const result = verify();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Bundled releaseInfo.ts does not match');
});
