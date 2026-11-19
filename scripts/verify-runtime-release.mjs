#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { renderProjection, resolveProjection } from './write-release-info.mjs';

const releaseInfoPath = 'packages/farm-core/src/releaseInfo.ts';
const unzipLimit = 128 * 1024 * 1024;

function readZipEntry(file, entry) {
  return execFileSync('unzip', ['-p', path.resolve(file), entry], { maxBuffer: unzipLimit });
}

function archiveApp(archive) {
  const root = path.join(archive, 'Products', 'Applications');
  const apps = readdirSync(root).filter(name => name.endsWith('.app'));
  if (apps.length !== 1) throw new Error('Expected one top-level app in the archive.');
  return path.join(root, apps[0]);
}

function readPlist(data) {
  return JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', '-'], { input: data }));
}

function verifySourceMap(file, projection) {
  const sourceMap = JSON.parse(readFileSync(file, 'utf8'));
  const matches = sourceMap.sources.flatMap((source, index) => {
    const normalized = source.replaceAll('\\', '/');
    if (normalized === releaseInfoPath || normalized.endsWith('/' + releaseInfoPath)) return [index];
    return [];
  });
  if (matches.length !== 1 || sourceMap.sourcesContent?.[matches[0]] !== renderProjection(projection)) {
    throw new Error('Bundled releaseInfo.ts does not match the central release binding.');
  }
}

function bundleDigest(bundle) {
  if (bundle.length === 0) throw new Error('The packaged React Native bundle is empty.');
  return createHash('sha256').update(bundle).digest('hex');
}

const [mode, artifact, pathArgument, archive] = process.argv.slice(2);
try {
  const projection = resolveProjection();
  let bundle;
  if (mode === '--aab') {
    const appBuild = path.join(pathArgument, 'app', 'build');
    const entry = 'index.android.bundle';
    verifySourceMap(path.join(appBuild, 'intermediates/sourcemaps/react/release', entry + '.packager.map'), projection);
    bundle = readZipEntry(artifact, 'base/assets/' + entry);
    if (!bundle.equals(readFileSync(path.join(appBuild, 'generated/assets/react/release', entry)))) {
      throw new Error('AAB bundle differs from the bundle produced by Gradle.');
    }
  } else if (mode === '--archive' || mode === '--ipa') {
    verifySourceMap(pathArgument, projection);
    const app = archiveApp(mode === '--archive' ? artifact : archive);
    const archiveInfo = readPlist(readFileSync(path.join(app, 'Info.plist')));
    if (archiveInfo.CFBundleShortVersionString !== projection.versionName) {
      throw new Error('Archive version differs from the JavaScript release version.');
    }
    bundle = readFileSync(path.join(app, 'main.jsbundle'));
    if (mode === '--ipa') {
      const payload = 'Payload/' + path.basename(app);
      const ipaInfo = readPlist(readZipEntry(artifact, payload + '/Info.plist'));
      for (const key of ['CFBundleIdentifier', 'CFBundleShortVersionString', 'CFBundleVersion']) {
        if (ipaInfo[key] !== archiveInfo[key]) throw new Error(`IPA ${key} differs from the verified archive.`);
      }
      if (!bundle.equals(readZipEntry(artifact, payload + '/main.jsbundle'))) {
        throw new Error('IPA bundle differs from the verified archive bundle.');
      }
    }
  } else {
    throw new Error('Expected --aab, --archive, or --ipa.');
  }
  console.log(`runtime release ${projection.versionName} ${projection.gitSha} bundle_sha256=${bundleDigest(bundle)}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
