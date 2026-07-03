import fs from 'node:fs';
import path from 'node:path';

// @ts-expect-error — .js 가드 모듈(CommonJS)에는 타입 선언이 없다. 런타임 계약만 검증한다.
import {
  APP_STORE_TEXT_LIMITS,
  PLAY_STORE_TEXT_LIMITS,
  collectStoreTextLimitViolations,
  countTextLength,
} from '../lib/store-text-limits.js';

// check:i18n 스토어 문구 글자수 제한 가드 회귀 테스트.
//
// 배경: 스토어 콘솔(App Store Connect / Google Play Console)은 필드별 최대 글자수를
// 강제하는데, 제한 초과는 제출 단계에서야 드러났다. check:i18n 이 미리 실패시키는
// 가드를 추가했고, 이 테스트는 그 판정 규칙을 고정한다.

describe('check:i18n 스토어 문구 글자수 제한 (collectStoreTextLimitViolations)', () => {
  describe('글자수 계산 (countTextLength)', () => {
    it('한글/영문은 문자 수 그대로 센다', () => {
      expect(countTextLength('행복 농장')).toBe(5);
      expect(countTextLength('Happy Farm')).toBe(10);
    });

    it('서로게이트 쌍(이모지)은 코드 포인트 1개로 센다', () => {
      // '🌾'.length 는 2(UTF-16 코드 유닛)지만 콘솔이 세는 문자 수는 1이다.
      expect(countTextLength('🌾')).toBe(1);
      expect(countTextLength('농장🌾')).toBe(3);
    });
  });

  describe('제한 판정', () => {
    const limits = [{ path: 'storeListing.appName', limit: 5 }];

    it('제한 이내면 위반이 없고 pass 로 집계된다', () => {
      const config = { storeListing: { appName: { 'ko-KR': '농장', 'en-US': 'Farm' } } };
      const { violations, passes } = collectStoreTextLimitViolations('play-store', config, limits);
      expect(violations).toEqual([]);
      expect(passes).toHaveLength(2);
    });

    it('제한과 정확히 같은 길이는 통과한다 (경계값)', () => {
      const config = { storeListing: { appName: { 'ko-KR': '행복한농장' } } };
      const { violations } = collectStoreTextLimitViolations('play-store', config, limits);
      expect(violations).toEqual([]);
    });

    it('제한을 1자라도 넘으면 위반으로 집계된다', () => {
      const config = { storeListing: { appName: { 'ko-KR': '행복한농장들' } } };
      const { violations } = collectStoreTextLimitViolations('play-store', config, limits);
      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain('play-store.storeListing.appName.ko-KR');
      expect(violations[0]).toContain('6자');
      expect(violations[0]).toContain('제한 5자');
    });

    it('여러 locale 이 함께 초과하면 locale 별로 각각 위반을 남긴다', () => {
      const config = {
        storeListing: { appName: { 'ko-KR': '행복한농장들', 'en-US': 'Happy Farm Tycoon' } },
      };
      const { violations } = collectStoreTextLimitViolations('play-store', config, limits);
      expect(violations).toHaveLength(2);
    });

    it('필드가 없으면 이 가드는 판정하지 않는다 (존재 검사는 requireLocaleMap 담당)', () => {
      const { violations, passes } = collectStoreTextLimitViolations('play-store', {}, limits);
      expect(violations).toEqual([]);
      expect(passes).toEqual([]);
    });
  });

  describe('실제 스토어 config 는 모든 마켓 제한을 만족한다', () => {
    // jest 는 레포 루트(rootDir)에서 실행되므로 process.cwd()가 레포 루트다.
    const repoRoot = process.cwd();
    const readJson = (relativePath: string) => JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));

    it('play-store/google-play.config.json', () => {
      const { violations } = collectStoreTextLimitViolations(
        'play-store',
        readJson('play-store/google-play.config.json'),
        PLAY_STORE_TEXT_LIMITS,
      );
      expect(violations).toEqual([]);
    });

    it('app-store/app-store.config.json', () => {
      const { violations } = collectStoreTextLimitViolations(
        'app-store',
        readJson('app-store/app-store.config.json'),
        APP_STORE_TEXT_LIMITS,
      );
      expect(violations).toEqual([]);
    });

    it('제한 상수는 콘솔 스펙의 핵심 필드를 커버한다', () => {
      const playPaths = PLAY_STORE_TEXT_LIMITS.map((entry: { path: string }) => entry.path);
      expect(playPaths).toEqual(
        expect.arrayContaining(['storeListing.appName', 'storeListing.shortDescription', 'storeListing.fullDescription']),
      );
      const appStorePaths = APP_STORE_TEXT_LIMITS.map((entry: { path: string }) => entry.path);
      expect(appStorePaths).toEqual(
        expect.arrayContaining(['storeListing.appName', 'storeListing.subtitle', 'storeListing.keywords']),
      );
    });
  });
});
