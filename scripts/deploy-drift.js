'use strict';

// 채널 배포 드리프트 판정의 순수 로직(#420).
// 데이터 수집(git 태그·GH Actions run/job 조회)은 워크플로우의 github-script가 담당하고,
// 여기서는 "얼마나 뒤처졌는지"만 결정한다. 순수 함수라 단위 테스트로 고정한다.
// deploy-drift-check.yml 이 require 로 로드하므로 CommonJS(module.exports)로 둔다.

// 드리프트 임계: 태그 2개 이상 뒤처지거나, 72시간 이상 최신 태그를 따라잡지 못하면 경고.
const DRIFT_TAG_GAP = 2;
const DRIFT_AGE_HOURS = 72;

// 이슈 중복 생성을 막기 위한 마커(본문에 숨겨 삽입 후 재조회로 매칭).
const ISSUE_MARKER = '<!-- deploy-drift-check -->';

/**
 * 최신순 v태그 목록에서 배포된 태그가 몇 개 뒤처졌는지 계산한다.
 * @param {string[]} sortedTagsDesc 최신순 v태그 배열(index 0 = 최신)
 * @param {string|null|undefined} deployedTag 채널이 마지막으로 배포한 태그
 * @returns {number|null} 뒤처진 태그 수(최신이면 0). 목록에 없으면 null(불명).
 */
function tagGap(sortedTagsDesc, deployedTag) {
  if (!deployedTag) {
    return null;
  }
  const index = sortedTagsDesc.indexOf(deployedTag);
  return index < 0 ? null : index;
}

/**
 * 단일 채널의 드리프트 여부를 판정한다.
 * @param {Object} params
 * @param {string[]} params.sortedTagsDesc 최신순 v태그 배열
 * @param {string} params.latestTag 최신 릴리즈 태그
 * @param {string|null} params.deployedTag 채널 최종 배포 태그(불명이면 null)
 * @param {number|null} params.ageHours 최신 태그 시각과 채널 최종 배포 시각의 차(시간). 불명이면 null
 * @param {boolean} [params.external] GH Actions 밖 채널(iOS/Xcode Cloud)이면 판정 제외
 * @returns {{drift: boolean, gap: number|null, external: boolean, reasons: string[]}}
 */
function evaluateChannel({ sortedTagsDesc, latestTag, deployedTag, ageHours, external = false }) {
  if (external) {
    return { drift: false, gap: null, external: true, reasons: ['external'] };
  }

  const gap = tagGap(sortedTagsDesc, deployedTag);

  if (deployedTag != null && deployedTag === latestTag) {
    return { drift: false, gap: 0, external: false, reasons: ['up-to-date'] };
  }

  // 성공 배포가 전혀 없거나 태그를 특정할 수 없으면 안전하게 드리프트로 본다.
  if (deployedTag == null || gap == null) {
    return { drift: true, gap: null, external: false, reasons: ['unknown-tag'] };
  }

  const reasons = [];
  if (gap >= DRIFT_TAG_GAP) {
    reasons.push(`tag-gap:${gap}`);
  }
  if (ageHours != null && ageHours >= DRIFT_AGE_HOURS) {
    reasons.push(`age:${Math.round(ageHours)}h`);
  }

  return { drift: reasons.length > 0, gap, external: false, reasons };
}

/**
 * 경과 시간을 사람이 읽기 쉬운 한글 문자열로 변환한다.
 * @param {number|null} ageHours
 * @returns {string}
 */
function formatAge(ageHours) {
  if (ageHours == null) {
    return '불명';
  }
  if (ageHours < 48) {
    return `${Math.round(ageHours)}시간`;
  }
  return `${Math.round(ageHours / 24)}일`;
}

/**
 * 채널별 판정 결과를 step summary용 마크다운 표로 렌더링한다.
 * @param {string} latestTag
 * @param {Array<{channel: string, deployedTag: string|null, deployRunUrl: string|null, ageHours: number|null, eval: ReturnType<typeof evaluateChannel>, note?: string}>} rows
 * @returns {string}
 */
function renderDriftTable(latestTag, rows) {
  const lines = [
    `최신 릴리즈 태그: **${latestTag ?? '(없음)'}**`,
    '',
    '| 채널 | 최종 배포 태그 | 뒤처짐 | 미배포 경과 | 상태 |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const row of rows) {
    const result = row.eval;
    let status;
    if (result.external) {
      status = `➖ GH Actions 밖 (Xcode Cloud)`;
    } else if (result.drift) {
      status = `⚠️ 드리프트 (${result.reasons.join(', ')})`;
    } else {
      status = '✅ 최신';
    }

    const tagLabel = row.deployedTag ?? '불명';
    const tagCell = row.deployRunUrl ? `[${tagLabel}](${row.deployRunUrl})` : tagLabel;
    const gapCell = result.external ? '—' : result.gap == null ? '불명' : `${result.gap}개`;
    const ageCell = result.external ? '—' : formatAge(row.ageHours);
    const noteSuffix = row.note ? ` <br>${row.note}` : '';

    lines.push(`| ${row.channel} | ${tagCell}${noteSuffix} | ${gapCell} | ${ageCell} | ${status} |`);
  }

  return lines.join('\n');
}

/**
 * 두 배포 run 중 더 최근(created_at) run을 고른다.
 * 채널의 최종 배포를 "단독 run"과 "deploy-all 경유 run" 중 최신으로 정하는 데 쓴다.
 * @param {{created_at: string}|null} a
 * @param {{created_at: string}|null} b
 * @returns {{created_at: string}|null}
 */
function pickNewerRun(a, b) {
  if (!a) {
    return b ?? null;
  }
  if (!b) {
    return a;
  }
  return new Date(a.created_at).getTime() >= new Date(b.created_at).getTime() ? a : b;
}

/**
 * 기준 시각(최신 태그 시각)과 채널 최종 배포 시각의 차를 시간 단위로 계산한다(음수는 0).
 * @param {number} referenceMs
 * @param {number|null} deployMs
 * @returns {number|null}
 */
function channelAgeHours(referenceMs, deployMs) {
  if (deployMs == null) {
    return null;
  }
  return Math.max(0, (referenceMs - deployMs) / 3_600_000);
}

/**
 * 수집한 배포 run·태그로 채널 표 행(판정 포함)을 만든다.
 * 워크플로우가 IO(태그/GH API)로 채운 값을 넘기면 여기서 판정·정규화한다.
 * @param {Object} params
 * @param {string} params.channel
 * @param {{created_at: string, html_url?: string}|null} params.run 채널 최종 성공 배포 run
 * @param {string|null} params.deployedTag run head_sha로 역매핑한 배포 태그
 * @param {number} params.referenceMs 최신 태그 시각(ms)
 * @param {string[]} params.sortedTagsDesc
 * @param {string} params.latestTag
 * @param {boolean} [params.external]
 * @param {string} [params.note]
 * @returns {{channel: string, deployedTag: string|null, deployRunUrl: string|null, ageHours: number|null, eval: ReturnType<typeof evaluateChannel>, note?: string}}
 */
function buildChannelRow({ channel, run, deployedTag, referenceMs, sortedTagsDesc, latestTag, external = false, note }) {
  const deployMs = run ? new Date(run.created_at).getTime() : null;
  const ageHours = external ? null : channelAgeHours(referenceMs, deployMs);
  const evalResult = evaluateChannel({
    sortedTagsDesc,
    latestTag,
    deployedTag: external ? null : deployedTag ?? null,
    ageHours,
    external,
  });
  const row = {
    channel,
    deployedTag: external ? null : deployedTag ?? null,
    deployRunUrl: run && run.html_url ? run.html_url : null,
    ageHours,
    eval: evalResult,
  };
  if (note) {
    row.note = note;
  }
  return row;
}

/**
 * 드리프트 이슈/코멘트 본문(마커 포함)을 만든다.
 * @param {Object} params
 * @param {string} params.table renderDriftTable 결과
 * @param {string} params.runUrl 점검 워크플로우 run URL
 * @param {string} params.checkedAtIso 점검 시각 ISO 문자열
 * @returns {string}
 */
function buildIssueBody({ table, runUrl, checkedAtIso }) {
  return [
    ISSUE_MARKER,
    '## 채널 배포 드리프트 감지',
    '',
    `점검 시각(UTC): ${checkedAtIso}`,
    `점검 워크플로우: ${runUrl}`,
    '',
    table,
    '',
    '위 채널이 최신 릴리즈 태그를 따라잡지 못했습니다. `deploy-all` 또는 채널별 배포 워크플로우를 실행해 주세요.',
  ].join('\n');
}

/**
 * 열린 이슈 목록에서 드리프트 이슈 마커를 찾아 생성/코멘트 여부를 결정한다.
 * @param {Array<{number: number, body?: string|null, pull_request?: unknown}>} openIssues
 * @returns {{action: 'create'} | {action: 'comment', issueNumber: number}}
 */
function chooseIssueAction(openIssues) {
  const existing = openIssues.find(
    (issue) =>
      issue.pull_request == null &&
      typeof issue.body === 'string' &&
      issue.body.includes(ISSUE_MARKER),
  );
  return existing ? { action: 'comment', issueNumber: existing.number } : { action: 'create' };
}

module.exports = {
  DRIFT_TAG_GAP,
  DRIFT_AGE_HOURS,
  ISSUE_MARKER,
  tagGap,
  evaluateChannel,
  formatAge,
  renderDriftTable,
  chooseIssueAction,
  pickNewerRun,
  channelAgeHours,
  buildChannelRow,
  buildIssueBody,
};
