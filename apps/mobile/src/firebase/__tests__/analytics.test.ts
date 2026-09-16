jest.mock('@react-native-firebase/analytics', () => ({
  getAnalytics: jest.fn(() => ({})),
  logEvent: jest.fn(() => Promise.resolve()),
}));

jest.mock('../app', () => ({ isFirebaseConfigured: jest.fn(() => true) }));
jest.mock('../crashlytics', () => ({ recordNonFatalError: jest.fn() }));
jest.mock('../../platformEvents', () => ({ trackMobilePlatformEvent: jest.fn() }));

import { mobileFarmAnalytics } from '../analytics';
import { Platform } from 'react-native';
import { RELEASE_INFO } from '../../../../../packages/farm-core/src';

const mockLogEvent = (
  jest.requireMock('@react-native-firebase/analytics') as { logEvent: jest.Mock }
).logEvent;
const mockTrackPlatform = (
  jest.requireMock('../../platformEvents') as { trackMobilePlatformEvent: jest.Mock }
).trackMobilePlatformEvent;

describe('mobile analytics dual sink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('같은 허용 이벤트를 Firebase와 Platform에 모두 보낸다', () => {
    mobileFarmAnalytics.trackNotificationOpened({ kind: 'harvest' });

    expect(mockLogEvent).toHaveBeenCalledWith(expect.anything(), 'notification_opened', {
      app_market: Platform.OS === 'ios' ? 'app_store' : 'google_play',
      runtime_platform: Platform.OS === 'ios' ? 'ios' : 'android',
      release_version: RELEASE_INFO.versionName,
      notification_kind: 'harvest',
    });
    expect(mockTrackPlatform).toHaveBeenCalledWith('notification_opened', {
      notification_kind: 'harvest',
    });
  });
});
