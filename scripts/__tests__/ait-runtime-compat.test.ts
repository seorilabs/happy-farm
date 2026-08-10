import fs from 'node:fs';
import path from 'node:path';

// @ts-expect-error — .js 검출기 모듈(CommonJS)에는 타입 선언이 없다. 런타임 계약만 검증한다.
import {
  collectAitRuntimeSourceTargets,
  findAitBundleRuntimeViolations,
  findAitSourceRuntimeViolations,
} from '../lib/ait-runtime-compat.js';

describe('AppsInToss Granite 런타임 호환성 가드', () => {
  it('BigInt 지수 연산 소스를 차단한다', () => {
    const violations = findAitSourceRuntimeViolations(
      'return BigInt(costBase) * BigInt(costGrowth) ** BigInt(tier);',
      'landmark.ts'
    );

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'landmark.ts',
        line: 1,
      }),
    ]);
  });

  it('Granite가 생성한 Math.pow와 BigInt 조합을 번들에서 차단한다', () => {
    const violations = findAitBundleRuntimeViolations(
      'return BigInt(costBase) * Math.pow(BigInt(costGrowth), BigInt(tier));',
      'bundle.ios.0_84_0.js'
    );

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'bundle.ios.0_84_0.js',
        line: 1,
      }),
    ]);
  });

  it('BigInt 곱셈 기반 정수 거듭제곱은 허용한다', () => {
    const source = `
      let result = BigInt(1);
      let factor = BigInt(base);
      while (exponent > 0) {
        if (exponent % 2 === 1) result *= factor;
        exponent = Math.floor(exponent / 2);
        factor *= factor;
      }
    `;

    expect(findAitSourceRuntimeViolations(source)).toEqual([]);
    expect(findAitBundleRuntimeViolations(source)).toEqual([]);
  });

  it('Android 번들에서 BGM과 효과음의 오디오 포커스 연결 누락을 차단한다', () => {
    const filePath = 'apps/ait/dist/bundle.android.0_84_0.js';

    expect(findAitBundleRuntimeViolations('disableFocus: true', filePath)).toEqual([
      expect.objectContaining({
        file: filePath,
        line: 0,
      }),
    ]);
    expect(findAitBundleRuntimeViolations('disableAudioFocus: true', filePath)).toEqual([]);
  });

  it('실제 AIT 런타임 소스에 금지 패턴이 없다', () => {
    const rootDir = process.cwd();
    const violations = collectAitRuntimeSourceTargets(rootDir).flatMap((relativePath: string) =>
      findAitSourceRuntimeViolations(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'), relativePath)
    );

    expect(violations).toEqual([]);
  });
});
