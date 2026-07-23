/// <reference types="jest" />

// 채널 배포 드리프트 판정 순수 로직(#420)의 단위 테스트.
// 데이터 수집(git/GH API)은 워크플로우가 담당하므로 여기서는 판정·렌더·이슈 결정만 고정한다.
import {
  DRIFT_AGE_HOURS,
  DRIFT_TAG_GAP,
  ISSUE_MARKER,
  chooseIssueAction,
  evaluateChannel,
  formatAge,
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
