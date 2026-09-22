import notifee, {
  AndroidImportance,
  AuthorizationStatus,
  EventType,
  TriggerType,
  type TimestampTrigger,
} from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

import { logDevWarning, type FarmNotificationKind } from '../../../../packages/farm-core/src';
import type { FarmGameNotifications, FarmReminderKind } from '../../../../packages/farm-ui/src';

const HARVEST_READY_NOTIFICATION_ID = 'happy-farm-harvest-ready';
const HARVEST_READY_CHANNEL_ID = 'harvest-ready';

// 백그라운드에서 탭된 알림을 다음 활성화까지 보관하는 큐(#476).
const PENDING_NOTIFICATION_OPENS_KEY = 'happy-farm:pendingNotificationOpens:v1';
// 앱이 오래 백그라운드에 있어도 큐가 무한히 자라지 않게 최근 항목만 남긴다.
const MAX_PENDING_OPENS = 20;

const FARM_NOTIFICATION_KINDS: readonly FarmNotificationKind[] = ['harvest', 'daily_bonus', 'crop_of_the_day'];

function isFarmNotificationKind(value: unknown): value is FarmNotificationKind {
  return typeof value === 'string' && FARM_NOTIFICATION_KINDS.includes(value as FarmNotificationKind);
}

// 복귀 리마인더는 수확 알림과 별도의 id/채널을 써서 서로 덮어쓰지 않는다.
const COMEBACK_REMINDER_CHANNEL_ID = 'comeback-reminders';
const COMEBACK_REMINDER_NOTIFICATION_IDS: Record<FarmReminderKind, string> = {
  dailyBonus: 'happy-farm-daily-bonus',
  cropOfTheDay: 'happy-farm-crop-of-the-day',
};

async function ensureComebackReminderChannel() {
  return notifee.createChannel({
    id: COMEBACK_REMINDER_CHANNEL_ID,
    name: 'Comeback reminders',
    importance: AndroidImportance.DEFAULT,
  });
}

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
      logDevWarning('[notifications] permission failed', error);
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
      logDevWarning('[notifications] schedule harvest failed', error);
    }
  },

  async cancelHarvestReady() {
    try {
      await notifee.cancelTriggerNotification(HARVEST_READY_NOTIFICATION_ID);
    } catch (error) {
      logDevWarning('[notifications] cancel harvest failed', error);
    }
  },

  async scheduleReminder(kind, { readyAtMs, title, body }) {
    try {
      const channelId = await ensureComebackReminderChannel();
      const notificationId = COMEBACK_REMINDER_NOTIFICATION_IDS[kind];
      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: readyAtMs,
      };

      await notifee.cancelTriggerNotification(notificationId);
      await notifee.createTriggerNotification(
        {
          id: notificationId,
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
      logDevWarning('[notifications] schedule reminder failed', error);
    }
  },

  async cancelReminder(kind) {
    try {
      await notifee.cancelTriggerNotification(COMEBACK_REMINDER_NOTIFICATION_IDS[kind]);
    } catch (error) {
      logDevWarning('[notifications] cancel reminder failed', error);
    }
  },
};

/** 알림 id -> 계측 kind. 수확 알림과 복귀 리마인더 두 종류를 모두 구분해 센다. */
const NOTIFICATION_KIND_BY_ID: Record<string, FarmNotificationKind> = {
  [HARVEST_READY_NOTIFICATION_ID]: 'harvest',
  [COMEBACK_REMINDER_NOTIFICATION_IDS.dailyBonus]: 'daily_bonus',
  [COMEBACK_REMINDER_NOTIFICATION_IDS.cropOfTheDay]: 'crop_of_the_day',
};

function getNotificationKind(notificationId: string | undefined): FarmNotificationKind | null {
  return notificationId == null ? null : (NOTIFICATION_KIND_BY_ID[notificationId] ?? null);
}

/**
 * 알림이 열렸을 때(`onOpen`)를 계측하기 위한 구독.
 * - 콜드 스타트(앱 종료 상태에서 알림 탭으로 실행)는 getInitialNotification으로,
 * - 포그라운드 중 알림 탭은 onForegroundEvent(PRESS)로,
 * - 앱이 백그라운드에 살아 있는 동안의 탭은 index.js가 등록한 백그라운드 핸들러가
 *   큐에 남긴 항목을 이 구독이 이어받아 처리한다(#476).
 *
 * 반환값은 구독 해제 함수다. 알림 동작 자체는 바꾸지 않고 관찰만 한다.
 */
export function registerHarvestNotificationOpenTracking(
  onOpen: (kind: FarmNotificationKind) => void
): () => void {
  notifee
    .getInitialNotification()
    .then((initial) => {
      const kind = getNotificationKind(initial?.notification?.id);
      if (kind != null) {
        onOpen(kind);
      }
    })
    .catch((error: unknown) => {
      logDevWarning('[notifications] initial notification failed', error);
    });

  // 백그라운드 탭은 analytics가 초기화되기 전에 도착할 수 있어 큐로 받는다.
  void drainPendingNotificationOpens().then((kinds) => {
    for (const kind of kinds) {
      onOpen(kind);
    }
  });

  const unsubscribeForeground = notifee.onForegroundEvent(({ type, detail }) => {
    if (type !== EventType.PRESS) return;
    const kind = getNotificationKind(detail.notification?.id);
    if (kind != null) {
      onOpen(kind);
    }
  });

  // 백그라운드에서 탭해 앱이 다시 떠오를 때도 큐를 비운다. 백그라운드 핸들러가 기록한
  // 항목은 앱이 활성화된 뒤에야 전송할 수 있기 때문이다.
  const appStateSubscription = AppState.addEventListener('change', (nextState) => {
    if (nextState !== 'active') return;
    void drainPendingNotificationOpens().then((kinds) => {
      for (const kind of kinds) {
        onOpen(kind);
      }
    });
  });

  return () => {
    unsubscribeForeground();
    appStateSubscription.remove();
  };
}

/**
 * 백그라운드에서 탭된 알림을 큐에 적는다. index.js의 notifee 백그라운드 핸들러에서만
 * 호출한다. 이 시점에는 JS 컨텍스트만 살아 있고 analytics는 초기화되기 전일 수 있어,
 * 바로 전송하지 않고 다음 활성화 때 비운다.
 */
export async function enqueuePendingNotificationOpen(notificationId: string | undefined) {
  const kind = getNotificationKind(notificationId);
  if (kind == null) return;
  try {
    const raw = await AsyncStorage.getItem(PENDING_NOTIFICATION_OPENS_KEY);
    const queued: unknown = raw == null ? [] : JSON.parse(raw);
    const kinds = Array.isArray(queued) ? queued.filter(isFarmNotificationKind) : [];
    kinds.push(kind);
    await AsyncStorage.setItem(PENDING_NOTIFICATION_OPENS_KEY, JSON.stringify(kinds.slice(-MAX_PENDING_OPENS)));
  } catch (error) {
    logDevWarning('[notifications] enqueue pending open failed', error);
  }
}

async function drainPendingNotificationOpens(): Promise<FarmNotificationKind[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_NOTIFICATION_OPENS_KEY);
    if (raw == null) return [];
    await AsyncStorage.removeItem(PENDING_NOTIFICATION_OPENS_KEY);
    const queued: unknown = JSON.parse(raw);
    return Array.isArray(queued) ? queued.filter(isFarmNotificationKind) : [];
  } catch (error) {
    logDevWarning('[notifications] drain pending opens failed', error);
    return [];
  }
}
