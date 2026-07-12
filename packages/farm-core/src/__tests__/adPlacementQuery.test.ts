/// <reference types="jest" />

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { REWARDED_AD_PLACEMENTS } from '../ads';

// analytics/queries/ad-placement-metrics.sql은 BigQuery에서 실행하는 산출물이라
// 헤드리스 dry-run은 불가하다. 대신 리포트가 의존하는 "계약"(placement 목록·필수 지표
// 컬럼·변수 스코프 분리·0분모 방어)이 조용히 드리프트되지 않도록 정적으로 가드한다.
// (이슈 [M7] #116, 리뷰 test-gap 대응)
const SQL_PATH = path.resolve(__dirname, '../../../../analytics/queries/ad-placement-metrics.sql');
const sql = readFileSync(SQL_PATH, 'utf8');

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('ad-placement-metrics.sql 계약 가드 (#116)', () => {
  test('placement_ecpm CTE에 ads.ts의 모든 placement가 정의돼 있다', () => {
    for (const placement of Object.values(REWARDED_AD_PLACEMENTS)) {
      expect(sql).toContain(`'${placement}'`);
    }
  });

  test('필수 지표 컬럼과 카운트가 모두 산출된다', () => {
    const requiredColumns = [
      'impressions',
      'clicks',
      'completes',
      'fails',
      'blocked',
      'ctr',
      'completion_rate',
      'fail_rate',
      'fill_approx',
      'block_rate',
      'est_revenue_usd',
      'arpdau_usd',
    ];
    for (const column of requiredColumns) {
      expect(sql).toContain(column);
    }
  });

  test('두 쿼리가 BEGIN...END 블록으로 변수 스코프가 분리돼 DECLARE 충돌이 없다', () => {
    // 스코프 분리 덕에 window_days를 두 번 선언해도 충돌하지 않는다(High 회귀 방지).
    // 문(statement) 수준 BEGIN만 센다(헤더 주석의 'BEGIN' 언급 제외).
    expect(sql.match(/^BEGIN$/gm)?.length ?? 0).toBe(2);
    expect(occurrences(sql, 'END;')).toBe(2);
    expect(occurrences(sql, 'DECLARE window_days')).toBe(2);
    // 레거시 DATE 변수(start_date/end_date) 중복 선언 방식으로 되돌아가지 않았는지 확인.
    expect(sql).not.toContain('DECLARE start_date');
    expect(sql).not.toContain('DECLARE end_date');
  });

  test('시계열[A]=28일, 주간 요약[B]=7일 기본 윈도우', () => {
    expect(sql).toContain('DECLARE window_days INT64 DEFAULT 28');
    expect(sql).toContain('DECLARE window_days INT64 DEFAULT 7');
  });

  test('arpdau_usd는 est_revenue_usd에서 파생돼 추정 매출과 정합한다', () => {
    // 두 쿼리 모두 SAFE_DIVIDE(est_revenue_usd, ...) 형태로 ARPDAU를 도출한다.
    expect(occurrences(sql, 'SAFE_DIVIDE(est_revenue_usd')).toBe(2);
  });

  test('모든 비율 컬럼이 SAFE_DIVIDE로 0분모를 방어한다', () => {
    // ctr/completion/fail/fill/block(각 5개) × 2쿼리 + arpdau 2개 = 12개 이상.
    expect(occurrences(sql, 'SAFE_DIVIDE(')).toBeGreaterThanOrEqual(12);
  });
});
