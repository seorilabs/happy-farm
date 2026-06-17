import notifee, {
  AndroidImportance,
  AuthorizationStatus,
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
