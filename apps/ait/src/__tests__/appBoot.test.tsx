/// <reference types="jest" />

import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react-native';

const mockEnsurePlatformSession = jest.fn(() => Promise.resolve(true));
const mockStartPlatformEvents = jest.fn();
const mockHandlePlatformAppState = jest.fn();
const mockShutdownPlatformEvents = jest.fn(() => Promise.resolve());
const mockInitializeFirebase = jest.fn(() => Promise.resolve());
const mockHandleAnalyticsAppState = jest.fn();

// registerApp이 컴포넌트를 그대로 돌려주게 해서 부팅 effect를 직접 렌더한다.
jest.mock('@apps-in-toss/framework', () => ({
  AppsInToss: { registerApp: (component: unknown) => component },
}));

// 팩토리는 import 호이스팅 시점에 실행되므로 호출 시점에 mock을 참조한다.
jest.mock('../platformEvents', () => ({
  ensureAppsInTossPlatformSession: () => mockEnsurePlatformSession(),
  startAppsInTossPlatformEvents: () => mockStartPlatformEvents(),
  handleAppsInTossPlatformAppStateChange: (state: string) => mockHandlePlatformAppState(state),
  shutdownAppsInTossPlatformEvents: () => mockShutdownPlatformEvents(),
}));

jest.mock('../firebaseWeb', () => ({
  initializeAppsInTossFirebaseServices: () => mockInitializeFirebase(),
}));

jest.mock('../firebaseWeb/analytics', () => ({
  handleAppsInTossAnalyticsAppStateChange: () => mockHandleAnalyticsAppState(),
}));

jest.mock('../../require.context', () => ({ context: {} }));

jest.mock('@toss/tds-react-native', () => ({
  TDSProvider: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

import AppContainer from '../_app';

describe('AIT 부팅', () => {
  beforeEach(() => {
    mockEnsurePlatformSession.mockClear();
    mockStartPlatformEvents.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  test('첫 실행에 Platform 세션을 열고 Analytics identity 준비 뒤 이벤트 flush를 시작한다', async () => {
    render(React.createElement(AppContainer as React.ComponentType));

    // 이 호출이 신규 사용자의 Platform 계정을 만들고 identity.created를 발화시킨다.
    expect(mockEnsurePlatformSession).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockStartPlatformEvents).toHaveBeenCalledTimes(1));
  });

  test('세션 열기가 실패해도 렌더를 막지 않는다', () => {
    mockEnsurePlatformSession.mockResolvedValueOnce(false);

    expect(() => render(React.createElement(AppContainer as React.ComponentType))).not.toThrow();

    expect(mockEnsurePlatformSession).toHaveBeenCalledTimes(1);
  });
});
