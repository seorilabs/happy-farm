import { createRequire } from 'node:module';
import path from 'node:path';
import { realpathSync } from 'node:fs';

test('app providers and shared UI resolve one safe-area context module', () => {
  // A provider from one copy cannot satisfy the hook from another copy.
  const root = path.resolve(__dirname, '../..');
  const consumers = ['package.json', 'apps/ait/package.json', 'apps/mobile/package.json'];
  const modules = consumers.map((manifest) =>
    realpathSync(createRequire(path.join(root, manifest)).resolve('react-native-safe-area-context'))
  );
  expect(new Set(modules).size).toBe(1);
});
