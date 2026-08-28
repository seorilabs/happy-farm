// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const config = require('@granite-js/react-native/jest').config({
  rootDir: __dirname,
  moduleNameMapper: {
    '@babel/runtime(.*)': `${path.dirname(require.resolve('@babel/runtime/package.json'))}$1`,
  },
});

config.testPathIgnorePatterns = [...(config.testPathIgnorePatterns ?? []), '<rootDir>/apps/mobile/'];

// The private ARC runner is capped at 4 GiB. Granite/jsdom transforms retain
// memory between suites, so recycle large workers and bound parallelism rather
// than increasing the runner limit or skipping coverage.
config.maxWorkers = 2;
config.workerIdleMemoryLimit = '768MB';

module.exports = config;
