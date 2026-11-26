import React, { createContext, useContext } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

// 게임 버튼 공통 피드백(#606 AC-8). 효과음 설정과 지원 여부는 FarmGame이 판단해 playTap에 담는다.
export type GameFeedback = { playTap: () => void };

export const GameFeedbackContext = createContext<GameFeedback>({ playTap: () => undefined });

// 아래 두께(borderBottomWidth 4)로 입체감을 내는 버튼: 눌리면 두께를 줄이고 같은 양만큼 내려앉아
// 바닥 위치는 그대로 둔 채 물리적으로 눌린 것처럼 보인다.
export const PRESSED_DEPTH_STYLE: ViewStyle = { borderBottomWidth: 2, transform: [{ translateY: 2 }] };
// 두께가 없는 버튼: 살짝 내려앉고 어두워진다.
export const PRESSED_SINK_STYLE: ViewStyle = { transform: [{ translateY: 1 }], opacity: 0.88 };

type GamePressableProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
  pressedStyle?: StyleProp<ViewStyle>;
  // 수확·심기처럼 자체 효과음이 있는 버튼은 탭음을 겹치지 않는다.
  silent?: boolean;
};

export function GamePressable({
  style,
  pressedStyle = PRESSED_SINK_STYLE,
  silent,
  disabled,
  onPress,
  ...rest
}: GamePressableProps) {
  const { playTap } = useContext(GameFeedbackContext);
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        state.pressed && disabled !== true ? pressedStyle : null,
      ]}
      onPress={(event: GestureResponderEvent) => {
        if (silent !== true) {
          playTap();
        }
        onPress?.(event);
      }}
    />
  );
}
