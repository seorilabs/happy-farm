import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  collectAitBundleTargets,
  collectAitRuntimeSourceTargets,
  findAitBundleRuntimeViolations,
  findAitSourceRuntimeViolations,
} = require('./lib/ait-runtime-compat.js');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const sourceOnly = process.argv.includes('--source-only');

const sourceTargets = collectAitRuntimeSourceTargets(rootDir);
const bundleTargets = sourceOnly ? [] : collectAitBundleTargets(rootDir);
const failures = sourceTargets.flatMap((relativePath) =>
  findAitSourceRuntimeViolations(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'), relativePath)
);

if (!sourceOnly && bundleTargets.length === 0) {
  failures.push({
    file: 'apps/ait/dist',
    line: 0,
    message: '검사할 AIT JavaScript 번들이 없습니다. ait build 이후 실행해야 합니다.',
    snippet: '',
  });
}

for (const relativePath of bundleTargets) {
  failures.push(
    ...findAitBundleRuntimeViolations(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'), relativePath)
  );
}

const result = {
  status: failures.length === 0 ? 'pass' : 'fail',
  checkedSources: sourceTargets.length,
  checkedBundles: bundleTargets.length,
  failures,
};

console.log(JSON.stringify(result, null, 2));

if (failures.length > 0) {
  process.exit(1);
}
