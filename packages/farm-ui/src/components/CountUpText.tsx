import React, { useEffect, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { REWARD_COUNT_UP_DELAY_MS, REWARD_COUNT_UP_DURATION_MS, getCountUpValue, type CountUpRun } from '../rewardBurst';
import { CoinText } from './GameUi';

const FRAME_MS = 33;

// 보상 카운트업(#606 AC-3). 숫자만 다시 그려 큰 화면 전체가 프레임마다 다시 그려지지 않게 한다.
// 실제 값이 카운트업 목표와 다르면(그사이 수확 등) 바로 실제 값을 보인다.
export function CountUpText({
  value,
  run,
  format,
  style,
  testID,
  numberOfLines,
  maxFontSizeMultiplier,
  coin = false,
}: {
  value: number;
  run: CountUpRun | null;
  format: (value: number) => string;
  style?: StyleProp<TextStyle>;
  testID?: string;
  numberOfLines?: number;
  maxFontSizeMultiplier?: number;
  // 문구 속 코인 이모지를 그림 코인으로 바꿔 그린다(1회차 #9).
  coin?: boolean;
}) {
  const [, setFrame] = useState(0);
  const active = run != null && run.to === value;

  useEffect(() => {
    // 연출 시작 전(startedAt이 정해지지 않음)에는 지급 전 값을 붙잡기만 하고 다시 그리지 않는다.
    if (!active || run == null || !Number.isFinite(run.startedAt)) return;
    const endAt = run.startedAt + REWARD_COUNT_UP_DELAY_MS + REWARD_COUNT_UP_DURATION_MS;
    const interval = setInterval(() => {
      setFrame((frame) => frame + 1);
      if (Date.now() >= endAt) clearInterval(interval);
    }, FRAME_MS);
    return () => clearInterval(interval);
  }, [active, run]);

  const shown = active && run != null ? getCountUpValue(run, Date.now()) : value;
  if (coin) {
    return (
      <CoinText testID={testID} style={style} numberOfLines={numberOfLines} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {format(shown)}
      </CoinText>
    );
  }
  return (
    <Text testID={testID} style={style} numberOfLines={numberOfLines} maxFontSizeMultiplier={maxFontSizeMultiplier}>
      {format(shown)}
    </Text>
  );
}
