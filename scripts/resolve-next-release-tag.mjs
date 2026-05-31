#!/usr/bin/env node

import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const RELEASE_TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const VERSION_SEGMENT_BASE = 1000;
const GOOGLE_PLAY_MAX_VERSION_CODE = 2100000000;

function parseArgs(argv) {
  const args = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    }

    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const key = arg.slice(2);
    if (key === 'github-output' || key === 'github-step-summary') {
      args.set(key, true);
      continue;
    }

    const value = argv[index + 1];
    if (value == null || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }

    args.set(key, value);
    index += 1;
  }

  return args;
}

function parseReleaseTag(tag) {
  const match = RELEASE_TAG_PATTERN.exec(tag);
  if (match == null) {
    throw new Error(`Release tag must use vX.Y.Z numeric SemVer format, got: ${tag}`);
  }

  return {
    tag,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function buildNumberOf(version) {
  if (version.major < 1 || version.minor >= VERSION_SEGMENT_BASE || version.patch >= VERSION_SEGMENT_BASE) {
    throw new Error(`Release tag is outside supported versionCode range: ${version.tag}`);
  }

  const buildNumber = version.major * 1_000_000 + version.minor * VERSION_SEGMENT_BASE + version.patch;
  if (buildNumber > GOOGLE_PLAY_MAX_VERSION_CODE) {
    throw new Error(`Release tag buildNumber exceeds Google Play versionCode maximum: ${buildNumber}`);
  }

  return buildNumber;
}

function compareVersions(left, right) {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

function formatTag(version) {
  return `v${version.major}.${version.minor}.${version.patch}`;
}

function listReleaseTags() {
  const output = execFileSync('git', ['tag', '--list', 'v*.*.*'], { encoding: 'utf8' });
  return output
    .split('\n')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => {
      try {
        return parseReleaseTag(tag);
      } catch {
        return null;
      }
    })
    .filter((version) => version != null);
}

function resolveNextVersion(args) {
  const explicitTag = args.get('tag');
  if (explicitTag != null) {
    const version = parseReleaseTag(explicitTag);
    const latest = listReleaseTags().sort(compareVersions).at(-1);
    if (latest != null && compareVersions(version, latest) <= 0) {
      throw new Error(`Release tag must be greater than the latest existing tag ${latest.tag}, got: ${explicitTag}`);
    }
    buildNumberOf(version);
    return version;
  }

  const bump = args.get('bump') ?? 'minor';
  if (!['major', 'minor', 'patch'].includes(bump)) {
    throw new Error(`Unsupported bump type: ${bump}`);
  }

  const latest = listReleaseTags().sort(compareVersions).at(-1);
  if (latest == null) {
    return { tag: 'v1.0.0', major: 1, minor: 0, patch: 0 };
  }

  if (bump === 'major') {
    return { tag: '', major: latest.major + 1, minor: 0, patch: 0 };
  }

  if (bump === 'minor') {
    return { tag: '', major: latest.major, minor: latest.minor + 1, patch: 0 };
  }

  return { tag: '', major: latest.major, minor: latest.minor, patch: latest.patch + 1 };
}

function tagExists(tag) {
  const existingTags = execFileSync('git', ['tag', '--list', tag], { encoding: 'utf8' });
  return existingTags.trim().length > 0;
}

function writeGithubOutput(values) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath == null || outputPath === '') {
    throw new Error('GITHUB_OUTPUT is required when --github-output is set.');
  }

  appendFileSync(
    outputPath,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n'
  );
}

function writeGithubStepSummary(values) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath == null || summaryPath === '') {
    return;
  }

  appendFileSync(
    summaryPath,
    [
      '### Next release tag',
      '',
      `- tag: ${values.tag}`,
      `- versionName: ${values.version_name}`,
      `- buildNumber: ${values.build_number}`,
      '',
    ].join('\n')
  );
}

try {
  const args = parseArgs(process.argv.slice(2));
  const nextVersion = resolveNextVersion(args);
  const tag = nextVersion.tag || formatTag(nextVersion);

  if (tagExists(tag)) {
    throw new Error(`Release tag already exists: ${tag}`);
  }

  const version = parseReleaseTag(tag);
  const values = {
    tag,
    version_name: `${version.major}.${version.minor}.${version.patch}`,
    build_number: String(buildNumberOf(version)),
  };

  if (args.get('github-output')) {
    writeGithubOutput(values);
  }

  if (args.get('github-step-summary')) {
    writeGithubStepSummary(values);
  }

  console.log(JSON.stringify(values, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
