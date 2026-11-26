/// <reference types="jest" />

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render } from '@testing-library/react-native';

import { FarmArtProvider, type FarmArt } from '../farmArt';
import { GameText, SkinFrame, UiIcon } from '../components/GameUi';

const ART: FarmArt = {
  ui: {
    icons: { coin: { uri: 'coin.png' } },
    skins: { primary: { left: { uri: 'l.png' }, center: { uri: 'c.png' }, right: { uri: 'r.png' }, capRatio: 0.5 } },
  },
  displayFontFamily: 'Baloo2-ExtraBold',
};

describe('GameUi (#606)', () => {
  test('스킨이 있으면 높이에 맞춘 끝 조각 두 개와 늘어나는 가운데로 그린다', () => {
    const view = render(
      <FarmArtProvider art={ART}>
        <SkinFrame testID="frame" skin="primary" height={56} fallbackStyle={{ backgroundColor: 'green' }}>
          <Text>Go</Text>
        </SkinFrame>
      </FarmArtProvider>
    );
    const left = StyleSheet.flatten(view.getByTestId('frame-skin-left').props.style);
    expect(left.width).toBe(28);
    expect(StyleSheet.flatten(view.getByTestId('frame').props.style).backgroundColor).toBeUndefined();
    expect(view.getByText('Go')).toBeTruthy();
  });

  test('스킨이 없으면 코드 스타일로 그린다', () => {
    const view = render(
      <SkinFrame testID="frame" skin="primary" height={56} fallbackStyle={{ backgroundColor: 'green' }} />
    );
    expect(view.queryByTestId('frame-skin-left')).toBeNull();
    expect(StyleSheet.flatten(view.getByTestId('frame').props.style).backgroundColor).toBe('green');
  });

  test('아이콘이 없으면 이모지로 그린다', () => {
    const withArt = render(
      <FarmArtProvider art={ART}>
        <UiIcon name="coin" size={24} fallback="💰" />
      </FarmArtProvider>
    );
    expect(withArt.queryByText('💰')).toBeNull();
    const withoutArt = render(<UiIcon name="star" size={24} fallback="⭐" />);
    expect(withoutArt.getByText('⭐')).toBeTruthy();
  });

  test('디스플레이 서체가 있으면 그 이름을, 없으면 시스템 굵은 글씨에 외곽선 그림자를 쓴다', () => {
    const withFont = render(
      <FarmArtProvider art={ART}>
        <GameText>4.85K</GameText>
      </FarmArtProvider>
    );
    expect(StyleSheet.flatten(withFont.getByText('4.85K').props.style).fontFamily).toBe('Baloo2-ExtraBold');
    const withoutFont = render(<GameText>4.85K</GameText>);
    const style = StyleSheet.flatten(withoutFont.getByText('4.85K').props.style);
    expect(style.fontFamily).toBeUndefined();
    expect(style.fontWeight).toBe('900');
    expect(style.textShadowColor).toBeDefined();
  });
});
