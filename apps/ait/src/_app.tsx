import { AppsInToss } from '@apps-in-toss/framework';
import { TDSProvider } from '@toss/tds-react-native';
import React, { useEffect, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { type InitialProps } from '@granite-js/react-native';
import { context } from '../require.context';
import { initializeAppsInTossFirebaseServices } from './firebaseWeb';
import { handleAppsInTossAnalyticsAppStateChange } from './firebaseWeb/analytics';
import {
  ensureAppsInTossPlatformSession,
  handleAppsInTossPlatformAppStateChange,
  shutdownAppsInTossPlatformEvents,
  startAppsInTossPlatformEvents,
} from './platformEvents';

function AppContainer({ children }: PropsWithChildren<InitialProps>) {
  useEffect(() => {
    let mounted = true;
    // 신규 사용자에게 Platform 계정을 만들어 신규가입 운영 알림이 발화하게 한다.
    // UI가 없는 익명 키 교환이고 실패해도 게임은 그대로 동작하므로 렌더를 막지 않는다.
    void ensureAppsInTossPlatformSession();

    // 초기화 실패를 조용히 삼키지 않고 관측 가능하게 남긴다. 초기화 완료 전 발생한
    // 이벤트는 Platform SDK 메모리 버퍼에 머물러 await 없이 시작해도 유실되지 않는다.
    void initializeAppsInTossFirebaseServices()
      .catch((error: unknown) => {
        console.warn('[ait] Firebase services init failed', error);
      })
      .finally(() => {
        // 준비 전에 생긴 이벤트는 SDK 메모리 버퍼에 있다. stable GA4 client ID와 Remote
        // Config 수집 토글을 먼저 확정한 뒤 자동 flush를 열어 relay 품질을 보존한다.
        if (mounted) {
          startAppsInTossPlatformEvents();
        }
      });

    const subscription = AppState.addEventListener('change', (nextState) => {
      handleAppsInTossAnalyticsAppStateChange(nextState);
      handleAppsInTossPlatformAppStateChange(nextState);
    });
    return () => {
      mounted = false;
      subscription.remove();
      void shutdownAppsInTossPlatformEvents();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <TDSProvider>{children}</TDSProvider>
    </SafeAreaProvider>
  );
}

export default AppsInToss.registerApp(AppContainer, { context });
