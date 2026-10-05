import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {URL, fileURLToPath} from 'node:url';
import test from 'node:test';

const checker = fileURLToPath(new URL('./check-app-store-readiness.mjs', import.meta.url));

function checkDisplayName(t, displayName) {
  const root = mkdtempSync(join(tmpdir(), 'app-store-display-name-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  mkdirSync(join(root, 'app-store'), {recursive: true});
  mkdirSync(join(root, 'apps/mobile/ios/HappyFarmMobile'), {recursive: true});
  writeFileSync(join(root, 'package.json'), '{}');
  writeFileSync(join(root, 'app-store/app-store.config.json'), JSON.stringify({
    primaryLanguage: 'en-US',
    storeListing: {appName: {'en-US': 'Happy Farm Tycoon', 'ko-KR': '행복 농장 타이쿤'}},
  }));
  writeFileSync(join(root, 'apps/mobile/ios/HappyFarmMobile/Info.plist'),
    `<plist><dict><key>CFBundleDisplayName</key><string>${displayName}</string></dict></plist>`);
  const run = spawnSync(process.execPath, [checker, '--json'], {cwd: root, encoding: 'utf8'});
  assert.equal(run.error, undefined);
  const result = JSON.parse(run.stdout);
  // This fixture covers only name validation; unrelated release requirements remain missing.
  return {
    passes: result.passes.filter(({message}) => message.includes('CFBundleDisplayName')),
    failures: result.failures.filter(({message}) => message.includes('CFBundleDisplayName')),
  };
}

test('영어 기본 언어에서도 등록된 한국어 기기 이름을 허용한다', (t) => {
  const result = checkDisplayName(t, '행복 농장 타이쿤');
  assert.equal(result.passes.length, 1);
  assert.deepEqual(result.failures, []);
});

test('등록되지 않은 기기 이름을 차단한다', (t) => {
  const result = checkDisplayName(t, 'Unrelated App');
  assert.deepEqual(result.passes, []);
  assert.equal(result.failures.length, 1);
});

test('빈 기기 이름을 차단한다', (t) => {
  const result = checkDisplayName(t, '');
  assert.deepEqual(result.passes, []);
  assert.equal(result.failures.length, 1);
});
