/// <reference types="jest" />

// 배포 드리프트 점검 워크플로우(#420)의 인수조건을 워크플로우 정의로 고정한다.
// 워크플로우 YAML 자체가 AC의 대상(트리거·러너·수집 경로·이슈 발행·action 핀 고정)이므로,
// 파일 내용을 읽어 각 AC를 직접 검증한다(저장소 config-assertion 테스트 관행과 동일).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const WORKFLOW = fs.readFileSync(
  path.join(ROOT, '.github/workflows/deploy-drift-check.yml'),
  'utf8',
);

describe('deploy-drift-check 워크플로우 (#420)', () => {
  test('AC-1: schedule(daily cron) + workflow_dispatch 트리거, runs-on: seorilabs-rpi-arm64', () => {
    expect(WORKFLOW).toMatch(/^on:/m);
    // schedule 아래 cron 항목(매일 실행)
    expect(WORKFLOW).toMatch(/schedule:/);
    expect(WORKFLOW).toMatch(/- cron: '[^']+'/);
    expect(WORKFLOW).toMatch(/workflow_dispatch:/);
    expect(WORKFLOW).toMatch(/runs-on: seorilabs-rpi-arm64/);
    // 이슈 발행을 위한 권한
    expect(WORKFLOW).toMatch(/issues: write/);
    expect(WORKFLOW).toMatch(/actions: read/);
  });

  test('AC-2: 최신 v태그 + 채널별 성공 배포 run(단독 + deploy-all 잡) 수집·비교', () => {
    // 최신 v태그 수집(최신순 정렬)
    expect(WORKFLOW).toMatch(/git['"]?,\s*\[['"]tag['"]/);
    expect(WORKFLOW).toMatch(/--sort=-v:refname/);
    expect(WORKFLOW).toMatch(/--points-at/);
    // 채널 단독 배포 워크플로우 run
    expect(WORKFLOW).toContain('deploy-apps-in-toss.yml');
    expect(WORKFLOW).toContain('deploy-google-play.yml');
    // deploy-all 경유 배포는 채널 잡 성공으로 수집
    expect(WORKFLOW).toContain('deploy-all.yml');
    expect(WORKFLOW).toMatch(/listWorkflowRuns/);
    expect(WORKFLOW).toMatch(/listJobsForWorkflowRun/);
    expect(WORKFLOW).toMatch(/conclusion === 'success'/);
    // 순수 판정 로직 재사용
    expect(WORKFLOW).toContain("require(path.resolve(process.env.GITHUB_WORKSPACE, 'scripts/deploy-drift.js'))");
    expect(WORKFLOW).toMatch(/drift\.evaluateChannel/);
  });

  test('AC-3: step summary 표 출력 + 마커 기반 이슈 생성/코멘트', () => {
    // step summary에 채널 비교 표
    expect(WORKFLOW).toMatch(/core\.summary/);
    expect(WORKFLOW).toMatch(/drift\.renderDriftTable/);
    // 동일 주제 open 이슈 판별(숨김 마커) → 없으면 생성, 있으면 코멘트
    expect(WORKFLOW).toMatch(/drift\.chooseIssueAction/);
    expect(WORKFLOW).toMatch(/drift\.ISSUE_MARKER/);
    expect(WORKFLOW).toMatch(/issues\.create\b/);
    expect(WORKFLOW).toMatch(/issues\.createComment/);
    expect(WORKFLOW).toMatch(/listForRepo/);
  });

  test('AC-5: 모든 action은 stable major 태그로 고정(@latest·branch 참조 금지)', () => {
    const usesRefs = [...WORKFLOW.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
    expect(usesRefs.length).toBeGreaterThan(0);
    for (const ref of usesRefs) {
      // owner/repo@vN 형태만 허용
      expect(ref).toMatch(/^[\w.-]+\/[\w.-]+@v\d+$/);
      expect(ref).not.toMatch(/@latest$/);
      expect(ref).not.toMatch(/@(main|master)$/);
    }
    // 저장소에서 사용 확인된 버전
    expect(usesRefs).toContain('actions/checkout@v6');
    expect(usesRefs).toContain('actions/github-script@v9');
  });
});
