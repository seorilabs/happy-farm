import { AppsInToss } from '@apps-in-toss/framework';
import { TDSProvider } from '@toss/tds-react-native';
import React, { useEffect, type PropsWithChildren } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { type InitialProps } from '@granite-js/react-native';
import { context } from '../require.context';
import { initializeAppsInTossFirebaseServices } from './firebaseWeb';

function AppContainer({ children }: PropsWithChildren<InitialProps>) {
  useEffect(() => {
    void initializeAppsInTossFirebaseServices();
  }, []);

  return (
    <SafeAreaProvider>
      <TDSProvider>{children}</TDSProvider>
    </SafeAreaProvider>
  );
}

export default AppsInToss.registerApp(AppContainer, { context });
