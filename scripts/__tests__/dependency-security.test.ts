import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repositoryRoot = path.resolve(__dirname, '../..');

describe('transitive dependency security boundary', () => {
  test('the image parser preserves Metro file-path and buffer inputs', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const imageSize = require('../../packages/image-size-compat/index.cjs');
    const assetPath = path.join(
      repositoryRoot,
      'apps/mobile/src/art/assets/crop_carrot.png',
    );

    expect(imageSize(assetPath)).toEqual(
      imageSize(Buffer.from(readFileSync(assetPath))),
    );
    expect(imageSize(assetPath)).toEqual(
      expect.objectContaining({
        width: expect.any(Number),
        height: expect.any(Number),
      }),
    );
  });

  test('the image parser terminates on malformed container lengths', () => {
    const compatibilityModule = path.join(
      repositoryRoot,
      'packages/image-size-compat/index.cjs',
    );
    const fixtures = [
      [0x00, 0x00, 0x00, 0x00, 0x4a, 0x58, 0x4c, 0x20],
      [0x00, 0x00, 0x00, 0x00, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66],
      [0x69, 0x63, 0x6e, 0x73, 0x00, 0x00, 0x00, 0x10, 0x69, 0x63, 0x30, 0x37, 0x00, 0x00, 0x00, 0x00],
    ];

    execFileSync(
      process.execPath,
      [
        '-e',
        `const imageSize = require(${JSON.stringify(compatibilityModule)});` +
          `const fixtures = ${JSON.stringify(fixtures)};` +
          'for (const bytes of fixtures) {' +
          '  try { imageSize(Uint8Array.from(bytes)); } catch {}' +
          '}',
      ],
      { timeout: 2_000 },
    );
  });

  test.each([
    '0',
    '127.1',
    '01200034567',
    '012.1.2.3',
    '017700000001',
    '000:0:0000::01',
    '::fFFf:127.0.0.1',
  ])('does not classify %s as a public address', address => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ip = require('../../packages/ip-compat/index.cjs');

    try {
      expect(ip.isPublic(address)).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('Invalid ip address');
    }
  });
});
