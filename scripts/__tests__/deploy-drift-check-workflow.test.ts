/// <reference types="jest" />

// 배포 드리프트 점검 워크플로우(#420)의 인수조건을 authoritative 테스트로 고정한다.
// 각 AC 테스트는 (1) 워크플로우 YAML의 실행 경로 배선과 (2) 그 경로가 호출하는 순수
// 로직의 실제 동작을 한 테스트 안에서 함께 검증한다 — 통과 시 AC 전체가 보장되도록.
import fs from 'node:fs';
import path from 'node:path';

import {
  ISSUE_MARKER,
  buildChannelRow,
  buildIssueBody,
  chooseIssueAction,
  pickNewerRun,
  renderDriftTable,
} from '../deploy-drift';

const ROOT = path.resolve(__dirname, '../..');
const WORKFLOW = fs.readFileSync(
  path.join(ROOT, '.github/workflows/deploy-drift-check.yml'),
  'utf8',
);

// #420 재현용 태그 축(최신순): 최신은 v1.8.3, WEB(AIT)는 v1.7.0에 정체.
const TAGS = ['v1.8.3', 'v1.8.2', 'v1.8.1', 'v1.8.0', 'v1.7.0'];
const LATEST = 'v1.8.3';
const REFERENCE_MS = Date.parse('2026-07-23T00:00:00Z'); // 최신 태그 시각 가정

describe('deploy-drift-check 워크플로우 (#420)', () => {
  test('AC-1: schedule(daily) + workflow_dispatch 트리거, runs-on: seorilabs-rpi-arm64', () => {
    // on: 블록에 schedule·workflow_dispatch 두 트리거가 모두 있어야 한다.
    const onBlock = WORKFLOW.match(/^on:\n([\s\S]*?)\n\w/m);
    expect(onBlock).not.toBeNull();
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

  test('AC-2: 최신 v태그 + 채널별 성공 배포 run(단독 + deploy-all 잡) 수집·비교', () => {
    // (1) 수집 경로 배선: 최신 v태그, 채널 단독 run, deploy-all 채널 잡 성공을 모은다.
    expect(WORKFLOW).toMatch(/--sort=-v:refname/); // 최신 v태그
    expect(WORKFLOW).toMatch(/--points-at/); // run head_sha → 배포 태그 역매핑
    expect(WORKFLOW).toContain('deploy-apps-in-toss.yml'); // AIT 단독 run
    expect(WORKFLOW).toContain('deploy-google-play.yml'); // Google Play 단독 run
    expect(WORKFLOW).toContain('deploy-all.yml'); // deploy-all 경유
    expect(WORKFLOW).toMatch(/listWorkflowRuns/);
    expect(WORKFLOW).toMatch(/listJobsForWorkflowRun/); // deploy-all 내 채널 잡
    expect(WORKFLOW).toMatch(/conclusion === 'success'/); // 성공 잡만
    // 워크플로우가 호출하는 비교 로직.
    expect(WORKFLOW).toContain("require(path.resolve(process.env.GITHUB_WORKSPACE, 'scripts/deploy-drift.js'))");
    expect(WORKFLOW).toMatch(/drift\.pickNewerRun/);
    expect(WORKFLOW).toMatch(/drift\.buildChannelRow/);

    // (2) 그 비교 로직의 실제 동작: 단독 run과 deploy-all 경유 run 중 최신을 고르고,
    //     역매핑 태그를 최신 태그와 비교해 뒤처짐을 판정한다(#420 WEB v1.7.0 정체 재현).
    const standalone = { created_at: '2026-07-13T00:00:00Z', html_url: 'https://x/ait-standalone' };
    const viaDeployAll = { created_at: '2026-07-19T00:00:00Z', html_url: 'https://x/ait-deploy-all' };
    const chosen = pickNewerRun(standalone, viaDeployAll);
    expect(chosen).toBe(viaDeployAll); // 더 최근 배포 run 선택

    const row = buildChannelRow({
      channel: 'AIT (WEB)',
      run: chosen,
      deployedTag: 'v1.7.0', // head_sha --points-at 결과 가정
      referenceMs: REFERENCE_MS,
      sortedTagsDesc: TAGS,
      latestTag: LATEST,
    });
    expect(row.deployedTag).toBe('v1.7.0');
    expect(row.eval.gap).toBe(4); // 최신에서 4개 뒤
    expect(row.eval.drift).toBe(true);

    // 성공 배포가 없는 채널은 태그 불명 → 드리프트로 표시.
    const emptyRow = buildChannelRow({
      channel: 'Google Play',
      run: null,
      deployedTag: null,
      referenceMs: REFERENCE_MS,
      sortedTagsDesc: TAGS,
      latestTag: LATEST,
    });
    expect(emptyRow.eval.drift).toBe(true);
    expect(emptyRow.eval.reasons).toContain('unknown-tag');
  });

  test('AC-3: step summary 표 출력 + 마커 기반 이슈 생성/코멘트', () => {
    // (1) 배선: step summary에 표를 쓰고, 마커로 이슈를 생성/코멘트한다.
    expect(WORKFLOW).toMatch(/core\.summary/);
    expect(WORKFLOW).toMatch(/drift\.renderDriftTable/);
    expect(WORKFLOW).toMatch(/drift\.chooseIssueAction/);
    expect(WORKFLOW).toMatch(/drift\.buildIssueBody/);
    expect(WORKFLOW).toMatch(/issues\.create\b/);
    expect(WORKFLOW).toMatch(/issues\.createComment/);
    expect(WORKFLOW).toMatch(/listForRepo/);

    // (2) 실제 동작: 채널별 `최신 태그 vs 최종 배포 태그` 표가 렌더되고,
    const rows = [
      buildChannelRow({
        channel: 'AIT (WEB)',
        run: { created_at: '2026-07-13T00:00:00Z', html_url: 'https://x/ait' },
        deployedTag: 'v1.7.0',
        referenceMs: REFERENCE_MS,
        sortedTagsDesc: TAGS,
        latestTag: LATEST,
      }),
    ];
    const table = renderDriftTable(LATEST, rows);
    expect(table).toContain(LATEST); // 최신 태그
    expect(table).toContain('v1.7.0'); // 최종 배포 태그
    expect(table).toContain('AIT (WEB)');
    expect(table).toContain('⚠️ 드리프트');

    // 이슈/코멘트 본문은 표 + 숨김 마커를 담고, 마커로 중복을 판별한다.
    const body = buildIssueBody({ table, runUrl: 'https://x/run/1', checkedAtIso: '2026-07-23T20:00:00.000Z' });
    expect(body).toContain(table);
    expect(body).toContain(ISSUE_MARKER);

    // 동일 주제(마커) 열린 이슈가 있으면 코멘트, 없으면 생성.
    expect(chooseIssueAction([{ number: 7, body }])).toEqual({ action: 'comment', issueNumber: 7 });
    expect(chooseIssueAction([{ number: 8, body: '무관' }])).toEqual({ action: 'create' });
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
