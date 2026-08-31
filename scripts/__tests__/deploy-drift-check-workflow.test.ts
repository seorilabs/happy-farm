/// <reference types="jest" />

// 배포 드리프트 점검 워크플로우(#420) 정의 자체가 대상인 인수조건을 고정한다.
// AC-1(트리거·러너)·AC-5(action 핀 고정)는 워크플로우 YAML의 정적 속성이라 여기서 검증하고,
// 실행 본체(수집·비교·이슈 발행, AC-2/AC-3)는 scripts/deploy-drift-run.js 로 분리돼
// deploy-drift-run.test.ts 가 목 주입 통합 테스트로 실제 동작을 검증한다.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const WORKFLOW = fs.readFileSync(
  path.join(ROOT, '.github/workflows/deploy-drift-check.yml'),
  'utf8',
);

describe('deploy-drift-check 워크플로우 (#420)', () => {
  test('AC-1: .github/workflows/deploy-drift-check.yml 신설 — schedule(daily) + workflow_dispatch, runs-on: seorilabs-rpi-arm64', () => {
    expect(WORKFLOW).toMatch(/^on:/m);
    expect(WORKFLOW).toMatch(/\n {2}schedule:/);
    expect(WORKFLOW).toMatch(/\n {2}workflow_dispatch:/);
    // 잡은 지정 러너에서 돈다.
    expect(WORKFLOW).toMatch(/runs-on: seorilabs-rpi-arm64/);
    // 이슈 발행·run 조회 권한.
    expect(WORKFLOW).toMatch(/issues: write/);
    expect(WORKFLOW).toMatch(/actions: read/);

    // schedule이 "매일" 실행인지: cron 5필드 중 일·월·요일이 모두 '*'이면 daily 보장.
    const cronMatch = WORKFLOW.match(/- cron: '([^']+)'/);
    expect(cronMatch).not.toBeNull();
    const fields = (cronMatch as RegExpMatchArray)[1].trim().split(/\s+/);
    expect(fields).toHaveLength(5); // minute hour day-of-month month day-of-week
    const [, , dayOfMonth, month, dayOfWeek] = fields;
    expect(dayOfMonth).toBe('*');
    expect(month).toBe('*');
    expect(dayOfWeek).toBe('*');
  });

  test('실행 본체를 scripts/deploy-drift-run.js 에 위임한다(AC-2/AC-3 통합 테스트 대상)', () => {
    // 수집·비교·요약·이슈 발행 로직은 모듈로 분리돼 목 주입 테스트가 가능하다.
    expect(WORKFLOW).toContain("require(path.resolve(process.env.GITHUB_WORKSPACE, 'scripts/deploy-drift-run.js'))");
    expect(WORKFLOW).toMatch(/await run\(\{ github, context, core, exec \}\)/);
    // 해당 모듈이 실제로 존재한다.
    expect(fs.existsSync(path.join(ROOT, 'scripts/deploy-drift-run.js'))).toBe(true);
  });

  test('AC-5: 모든 action은 확인된 stable release의 full commit SHA로 고정한다', () => {
    const usesRefs = [...WORKFLOW.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
    expect(usesRefs.length).toBeGreaterThan(0);
    for (const ref of usesRefs) {
      expect(ref).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
      expect(ref).not.toMatch(/@latest$/);
      expect(ref).not.toMatch(/@(main|master)$/);
      expect(ref).not.toMatch(/@v\d+$/);
    }
    expect(usesRefs).toContain('actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803');
    expect(usesRefs).toContain('actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3');
  });
});
