import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const script = path.resolve(__dirname, '../write-release-info.mjs');
const fixtures: string[] = [];

function run(overrides: Record<string, string> = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'happy-farm-release-info-'));
  fixtures.push(root);
  fs.mkdirSync(path.join(root, 'packages/farm-core/src'), { recursive: true });
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      SEORI_RELEASE_TAG: 'v1.2.3',
      SEORI_RELEASE_VERSION: '1.2.3',
      SEORI_RELEASE_VERSION_CODE: '1001002003',
      SEORI_RELEASE_SOURCE_SHA: 'a'.repeat(40),
      ...overrides,
    },
  });
  return { root, result };
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

describe('중앙 릴리즈 binding 런타임 투영', () => {
  test('중앙이 확정한 값을 계산 없이 releaseInfo.ts에 기록한다', () => {
    const { root, result } = run();
    expect(result.status).toBe(0);
    const output = fs.readFileSync(path.join(root, 'packages/farm-core/src/releaseInfo.ts'), 'utf8');
    expect(output).toContain('versionName: "1.2.3"');
    expect(output).toContain('buildNumber: 1001002003');
    expect(output).toContain(`gitSha: "${'a'.repeat(40)}"`);
    expect(output).toContain('does not derive versions');
  });

  test('태그와 중앙 version이 다르면 기록하지 않는다', () => {
    const { root, result } = run({ SEORI_RELEASE_VERSION: '1.2.4' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('do not match');
    expect(fs.existsSync(path.join(root, 'packages/farm-core/src/releaseInfo.ts'))).toBe(false);
  });

  test('중앙 source SHA와 version code가 없으면 로컬 값으로 대체하지 않는다', () => {
    const missingSha = run({ SEORI_RELEASE_SOURCE_SHA: '' });
    const invalidCode = run({ SEORI_RELEASE_VERSION_CODE: '0' });
    expect(missingSha.result.status).not.toBe(0);
    expect(invalidCode.result.status).not.toBe(0);
  });
});
