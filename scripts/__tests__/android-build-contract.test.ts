import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repositoryRoot = path.resolve(__dirname, '../..');
const sourceBuildScript = fs.readFileSync(path.join(repositoryRoot, 'scripts/build-android.sh'), 'utf8');
const fixtures: string[] = [];

function writeExecutable(filePath: string, contents: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, { mode: 0o755 });
}

function createFixture(): {
  root: string;
  script: string;
  output: string;
  commandLog: string;
  environment: NodeJS.ProcessEnv;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'happy-farm-build-contract-'));
  fixtures.push(root);

  const script = path.join(root, 'scripts/build-android.sh');
  const fakeBin = path.join(root, 'fake-bin');
  const androidHome = path.join(root, 'android-sdk');
  const commandLog = path.join(root, 'commands.log');
  const output = path.join(root, 'app-release.aab');

  writeExecutable(script, sourceBuildScript);
  fs.writeFileSync(
    path.join(root, 'build.env'),
    [
      'NODE_VERSION=24.16.0',
      'PNPM_VERSION=11.3.0',
      'JDK_VERSION=17',
      'ANDROID_PLATFORM=36',
      'ANDROID_BUILD_TOOLS=36.0.0',
      'ANDROID_NDK_VERSION=27.1.12297006',
      'GRADLE_MAX_WORKERS=4',
      'AAB_PATH=dist/android/happy-farm.aab',
      'CLOUD_BUILD_PNPM_STORE=.cloudbuild-private-pnpm-store',
      'EXPECTED_ANDROID_PACKAGE=com.seorilabs.happyfarm',
      'EXPECTED_FIREBASE_PROJECT=happy-farm-tycoon',
      'EXPECTED_UPLOAD_KEY_ALIAS=happy-farm-upload',
      `EXPECTED_UPLOAD_CERT_SHA256=${'A'.repeat(64)}`,
      '',
    ].join('\n')
  );

  writeExecutable(
    path.join(fakeBin, 'node'),
    '#!/usr/bin/env bash\n[ "${1:-}" = "--version" ] && { echo v24.16.0; exit 0; }\nexit 64\n'
  );
  writeExecutable(
    path.join(fakeBin, 'pnpm'),
    [
      '#!/usr/bin/env bash',
      '[ "${1:-}" = "--version" ] && { echo 11.3.0; exit 0; }',
      'printf \'%s\\n\' "$*" >> "$SEORI_TEST_COMMAND_LOG"',
      '',
    ].join('\n')
  );
  writeExecutable(path.join(fakeBin, 'java'), '#!/usr/bin/env bash\nprintf \'openjdk version "17.0.0"\\n\' >&2\n');
  writeExecutable(
    path.join(fakeBin, 'keytool'),
    [
      '#!/usr/bin/env bash',
      'keystore=""',
      'while [ "$#" -gt 0 ]; do',
      '  if [ "$1" = "-keystore" ]; then shift; keystore="$1"; fi',
      '  shift',
      'done',
      '[ -n "$keystore" ]',
      'printf ephemeral > "$keystore"',
      '',
    ].join('\n')
  );
  for (const command of ['jarsigner', 'jar']) {
    writeExecutable(path.join(fakeBin, command), '#!/usr/bin/env bash\nexit 0\n');
  }
  writeExecutable(
    path.join(root, 'apps/mobile/android/gradlew'),
    [
      '#!/usr/bin/env bash',
      'printf \'gradlew %s\\n\' "$*" >> "$SEORI_TEST_COMMAND_LOG"',
      'mkdir -p app/build/outputs/bundle/release',
      'printf compile-only-aab > app/build/outputs/bundle/release/app-release.aab',
      '',
    ].join('\n')
  );

  fs.mkdirSync(path.join(root, 'apps/mobile/android/app'), { recursive: true });
  fs.mkdirSync(path.join(androidHome, 'platforms/android-36'), { recursive: true });
  fs.mkdirSync(path.join(androidHome, 'build-tools/36.0.0'), { recursive: true });
  fs.mkdirSync(path.join(androidHome, 'ndk/27.1.12297006'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
  fs.mkdirSync(path.join(root, 'home'), { recursive: true });

  return {
    root,
    script,
    output,
    commandLog,
    environment: {
      PATH: `${fakeBin}:/usr/bin:/bin`,
      HOME: path.join(root, 'home'),
      TMPDIR: path.join(root, 'tmp'),
      ANDROID_HOME: androidHome,
      SEORI_TEST_COMMAND_LOG: commandLog,
    },
  };
}

function execute(fixture: ReturnType<typeof createFixture>, additionalEnvironment: NodeJS.ProcessEnv = {}) {
  return spawnSync('/bin/bash', [fixture.script], {
    cwd: fixture.root,
    encoding: 'utf8',
    env: { ...fixture.environment, ...additionalEnvironment },
  });
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

describe('Android build-only 실행 계약', () => {
  it('exact source를 일회성 서명 AAB로 만들고 중앙 고정 경로에만 쓴다', () => {
    const fixture = createFixture();
    const sourceSha = 'a'.repeat(40);
    const result = execute(fixture, {
      SEORI_BUILD_MODE: 'build-only',
      SEORI_SOURCE_SHA: sourceSha,
      SEORI_ANDROID_AAB_OUTPUT: fixture.output,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('mode=build-only');
    expect(result.stdout).toContain(`source=${sourceSha}`);
    expect(fs.readFileSync(fixture.output, 'utf8')).toBe('compile-only-aab');
    expect(fs.readFileSync(fixture.commandLog, 'utf8')).toContain('install --frozen-lockfile');
    expect(fs.readFileSync(fixture.commandLog, 'utf8')).not.toContain('--store-dir');
    expect(fs.existsSync(path.join(fixture.root, 'apps/mobile/android/key.properties'))).toBe(false);
    expect(fs.existsSync(path.join(fixture.root, 'apps/mobile/android/app/google-services.json'))).toBe(false);
  });

  it('중앙 v2 계약이 빈 release 값을 export해도 compile-only 버전으로 빌드한다', () => {
    const fixture = createFixture();
    const sourceSha = 'a'.repeat(40);
    const result = execute(fixture, {
      SEORI_BUILD_MODE: 'build-only',
      SEORI_SOURCE_SHA: sourceSha,
      SEORI_ANDROID_AAB_OUTPUT: fixture.output,
      SEORI_RELEASE_TAG: '',
      SEORI_RELEASE_VERSION_NAME: '',
      SEORI_RELEASE_VERSION_CODE: '',
    });

    expect(result.status).toBe(0);
    const commandLog = fs.readFileSync(fixture.commandLog, 'utf8');
    expect(commandLog).toContain('-PversionNameOverride=0.0.0');
    expect(commandLog).toContain(`-PversionCodeOverride=${Number.parseInt('aaaaaaa', 16) + 1}`);
    expect(fs.readFileSync(fixture.output, 'utf8')).toBe('compile-only-aab');
  });

  it('stable tag 실행은 중앙이 주입한 release 버전으로 빌드한다', () => {
    const fixture = createFixture();
    const result = execute(fixture, {
      SEORI_BUILD_MODE: 'build-only',
      SEORI_SOURCE_SHA: 'd'.repeat(40),
      SEORI_ANDROID_AAB_OUTPUT: fixture.output,
      SEORI_RELEASE_TAG: 'v1.2.3',
      SEORI_RELEASE_VERSION_NAME: '1.2.3',
      SEORI_RELEASE_VERSION_CODE: '42',
    });

    expect(result.status).toBe(0);
    const commandLog = fs.readFileSync(fixture.commandLog, 'utf8');
    expect(commandLog).toContain('-PversionNameOverride=1.2.3');
    expect(commandLog).toContain('-PversionCodeOverride=42');
  });

  it('release 값이 일부만 있거나 tag와 어긋나면 빌드 전에 중단한다', () => {
    const fixture = createFixture();
    const base = {
      SEORI_BUILD_MODE: 'build-only',
      SEORI_SOURCE_SHA: 'e'.repeat(40),
      SEORI_ANDROID_AAB_OUTPUT: fixture.output,
    };
    const partial = execute(fixture, { ...base, SEORI_RELEASE_TAG: 'v1.2.3' });
    const mismatch = execute(fixture, {
      ...base,
      SEORI_RELEASE_TAG: 'v1.2.3',
      SEORI_RELEASE_VERSION_NAME: '1.2.4',
      SEORI_RELEASE_VERSION_CODE: '42',
    });
    const prerelease = execute(fixture, {
      ...base,
      SEORI_RELEASE_TAG: 'v1.2.3-rc.1',
      SEORI_RELEASE_VERSION_NAME: '1.2.3-rc.1',
      SEORI_RELEASE_VERSION_CODE: '42',
    });
    const legacyName = execute(fixture, { ...base, SEORI_RELEASE_VERSION: '1.2.3' });

    expect(partial.status).not.toBe(0);
    expect(partial.stderr).toContain('모두 요구합니다');
    expect(mismatch.status).not.toBe(0);
    expect(mismatch.stderr).toContain('SEORI_RELEASE_TAG와 다릅니다');
    expect(prerelease.status).not.toBe(0);
    expect(prerelease.stderr).toContain('stable SemVer');
    expect(legacyName.status).not.toBe(0);
    expect(legacyName.stderr).toContain('SEORI_RELEASE_VERSION');
    expect(fs.existsSync(fixture.output)).toBe(false);
  });

  it('build-only에 production secret이 섞이면 값 노출 없이 중단한다', () => {
    const fixture = createFixture();
    const secretCanary = 'must-not-appear';
    const result = execute(fixture, {
      SEORI_BUILD_MODE: 'build-only',
      SEORI_SOURCE_SHA: 'b'.repeat(40),
      SEORI_ANDROID_AAB_OUTPUT: fixture.output,
      GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD: secretCanary,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD');
    expect(`${result.stdout}${result.stderr}`).not.toContain(secretCanary);
    expect(fs.existsSync(fixture.output)).toBe(false);
  });

  it('source SHA와 중앙 output 계약이 정확하지 않으면 빌드 전에 중단한다', () => {
    const fixture = createFixture();
    const invalidSha = execute(fixture, {
      SEORI_BUILD_MODE: 'build-only',
      SEORI_SOURCE_SHA: 'not-a-sha',
      SEORI_ANDROID_AAB_OUTPUT: fixture.output,
    });
    const wrongOutput = execute(fixture, {
      SEORI_BUILD_MODE: 'build-only',
      SEORI_SOURCE_SHA: 'c'.repeat(40),
      SEORI_ANDROID_AAB_OUTPUT: path.join(fixture.root, 'other.aab'),
    });

    expect(invalidSha.status).not.toBe(0);
    expect(invalidSha.stderr).toContain('40자리 소문자 Git SHA');
    expect(wrongOutput.status).not.toBe(0);
    expect(wrongOutput.stderr).toContain('중앙 build-only 계약 경로와 다릅니다');
    expect(fs.existsSync(fixture.output)).toBe(false);
  });

  it('mode가 없으면 기존 market-upload 계약으로 진입해 production 입력을 요구한다', () => {
    const fixture = createFixture();
    const result = execute(fixture);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('mode=market-upload');
    expect(result.stderr).toContain('필수 환경변수가 없습니다: ANDROID_VERSION_NAME');
    expect(fs.existsSync(fixture.output)).toBe(false);
  });
});

// Cloud Build 폴백은 사람이 급할 때 로컬에서 제출하는 경로라 평소에는 아무도 돌리지 않는다.
// #549 가 평시 경로를 중앙 워크플로로 옮기며 pnpm store 를 채우던 단계를 지웠고, 폴백은
// market-upload 의 store 검사에서 멈추는 채로 남았다. 필수·거부 목록을 여기 다시 적지 않고
// 스크립트에서 직접 읽어 cloudbuild-android.yaml 과 대조한다.
describe('Cloud Build 폴백 설정', () => {
  const cloudBuild = fs.readFileSync(path.join(repositoryRoot, 'cloudbuild-android.yaml'), 'utf8');
  const buildEnv = fs.readFileSync(path.join(repositoryRoot, 'build.env'), 'utf8');

  function marketUpload(): string {
    const start = sourceBuildScript.indexOf('run_market_upload() {');
    expect(start).toBeGreaterThanOrEqual(0);
    return sourceBuildScript.slice(start, sourceBuildScript.indexOf('\n}\n', start));
  }

  function buildStep(): { body: string; env: Record<string, string> } {
    const match = cloudBuild.match(/- id: build-signed-aab\n([\s\S]*?)(?=\n {2}- id: |\n\S)/);
    expect(match).not.toBeNull();
    const body = match![1];
    const env: Record<string, string> = {};
    for (const entry of body.matchAll(/^ {6}- ([A-Z0-9_]+)=(.*)$/gm)) env[entry[1]] = entry[2];
    return { body, env };
  }

  it('market-upload 의 필수값을 모두 넘기고 거부값은 넘기지 않는다', () => {
    const market = marketUpload();
    const requiredBlock = market.match(/for name in \\\n([\s\S]*?); do\n\s*require_env "\$name"/);
    expect(requiredBlock).not.toBeNull();
    const required = requiredBlock![1].split(/[\s\\]+/).filter(Boolean);
    const rejected = [...market.matchAll(/^\s*reject_env ([A-Z0-9_]+)$/gm)].map(entry => entry[1]);
    expect(required.length).toBeGreaterThan(0);

    const { env } = buildStep();
    for (const name of required) expect(Object.keys(env)).toContain(name);
    for (const name of rejected) expect(Object.keys(env)).not.toContain(name);

    const declared = new Set([...cloudBuild.matchAll(/^ {2}(_[A-Z0-9_]+):/gm)].map(entry => entry[1]));
    for (const value of Object.values(env)) {
      for (const entry of value.matchAll(/\$\{(_[A-Z0-9_]+)\}/g)) expect(declared.has(entry[1])).toBe(true);
    }
  });

  it('market-upload 가 요구하는 pnpm store 디렉터리를 스크립트 전에 만든다', () => {
    expect(marketUpload()).toContain('CLOUD_BUILD_PNPM_STORE');
    expect(buildEnv).toMatch(/^CLOUD_BUILD_PNPM_STORE=\S+$/m);
    const { body } = buildStep();
    expect(body).toContain('CLOUD_BUILD_PNPM_STORE');
    expect(body).toMatch(/mkdir -p "\/workspace\/\$\$store"/);
    expect(body.indexOf('mkdir -p')).toBeLessThan(body.indexOf('scripts/build-android.sh'));
  });

  it('릴리즈마다 달라지는 값에 옛 기본값을 남기지 않고 Secret Manager 를 쓰지 않는다', () => {
    for (const key of ['_SEORI_RELEASE_TAG', '_SEORI_RELEASE_SOURCE_SHA', '_ANDROID_VERSION_NAME', '_ANDROID_VERSION_CODE']) {
      expect(cloudBuild).toMatch(new RegExp(`^ {2}${key}: ""$`, 'm'));
    }
    expect(cloudBuild).not.toMatch(/availableSecrets|secretEnv|secretManager/);
  });
});
