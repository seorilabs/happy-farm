/// <reference types="jest" />

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const AIT_ARTIFACT = path.join(REPO_ROOT, 'apps/ait/happy-farm.ait');
const ZIP_LOCAL_FILE_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function readZipEntry(archive: Buffer, entryName: string): Buffer {
  let offset = archive.indexOf(ZIP_LOCAL_FILE_HEADER);

  while (offset >= 0) {
    const compressionMethod = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const fileNameLength = archive.readUInt16LE(offset + 26);
    const extraFieldLength = archive.readUInt16LE(offset + 28);
    const fileNameStart = offset + 30;
    const fileNameEnd = fileNameStart + fileNameLength;
    const fileName = archive.subarray(fileNameStart, fileNameEnd).toString('utf8');
    const dataStart = fileNameEnd + extraFieldLength;
    const dataEnd = dataStart + compressedSize;

    if (fileName === entryName) {
      const compressed = archive.subarray(dataStart, dataEnd);
      if (compressionMethod === 0) {
        return compressed;
      }
      if (compressionMethod === 8) {
        return inflateRawSync(compressed);
      }
      throw new Error(`지원하지 않는 ZIP 압축 방식입니다: ${compressionMethod}`);
    }

    offset = archive.indexOf(ZIP_LOCAL_FILE_HEADER, dataEnd);
  }

  throw new Error(`AIT 산출물에서 ${entryName} 엔트리를 찾지 못했습니다.`);
}

describe('AppsInToss 게임 내비게이션 설정', () => {
  jest.setTimeout(120_000);

  test('AC-3: 생성된 .ait 산출물에 navigationBar 투명 배경과 dark 테마를 포함한다', () => {
    execFileSync('pnpm', ['--dir', 'apps/ait', 'build'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    expect(fs.existsSync(AIT_ARTIFACT)).toBe(true);
    const artifact = fs.readFileSync(AIT_ARTIFACT);
    const iosBundle = readZipEntry(artifact, 'bundle.ios.0_84_0.js').toString('utf8');
    const serializedNavigationBar = iosBundle
      .match(/navigationBar:\{transparentBackground:(?:!0|true),theme:"dark"\}/)?.[0]
      .replace('!0', 'true');

    expect(serializedNavigationBar).toBe('navigationBar:{transparentBackground:true,theme:"dark"}');
  });
});
