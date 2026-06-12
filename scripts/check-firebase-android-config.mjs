#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const configPath = path.join(rootDir, 'apps/mobile/android/app/google-services.json');
const requiredPackages = ['com.seorilabs.happyfarm', 'com.seorilabs.happyfarm.debug'];

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (!fs.existsSync(configPath)) {
  fail(`Missing Firebase Android config: ${path.relative(rootDir, configPath)}`);
  process.exit();
}

let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  fail(`Invalid google-services.json: ${error instanceof Error ? error.message : String(error)}`);
  process.exit();
}

const packages = new Set(
  (Array.isArray(config.client) ? config.client : [])
    .map((client) => client?.client_info?.android_client_info?.package_name)
    .filter((packageName) => typeof packageName === 'string')
);

for (const packageName of requiredPackages) {
  if (!packages.has(packageName)) {
    fail(`google-services.json is missing Android client package: ${packageName}`);
  }
}

if (process.exitCode == null || process.exitCode === 0) {
  console.log(`Firebase Android config OK: ${[...packages].join(', ')}`);
}
