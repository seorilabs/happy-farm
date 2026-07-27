import { appsInToss } from '@apps-in-toss/framework/plugins';
import { defineConfig } from '@granite-js/react-native/config';

export default defineConfig({
  scheme: 'intoss',
  appName: 'happy-farm',
  plugins: [
    appsInToss({
      appType: 'game',
      navigationBar: {
        transparentBackground: true,
        theme: 'dark',
      },
      brand: {
        displayName: '행복한 농장 타이쿤',
        primaryColor: '#2F8747',
        icon: 'https://static.toss.im/appsintoss/38345/7cb5596a-ee72-43c3-b899-7d3a494b0602.png',
      },
      permissions: [],
    }),
  ],
});
