/// <reference types="jest" />

// 배포 드리프트 워크플로우 실행 본체(#420)의 통합 테스트.
// github/core/exec 를 목으로 주입해, 워크플로우가 실제로 도는 수집→비교→요약→이슈 발행
// 경로를 헤드리스에서 그대로 실행·검증한다(AC-2 수집·비교, AC-3 표 출력·이슈 생성/코멘트).
import * as drift from '../deploy-drift';
import { run } from '../deploy-drift-run';

const OWNER = 'seorilabs';
const REPO = 'happy-farm';
const TAGS = ['v1.8.3', 'v1.8.2', 'v1.8.1', 'v1.8.0', 'v1.7.0'];

type Run = { id: number; head_sha: string; created_at: string; html_url?: string };

interface Fixture {
  runsByWorkflow: Record<string, Run[]>;
  jobsByRun: Record<number, Array<{ name: string; conclusion: string }>>;
  pointsAt: Record<string, string>; // head_sha → 배포 태그
  openIssues: Array<{ number: number; body: string; pull_request?: unknown }>;
  defaultBranch?: string;
  unreleased?: Array<{ sha: string; commit: { message: string; committer: { date: string } } }>;
  compareStatus?: string;
  compareError?: boolean;
  tags?: string[];
}

function makeCtx(fx: Fixture) {
  const execCalls: string[][] = [];
  const exec = {
    getExecOutput: jest.fn(async (_cmd: string, args: string[]) => {
      execCalls.push(args);
      if (args[0] === 'tag' && args.includes('--points-at')) {
        const sha = args[args.indexOf('--points-at') + 1];
        return { stdout: `${fx.pointsAt[sha] ?? ''}\n`, stderr: '', exitCode: 0 };
      }
      if (args[0] === 'tag' && args.includes('--list')) {
        return { stdout: `${(fx.tags ?? TAGS).join('\n')}\n`, stderr: '', exitCode: 0 };
      }
      if (args[0] === 'log') {
        return { stdout: '2026-07-23T00:00:00Z\n', stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    }),
  };

  const github = {
    rest: {
      repos: {
        get: jest.fn(async () => ({ data: { default_branch: fx.defaultBranch ?? 'main' } })),
        compareCommitsWithBasehead: jest.fn(async ({ page = 1, per_page = 100 }: { page?: number; per_page?: number; basehead: string }) => {
          if (fx.compareError) throw new Error('comparison unavailable');
          const commits = fx.unreleased ?? [];
          return { data: { status: fx.compareStatus ?? (commits.length ? 'ahead' : 'identical'), ahead_by: commits.length, total_commits: commits.length, commits: commits.slice((page - 1) * per_page, page * per_page) } };
        }),
      },
      actions: {
        listWorkflowRuns: jest.fn(async ({ workflow_id }: { workflow_id: string }) => ({
          data: { workflow_runs: fx.runsByWorkflow[workflow_id] ?? [] },
        })),
        listJobsForWorkflowRun: jest.fn(async ({ run_id }: { run_id: number }) => ({
          data: { jobs: fx.jobsByRun[run_id] ?? [] },
        })),
      },
      issues: {
        listForRepo: jest.fn(async () => ({ data: fx.openIssues })),
        create: jest.fn(async () => ({ data: { number: 999 } })),
        createComment: jest.fn(async () => ({ data: {} })),
      },
    },
    // github-script paginate: 잡 배열 또는 이슈 배열을 평탄화해 반환.
    paginate: jest.fn(async (fn: (p: unknown) => Promise<{ data: unknown }>, params: unknown) => {
      const res = await fn(params);
      const data = res.data as Record<string, unknown>;
      if (Array.isArray(data)) return data;
      return (data.jobs as unknown[]) ?? (data.workflow_runs as unknown[]) ?? [];
    }),
  };

  const summaryEvents: unknown[][] = [];
  const summary = {
    addHeading: (...a: unknown[]) => {
      summaryEvents.push(['heading', ...a]);
      return summary;
    },
    addRaw: (...a: unknown[]) => {
      summaryEvents.push(['raw', ...a]);
      return summary;
    },
    write: jest.fn(async () => {
      summaryEvents.push(['write']);
      return summary;
    }),
  };
  const core = { summary, info: jest.fn() };

  const context = {
    repo: { owner: OWNER, repo: REPO },
    serverUrl: 'https://github.com',
    runId: 12345,
  };

  return { github, core, exec, context, summaryEvents, execCalls };
}

// 수집 소스 커버리지:
//  - AIT: 단독 run(7/13, v1.7.0)과 deploy-all 채널 잡(7/10, v1.6.5)이 둘 다 있어 최신(단독)을 택한다.
//  - Google Play: 단독 배포 없음 → deploy-all 채널 잡(7/16, v1.8.1)으로만 수집한다.
// deploy-all run 목록은 API처럼 최신순: [100(7/16, GP잡), 90(7/10, AIT잡)].
function driftFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    runsByWorkflow: {
      'deploy-apps-in-toss.yml': [
        { id: 1, head_sha: 'shaAIT17', created_at: '2026-07-13T00:00:00Z', html_url: 'https://x/ait' },
      ],
      'deploy-google-play.yml': [], // 단독 배포 없음 → deploy-all 경유로 수집
      'deploy-all.yml': [
        { id: 100, head_sha: 'shaGP', created_at: '2026-07-16T00:00:00Z', html_url: 'https://x/all-gp' },
        { id: 90, head_sha: 'shaAIT16', created_at: '2026-07-10T00:00:00Z', html_url: 'https://x/all-ait' },
      ],
    },
    jobsByRun: {
      100: [{ name: 'Deploy Google Play / Google Play artifact deploy', conclusion: 'success' }],
      90: [{ name: 'Deploy AIT / AIT artifact deploy', conclusion: 'success' }],
    },
    // shaAIT17=단독(7/13) v1.7.0, shaAIT16=deploy-all(7/10) v1.6.5, shaGP=deploy-all(7/16) v1.8.1
    pointsAt: { shaAIT17: 'v1.7.0', shaAIT16: 'v1.6.5', shaGP: 'v1.8.1' },
    openIssues: [],
    ...overrides,
  };
}

describe('deploy-drift-run (#420 워크플로우 실행 본체)', () => {
  test('AC-2: 최신 v* 태그와 채널별 최근 성공 배포 태그(deploy-apps-in-toss·deploy-google-play 단독 run + deploy-all 내 해당 잡 성공 포함) 수집·비교 (gh api 대신 github-script REST)', async () => {
    const fx = driftFixture();
    const ctx = makeCtx(fx);
    const result = await run({ ...ctx, drift });

    // 최신 v* 태그 수집: git tag --sort 로 최신순 목록을 얻어 최상단을 최신 태그로 삼는다.
    expect(ctx.execCalls.some((a) => a.includes('--sort=-v:refname') && !a.includes('--points-at'))).toBe(true);
    expect(result.latestTag).toBe('v1.8.3'); // 수집된 최신 v* 태그
    // 채널 단독 run과 deploy-all run을 모두 조회했다.
    const queried = ctx.github.rest.actions.listWorkflowRuns.mock.calls.map((c) => c[0].workflow_id);
    expect(queried).toEqual(expect.arrayContaining(['deploy-apps-in-toss.yml', 'deploy-google-play.yml', 'deploy-all.yml']));
    // deploy-all 내 채널 잡 성공을 확인했다(두 deploy-all run 모두 잡을 조회).
    expect(ctx.github.rest.actions.listJobsForWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({ run_id: 100 }));
    expect(ctx.github.rest.actions.listJobsForWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({ run_id: 90 }));
    // head_sha → 배포 태그 역매핑을 수행했다(단독·deploy-all 양쪽 sha 모두).
    expect(ctx.execCalls.some((a) => a.includes('--points-at') && a.includes('shaAIT17'))).toBe(true); // 단독
    expect(ctx.execCalls.some((a) => a.includes('--points-at') && a.includes('shaGP'))).toBe(true); // deploy-all

    // 수집 결과: 채널별 "최근 성공 배포 태그"가 각 소스에서 정확히 수집된다.
    const byChannel = Object.fromEntries(result.channels.map((c) => [c.channel, c]));
    // AIT는 단독 run(7/13, v1.7.0)과 deploy-all 잡(7/10, v1.6.5)이 둘 다 있고 → 최신(단독)을 택한다.
    expect(byChannel['AIT (WEB)'].deployedTag).toBe('v1.7.0'); // v1.6.5(구 deploy-all)가 아니라 최신 단독 run
    // Google Play는 단독 배포가 없어 deploy-all 채널 잡(성공)으로 수집한다.
    expect(byChannel['Google Play (Android)'].deployedTag).toBe('v1.8.1');

    // 비교 결과: 최신 v1.8.3 대비 뒤처짐(gap)과 드리프트 판정이 정확하다.
    expect(byChannel['AIT (WEB)'].gap).toBe(4); // v1.8.3 → v1.7.0
    expect(byChannel['AIT (WEB)'].drift).toBe(true);
    expect(byChannel['Google Play (Android)'].gap).toBe(2); // v1.8.3 → v1.8.1
    expect(byChannel['Google Play (Android)'].drift).toBe(true);
    expect(result.driftedChannels).toEqual(expect.arrayContaining(['AIT (WEB)', 'Google Play (Android)']));
  });

  test('AC-3: 드리프트 감지 시 step summary에 채널별 최신 태그 vs 최종 배포 태그 표를 출력하고, 동일 주제 open 이슈가 없으면 이슈를 자동 생성한다(본문 숨김 마커)', async () => {
    const fx = driftFixture({ openIssues: [] });
    const ctx = makeCtx(fx);
    const result = await run({ ...ctx, drift });

    // step summary가 기록되었다.
    expect(ctx.core.summary.write).toHaveBeenCalled();
    expect(ctx.summaryEvents.some((e) => String(e[1] ?? '').includes('드리프트 감지'))).toBe(true);

    // 새 이슈를 생성했고(코멘트 아님), 본문에 마커·채널 비교 표(최신 vs 최종 배포 태그)가 담겼다.
    expect(ctx.github.rest.issues.create).toHaveBeenCalledTimes(1);
    expect(ctx.github.rest.issues.createComment).not.toHaveBeenCalled();
    const body = ctx.github.rest.issues.create.mock.calls[0][0].body as string;
    expect(body).toContain(drift.ISSUE_MARKER);
    expect(body).toContain('v1.8.3'); // 최신 태그
    expect(body).toContain('v1.7.0'); // AIT 최종 배포 태그
    expect(body).toContain('v1.8.1'); // Google Play 최종 배포 태그
    expect(result.issue).toEqual({ action: 'create', number: 999 });
  });

  test('AC-3: 동일 주제 open 이슈(본문 숨김 마커)가 있으면 새로 만들지 않고 코멘트한다', async () => {
    const fx = driftFixture({
      openIssues: [{ number: 55, body: `기존 드리프트 이슈\n${drift.ISSUE_MARKER}` }],
    });
    const ctx = makeCtx(fx);
    const result = await run({ ...ctx, drift });

    expect(ctx.github.rest.issues.createComment).toHaveBeenCalledTimes(1);
    expect(ctx.github.rest.issues.createComment.mock.calls[0][0].issue_number).toBe(55);
    expect(ctx.github.rest.issues.create).not.toHaveBeenCalled();
    expect(result.issue).toEqual({ action: 'comment', number: 55 });
  });

  test('AC-3: 모든 채널이 최신 태그면 이슈를 만들지 않고 요약만 남긴다', async () => {
    const fx = driftFixture({ pointsAt: { shaAIT17: 'v1.8.3', shaAIT16: 'v1.6.5', shaGP: 'v1.8.3' } });
    const ctx = makeCtx(fx);
    const result = await run({ ...ctx, drift });

    expect(result.driftedChannels).toEqual([]);
    expect(ctx.github.rest.issues.create).not.toHaveBeenCalled();
    expect(ctx.github.rest.issues.createComment).not.toHaveBeenCalled();
    expect(ctx.summaryEvents.some((e) => String(e[1] ?? '').includes('따라가고'))).toBe(true);
  });
});


describe('release lag integration (#478)', () => {
  const NOW = Date.parse('2026-10-23T00:00:00Z');
  function freshChannels(extra: Partial<Fixture> = {}) {
    return driftFixture({ pointsAt: { shaAIT17: TAGS[0], shaGP: TAGS[0] }, ...extra });
  }
  function commit(index: number, hours: number) {
    return { sha: String(index).padStart(40, '0'), commit: { message: `commit-${index}\nbody`, committer: { date: new Date(NOW - hours * 3_600_000).toISOString() } } };
  }
  test.each([47.999, 48, 72])('채널 최신이어도 %d시간 지연은 판정과 실제 이슈 쓰기에 반영한다', async (hours) => {
    const ctx = makeCtx(freshChannels({ unreleased: [commit(1, hours)], defaultBranch: 'trunk' }));
    const result = await run({ ...ctx, drift, now: () => NOW });
    expect(result.releaseLag).toMatchObject({ commitsAhead: 1, oldestUnreleasedAgeHours: hours, lag: hours >= 48, branch: 'trunk' });
    expect(result.driftedChannels).toEqual([]);
    expect(ctx.github.rest.repos.compareCommitsWithBasehead).toHaveBeenCalledWith(expect.objectContaining({ basehead: 'v1.8.3...trunk', per_page: 100, page: 1 }));
    expect(ctx.github.rest.issues.create).toHaveBeenCalledTimes(hours >= 48 ? 1 : 0);
    if (hours >= 48) {
      const body = ctx.github.rest.issues.create.mock.calls[0][0].body;
      expect(body).toContain('릴리스 지연');
      expect(body).toContain('## 릴리스 태그 발행 지연과 채널 상태');
      expect(body).toContain('commit-1');
      expect(body).not.toContain('Generated by');
      expect(body).not.toContain('배포 워크플로우를 실행해');
    }
  });
  test('태그 지연만 있어도 기존 마커 이슈에 코멘트한다', async () => {
    const ctx = makeCtx(freshChannels({ unreleased: [commit(1, 72)], openIssues: [{ number: 55, body: drift.ISSUE_MARKER }] }));
    const result = await run({ ...ctx, drift, now: () => NOW });
    expect(result.issue).toEqual({ action: 'comment', number: 55 });
    expect(ctx.github.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 55, body: expect.stringContaining('commit-1') }));
  });
  test.each([100, 101, 301])('%d개 미발행 커밋은 모든 페이지를 수집하고 마지막 제목을 싣는다', async (count) => {
    const commits = Array.from({ length: count }, (_, i) => commit(i + 1, i === 0 ? 72 : 1));
    const ctx = makeCtx(freshChannels({ unreleased: commits }));
    const result = await run({ ...ctx, drift, now: () => NOW });
    expect(result.releaseLag).toMatchObject({ commitsAhead: count, oldestUnreleasedAgeHours: 72, lag: true });
    expect(ctx.github.rest.repos.compareCommitsWithBasehead).toHaveBeenCalledTimes(Math.ceil(count / 100));
    expect(ctx.github.rest.issues.create.mock.calls[0][0].body).toContain(`commit-${count}`);
  });
  test.each([{ compareError: true }, { compareStatus: 'diverged', unreleased: [commit(1, 72)] }, { unreleased: [{ ...commit(1, 72), commit: { message: 'bad-date', committer: { date: 'invalid' } } }] }])('비교 실패/불가/날짜 누락은 확인 불가로 표시한다: %p', async (extra) => {
    const ctx = makeCtx(freshChannels(extra));
    const result = await run({ ...ctx, drift, now: () => NOW });
    expect(result.releaseLag).toMatchObject({ lag: false, unknown: true });
    expect(ctx.github.rest.issues.create).not.toHaveBeenCalled();
    expect(ctx.summaryEvents.some((e) => String(e[1] ?? '').includes('릴리스 지연: 확인 불가'))).toBe(true);
    expect(ctx.summaryEvents.some((e) => String(e[1] ?? '').includes('모든 채널이 최신'))).toBe(false);
  });
  test('비교 실패가 기존 채널 경고를 감추지 않는다', async () => {
    const ctx = makeCtx(driftFixture({ compareError: true }));
    const result = await run({ ...ctx, drift, now: () => NOW });
    expect(result.driftedChannels).toContain('AIT (WEB)');
    expect(ctx.github.rest.issues.create).toHaveBeenCalledTimes(1);
  });
  test('빈 페이지로 비교가 불완전하면 최신으로 처리하지 않는다', async () => {
    const ctx = makeCtx(freshChannels());
    ctx.github.rest.repos.compareCommitsWithBasehead.mockResolvedValue({ data: { status: 'ahead', ahead_by: 101, total_commits: 101, commits: [] } });
    const result = await run({ ...ctx, drift, now: () => NOW });
    expect(result.releaseLag).toMatchObject({ unknown: true, commitsAhead: null, lag: false });
    expect(ctx.github.rest.repos.compareCommitsWithBasehead).toHaveBeenCalledTimes(1);
    expect(ctx.github.rest.issues.create).not.toHaveBeenCalled();
  });
  test('기본 브랜치가 없으면 main으로 추측하지 않는다', async () => {
    const ctx = makeCtx(freshChannels({ defaultBranch: '' }));
    const result = await run({ ...ctx, drift, now: () => NOW });
    expect(result.releaseLag.unknown).toBe(true);
    expect(ctx.github.rest.repos.compareCommitsWithBasehead).not.toHaveBeenCalled();
  });
  test('미래 날짜의 커밋은 지연을 음수나 경고로 만들지 않는다', async () => {
    const ctx = makeCtx(freshChannels({ unreleased: [commit(1, -1)] }));
    const result = await run({ ...ctx, drift, now: () => NOW });
    expect(result.releaseLag).toMatchObject({ unknown: false, commitsAhead: 1, oldestUnreleasedAgeHours: 0, lag: false });
    expect(ctx.github.rest.issues.create).not.toHaveBeenCalled();
  });
  test('유효하지 않은 태그 suffix를 최신 릴리스로 사용하지 않는다', async () => {
    const ctx = makeCtx(freshChannels({ tags: ['v99.0.0-junk', 'v01.8.4', ...TAGS] }));
    const result = await run({ ...ctx, drift, now: () => NOW });
    expect(result.latestTag).toBe(TAGS[0]);
  });
});
