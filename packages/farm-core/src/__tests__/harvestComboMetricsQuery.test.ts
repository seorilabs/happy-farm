/// <reference types="jest" />

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { COMBO_GREAT_THRESHOLD, COMBO_LEGENDARY_THRESHOLD } from '../constants';

// BigQuery 콘솔용 multi-statement SQL은 Jest에서 직접 dry-run할 수 없다. 대신 #348의
// 분석 계약(직접 이벤트·필수 6 params·28개 완료일·티어/분포/종료/집중도)이 구현과
// 문서에서 조용히 드리프트하지 않도록 정적으로 가드한다.
const SQL_PATH = path.resolve(__dirname, '../../../../analytics/queries/harvest-combo-metrics.sql');
const sql = readFileSync(SQL_PATH, 'utf8');

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('harvest-combo-metrics.sql 계약 가드 (#348)', () => {
  test('harvest_combo_completed와 필수 6개 파라미터를 직접 읽는다', () => {
    expect(sql).toContain("event_name = 'harvest_combo_completed'");
    for (const parameter of [
      'manual_harvest_count',
      'combo_tier',
      'duration_ms',
      'base_revenue_total',
      'end_reason',
      'schema_version',
    ]) {
      expect(sql).toContain(`ep.key = '${parameter}'`);
    }
  });

  test('모든 분석 블록이 당일을 제외한 28개 완료일을 사용한다', () => {
    expect(sql.match(/^BEGIN$/gm)?.length ?? 0).toBe(5);
    // ORDER BY CASE ... END;는 블록 종료가 아니므로 statement-level END만 센다.
    expect(sql.match(/^END;$/gm)?.length ?? 0).toBe(5);
    expect(occurrences(sql, 'DECLARE window_days INT64 DEFAULT 28')).toBe(5);
    expect(occurrences(sql, 'DATE_SUB(CURRENT_DATE(), INTERVAL window_days DAY)')).toBe(5);
    expect(occurrences(sql, 'DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)')).toBe(5);
  });

  test('stable tier와 종료 사유 enum 및 schema v1만 baseline에 사용한다', () => {
    for (const tier of ['normal', 'great', 'legendary']) {
      expect(sql).toContain(`'${tier}'`);
    }
    for (const reason of ['timeout', 'background', 'prestige', 'reset', 'cloud_restore']) {
      expect(sql).toContain(`'${reason}'`);
    }
    expect(sql).toContain('schema_version = 1');
    expect(sql).toContain('manual_harvest_count >= 1');
    expect(sql).toContain('duration_ms >= 0');
    expect(sql).toContain('base_revenue_total >= 0');
  });

  test('티어 분포와 길이·지속시간·수익 분포를 산출한다', () => {
    for (const metric of [
      'combo_share',
      'manual_harvest_share',
      'user_reach_rate',
      'exact_tier_users',
      'reached_users',
      'median_manual_harvest_count',
      'p90_manual_harvest_count',
      'max_manual_harvest_count',
      'median_duration_ms',
      'p90_duration_ms',
      'max_duration_ms',
      'avg_base_revenue_per_combo',
      'avg_base_revenue_per_manual_harvest',
    ]) {
      expect(sql).toContain(metric);
    }
    expect(sql).toContain('APPROX_QUANTILES(');
    // 도달률은 exact final tier share가 아니다. legendary 사용자는 great에도
    // 도달했으므로 수동 수확 threshold 기준 누적 cohort로 집계해야 한다.
    expect(sql).toContain('minimum_manual_harvest_count');
    expect(sql).toContain(
      'valid_combo_events.manual_harvest_count >= tiers.minimum_manual_harvest_count'
    );
    expect(sql).toContain(`SELECT 'great', 2, ${COMBO_GREAT_THRESHOLD}`);
    expect(sql).toContain(`SELECT 'legendary', 3, ${COMBO_LEGENDARY_THRESHOLD}`);
    expect(sql).toContain('normal(1+) is an intentional 100% cohort anchor');
  });

  test('종료 사유 분포와 사용자 집중도를 0분모 안전하게 산출한다', () => {
    for (const metric of [
      'end_reason_share',
      'top1_manual_harvest_share',
      'top2_manual_harvest_share',
      'top10pct_manual_harvest_share',
      'top1_base_revenue_share',
      'top2_base_revenue_share',
      'hhi_manual_harvests',
      'hhi_base_revenue',
    ]) {
      expect(sql).toContain(metric);
    }
    expect(occurrences(sql, 'SAFE_DIVIDE(')).toBeGreaterThanOrEqual(10);
    expect(sql).toContain('top1/top2 mean exactly the largest one/two users');
    expect(sql).toContain('ROW_NUMBER() OVER (ORDER BY manual_harvests DESC, user_pseudo_id)');
  });

  test('필수 파라미터 누락과 enum·범위·schema 드리프트를 별도 출력한다', () => {
    for (const metric of [
      'missing_manual_harvest_count',
      'missing_combo_tier',
      'missing_duration_ms',
      'missing_base_revenue_total',
      'missing_end_reason',
      'missing_schema_version',
      'invalid_combo_tier',
      'invalid_end_reason',
      'invalid_schema_version',
      'has_data',
      'valid_event_rate',
    ]) {
      expect(sql).toContain(metric);
    }
    expect(sql).toContain('IF(COUNT(*) = 0, NULL, SAFE_DIVIDE(COUNTIF(is_valid), COUNT(*)))');
  });
});
