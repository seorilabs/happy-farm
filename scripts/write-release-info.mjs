#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;

function required(name) {
  const value = process.env[name]?.trim() ?? '';
  if (value.length === 0) {
    throw new Error(`${name} is required from the central release binding.`);
  }
  return value;
}

function resolveProjection() {
  const releaseTag = required('SEORI_RELEASE_TAG');
  const versionName = required('SEORI_RELEASE_VERSION');
  const buildNumberText = required('SEORI_RELEASE_VERSION_CODE');
  const gitSha = required('SEORI_RELEASE_SOURCE_SHA');
  const match = TAG_PATTERN.exec(releaseTag);

  if (match == null || `v${versionName}` !== releaseTag) {
    throw new Error('Central release tag and version do not match.');
  }
  if (!/^[1-9]\d*$/u.test(buildNumberText)) {
    throw new Error('SEORI_RELEASE_VERSION_CODE must be a positive integer.');
  }
  const buildNumber = Number(buildNumberText);
  if (!Number.isSafeInteger(buildNumber)) {
    throw new Error('SEORI_RELEASE_VERSION_CODE exceeds the safe integer range.');
  }
  if (!SHA_PATTERN.test(gitSha)) {
    throw new Error('SEORI_RELEASE_SOURCE_SHA must be a 40-character lowercase Git SHA.');
  }

  return {
    releaseTag,
    versionName,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    buildNumber,
    gitSha,
  };
}

function writeProjection(projection) {
  const outputPath = path.join(process.cwd(), 'packages/farm-core/src/releaseInfo.ts');
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    [
      '// Generated from the central release binding. This file does not derive versions.',
      'export const RELEASE_INFO = {',
      `  releaseTag: ${JSON.stringify(projection.releaseTag)},`,
      `  versionName: ${JSON.stringify(projection.versionName)},`,
      `  major: ${projection.major},`,
      `  minor: ${projection.minor},`,
      `  patch: ${projection.patch},`,
      `  buildNumber: ${projection.buildNumber},`,
      `  gitSha: ${JSON.stringify(projection.gitSha)},`,
      '} as const;',
      '',
    ].join('\n'),
    'utf8'
  );
  return outputPath;
}

try {
  const projection = resolveProjection();
  const outputPath = writeProjection(projection);
  process.stdout.write(`release binding projected: ${outputPath}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
