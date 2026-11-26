/// <reference types="jest" />

import { readFileSync } from 'node:fs';
import path from 'node:path';

// BigQuery multi-statement SQL은 Jest에서 직접 실행할 수 없으므로, #606 첫 세션 분석의
// 표본 보정·이벤트·관찰 기간 계약을 정적으로 고정한다. 실제 검증은 bq --dry_run으로 했다.
const SQL_PATH = path.resolve(__dirname, '../../../../analytics/queries/first-session-funnel.sql');
const sql = readFileSync(SQL_PATH, 'utf8');

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('first-session-funnel.sql 계약 가드 (#606)', () => {
  test('세 블록이 당일 미완료 export를 빼고 완료일만 읽는다', () => {
    expect(sql.match(/^BEGIN$/gm)?.length ?? 0).toBe(3);
    expect(sql.match(/^END;$/gm)?.length ?? 0).toBe(3);
    expect(occurrences(sql, 'DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)')).toBe(3);
  });

  test('첫날 분석은 스토어 설치·국가 있는 행·정상 버전만 남긴다', () => {
    expect(occurrences(sql, "app_info.install_source IN ('iTunes', 'com.android.vending')")).toBe(2);
    expect(occurrences(sql, "AND geo.country IS NOT NULL AND geo.country != ''")).toBe(2);
    expect(occurrences(sql, "app_info.version NOT IN ('1.1.2', '1.1.4', '1.2.4', '1.8.1', '1.8.3')")).toBe(2);
    expect(occurrences(sql, "platform IN ('IOS', 'ANDROID')")).toBe(2);
  });

  test('복귀는 첫 실행 뒤 1~3일을 끝까지 관찰할 수 있는 코호트만 센다', () => {
    expect(sql).toContain('DECLARE follow_days INT64 DEFAULT 4');
    expect(sql).toContain('HAVING MIN(event_day) <= DATE_SUB(CURRENT_DATE(), INTERVAL follow_days DAY)');
    expect(sql).toContain('DATE_DIFF(e.event_day, f.first_day, DAY) BETWEEN 1 AND 3');
  });

  test('첫날 행동과 온보딩 단계, 시트 계측 이벤트를 읽는다', () => {
    for (const event of [
      'first_open',
      'game_start',
      'onboarding_stall',
      'onboarding_skip',
      'first_meaningful_harvest',
      'onboarding_complete',
      'plot_unlocked',
      'upgrade_purchased',
      'missions_screen',
      'production_screen',
      'animals_screen',
      'cooking_screen',
      'collection_screen',
      'interstitial_shown',
      'sheet_opened',
      'sheet_closed',
    ]) {
      expect(sql).toContain(`'${event}'`);
    }
    for (const parameter of ['engagement_time_msec', 'step', 'sheet', 'source', 'dwell_ms']) {
      expect(sql).toContain(`key = '${parameter}'`);
    }
  });
});
