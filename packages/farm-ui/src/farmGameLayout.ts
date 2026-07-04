// FarmGame 컴포넌트와 그 StyleSheet(`farmGameStyles.ts`)가 공유하는 레이아웃 치수 상수.
// styles를 별도 모듈로 분리하면서 순환 의존을 피하기 위해 함께 추출했다(값/동작 변경 없음).
export const PLOT_COLUMNS = 4;
export const PLOT_GAP = 10;
export const MAIN_HORIZONTAL_PADDING = 16;
export const SHEET_DRAG_HIT_TARGET_HEIGHT = 36;
// 하단 시트 스크롤 콘텐츠의 기본 하단 여백. 여기에 하단 safe-area 인셋을 더해
// 시트 하단 버튼이 시스템 내비/제스처 바와 겹치지 않게 한다(#236).
export const SHEET_CONTENT_BASE_PADDING_BOTTOM = 28;
