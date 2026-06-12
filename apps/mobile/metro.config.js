const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const workspaceRoot = path.resolve(__dirname, '../..');
const mobileNodeModules = path.resolve(__dirname, 'node_modules');
const workspaceNodeModules = path.resolve(workspaceRoot, 'node_modules');
const aitRoot = path.resolve(workspaceRoot, 'apps/ait');

const escapePathForRegex = (filePath) => filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const resolvePackagePath = (packageName, fromPath) => {
  try {
    return path.dirname(require.resolve(`${packageName}/package.json`, { paths: [fromPath] }));
  } catch {
    return null;
  }
};

const mobilePackageAliases = {
  '@react-native-async-storage/async-storage': resolvePackagePath('@react-native-async-storage/async-storage', __dirname),
  react: resolvePackagePath('react', __dirname),
  'react-native': resolvePackagePath('react-native', __dirname),
  'react-native-safe-area-context': resolvePackagePath('react-native-safe-area-context', __dirname),
};

const blockedNativePackagePaths = Object.entries(mobilePackageAliases).flatMap(([packageName, mobilePackagePath]) => {
  if (mobilePackagePath == null) {
    return [];
  }

  return [workspaceRoot, aitRoot]
    .flatMap((root) => [
      resolvePackagePath(packageName, root),
      path.resolve(root, 'node_modules', packageName),
    ])
    .filter((packagePath) => packagePath != null && packagePath !== mobilePackagePath)
    .map((packagePath) => new RegExp(`^${escapePathForRegex(packagePath)}(?:[/\\\\].*)?$`));
});

const resolveMobileAlias = (moduleName) => {
  for (const [packageName, mobilePackagePath] of Object.entries(mobilePackageAliases)) {
    if (mobilePackagePath == null) {
      continue;
    }
    if (moduleName === packageName) {
      return mobilePackagePath;
    }
    if (moduleName.startsWith(`${packageName}/`)) {
      return path.join(mobilePackagePath, moduleName.slice(packageName.length + 1));
    }
  }
  return null;
};

const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    blockList: blockedNativePackagePaths,
    unstable_enableSymlinks: true,
    extraNodeModules: mobilePackageAliases,
    nodeModulesPaths: [
      mobileNodeModules,
      workspaceNodeModules,
    ],
    resolveRequest: (context, moduleName, platform) => {
      const mobileAlias = resolveMobileAlias(moduleName);
      return context.resolveRequest(context, mobileAlias ?? moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
