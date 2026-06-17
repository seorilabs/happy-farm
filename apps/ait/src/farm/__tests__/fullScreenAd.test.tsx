/// <reference types="jest" />

import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';

import type { RewardedAdController, RewardedAdShowResult } from '../../../../../packages/farm-core/src';

type FullScreenAdEvent = {
  type: 'loaded' | 'userEarnedReward' | 'dismissed' | 'failedToShow';
};

type FullScreenAdRequest = {
  options: { adGroupId: string };
  onEvent: (event: FullScreenAdEvent) => void;
  onError: () => void;
};

const mockUnregisterLoad = jest.fn();
const mockUnregisterShow = jest.fn();
let latestLoadRequest: FullScreenAdRequest | null = null;

const mockLoadFullScreenAd = Object.assign(
  jest.fn((request: FullScreenAdRequest) => {
    latestLoadRequest = request;
    return mockUnregisterLoad;
  }),
  { isSupported: jest.fn(() => true) }
);

const mockShowFullScreenAd = Object.assign(jest.fn(() => mockUnregisterShow), {
  isSupported: jest.fn(() => true),
});

jest.mock('@apps-in-toss/framework', () => ({
  loadFullScreenAd: mockLoadFullScreenAd,
  showFullScreenAd: mockShowFullScreenAd,
}));

jest.mock('../../firebaseWeb/remoteConfig', () => ({
  useAppsInTossAdsEnabled: () => true,
}));

const { useFullScreenAd } =
  jest.requireActual<typeof import('../platform/fullScreenAd')>('../platform/fullScreenAd');

function Harness({ onController }: { onController: (controller: RewardedAdController) => void }) {
  const controller = useFullScreenAd('ait.rewarded.test');
  onController(controller);
  return null;
}

describe('useFullScreenAd', () => {
  beforeEach(() => {
    latestLoadRequest = null;
    mockUnregisterLoad.mockClear();
    mockUnregisterShow.mockClear();
    mockLoadFullScreenAd.mockClear();
    mockShowFullScreenAd.mockClear();
    mockLoadFullScreenAd.isSupported.mockClear();
    mockShowFullScreenAd.isSupported.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  test('settles an in-flight show request when the hook unmounts', async () => {
    const controllerRef: { current?: RewardedAdController } = {};
    const rendered = render(
      <Harness
        onController={(value) => {
          controllerRef.current = value;
        }}
      />
    );

    await waitFor(() => {
      expect(latestLoadRequest).not.toBeNull();
    });
    act(() => {
      latestLoadRequest?.onEvent({ type: 'loaded' });
    });
    await waitFor(() => {
      expect(controllerRef.current?.isAdReady).toBe(true);
    });

    let result: RewardedAdShowResult | null = null;
    const controller = controllerRef.current;
    if (controller == null) {
      throw new Error('useFullScreenAd did not provide a controller.');
    }
    let showPromise: Promise<void> | null = null;
    await act(async () => {
      showPromise = controller.showAd().then((value: RewardedAdShowResult) => {
        result = value;
      });
    });

    expect(mockShowFullScreenAd).toHaveBeenCalledWith(
      expect.objectContaining({ options: { adGroupId: 'ait.rewarded.test' } })
    );

    await act(async () => {
      rendered.unmount();
    });
    await showPromise;

    expect(result).toEqual({ status: 'dismissed' });
    expect(mockUnregisterShow).toHaveBeenCalledTimes(1);
  });
});
