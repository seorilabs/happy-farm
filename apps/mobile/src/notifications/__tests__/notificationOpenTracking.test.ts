/**
 * @format
 */

type NotifeeEvent = { type: number; detail: { notification?: { id?: string } } };

const EVENT_TYPE_PRESS = 1;
const EVENT_TYPE_DISMISSED = 0;

const mockStorage = new Map<string, string>();
let mockForegroundHandler: ((event: NotifeeEvent) => void) | null = null;
let mockInitialNotification: { notification: { id: string } } | null = null;
let mockAppStateHandler: ((state: string) => void) | null = null;

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    getInitialNotification: jest.fn(() => Promise.resolve(mockInitialNotification)),
    onForegroundEvent: jest.fn((handler: (event: NotifeeEvent) => void) => {
      mockForegroundHandler = handler;
      return () => {
        mockForegroundHandler = null;
      };
    }),
    createChannel: jest.fn(() => Promise.resolve('channel')),
    cancelTriggerNotification: jest.fn(() => Promise.resolve()),
    createTriggerNotification: jest.fn(() => Promise.resolve()),
  },
  AndroidImportance: { DEFAULT: 3 },
  AuthorizationStatus: { AUTHORIZED: 1, PROVISIONAL: 2, DENIED: 0 },
  EventType: { DISMISSED: EVENT_TYPE_DISMISSED, PRESS: EVENT_TYPE_PRESS },
  TriggerType: { TIMESTAMP: 0 },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(mockStorage.get(key) ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      mockStorage.set(key, value);
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      mockStorage.delete(key);
      return Promise.resolve();
    }),
  },
}));

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn((_event: string, handler: (state: string) => void) => {
      mockAppStateHandler = handler;
      return {
        remove: () => {
          mockAppStateHandler = null;
        },
      };
    }),
  },
  Platform: { OS: 'android', select: (options: Record<string, unknown>) => options.android },
}));

import {
  enqueuePendingNotificationOpen,
  registerHarvestNotificationOpenTracking,
} from '../harvestNotifications';

const HARVEST_ID = 'happy-farm-harvest-ready';
const DAILY_BONUS_ID = 'happy-farm-daily-bonus';
const CROP_OF_THE_DAY_ID = 'happy-farm-crop-of-the-day';

/** 모의 Promise 체인이 모두 풀릴 때까지 마이크로태스크를 흘려보낸다. */
async function flush() {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  mockStorage.clear();
  mockForegroundHandler = null;
  mockInitialNotification = null;
  mockAppStateHandler = null;
});

describe('알림 열람 계측 (#476)', () => {
  test('백그라운드에서 탭된 알림을 큐에 적어 두고 다음 구독이 그대로 이어받는다', async () => {
    await enqueuePendingNotificationOpen(HARVEST_ID);
    await enqueuePendingNotificationOpen(DAILY_BONUS_ID);

    const opened: string[] = [];
    const unsubscribe = registerHarvestNotificationOpenTracking((kind) => opened.push(kind));
    await flush();

    expect(opened).toEqual(['harvest', 'daily_bonus']);
    unsubscribe();
  });

  test('큐는 한 번만 소비된다 — 재구독이 같은 탭을 다시 세지 않는다', async () => {
    await enqueuePendingNotificationOpen(HARVEST_ID);

    const first: string[] = [];
    registerHarvestNotificationOpenTracking((kind) => first.push(kind));
    await flush();

    const second: string[] = [];
    registerHarvestNotificationOpenTracking((kind) => second.push(kind));
    await flush();

    expect(first).toEqual(['harvest']);
    expect(second).toEqual([]);
  });

  test('앱이 다시 활성화될 때도 큐를 비운다 — 백그라운드 탭으로 떠오른 경로', async () => {
    const opened: string[] = [];
    registerHarvestNotificationOpenTracking((kind) => opened.push(kind));
    await flush();
    expect(opened).toEqual([]);

    await enqueuePendingNotificationOpen(CROP_OF_THE_DAY_ID);
    mockAppStateHandler?.('active');
    await flush();

    expect(opened).toEqual(['crop_of_the_day']);
  });

  test('알 수 없는 알림 id는 큐에 쌓지 않는다', async () => {
    await enqueuePendingNotificationOpen('some-other-app-notification');
    await enqueuePendingNotificationOpen(undefined);

    const opened: string[] = [];
    registerHarvestNotificationOpenTracking((kind) => opened.push(kind));
    await flush();

    expect(opened).toEqual([]);
  });

  test('포그라운드 탭은 알림 종류를 구분해 전달한다', async () => {
    const opened: string[] = [];
    registerHarvestNotificationOpenTracking((kind) => opened.push(kind));
    await flush();

    mockForegroundHandler?.({ type: EVENT_TYPE_PRESS, detail: { notification: { id: DAILY_BONUS_ID } } });
    mockForegroundHandler?.({ type: EVENT_TYPE_PRESS, detail: { notification: { id: HARVEST_ID } } });
    // 스와이프로 지운 알림(DISMISSED)은 열람이 아니다.
    mockForegroundHandler?.({ type: EVENT_TYPE_DISMISSED, detail: { notification: { id: HARVEST_ID } } });

    expect(opened).toEqual(['daily_bonus', 'harvest']);
  });

  test('콜드 스타트 알림도 종류를 구분해 전달한다', async () => {
    mockInitialNotification = { notification: { id: CROP_OF_THE_DAY_ID } };

    const opened: string[] = [];
    registerHarvestNotificationOpenTracking((kind) => opened.push(kind));
    await flush();

    expect(opened).toEqual(['crop_of_the_day']);
  });
});
