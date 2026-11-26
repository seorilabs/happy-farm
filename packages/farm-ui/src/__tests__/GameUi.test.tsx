/// <reference types="jest" />

import React from 'react';
import { Image, StyleSheet, Text } from 'react-native';
import { render } from '@testing-library/react-native';

import { FarmArtProvider, type FarmArt } from '../farmArt';
import { CoinText, GameText, SkinFrame, UiIcon } from '../components/GameUi';

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

  test('가운데 조각은 끝 조각 아래로 1pt씩 겹쳐 이음매 틈이 보이지 않게 한다 (1회차 #14)', () => {
    const view = render(
      <FarmArtProvider art={ART}>
        <SkinFrame testID="frame" skin="primary" height={56} />
      </FarmArtProvider>
    );
    const center = StyleSheet.flatten(view.getByTestId('frame-skin-center').props.style);
    expect(center.left).toBe(27);
    expect(center.right).toBe(27);
  });

  test('디스플레이 서체가 있어도 한중일 글자는 시스템 굵은 글씨와 외곽선으로 그린다 (1회차 #7)', () => {
    const view = render(
      <FarmArtProvider art={ART}>
        <GameText testID="label">모두 수확 12</GameText>
      </FarmArtProvider>
    );
    const cjk = view.getByText('모두 수확');
    const style = StyleSheet.flatten(cjk.props.style);
    expect(style.fontFamily).not.toBe('Baloo2-ExtraBold');
    expect(style.fontWeight).toBe('900');
    expect(style.textShadowColor).toBeDefined();
    // 숫자는 부모의 디스플레이 서체를 그대로 쓴다.
    expect(StyleSheet.flatten(view.getByTestId('label').props.style).fontFamily).toBe('Baloo2-ExtraBold');
  });

  test('한국어 줄바꿈은 단어 단위로 한다 (1회차 #21)', () => {
    const view = render(<GameText testID="label">상점에서 열기</GameText>);
    expect(view.getByTestId('label').props.lineBreakStrategyIOS).toBe('hangul-word');
  });

  test('코인 아이콘이 있으면 금액 뒤 코인 이모지를 그림 코인으로 바꾼다 (1회차 #9)', () => {
    const withArt = render(
      <FarmArtProvider art={ART}>
        <CoinText testID="price">300 🪙</CoinText>
      </FarmArtProvider>
    );
    expect(withArt.queryByText('300 🪙')).toBeNull();
    expect(withArt.UNSAFE_getAllByType(Image)).toHaveLength(1);
    expect(withArt.getByTestId('price').props.accessibilityLabel).toBe('300');
    const withoutArt = render(<CoinText testID="price">300 🪙</CoinText>);
    expect(withoutArt.getByText('300 🪙')).toBeTruthy();
  });
});
