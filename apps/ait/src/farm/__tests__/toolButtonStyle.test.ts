/// <reference types="jest" />

import { StyleSheet } from 'react-native';

import { styles } from '../../../../../packages/farm-ui/src/farmGameStyles';

// #237: 하단 '도구 선택'의 씨앗(작물) 버튼에서 이모지가 박스 밖으로 튀어나가고
// 여백이 부족해 빡빡하게 보이던 문제의 회귀 방지. 시각 렌더 자체는 헤드리스로
// 검증할 수 없으므로, 튀어나감/여백을 결정하는 스타일 불변식을 고정한다.
describe('씨앗/도구 선택 버튼 스타일 (#237)', () => {
  it('버튼 박스가 내부 콘텐츠를 클리핑하고 상하좌우 여백을 갖는다', () => {
    const btn = StyleSheet.flatten(styles.toolButton);
    // 작물 이모지가 박스 경계 밖으로 튀어나가지 않도록 overflow 클리핑
    expect(btn.overflow).toBe('hidden');
    // 아이콘·이름·가격/ROI 주변 여백 확보
    expect(btn.paddingHorizontal as number).toBeGreaterThanOrEqual(4);
    expect(btn.paddingVertical as number).toBeGreaterThanOrEqual(4);
  });

  it('작물 아이콘의 lineHeight가 fontSize 이상으로 한정돼 글리프가 박스 안에 들어온다', () => {
    const icon = StyleSheet.flatten(styles.toolIcon);
    expect(typeof icon.fontSize).toBe('number');
    expect(typeof icon.lineHeight).toBe('number');
    const fontSize = icon.fontSize as number;
    const lineHeight = icon.lineHeight as number;
    // 이모지 글리프가 잘리지 않으면서 세로로 넘치지 않도록 lineHeight 명시
    expect(lineHeight).toBeGreaterThanOrEqual(fontSize);
    // 세로 여백 안에 아이콘+이름+가격/ROI가 함께 들어가도록 과도하게 크지 않게 유지
    expect(lineHeight).toBeLessThanOrEqual(fontSize + 8);
  });

  it('마스터리/NEW 배지가 버튼 모서리에 절대 배치돼 콘텐츠와 겹치지 않는다', () => {
    expect(StyleSheet.flatten(styles.toolMasteryBadge).position).toBe('absolute');
    expect(StyleSheet.flatten(styles.toolNewBadge).position).toBe('absolute');
  });
});
