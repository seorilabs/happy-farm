// 소스 코드에서 "하드코딩된 한글 UI 문자열"만 골라내기 위한 스캐너.
//
// 핵심 의도: 사용자에게 노출되는 문자열 리터럴에 한글이 하드코딩되면 위반이다.
// 그러나 한글 코드 주석(// 라인 주석, /* */ 블록 주석, /** */ JSDoc)은 위반이 아니다.
//
// 단순히 라인 단위로 // 또는 /* 위치만 찾아 잘라내는 방식은 문자열 리터럴과 주석을
// 구분하지 못한다. 예를 들어 `const s = "안녕 // 메모"`에서 // 뒤를 주석으로 잘라내면
// 문자열 안의 한글을 놓친다. 반대로 `// 현재 기회를 "확인됨"으로 표시` 같은 라인
// 주석 안의 따옴표를 문자열 시작으로 오인해서도 안 된다.
//
// 그래서 파일 전체를 문자 단위 상태 기계로 스캔한다. 상태는 아래 5가지다.
//   - code         : 일반 코드
//   - lineComment  : // 이후 그 줄 끝까지
//   - blockComment : /* 이후 */ 까지(여러 줄에 걸칠 수 있음, JSDoc /** 포함)
//   - string       : "..." 또는 '...' (escape \" \' 처리)
//   - template     : `...` 템플릿 리터럴(여러 줄 가능, escape \` 처리)
// 한글은 오직 string / template 상태에서 만났을 때만 위반으로 집계한다.
// 주석 상태(lineComment / blockComment)에서 만난 한글은 무시한다.
//
// 블록 주석과 템플릿 리터럴은 줄 경계를 넘을 수 있으므로, 라인별로 독립 처리하지 않고
// 파일 내용 전체를 하나의 running state로 스캔한다.
//
// 참고: jest(granite babel 프리셋)가 .js는 트랜스폼/로드하지만 .mjs는 트랜스폼하지 않아
// 회귀 테스트에서 import가 실패하므로, 이 모듈은 CommonJS(.js)로 두어 CLI(.mjs, ESM
// interop)와 jest 양쪽에서 그대로 쓸 수 있게 했다.

const HANGUL = /[가-힣]/;

/**
 * @param {string} source 스캔할 소스 코드 전체 내용
 * @returns {{ violations: Array<{ line: number, column: number, char: string, snippet: string }> }}
 *   한글이 문자열/템플릿 리터럴 안에서 발견된 위치 목록. 없으면 빈 배열.
 */
function scanHardcodedHangul(source) {
  const violations = [];

  // 상태 기계
  const CODE = 'code';
  const LINE_COMMENT = 'lineComment';
  const BLOCK_COMMENT = 'blockComment';
  const STRING = 'string';
  const TEMPLATE = 'template';

  let state = CODE;
  let quoteChar = ''; // STRING 상태일 때 여는 따옴표(" 또는 ')
  let escaped = false; // 문자열/템플릿 안에서 직전 문자가 백슬래시였는지

  let line = 1;
  let column = 0; // 현재 줄에서의 1-based 컬럼

  const len = source.length;
  for (let i = 0; i < len; i += 1) {
    const ch = source[i];
    const next = i + 1 < len ? source[i + 1] : '';

    if (ch === '\n') {
      // 라인 주석은 개행에서 종료된다.
      if (state === LINE_COMMENT) {
        state = CODE;
      }
      // 문자열("/')은 개행으로 이어질 수 없다(비정상 입력 방어: 상태에 갇히지 않도록 복구).
      if (state === STRING && !escaped) {
        state = CODE;
        quoteChar = '';
      }
      escaped = false;
      line += 1;
      column = 0;
      continue;
    }

    column += 1;

    switch (state) {
      case CODE: {
        if (ch === '/' && next === '/') {
          state = LINE_COMMENT;
          i += 1;
          column += 1;
        } else if (ch === '/' && next === '*') {
          state = BLOCK_COMMENT;
          i += 1;
          column += 1;
        } else if (ch === '"' || ch === "'") {
          state = STRING;
          quoteChar = ch;
          escaped = false;
        } else if (ch === '`') {
          state = TEMPLATE;
          escaped = false;
        }
        // 그 외 코드 문자는 무시(코드의 한글은 문법 오류이거나 식별자이며,
        // 우리는 사용자-facing 문자열만 문제 삼는다).
        break;
      }

      case LINE_COMMENT: {
        // 개행은 위에서 처리. 그 외는 모두 주석 내용이므로 한글이어도 무시.
        break;
      }

      case BLOCK_COMMENT: {
        if (ch === '*' && next === '/') {
          state = CODE;
          i += 1;
          column += 1;
        }
        // 블록 주석 안 한글은 무시.
        break;
      }

      case STRING: {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === quoteChar) {
          state = CODE;
          quoteChar = '';
        } else if (HANGUL.test(ch)) {
          violations.push({ line, column, char: ch, snippet: snippetForLine(source, i) });
        }
        break;
      }

      case TEMPLATE: {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '`') {
          state = CODE;
        } else if (HANGUL.test(ch)) {
          // 템플릿 ${...} 표현식 안까지 완벽 파싱하지는 않는다. 표현식 안에 한글 문자열
          // 리터럴이 들어가는 경우는 사실상 없고, 있더라도 그 자체가 하드코딩 한글
          // 문자열이므로 위반으로 잡는 게 맞다.
          violations.push({ line, column, char: ch, snippet: snippetForLine(source, i) });
        }
        break;
      }

      default:
        break;
    }
  }

  return { violations };
}

// 위반 위치가 포함된 소스 라인을 잘라 스니펫으로 반환(공백 정리 + 길이 제한).
function snippetForLine(source, index) {
  let start = index;
  while (start > 0 && source[start - 1] !== '\n') start -= 1;
  let end = index;
  while (end < source.length && source[end] !== '\n') end += 1;
  const raw = source.slice(start, end).trim();
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
}

/**
 * 편의 함수: 위반이 하나라도 있으면 true.
 * @param {string} source
 * @returns {boolean}
 */
function hasHardcodedHangul(source) {
  return scanHardcodedHangul(source).violations.length > 0;
}

module.exports = { scanHardcodedHangul, hasHardcodedHangul };
