/// <reference types="jest" />

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { ABSOLUTE_FILL } from '../absoluteFill';

// RN 0.85(mobile)의 StyleSheet에는 absoluteFillObject가 없어 펼치면 아무것도 들어가지 않는다. jest와
// 타입 검사(Granite RN 0.84 기준)는 통과하므로 소스에서 직접 막는다(#606). 밭 배경은 #610에서 다룬다.
const KNOWN_REMAINING = new Set(['components/EnvironmentBackdrop.tsx']);

function sourceFiles(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === '__tests__') return [];
    if (statSync(full).isDirectory()) return sourceFiles(full, base);
    return /\.(ts|tsx)$/.test(name) ? [path.relative(base, full)] : [];
  });
}

describe('절대 위치 채우기 (#606)', () => {
  test('ABSOLUTE_FILL은 네 변을 0으로 둔 절대 위치다', () => {
    expect(ABSOLUTE_FILL).toEqual({ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 });
  });

  test('farm-ui는 RN 0.85에 없는 StyleSheet.absoluteFillObject를 쓰지 않는다', () => {
    const root = path.resolve(__dirname, '..');
    const offenders = sourceFiles(root).filter(
      (file) => !KNOWN_REMAINING.has(file) && /StyleSheet\.absoluteFillObject/.test(readFileSync(path.join(root, file), 'utf8'))
    );
    expect(offenders).toEqual([]);
  });
});
