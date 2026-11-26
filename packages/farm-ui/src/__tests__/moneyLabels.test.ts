/// <reference types="jest" />

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { SUPPORTED_LOCALES, formatGold, formatHourlyGold } from '../../../farm-core/src';
import { getFarmMessages } from '../i18n';

// #606 AC-10: 금액 뒤에 붙던 "G"가 K, M과 만나 "48.5KG"처럼 무게로 읽혔다. 금액 단위는 코인(🪙)으로 쓴다.
// 템플릿 문자열(`${amount}G`)과 JSX 글자({formatMoney(...)}G) 둘 다 잡는다.
const MONEY_G_AFTER_INTERPOLATION = /(\$\{[^}]+\}|\{formatMoney\([^)]*\)\})\s?G(?![a-zA-Z])/;

describe('금액 표기 (#606 AC-10)', () => {
  test('문구 카탈로그 8개 언어에 금액 뒤 G 단위가 없다', () => {
    const dir = path.join(__dirname, '../i18n/messages');
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.ts'))) {
      const offending = readFileSync(path.join(dir, file), 'utf8')
        .split('\n')
        .filter((line) => MONEY_G_AFTER_INTERPOLATION.test(line));
      expect({ file, offending }).toEqual({ file, offending: [] });
    }
  });

  test('화면 코드도 금액 뒤에 G를 붙이지 않는다', () => {
    const roots = [path.join(__dirname, '..'), path.join(__dirname, '../../../farm-core/src')];
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '__tests__' || entry.name === 'messages') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
      }
    };
    roots.forEach(walk);
    const offending = files.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => MONEY_G_AFTER_INTERPOLATION.test(line))
        .map((line) => `${path.basename(file)}: ${line.trim()}`)
    );
    expect(offending).toEqual([]);
  });

  test('금액은 숫자 뒤에 코인으로, 시간당 금액도 코인으로 보인다', () => {
    expect(formatGold(48_500, 'en-US')).toBe('48.5K 🪙');
    expect(formatGold(48_500, 'ko-KR')).toBe('4.85만 🪙');
    for (const locale of SUPPORTED_LOCALES) {
      expect(formatHourlyGold(48_500, locale)).not.toMatch(/G/);
      expect(formatHourlyGold(48_500, locale)).toContain('🪙');
      expect(getFarmMessages(locale).sheetGoldLabel('48.5K')).toBe('🪙 48.5K');
    }
  });
});
