/// <reference types="jest" />

import { readFileSync } from 'node:fs';
import path from 'node:path';

// BigQuery multi-statement SQL은 Jest에서 직접 dry-run할 수 없으므로,
// #349의 이벤트·28일 window·퍼널·빈도·분포·집중도·품질 계약을
// 정적으로 고정한다.
const SQL_PATH = path.resolve(__dirname, '../../../../analytics/queries/animal-funnel-metrics.sql');
const sql = readFileSync(SQL_PATH, 'utf8');

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('animal-funnel-metrics.sql 계약 가드 (#349)', () => {
  test('동물 퍼널 5개 이벤트와 필수 파라미터를 읽는다', () => {
    for (const event of [
      'animals_screen',
      'animal_purchased',
      'animal_fed',
      'animal_produce_collected',
      'animal_produce_collect_all',
    ]) {
      expect(sql).toContain(`'${event}'`);
    }

    for (const parameter of [
      'source',
      'animal',
      'collection_mode',
      'owned_count',
      'feeding_count',
      'ready_count',
      'purchase_cost',
      'owned_count_after',
      'feed_cost',
      'produce_timer_ms',
      'base_revenue',
      'final_revenue',
      'is_rare',
      'rare_multiplier',
      'ready_wait_ms',
      'collected_count',
      'base_revenue_total',
      'final_revenue_total',
      'rare_count',
      'schema_version',
    ]) {
      expect(sql).toContain(`ep.key = '${parameter}'`);
    }
  });

  test('모든 블록이 당일을 제외한 28개 완료일을 쓴다', () => {
    expect(sql.match(/^BEGIN$/gm)?.length ?? 0).toBe(5);
    expect(sql.match(/^END;$/gm)?.length ?? 0).toBe(5);
    expect(occurrences(sql, 'DECLARE window_days INT64 DEFAULT 28')).toBe(5);
    expect(occurrences(sql, 'DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY)')).toBe(5);
    expect(occurrences(sql, 'DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)')).toBe(5);
  });

  test('퍼널·수집 빈도·동물별 분포를 0분모 안전하게 산출한다', () => {
    for (const metric of [
      'screen_user_conversion_rate',
      'collections_per_user',
      'collections_per_session',
      'avg_ready_wait_ms',
      'median_ready_wait_ms',
      'p90_ready_wait_ms',
      'purchases',
      'purchasers',
      'feeds',
      'feeders',
      'collectors',
      'base_revenue',
      'final_revenue',
    ]) {
      expect(sql).toContain(metric);
    }
    expect(occurrences(sql, 'SAFE_DIVIDE(')).toBeGreaterThanOrEqual(8);
    expect(sql).toContain('GROUP BY animal');
    expect(sql).toContain("collection_mode IN ('single', 'collect_all')");
  });

  test('사용자 수집량·수익 집중도를 stable tie-break로 집계한다', () => {
    for (const metric of [
      'collection_top1_share',
      'collection_top2_share',
      'collection_top10pct_share',
      'collection_hhi',
      'revenue_top1_share',
      'revenue_top2_share',
      'revenue_hhi',
    ]) {
      expect(sql).toContain(metric);
    }
    expect(sql).toContain('ROW_NUMBER() OVER (ORDER BY collections DESC, user_pseudo_id)');
    expect(sql).toContain('ROW_NUMBER() OVER (ORDER BY final_revenue DESC, user_pseudo_id)');
  });

  test('schema v1 baseline outcome과 enum·범위·no-data 품질을 따로 출력한다', () => {
    expect(sql).toContain('schema_version = 1');
    expect(sql).toContain("source IN ('more', 'welcome_back')");
    expect(sql).toContain('final_revenue = base_revenue');
    expect(sql).toContain('is_rare = 0 AND rare_multiplier = 1');
    expect(sql).toContain('final_revenue_total = base_revenue_total');
    expect(sql).toContain('rare_count = 0');
    for (const metric of [
      'missing_schema_version_events',
      'invalid_schema_version_events',
      'invalid_payload_events',
      'valid_event_rate',
      'quality_status',
    ]) {
      expect(sql).toContain(metric);
    }
    for (const status of ['no_data', 'all_invalid', 'valid', 'partially_invalid']) {
      expect(sql).toContain(`'${status}'`);
    }
  });
});
