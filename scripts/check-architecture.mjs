import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const passes = [];

const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const ignoredSegments = new Set(['node_modules', 'dist', 'build', 'Pods', '.granite', '.swc', '.gradle', 'DerivedData']);

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function repoPath(relativePath) {
  return path.join(root, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(repoPath(relativePath));
}

function collectSourceFiles(relativeRoot) {
  const absoluteRoot = repoPath(relativeRoot);
  if (!fs.existsSync(absoluteRoot)) {
    return [];
  }

  const files = [];
  const stack = [absoluteRoot];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current == null) continue;

    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (ignoredSegments.has(entry.name)) {
        continue;
      }

      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }

      if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
        files.push(toPosix(path.relative(root, entryPath)));
      }
    }
  }

  return files.sort();
}

function read(relativePath) {
  return fs.readFileSync(repoPath(relativePath), 'utf8');
}

function extractImports(source) {
  const imports = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?[^'"]*?\s+from\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (typeof match[1] === 'string') {
        imports.push(match[1]);
      }
    }
  }

  return imports;
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) {
    return null;
  }

  return toPosix(path.normalize(path.join(path.dirname(fromFile), specifier)));
}

function isForbiddenBareImport(specifier, forbiddenPrefixes) {
  return forbiddenPrefixes.some((prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`));
}

function checkForbiddenImports({ name, roots, forbiddenPrefixes = [], forbiddenRelativeRoots = [] }) {
  const files = roots.flatMap(collectSourceFiles);
  const localFailures = [];

  for (const file of files) {
    for (const specifier of extractImports(read(file))) {
      if (isForbiddenBareImport(specifier, forbiddenPrefixes)) {
        localFailures.push(`${file} -> ${specifier}`);
        continue;
      }

      const resolved = resolveImport(file, specifier);
      if (resolved == null) {
        continue;
      }

      if (forbiddenRelativeRoots.some((relativeRoot) => resolved === relativeRoot || resolved.startsWith(`${relativeRoot}/`))) {
        localFailures.push(`${file} -> ${specifier}`);
      }
    }
  }

  if (localFailures.length > 0) {
    failures.push(`${name}: ${localFailures.join(', ')}`);
  } else {
    passes.push(`${name}: ${files.length} files checked`);
  }
}

function requirePath(relativePath, label) {
  if (exists(relativePath)) {
    passes.push(`${label}: ${relativePath}`);
  } else {
    failures.push(`${label}: ${relativePath} 경로가 없습니다.`);
  }
}

requirePath('packages/farm-core/src', 'core package');
requirePath('packages/farm-ui/src', 'shared RN UI package');
requirePath('apps/ait/src', 'AppsInToss app');
requirePath('apps/mobile', 'mobile app');

checkForbiddenImports({
  name: 'farm-core platform boundary',
  roots: ['packages/farm-core/src'],
  forbiddenPrefixes: [
    '@apps-in-toss',
    '@granite-js',
    '@react-native',
    '@react-native-firebase',
    '@toss',
    'expo',
    'firebase',
    'react',
    'react-native',
    'react-native-google-mobile-ads',
    'react-native-sound',
  ],
  forbiddenRelativeRoots: ['apps'],
});

checkForbiddenImports({
  name: 'farm-ui market adapter boundary',
  roots: ['packages/farm-ui/src'],
  forbiddenPrefixes: [
    '@apps-in-toss',
    '@granite-js',
    '@react-native-async-storage',
    '@react-native-firebase',
    '@toss',
    'firebase',
    'react-native-google-mobile-ads',
    'react-native-sound',
  ],
  forbiddenRelativeRoots: ['apps'],
});

checkForbiddenImports({
  name: 'mobile must not import AppsInToss app',
  roots: ['apps/mobile'],
  forbiddenRelativeRoots: ['apps/ait'],
});

checkForbiddenImports({
  name: 'AppsInToss app must not import mobile app',
  roots: ['apps/ait/src', 'apps/ait/pages'],
  forbiddenRelativeRoots: ['apps/mobile'],
});

const result = {
  status: failures.length > 0 ? 'fail' : 'pass',
  passes,
  failures,
};

console.log(JSON.stringify(result, null, 2));

if (failures.length > 0) {
  process.exit(1);
}
