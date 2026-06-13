#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    env: options.env ?? process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result.stdout ?? '';
}

const versionOutput = run(
  process.execPath,
  ['scripts/resolve-release-version.mjs', '--write-release-info'],
  { capture: true }
);
const releaseVersion = JSON.parse(versionOutput);

console.log(
  `Building Google Play AAB for ${releaseVersion.release_tag} ` +
    `(${releaseVersion.version_name}, code ${releaseVersion.google_play_version_code})`
);

run('pnpm', ['--dir', 'apps/mobile', 'build:android'], {
  env: {
    ...process.env,
    GOOGLE_PLAY_VERSION_CODE: releaseVersion.google_play_version_code,
    GOOGLE_PLAY_VERSION_NAME: releaseVersion.version_name,
    RELEASE_VERSION_NAME: releaseVersion.version_name,
  },
});
