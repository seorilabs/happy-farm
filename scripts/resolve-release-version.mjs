#!/usr/bin/env node
import { appendFileSync } from 'node:fs';

const GOOGLE_PLAY_MAX_VERSION_CODE = 2100000000;

function parseArgs(argv) {
  const args = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const key = arg.slice(2);
    if (key === 'github-output' || key === 'github-step-summary' || key === 'quiet') {
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

function readInteger(value, label, { min }) {
  if (value == null || value === '') {
    throw new Error(`${label} is required.`);
  }

  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be an integer, got: ${value}`);
  }

  const parsedValue = Number(value);
  if (!Number.isSafeInteger(parsedValue) || parsedValue < min) {
    throw new Error(`${label} must be >= ${min}, got: ${value}`);
  }

  return parsedValue;
}

function resolveReleaseVersion(args) {
  const major = readInteger(args.get('major') ?? process.env.RELEASE_MAJOR_VERSION ?? '1', 'major', { min: 0 });
  const runNumber = readInteger(args.get('run-number') ?? process.env.GITHUB_RUN_NUMBER, 'GITHUB_RUN_NUMBER', {
    min: 1,
  });
  const runAttempt = readInteger(
    args.get('run-attempt') ?? process.env.GITHUB_RUN_ATTEMPT ?? '1',
    'GITHUB_RUN_ATTEMPT',
    {
      min: 1,
    }
  );

  const buildNumber = runNumber * 100 + runAttempt;
  if (buildNumber > GOOGLE_PLAY_MAX_VERSION_CODE) {
    throw new Error(`build_number exceeds Google Play versionCode maximum: ${buildNumber}`);
  }

  const versionName = `${major}.${runNumber}.${runAttempt}`;

  return {
    version_name: versionName,
    build_number: String(buildNumber),
    google_play_fallback_version_code: String(buildNumber),
    apple_marketing_version: versionName,
    apple_build_number: String(buildNumber),
  };
}

function writeGithubOutput(values) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath == null || outputPath === '') {
    throw new Error('GITHUB_OUTPUT is required when --github-output is set.');
  }

  const output = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  appendFileSync(outputPath, `${output}\n`);
}

function writeGithubStepSummary(values) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath == null || summaryPath === '') {
    return;
  }

  appendFileSync(
    summaryPath,
    [
      '### Release version',
      '',
      `- versionName: ${values.version_name}`,
      `- buildNumber: ${values.build_number}`,
      `- Apple CFBundleShortVersionString: ${values.apple_marketing_version}`,
      `- Apple CFBundleVersion: ${values.apple_build_number}`,
      '',
    ].join('\n')
  );
}

try {
  const args = parseArgs(process.argv.slice(2));
  const values = resolveReleaseVersion(args);

  if (args.get('github-output')) {
    writeGithubOutput(values);
  }

  if (args.get('github-step-summary')) {
    writeGithubStepSummary(values);
  }

  if (!args.get('quiet')) {
    console.log(JSON.stringify(values, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
