'use strict';

// 배포 드리프트 점검 워크플로우(#420)의 실행 본체.
// deploy-drift-check.yml 의 github-script 스텝이 이 함수를 호출한다. 인라인 스크립트를
// 모듈로 분리해, github/core/exec 를 목으로 주입한 통합 테스트로 수집→비교→요약→이슈
// 발행 경로를 헤드리스에서 직접 검증할 수 있게 한다(순수 판정 로직은 deploy-drift.js).
// github-script 가 require 로 로드하므로 CommonJS 로 둔다.

const path = require('path');

// 채널별 배포 잡 이름 매칭(단독 워크플로우 파일 + deploy-all 내 채널 잡).
const CHANNELS = [
  {
    channel: 'AIT (WEB)',
    workflowFile: 'deploy-apps-in-toss.yml',
    jobRegex: /Deploy AIT|AppsInToss|apps.?in.?toss/i,
  },
  {
    channel: 'Google Play (Android)',
    workflowFile: 'deploy-google-play.yml',
    jobRegex: /Deploy Google Play|Google Play/i,
  },
];

/**
 * 워크플로우 실행 본체.
 * @param {Object} ctx
 * @param {any} ctx.github  actions/github-script octokit 클라이언트
 * @param {any} ctx.context actions/github-script context
 * @param {any} ctx.core    actions/github-script core
 * @param {any} ctx.exec    actions/github-script exec
 * @param {typeof import('./deploy-drift')} [ctx.drift] 순수 로직(테스트 주입용, 기본은 require)
 */
async function run({ github, context, core, exec, drift }) {
  const driftLib =
    drift ?? require(path.resolve(process.env.GITHUB_WORKSPACE || process.cwd(), 'scripts/deploy-drift.js'));

  const { owner, repo } = context.repo;

  // --- 1) v태그 목록(최신순)과 최신 태그 시각 수집 --------------------
  const tagsOut = await exec.getExecOutput(
    'git',
    ['tag', '--list', 'v[0-9]*.[0-9]*.[0-9]*', '--sort=-v:refname'],
    { silent: true },
  );
  const sortedTags = tagsOut.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  const latestTag = sortedTags[0] ?? null;

  if (!latestTag) {
    core.summary.addHeading('배포 드리프트 점검').addRaw('vX.Y.Z 태그가 없어 점검을 건너뜁니다.');
    await core.summary.write();
    return { skipped: true };
  }

  async function tagDate(tag) {
    const out = await exec.getExecOutput('git', ['log', '-1', '--format=%cI', tag], {
      silent: true,
      ignoreReturnCode: true,
    });
    const iso = out.stdout.trim();
    return iso ? new Date(iso) : null;
  }

  async function shaToTag(sha) {
    if (!sha) return null;
    const out = await exec.getExecOutput(
      'git',
      ['tag', '--points-at', sha, '--list', 'v[0-9]*.[0-9]*.[0-9]*', '--sort=-v:refname'],
      { silent: true, ignoreReturnCode: true },
    );
    const found = out.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
    return found[0] ?? null;
  }

  const latestTagDate = await tagDate(latestTag);
  const referenceMs = (latestTagDate ?? new Date()).getTime();

  // --- 2) 채널별 최근 성공 배포 run 수집 ------------------------------
  // 단독 workflow_dispatch run 은 해당 워크플로우 파일 run 목록에서,
  // deploy-all 경유 배포는 deploy-all run 의 채널 잡(conclusion=success)에서 찾는다.
  async function latestStandaloneRun(workflowFile) {
    const res = await github.rest.actions.listWorkflowRuns({
      owner,
      repo,
      workflow_id: workflowFile,
      status: 'success',
      per_page: 20,
    });
    return res.data.workflow_runs[0] ?? null; // API는 최신순 정렬
  }

  async function latestDeployAllRunForJob(jobNameRegex) {
    const res = await github.rest.actions.listWorkflowRuns({
      owner,
      repo,
      workflow_id: 'deploy-all.yml',
      per_page: 30,
    });
    for (const deployAllRun of res.data.workflow_runs) {
      const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {
        owner,
        repo,
        run_id: deployAllRun.id,
        per_page: 50,
      });
      const job = jobs.find((j) => jobNameRegex.test(j.name) && j.conclusion === 'success');
      if (job) return deployAllRun;
    }
    return null;
  }

  async function resolveChannel({ channel, workflowFile, jobRegex }) {
    const [standalone, viaAll] = await Promise.all([
      latestStandaloneRun(workflowFile),
      latestDeployAllRunForJob(jobRegex),
    ]);
    const chosen = driftLib.pickNewerRun(standalone, viaAll);
    const deployedTag = chosen ? await shaToTag(chosen.head_sha) : null;
    return driftLib.buildChannelRow({
      channel,
      run: chosen,
      deployedTag,
      referenceMs,
      sortedTagsDesc: sortedTags,
      latestTag,
    });
  }

  const channelRows = await Promise.all(CHANNELS.map((c) => resolveChannel(c)));

  // iOS는 Xcode Cloud(GH Actions 밖)라 판정 제외, 표에만 명시(오탐 방지).
  const iosRow = driftLib.buildChannelRow({
    channel: 'iOS (App Store)',
    run: null,
    deployedTag: null,
    referenceMs,
    sortedTagsDesc: sortedTags,
    latestTag,
    external: true,
    note: 'Xcode Cloud 경로 — GH Actions 밖',
  });

  const rows = [...channelRows, iosRow];
  const table = driftLib.renderDriftTable(latestTag, rows);
  const driftedChannels = channelRows.filter((r) => r.eval.drift);

  // --- 3) step summary 출력 ------------------------------------------
  core.summary.addHeading('채널 배포 드리프트 점검').addRaw(table, true);
  if (driftedChannels.length > 0) {
    core.summary.addRaw(`\n\n⚠️ 드리프트 감지: ${driftedChannels.map((r) => r.channel).join(', ')}`, true);
  } else {
    core.summary.addRaw('\n\n✅ 모든 채널이 최신 릴리즈 태그를 따라가고 있습니다.', true);
  }
  await core.summary.write();

  if (driftedChannels.length === 0) {
    core.info('드리프트 없음 — 이슈를 생성/코멘트하지 않습니다.');
    return { latestTag, driftedChannels: [], issue: null };
  }

  // --- 4) 드리프트 감지 시 이슈 생성 또는 코멘트 ----------------------
  const openIssues = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state: 'open',
    per_page: 100,
  });
  const decision = driftLib.chooseIssueAction(openIssues);

  const body = [
    driftLib.buildIssueBody({
      table,
      runUrl: `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`,
      checkedAtIso: new Date().toISOString(),
    }),
    '',
    '---',
    '_Generated by [Claude Code](https://claude.ai/code)_',
  ].join('\n');

  if (decision.action === 'comment') {
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: decision.issueNumber,
      body,
    });
    core.info(`기존 드리프트 이슈 #${decision.issueNumber} 에 코멘트했습니다.`);
    return { latestTag, driftedChannels: driftedChannels.map((r) => r.channel), issue: { action: 'comment', number: decision.issueNumber } };
  }

  const created = await github.rest.issues.create({
    owner,
    repo,
    title: `🚚 채널 배포 드리프트 감지 (최신 ${latestTag})`,
    body,
  });
  core.info(`드리프트 이슈 #${created.data.number} 를 생성했습니다.`);
  return { latestTag, driftedChannels: driftedChannels.map((r) => r.channel), issue: { action: 'create', number: created.data.number } };
}

module.exports = { run, CHANNELS };
