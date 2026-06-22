import notifee, {
  AndroidImportance,
  AuthorizationStatus,
  EventType,
  TriggerType,
  type TimestampTrigger,
} from '@notifee/react-native';

import type { FarmGameNotifications } from '../../../../packages/farm-ui/src';
import { recordNonFatalError } from '../firebase/crashlytics';

const HARVEST_READY_NOTIFICATION_ID = 'happy-farm-harvest-ready';
const HARVEST_READY_CHANNEL_ID = 'harvest-ready';

function isAuthorized(status: AuthorizationStatus) {
  return status === AuthorizationStatus.AUTHORIZED || status === AuthorizationStatus.PROVISIONAL;
}

async function ensureHarvestReadyChannel() {
  return notifee.createChannel({
    id: HARVEST_READY_CHANNEL_ID,
    name: 'Harvest reminders',
    importance: AndroidImportance.DEFAULT,
  });
}

export const mobileHarvestNotifications: FarmGameNotifications = {
  isSupported: true,

  async requestPermission() {
    try {
      const settings = await notifee.requestPermission({
        alert: true,
        badge: false,
        sound: true,
      });
      return isAuthorized(settings.authorizationStatus);
    } catch (error) {
      recordNonFatalError(error, 'notifications:permission');
      return false;
    }
  },

  async scheduleHarvestReady({ readyAtMs, title, body }) {
    try {
      const channelId = await ensureHarvestReadyChannel();
      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: readyAtMs,
      };

      await notifee.cancelTriggerNotification(HARVEST_READY_NOTIFICATION_ID);
      await notifee.createTriggerNotification(
        {
          id: HARVEST_READY_NOTIFICATION_ID,
          title,
          body,
          android: {
            channelId,
            pressAction: {
              id: 'default',
            },
          },
        },
        trigger
      );
    } catch (error) {
      recordNonFatalError(error, 'notifications:schedule_harvest_ready');
    }
  },

  async cancelHarvestReady() {
    try {
      await notifee.cancelTriggerNotification(HARVEST_READY_NOTIFICATION_ID);
    } catch (error) {
      recordNonFatalError(error, 'notifications:cancel_harvest_ready');
    }
  },
};

/**
 * 수확 알림이 열렸을 때(`onOpen`)를 계측하기 위한 구독.
 * - 콜드 스타트(앱 종료 상태에서 알림 탭으로 실행)는 getInitialNotification으로,
 * - 포그라운드/백그라운드 복귀 중 알림 탭은 onForegroundEvent(PRESS)로 감지한다.
 * 반환값은 구독 해제 함수다. 알림 동작 자체는 바꾸지 않고 관찰만 한다.
 */
export function registerHarvestNotificationOpenTracking(onOpen: () => void): () => void {
  notifee
    .getInitialNotification()
    .then((initial) => {
      if (initial?.notification?.id === HARVEST_READY_NOTIFICATION_ID) {
        onOpen();
      }
    })
    .catch((error: unknown) => {
      recordNonFatalError(error, 'notifications:initial_notification');
    });

  return notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.PRESS && detail.notification?.id === HARVEST_READY_NOTIFICATION_ID) {
      onOpen();
    }
  });
}
