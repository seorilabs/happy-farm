import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

// 팝업 진입 모션(#606): 작게 시작해 살짝 튕기며 제자리로 온다. 반복해 보는 안내 팝업이라 짧게 둔다.
export const POP_IN_FROM_SCALE = 0.88;

export function usePopInStyle() {
  const progressRef = useRef<Animated.Value | null>(null);
  if (progressRef.current == null) {
    progressRef.current = new Animated.Value(0);
  }
  const progress = progressRef.current;

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.spring(progress, {
      toValue: 1,
      damping: 12,
      stiffness: 220,
      mass: 0.8,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress]);

  return {
    opacity: progress.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
    transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [POP_IN_FROM_SCALE, 1] }) }],
  };
}
