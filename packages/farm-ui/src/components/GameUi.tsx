import React, { useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useFarmArt, type FarmSkinKey, type FarmUiIconKey } from '../farmArt';

// 게임 UI 공통 부품(#606). 호스트가 스킨, 아이콘, 서체를 넘기지 않거나 이미지를 못 읽으면
// 지금의 코드 스타일과 이모지로 그린다(설계의 에셋 실패 처리).

export function UiIcon({ name, size, fallback }: { name: FarmUiIconKey; size: number; fallback: string }) {
  const source = useFarmArt().ui?.icons[name];
  const [failed, setFailed] = useState(false);
  if (source == null || failed) {
    return (
      <Text accessible={false} style={{ fontSize: size * 0.78, lineHeight: size, textAlign: 'center', width: size }}>
        {fallback}
      </Text>
    );
  }
  return (
    <Image
      accessible={false}
      source={source}
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

// 눌림과 비활성은 별도 이미지 없이 덮개로 만든다. 눌리면 살짝 어둡고, 비활성은 회색 막을 씌운다.
export const SKIN_PRESSED_SHADE = 'rgba(40, 20, 0, 0.12)';
export const SKIN_DISABLED_SHADE = 'rgba(150, 140, 125, 0.5)';

export function SkinFrame({
  skin,
  height,
  pressed = false,
  disabled = false,
  fallbackStyle,
  style,
  contentStyle,
  children,
  testID,
}: {
  skin: FarmSkinKey;
  // 끝 조각 폭을 높이로 정하므로 높이를 고정해서 받는다.
  height: number;
  pressed?: boolean;
  disabled?: boolean;
  // 스킨이 없을 때 쓰는 코드 스타일(배경, 테두리).
  fallbackStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  testID?: string;
}) {
  const art = useFarmArt().ui?.skins[skin];
  const [failed, setFailed] = useState(false);
  const useSkin = art != null && !failed;
  const cap = useSkin ? Math.round(height * art.capRatio) : 0;
  return (
    <View testID={testID} style={[{ height }, !useSkin && fallbackStyle, style]}>
      {useSkin ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Image
            testID={testID != null ? `${testID}-skin-left` : undefined}
            source={art.left}
            onError={() => setFailed(true)}
            resizeMode="stretch"
            style={[styles.slice, { left: 0, width: cap }]}
          />
          <Image
            source={art.center}
            onError={() => setFailed(true)}
            resizeMode="stretch"
            style={[styles.slice, { left: cap, right: cap }]}
          />
          <Image
            source={art.right}
            onError={() => setFailed(true)}
            resizeMode="stretch"
            style={[styles.slice, { right: 0, width: cap }]}
          />
        </View>
      ) : null}
      {pressed || disabled ? (
        <View
          pointerEvents="none"
          style={[
            styles.shade,
            { borderRadius: height / 2, backgroundColor: disabled ? SKIN_DISABLED_SHADE : SKIN_PRESSED_SHADE },
          ]}
        />
      ) : null}
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

export type GameTextTone = 'ink' | 'onPrimary' | 'muted';

// 기존 Text 스타일에 디스플레이 서체만 얹을 때 쓴다(카운트업 숫자처럼 Text를 직접 그리는 곳).
export function useDisplayFontStyle(): TextStyle {
  const fontFamily = useFarmArt().displayFontFamily;
  return fontFamily != null ? { fontFamily, fontWeight: 'normal' } : SYSTEM_OUTLINE_STYLE;
}

const SYSTEM_OUTLINE_STYLE: TextStyle = {
  textShadowColor: 'rgba(255, 255, 255, 0.6)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 1,
};

// 숫자와 라틴 문자는 디스플레이 서체로, 없으면 시스템 굵은 글씨에 얇은 외곽선 그림자를 준다.
// 한중일 글자는 서체에 없어 플랫폼이 시스템 글꼴로 자동 대체한다.
export function GameText({
  tone = 'ink',
  style,
  children,
  ...rest
}: TextProps & { tone?: GameTextTone; style?: StyleProp<TextStyle> }) {
  const fontStyle = useDisplayFontStyle();
  return (
    <Text
      {...rest}
      style={[
        styles.text,
        fontStyle,
        // 초록 버튼 위 흰 글자는 서체와 관계없이 짙은 초록 그림자로 읽힘을 지킨다.
        tone === 'onPrimary' ? styles.onPrimary : tone === 'muted' ? styles.muted : styles.ink,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  slice: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  shade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '900',
  },
  ink: {
    color: '#5c3a16',
  },
  muted: {
    color: '#8a6a3c',
  },
  onPrimary: {
    color: '#ffffff',
    textShadowColor: 'rgba(30, 80, 20, 0.85)',
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 1.5,
  },
});
