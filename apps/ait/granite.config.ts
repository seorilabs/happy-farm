import { appsInToss } from '@apps-in-toss/framework/plugins';
import { defineConfig } from '@granite-js/react-native/config';

export default defineConfig({
  scheme: 'intoss',
  appName: 'happy-farm',
  plugins: [
    appsInToss({
      appType: 'game',
      brand: {
        displayName: '행복 농장 타이쿤',
        primaryColor: '#2F8747',
        icon: 'https://placehold.co/600x600/2F8747/FFFFFF.png?text=HF',
      },
      permissions: [],
    }),
  ],
});
