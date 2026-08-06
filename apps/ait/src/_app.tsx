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
  flushAppsInTossPlatformEvents,
  shutdownAppsInTossPlatformEvents,
  startAppsInTossPlatformEvents,
} from './platformEvents';

function AppContainer({ children }: PropsWithChildren<InitialProps>) {
  useEffect(() => {
    startAppsInTossPlatformEvents();

    // 초기화 실패를 조용히 삼키지 않고 관측 가능하게 남긴다. 초기화 완료 전 발생한
    // 이벤트는 analytics 레이어에서 큐잉되므로 await 없이 시작해도 유실되지 않는다.
    initializeAppsInTossFirebaseServices().catch((error: unknown) => {
      console.warn('[ait] Firebase services init failed', error);
    });

    const subscription = AppState.addEventListener('change', (nextState) => {
      handleAppsInTossAnalyticsAppStateChange(nextState);
      if (nextState !== 'active') {
        void flushAppsInTossPlatformEvents();
      }
    });
    return () => {
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
