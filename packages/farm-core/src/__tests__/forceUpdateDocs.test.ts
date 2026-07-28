/// <reference types="jest" />

import { readFileSync } from 'node:fs';
import path from 'node:path';

// #428 AC-5: 강제 업데이트 게이트의 운영 절차(언제 최소버전을 올리는지)가
// docs/firebase-mobile.md에 문서화돼 있는지 회귀로 고정한다. 문서가 삭제되거나
// 핵심 운영 지침이 빠지면 이 테스트가 실패한다. (node:fs를 쓰는 fs 계약 테스트
// contentMetricsQuery.test.ts와 동일한 패턴으로 farm-core 테스트 컨텍스트에 둔다.)
const DOC_PATH = path.resolve(__dirname, '../../../../docs/firebase-mobile.md');
const doc = readFileSync(DOC_PATH, 'utf8');

describe('firebase-mobile.md 강제 업데이트 게이트 운영 문서 (#428 AC-5)', () => {
  it('강제 업데이트 게이트 섹션과 운영 절차를 문서화한다', () => {
    expect(doc).toContain('## 강제 업데이트 게이트');
    expect(doc).toContain('운영 절차');
    // "언제 최소버전을 올리는지" 핵심 지침.
    expect(doc).toContain('minimum_supported_version_code');
    expect(doc).toMatch(/스토어에 승인·게시|이미 스토어에 승인/);
    expect(doc).toContain('롤백');
  });

  it('force_update_url 폴백과 iOS 필수 설정을 문서화한다', () => {
    expect(doc).toContain('force_update_url');
    expect(doc).toMatch(/iOS.*force_update_url|force_update_url.*iOS/);
  });

  it('배포 후 측정 이벤트(update_gate_shown/store_click)를 문서화한다', () => {
    expect(doc).toContain('update_gate_shown');
    expect(doc).toContain('update_gate_store_click');
  });
});
