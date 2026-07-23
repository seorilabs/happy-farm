/**
 * @format
 */

import { CROPS, type CropKey } from '../../../../../packages/farm-core/src';
import { mobileFarmArt } from '../farmArt';

describe('mobileFarmArt', () => {
  test('every crop key resolves to a bundled asset (no missing map entries)', () => {
    for (const cropKey of Object.keys(CROPS) as CropKey[]) {
      const source = mobileFarmArt.cropIcon?.(cropKey);
      expect(source).not.toBeNull();
      expect(source).toBeDefined();
    }
  });

  test('growth stages resolve to bundled assets', () => {
    for (const stage of ['sprout', 'sapling', 'budding', 'mature'] as const) {
      expect(mobileFarmArt.stageIcon?.(stage)).toBeDefined();
    }
  });
});
