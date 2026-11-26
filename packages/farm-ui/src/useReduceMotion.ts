import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// 동작 줄이기 설정(#606). 켜져 있으면 날아가는 코인, 튕김, 손가락 흔들림을 끄고 숫자만 바꾼다.
export function useReduceMotion(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let mounted = true;
    if (typeof AccessibilityInfo?.isReduceMotionEnabled === 'function') {
      // 플랫폼에 따라 Promise가 아닌 값이 올 수 있어 감싸서 읽는다.
      Promise.resolve(AccessibilityInfo.isReduceMotionEnabled())
        .then((value) => {
          if (mounted && value === true) setEnabled(true);
        })
        .catch(() => undefined);
    }
    const subscription =
      typeof AccessibilityInfo?.addEventListener === 'function'
        ? AccessibilityInfo.addEventListener('reduceMotionChanged', (value: boolean) => {
            if (mounted) setEnabled(value);
          })
        : null;
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);
  return enabled;
}
