#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const packageName = process.env.ANDROID_APPLICATION_ID ?? 'com.seorilabs.happyfarm.debug';
const debugHost = process.argv[2] ?? 'localhost:8081';
const appDataDir = `/data/data/${packageName}`;
const prefsFile = `${appDataDir}/shared_prefs/${packageName}_preferences.xml`;

function xmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function runAdb(args) {
  const result = spawnSync('adb', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`adb ${args.join(' ')} failed${detail ? `:\n${detail}` : ''}`);
  }
  return result.stdout.trim();
}

const xmlLines = [
  '<?xml version="1.0" encoding="utf-8" standalone="yes" ?>',
  '<map>',
  `    <string name="debug_http_host">${xmlEscape(debugHost)}</string>`,
  '</map>',
];

const writePrefsCommand = [
  `mkdir -p ${appDataDir}/shared_prefs`,
  `printf '%s\\n' ${xmlLines.map(shellQuote).join(' ')} > ${prefsFile}`,
].join(' && ');

runAdb(['shell', `run-as ${packageName} sh -c ${shellQuote(writePrefsCommand)}`]);

console.log(`Set ${packageName} React Native debug host to ${debugHost}.`);
