/**
 * @format
 */

import notifee, { EventType } from '@notifee/react-native';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { enqueuePendingNotificationOpen } from './src/notifications/harvestNotifications';

// 앱이 백그라운드에 살아 있는 동안의 알림 탭은 onForegroundEvent 로 오지 않고 이 핸들러로
// 전달된다. 등록이 없으면 그 탭이 전부 유실된다(#476: Android 예약 244건에 opened 0건).
// notifee 는 컴포넌트 트리 밖, 앱 등록 전에 한 번만 등록하기를 요구하므로 여기에 둔다.
// 이 시점에는 analytics 가 아직 초기화되지 않았을 수 있어 바로 전송하지 않고 큐에 적는다.
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.PRESS) {
    await enqueuePendingNotificationOpen(detail.notification?.id);
  }
});

AppRegistry.registerComponent(appName, () => App);
