/// <reference types="jest" />

// 채널 배포 드리프트 판정 순수 로직(#420)의 단위 테스트.
// 데이터 수집(git/GH API)은 워크플로우가 담당하므로 여기서는 판정·렌더·이슈 결정만 고정한다.
import {
  DRIFT_AGE_HOURS,
  DRIFT_TAG_GAP,
  ISSUE_MARKER,
  buildChannelRow,
  buildIssueBody,
  channelAgeHours,
  chooseIssueAction,
  evaluateChannel,
  formatAge,
  pickNewerRun,
  renderDriftTable,
  tagGap,
} from '../deploy-drift';

const TAGS = ['v1.8.3', 'v1.8.2', 'v1.8.1', 'v1.8.0', 'v1.7.0'];
const LATEST = 'v1.8.3';

describe('tagGap', () => {
  test('최신 태그면 0을 반환한다', () => {
    expect(tagGap(TAGS, 'v1.8.3')).toBe(0);
  });

  test('뒤처진 개수를 정확히 센다', () => {
    // v1.7.0은 최신에서 4개 뒤(1.8.3/1.8.2/1.8.1/1.8.0)
    expect(tagGap(TAGS, 'v1.7.0')).toBe(4);
    expect(tagGap(TAGS, 'v1.8.2')).toBe(1);
  });

  test('목록에 없거나 null이면 null(불명)을 반환한다', () => {
    expect(tagGap(TAGS, 'v9.9.9')).toBeNull();
    expect(tagGap(TAGS, null)).toBeNull();
    expect(tagGap(TAGS, undefined)).toBeNull();
  });
});

describe('evaluateChannel', () => {
  test('최신 태그를 배포한 채널은 드리프트가 아니다', () => {
    const result = evaluateChannel({
      sortedTagsDesc: TAGS,
      latestTag: LATEST,
      deployedTag: 'v1.8.3',
      ageHours: 240,
    });
    expect(result.drift).toBe(false);
    expect(result.gap).toBe(0);
  });

  test('태그 2개 이상 뒤처지면 드리프트다 (#420 WEB 1.7.0 케이스)', () => {
    const result = evaluateChannel({
      sortedTagsDesc: TAGS,
      latestTag: LATEST,
      deployedTag: 'v1.7.0',
      ageHours: 1, // 시간 조건이 아니라 태그 갭만으로도 감지되어야 함
    });
    expect(result.drift).toBe(true);
    expect(result.gap).toBe(4);
    expect(result.reasons.some((r) => r.startsWith('tag-gap'))).toBe(true);
  });

  test('태그 1개 차이지만 72시간 이상 지나면 드리프트다', () => {
    const result = evaluateChannel({
      sortedTagsDesc: TAGS,
      latestTag: LATEST,
      deployedTag: 'v1.8.2',
      ageHours: DRIFT_AGE_HOURS + 1,
    });
    expect(result.drift).toBe(true);
    expect(result.reasons.some((r) => r.startsWith('age'))).toBe(true);
  });

  test('태그 1개 차이에 72시간 미만이면 드리프트가 아니다', () => {
    const result = evaluateChannel({
      sortedTagsDesc: TAGS,
      latestTag: LATEST,
      deployedTag: 'v1.8.2',
      ageHours: 10,
    });
    expect(result.drift).toBe(false);
    expect(result.gap).toBe(DRIFT_TAG_GAP - 1);
  });

  test('성공 배포가 없거나 태그를 특정 못 하면 드리프트(불명)로 본다', () => {
    const result = evaluateChannel({
      sortedTagsDesc: TAGS,
      latestTag: LATEST,
      deployedTag: null,
      ageHours: null,
    });
    expect(result.drift).toBe(true);
    expect(result.gap).toBeNull();
    expect(result.reasons).toContain('unknown-tag');
  });

  test('external(iOS/Xcode Cloud) 채널은 판정에서 제외한다', () => {
    const result = evaluateChannel({
      sortedTagsDesc: TAGS,
      latestTag: LATEST,
      deployedTag: null,
      ageHours: null,
      external: true,
    });
    expect(result.drift).toBe(false);
    expect(result.external).toBe(true);
  });
});

describe('formatAge', () => {
  test('48시간 미만은 시간 단위, 이상은 일 단위, null은 불명', () => {
    expect(formatAge(10)).toBe('10시간');
    expect(formatAge(72)).toBe('3일');
    expect(formatAge(null)).toBe('불명');
  });
});

describe('renderDriftTable', () => {
  test('표에 최신 태그·채널 행·상태가 포함된다', () => {
    const rows = [
      {
        channel: 'AIT (WEB)',
        deployedTag: 'v1.7.0',
        deployRunUrl: 'https://example.com/run/1',
        ageHours: 240,
        eval: evaluateChannel({
          sortedTagsDesc: TAGS,
          latestTag: LATEST,
          deployedTag: 'v1.7.0',
          ageHours: 240,
        }),
      },
      {
        channel: 'iOS',
        deployedTag: null,
        deployRunUrl: null,
        ageHours: null,
        eval: evaluateChannel({
          sortedTagsDesc: TAGS,
          latestTag: LATEST,
          deployedTag: null,
          ageHours: null,
          external: true,
        }),
        note: 'Xcode Cloud',
      },
    ];
    const table = renderDriftTable(LATEST, rows);
    expect(table).toContain(LATEST);
    expect(table).toContain('AIT (WEB)');
    expect(table).toContain('[v1.7.0](https://example.com/run/1)');
    expect(table).toContain('⚠️ 드리프트');
    expect(table).toContain('GH Actions 밖');
  });
});

describe('pickNewerRun', () => {
  test('created_at이 더 최근인 run을 고른다 (단독 vs deploy-all 경유)', () => {
    const older = { created_at: '2026-07-13T00:00:00Z', html_url: 'a' };
    const newer = { created_at: '2026-07-23T00:00:00Z', html_url: 'b' };
    expect(pickNewerRun(older, newer)).toBe(newer);
    expect(pickNewerRun(newer, older)).toBe(newer);
  });

  test('한쪽이 없으면 나머지를, 둘 다 없으면 null을 반환한다', () => {
    const run = { created_at: '2026-07-23T00:00:00Z' };
    expect(pickNewerRun(run, null)).toBe(run);
    expect(pickNewerRun(null, run)).toBe(run);
    expect(pickNewerRun(null, null)).toBeNull();
  });
});

describe('channelAgeHours', () => {
  test('기준 시각과 배포 시각의 차를 시간으로, 음수는 0으로, 없으면 null', () => {
    const ref = Date.parse('2026-07-23T00:00:00Z');
    const deploy = Date.parse('2026-07-13T00:00:00Z');
    expect(channelAgeHours(ref, deploy)).toBeCloseTo(240, 5); // 10일
    expect(channelAgeHours(deploy, ref)).toBe(0); // 음수 클램프
    expect(channelAgeHours(ref, null)).toBeNull();
  });
});

// AC-2: 수집한 배포 run + 태그로 채널 판정 행을 만드는 워크플로우 실사용 경로를 검증.
describe('buildChannelRow (#420 채널 수집·비교)', () => {
  const referenceMs = Date.parse('2026-07-23T00:00:00Z'); // 최신 태그 v1.8.3 시각 가정

  test('WEB(AIT)가 v1.7.0에 10일 정체하면 드리프트로 판정한다 (#420 재현)', () => {
    const row = buildChannelRow({
      channel: 'AIT (WEB)',
      run: { created_at: '2026-07-13T00:00:00Z', html_url: 'https://example.com/run/ait' },
      deployedTag: 'v1.7.0',
      referenceMs,
      sortedTagsDesc: TAGS,
      latestTag: LATEST,
    });
    expect(row.deployedTag).toBe('v1.7.0');
    expect(row.deployRunUrl).toBe('https://example.com/run/ait');
    expect(row.ageHours).toBeCloseTo(240, 5);
    expect(row.eval.drift).toBe(true);
    expect(row.eval.gap).toBe(4);
  });

  test('최신 태그를 배포한 채널은 드리프트가 아니다', () => {
    const row = buildChannelRow({
      channel: 'Google Play',
      run: { created_at: '2026-07-23T00:00:00Z', html_url: 'https://example.com/run/gp' },
      deployedTag: 'v1.8.3',
      referenceMs,
      sortedTagsDesc: TAGS,
      latestTag: LATEST,
    });
    expect(row.eval.drift).toBe(false);
    expect(row.ageHours).toBe(0);
  });

  test('성공 배포 run이 없으면 태그·URL이 null이고 드리프트(불명)로 본다', () => {
    const row = buildChannelRow({
      channel: 'Google Play',
      run: null,
      deployedTag: null,
      referenceMs,
      sortedTagsDesc: TAGS,
      latestTag: LATEST,
    });
    expect(row.deployedTag).toBeNull();
    expect(row.deployRunUrl).toBeNull();
    expect(row.ageHours).toBeNull();
    expect(row.eval.drift).toBe(true);
    expect(row.eval.reasons).toContain('unknown-tag');
  });

  test('external(iOS) 행은 판정 제외, note를 보존한다', () => {
    const row = buildChannelRow({
      channel: 'iOS (App Store)',
      run: null,
      deployedTag: null,
      referenceMs,
      sortedTagsDesc: TAGS,
      latestTag: LATEST,
      external: true,
      note: 'Xcode Cloud 경로',
    });
    expect(row.eval.external).toBe(true);
    expect(row.eval.drift).toBe(false);
    expect(row.note).toBe('Xcode Cloud 경로');
  });
});

// AC-3: 드리프트 감지 시 발행하는 이슈/코멘트 본문이 마커와 표를 담는지 검증.
describe('buildIssueBody', () => {
  test('본문에 마커·표·점검 메타가 포함된다', () => {
    const rows = [
      {
        channel: 'AIT (WEB)',
        deployedTag: 'v1.7.0',
        deployRunUrl: 'https://example.com/run/ait',
        ageHours: 240,
        eval: evaluateChannel({ sortedTagsDesc: TAGS, latestTag: LATEST, deployedTag: 'v1.7.0', ageHours: 240 }),
      },
    ];
    const table = renderDriftTable(LATEST, rows);
    const body = buildIssueBody({
      table,
      runUrl: 'https://example.com/actions/runs/1',
      checkedAtIso: '2026-07-23T20:00:00.000Z',
    });
    expect(body).toContain(ISSUE_MARKER);
    expect(body.startsWith(ISSUE_MARKER)).toBe(true); // 마커가 최상단(재조회 매칭용)
    expect(body).toContain('채널 배포 드리프트 감지');
    expect(body).toContain('2026-07-23T20:00:00.000Z');
    expect(body).toContain('https://example.com/actions/runs/1');
    expect(body).toContain(table);
  });
});

describe('chooseIssueAction', () => {
  test('마커가 있는 열린 이슈가 있으면 코멘트를 택한다', () => {
    const action = chooseIssueAction([
      { number: 10, body: `기존 드리프트 이슈\n${ISSUE_MARKER}` },
    ]);
    expect(action).toEqual({ action: 'comment', issueNumber: 10 });
  });

  test('마커가 없으면 새 이슈를 생성한다', () => {
    const action = chooseIssueAction([{ number: 11, body: '무관한 이슈' }]);
    expect(action).toEqual({ action: 'create' });
  });

  test('PR(pull_request 필드)은 매칭에서 제외한다', () => {
    const action = chooseIssueAction([
      { number: 12, body: ISSUE_MARKER, pull_request: { url: 'x' } },
    ]);
    expect(action).toEqual({ action: 'create' });
  });
});
