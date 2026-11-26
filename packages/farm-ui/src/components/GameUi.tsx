import React, { useState } from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { GOLD_UNIT } from '../../../farm-core/src';
import { useFarmArt, type FarmSkinKey, type FarmUiIconKey } from '../farmArt';
import { GamePressable, PRESSED_SINK_STYLE } from './GamePressable';

// 게임 UI 공통 부품(#606). 호스트가 스킨, 아이콘, 서체를 넘기지 않거나 이미지를 못 읽으면
// 지금의 코드 스타일과 이모지로 그린다(설계의 에셋 실패 처리).

// 스킨 틀은 높이가 정해져 있어 글자가 끝없이 커지면 잘린다. 게임 HUD처럼 틀 안 글자는 1.3배까지만
// 키우고, 전체 문구는 접근성 이름으로 남긴다(#606 B안, fontScale 2 검수).
export const GAME_UI_MAX_FONT_SCALE = 1.3;

export function UiIcon({ name, size, fallback }: { name: FarmUiIconKey; size: number; fallback: string }) {
  const source = useFarmArt().ui?.icons[name];
  const [failed, setFailed] = useState(false);
  if (source == null || failed) {
    return (
      <Text
        accessible={false}
        allowFontScaling={false}
        style={{ fontSize: size * 0.78, lineHeight: size, textAlign: 'center', width: size }}
      >
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
const SKIN_SEAM_OVERLAP = 1;

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
        // 정적 이미지는 원본 픽셀 크기를 기본 크기로 받아 top/bottom 지정을 무시한다(iOS 실행 화면에서
        // 끝 조각이 120pt 높이로 그려졌다). 자리는 View가 잡고 이미지는 그 안을 100%로 채운다.
        // 늘린 이미지는 가장자리 한 줄이 반투명하게 번져 조각 경계에 옅은 세로선이 생긴다(1회차 #14).
        // 가운데 조각을 끝 조각 아래로 1pt씩 넣고 끝 조각을 위에 그려 틈을 덮는다.
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View
            testID={testID != null ? `${testID}-skin-center` : undefined}
            style={[styles.slice, { left: cap - SKIN_SEAM_OVERLAP, right: cap - SKIN_SEAM_OVERLAP }]}
          >
            <Image source={art.center} onError={() => setFailed(true)} resizeMode="stretch" style={styles.sliceImage} />
          </View>
          <View testID={testID != null ? `${testID}-skin-left` : undefined} style={[styles.slice, { left: 0, width: cap }]}>
            <Image source={art.left} onError={() => setFailed(true)} resizeMode="stretch" style={styles.sliceImage} />
          </View>
          <View style={[styles.slice, { right: 0, width: cap }]}>
            <Image source={art.right} onError={() => setFailed(true)} resizeMode="stretch" style={styles.sliceImage} />
          </View>
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

// 서체가 없는 호스트(앱인토스)는 짙은 글자 아래에 옅은 갈색 띠를 번지지 않게(radius 0) 깔아,
// 밝은 칩 위에서도 두께가 있는 게임 글자로 보이게 한다.
const SYSTEM_OUTLINE_STYLE: TextStyle = {
  textShadowColor: 'rgba(92, 58, 22, 0.28)',
  textShadowOffset: { width: 0, height: 1.5 },
  textShadowRadius: 0,
};

// 한중일 글자(한글, 가나, 한자, 전각 기호) 구간. 사이의 띄어쓰기는 같은 구간으로 묶는다.
const CJK_RUN =
  /[\u1100-\u11ff\u3000-\u30ff\u3130-\u318f\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]+(?:\s+[\u1100-\u11ff\u3000-\u30ff\u3130-\u318f\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]+)*/g;
const CJK_SYSTEM_FONT = Platform.select({ ios: 'System', android: 'sans-serif', default: undefined });

// 디스플레이 서체에는 한중일 글자가 없어 플랫폼이 보통 굵기의 시스템 글꼴로 대신 그린다(1회차 #7).
// 사용자 결정("한중일은 시스템 굵은 글씨와 외곽선")대로 그 구간만 시스템 굵은 글씨로 따로 그린다.
function splitCjkRuns(children: React.ReactNode, cjkStyle: TextStyle): React.ReactNode {
  let found = false;
  let key = 0;
  const parts: React.ReactNode[] = [];
  const visit = (node: React.ReactNode) => {
    if (typeof node === 'string') {
      let last = 0;
      for (const match of node.matchAll(CJK_RUN)) {
        const start = match.index ?? 0;
        if (start > last) parts.push(node.slice(last, start));
        parts.push(
          <Text key={`cjk-${key++}`} style={cjkStyle}>
            {match[0]}
          </Text>
        );
        found = true;
        last = start + match[0].length;
      }
      if (last < node.length) parts.push(node.slice(last));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    parts.push(React.isValidElement(node) ? React.cloneElement(node, { key: `node-${key++}` }) : node);
  };
  visit(children);
  return found ? parts : children;
}

const CJK_INK_STYLE: TextStyle = { fontFamily: CJK_SYSTEM_FONT, fontWeight: '900', ...SYSTEM_OUTLINE_STYLE };
// 초록 버튼 위 흰 글자는 부모의 짙은 초록 그림자를 그대로 물려받는다.
const CJK_ON_PRIMARY_STYLE: TextStyle = { fontFamily: CJK_SYSTEM_FONT, fontWeight: '900' };

// 숫자와 라틴 문자는 디스플레이 서체로, 없으면 시스템 굵은 글씨에 옅은 갈색 아래 띠를 준다.
// 한중일 글자는 서체가 있어도 시스템 굵은 글씨와 아래 띠로 그린다.
export function GameText({
  tone = 'ink',
  style,
  children,
  ...rest
}: TextProps & { tone?: GameTextTone; style?: StyleProp<TextStyle> }) {
  const fontStyle = useDisplayFontStyle();
  const hasDisplayFont = fontStyle.fontFamily != null;
  return (
    <Text
      maxFontSizeMultiplier={GAME_UI_MAX_FONT_SCALE}
      // 한국어가 "상/점에서"처럼 낱자 사이에서 줄을 바꾸지 않게 한다(1회차 #21, iOS).
      lineBreakStrategyIOS="hangul-word"
      {...rest}
      style={[
        styles.text,
        fontStyle,
        // 초록 버튼 위 흰 글자는 서체와 관계없이 짙은 초록 그림자로 읽힘을 지킨다.
        tone === 'onPrimary' ? styles.onPrimary : tone === 'muted' ? styles.muted : styles.ink,
        style,
      ]}
    >
      {hasDisplayFont ? splitCjkRuns(children, tone === 'onPrimary' ? CJK_ON_PRIMARY_STYLE : CJK_INK_STYLE) : children}
    </Text>
  );
}

// 금액 뒤 코인 이모지(🪙)를 그림 코인으로 바꿔 그린다(1회차 #9). iOS의 🪙는 은색 동전이라 HUD의
// 금색 새싹 코인과 다른 재화로 읽힌다. 그림이 없으면(아이콘 실패, 테스트) 이모지를 그대로 둔다.
export function CoinText({
  children,
  style,
  iconSize,
  ...rest
}: Omit<TextProps, 'children'> & { children: string; iconSize?: number }) {
  const coin = useFarmArt().ui?.icons.coin;
  if (coin == null || !children.includes(GOLD_UNIT)) {
    return (
      <Text lineBreakStrategyIOS="hangul-word" {...rest} style={style}>
        {children}
      </Text>
    );
  }
  const fontSize = StyleSheet.flatten(style)?.fontSize ?? 14;
  const size = iconSize ?? Math.round(fontSize * 1.1);
  const segments = children.split(GOLD_UNIT);
  return (
    <Text
      lineBreakStrategyIOS="hangul-word"
      accessibilityLabel={segments.join('').replace(/\s+/g, ' ').trim()}
      {...rest}
      style={style}
    >
      {segments.flatMap((segment, index) =>
        index === 0
          ? [segment]
          : [<Image key={`coin-${index}`} accessible={false} source={coin} style={{ width: size, height: size }} />, segment]
      )}
    </Text>
  );
}

// 빨간 알림 배지. 숫자, 느낌표, 점 세 가지. 0이나 null이면 그리지 않는다.
export type BadgeValue = number | '!' | 'dot' | null | undefined;

export function GameBadge({ value, testID }: { value: BadgeValue; testID?: string }) {
  if (value == null || value === 0) return null;
  if (value === 'dot') {
    return <View testID={testID} pointerEvents="none" style={[styles.badge, styles.badgeDot]} />;
  }
  return (
    <View testID={testID} pointerEvents="none" style={styles.badge}>
      <Text allowFontScaling={false} style={styles.badgeText}>
        {value === '!' ? '!' : value > 99 ? '99+' : value}
      </Text>
    </View>
  );
}

export const HUD_ICON_BUTTON_HEIGHT = 48;

// 헤더의 정사각 아이콘 버튼(더보기, 출석, 부스트). 칩 스킨의 끝 조각 두 개로 둥근 네모를 만든다.
export function HudIconButton({
  testID,
  icon,
  fallback,
  caption,
  badge,
  accessibilityLabel,
  onPress,
}: {
  testID?: string;
  icon?: FarmUiIconKey;
  fallback: string;
  // 아이콘 아래 작은 글자(부스트 배수나 남은 시간).
  caption?: string;
  badge?: BadgeValue;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const art = useFarmArt().ui?.skins.chip;
  const width = art != null ? Math.round(HUD_ICON_BUTTON_HEIGHT * art.capRatio) * 2 : HUD_ICON_BUTTON_HEIGHT + 6;
  return (
    <GamePressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      pressedStyle={PRESSED_SINK_STYLE}
      style={styles.hudIconButton}
      onPress={onPress}
    >
      {({ pressed }) => (
        <>
          <SkinFrame
            skin="chip"
            height={HUD_ICON_BUTTON_HEIGHT}
            pressed={pressed}
            style={{ width }}
            fallbackStyle={styles.chipFallback}
            contentStyle={styles.hudIconContent}
          >
            {icon != null ? (
              <UiIcon name={icon} size={caption != null ? 24 : 30} fallback={fallback} />
            ) : (
              <Text allowFontScaling={false} style={caption != null ? styles.hudEmojiSmall : styles.hudEmoji}>
                {fallback}
              </Text>
            )}
            {caption != null ? (
              <GameText style={styles.hudCaption} numberOfLines={1} adjustsFontSizeToFit>
                {caption}
              </GameText>
            ) : null}
          </SkinFrame>
          <GameBadge value={badge} />
        </>
      )}
    </GamePressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e5484d',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  badgeDot: {
    minWidth: 14,
    width: 14,
    height: 14,
    top: -3,
    right: -3,
    paddingHorizontal: 0,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 14,
  },
  hudIconButton: {
    position: 'relative',
  },
  hudIconContent: {
    flexDirection: 'column',
    paddingBottom: 3,
  },
  hudEmoji: {
    fontSize: 24,
  },
  hudEmojiSmall: {
    fontSize: 18,
    lineHeight: 22,
  },
  hudCaption: {
    fontSize: 10,
    lineHeight: 12,
    marginTop: -1,
  },
  chipFallback: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#e0c48a',
    borderBottomWidth: 4,
    borderBottomColor: '#c9a253',
    backgroundColor: '#fffaf0',
  },
  slice: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  sliceImage: {
    width: '100%',
    height: '100%',
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
