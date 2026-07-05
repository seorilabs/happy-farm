import balance from './balance.json';

// 일일/주간 리셋 경계 공통 헬퍼(#251).
//
// 오늘의 작물·일일/주간 미션·룰렛·주말 축제·광고 일일 한도는 모두 "캘린더 일" 경계로
// 리셋되는데, 예전엔 각 모듈이 제각기 Math.floor(now / DAY_MS)로 UTC 자정(=KST 09:00)에
// 롤오버했다. 이 헬퍼로 경계 계산을 한곳으로 통일하고, 오프셋(offsetMs)만큼 이동한
// 저활동 시각(기본: KST 04:00)에 리셋되도록 한다. offset=0이면 기존 UTC epoch-day와
// 완전히 동일해 하위호환된다. 순수·결정적이며 비정상 입력에 방어적이다.

const DAY_MS = 24 * 60 * 60 * 1000;

// 리셋 오프셋(ms). balance.json에서 데이터 주도로 정의(라이브옵스/마켓별 튜닝).
// 기본값 68400000 = 19h → KST(UTC+9) 04:00 리셋(UTC 19:00).
export const RESET_OFFSET_MS: number = balance.resetOffset.offsetMs;

function safeOffset(offsetMs: number): number {
  return Number.isFinite(offsetMs) ? offsetMs : 0;
}

// now가 속한 "리셋 일(day) 인덱스". 경계는 UTC 자정이 아니라 offsetMs만큼 뒤로 민
// 시각에 발생한다. 예) offset=19h면 UTC 19:00(=KST 04:00)마다 인덱스가 1 증가한다.
export function getResetDayIndex(now: number = Date.now(), offsetMs: number = RESET_OFFSET_MS): number {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  return Math.floor((safeNow - safeOffset(offsetMs)) / DAY_MS);
}

// 리셋 일 인덱스 → 그 리셋 일이 시작하는 UTC ms(윈도우 시작 시각). getResetDayIndex의
// 역함수 성질을 만족한다: getResetDayIndex(getResetDayStart(k)) === k.
export function getResetDayStart(dayIndex: number, offsetMs: number = RESET_OFFSET_MS): number {
  const safeIndex = Number.isFinite(dayIndex) ? Math.floor(dayIndex) : 0;
  return safeIndex * DAY_MS + safeOffset(offsetMs);
}
