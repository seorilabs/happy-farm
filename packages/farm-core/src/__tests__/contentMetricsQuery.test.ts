/// <reference types="jest" />

import { readFileSync } from 'node:fs';
import path from 'node:path';

// analytics/queries/content-metrics.sql은 BigQuery에서 실행하는 산출물이라 헤드리스
// dry-run이 불가하다. 대신 콘텐츠 대시보드가 의존하는 "계약"(작물/구역 집계 컬럼,
// 소스 이벤트, 변수 스코프 분리, 0분모 방어)이 조용히 드리프트되지 않도록 정적 가드한다.
// (docs/04-work/content-analytics.md 기준)
const SQL_PATH = path.resolve(__dirname, '../../../../analytics/queries/content-metrics.sql');
const sql = readFileSync(SQL_PATH, 'utf8');

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('content-metrics.sql 계약 가드', () => {
  test('작물[A] 집계 컬럼이 모두 산출된다', () => {
    for (const column of [
      'planted',
      'ready',
      'harvested',
      'seed_selected',
      'first_harvests',
      'cotd_harvests',
      'harvesters',
      'revenue',
      'plant_to_harvest_rate',
      'avg_revenue_per_harvest',
    ]) {
      expect(sql).toContain(column);
    }
  });

  test('구역[B] 집계 컬럼이 모두 산출된다', () => {
    for (const column of [
      'unlock_clicked',
      'unlocked',
      'unlock_cost_sum',
      'unlock_conversion',
    ]) {
      expect(sql).toContain(column);
    }
  });

  test('작물/구역 집계가 의존하는 소스 이벤트가 모두 참조된다', () => {
    for (const event of [
      'crop_planted',
      'crop_harvested',
      'crop_ready_summary',
      'crop_ready',
      'seed_selected',
      'first_seed_selected',
      'crop_of_the_day_harvested',
      'area_unlock_clicked',
      'area_unlocked',
    ]) {
      expect(sql).toContain(`'${event}'`);
    }
  });

  test('ready는 summary ready_count와 legacy crop_ready를 함께 합산한다', () => {
    expect(sql).toContain("event_name = 'crop_ready_summary'");
    expect(sql).toContain("event_name = 'crop_ready'");
    expect(sql).toContain('COALESCE(ready_count, 0)');
  });

  test('두 블록이 BEGIN...END로 변수 스코프가 분리돼 DECLARE 충돌이 없다', () => {
    expect(sql.match(/^BEGIN$/gm)?.length ?? 0).toBe(2);
    expect(occurrences(sql, 'END;')).toBe(2);
    expect(occurrences(sql, 'DECLARE window_days')).toBe(2);
  });

  test('파생율은 SAFE_DIVIDE로 0분모를 방어한다', () => {
    // 심기/수확/언락이 0인 날에도 쿼리가 죽지 않아야 한다(0 division → NULL).
    expect(sql).toContain('SAFE_DIVIDE(harvested, planted)');
    expect(sql).toContain('SAFE_DIVIDE(unlocked, unlock_clicked)');
  });
});
