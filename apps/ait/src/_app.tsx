import { AppsInToss } from '@apps-in-toss/framework';
import { TDSProvider } from '@toss/tds-react-native';
import React, { useEffect, type PropsWithChildren } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { type InitialProps } from '@granite-js/react-native';
import { context } from '../require.context';
import { initializeAppsInTossFirebaseServices } from './firebaseWeb';

function AppContainer({ children }: PropsWithChildren<InitialProps>) {
  useEffect(() => {
    // 초기화 실패를 조용히 삼키지 않고 관측 가능하게 남긴다. 초기화 완료 전 발생한
    // 이벤트는 analytics 레이어에서 큐잉되므로 await 없이 시작해도 유실되지 않는다.
    initializeAppsInTossFirebaseServices().catch((error: unknown) => {
      console.warn('[ait] Firebase 서비스 초기화 실패', error);
    });
  }, []);

  return (
    <SafeAreaProvider>
      <TDSProvider>{children}</TDSProvider>
    </SafeAreaProvider>
  );
}

export default AppsInToss.registerApp(AppContainer, { context });
