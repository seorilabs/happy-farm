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
let latestShowRequest: FullScreenAdRequest | null = null;

const mockLoadFullScreenAd = Object.assign(
  jest.fn((request: FullScreenAdRequest) => {
    latestLoadRequest = request;
    return mockUnregisterLoad;
  }),
  { isSupported: jest.fn(() => true) }
);

const mockShowFullScreenAd = Object.assign(
  jest.fn((request: FullScreenAdRequest) => {
    latestShowRequest = request;
    return mockUnregisterShow;
  }),
  { isSupported: jest.fn(() => true) }
);

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
    latestShowRequest = null;
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

  test('returns notReady immediately when showAd is called while another show is in flight', async () => {
    const controllerRef: { current?: RewardedAdController } = {};
    render(
      <Harness onController={(value) => { controllerRef.current = value; }} />
    );

    await waitFor(() => expect(latestLoadRequest).not.toBeNull());
    act(() => { latestLoadRequest?.onEvent({ type: 'loaded' }); });
    await waitFor(() => expect(controllerRef.current?.isAdReady).toBe(true));

    const controller = controllerRef.current;
    if (controller == null) throw new Error('controller not provided');

    let firstResult: RewardedAdShowResult | null = null;
    let secondResult: RewardedAdShowResult | null = null;

    await act(async () => {
      // Call showAd twice in the same synchronous tick
      controller.showAd().then((v) => { firstResult = v; });
      controller.showAd().then((v) => { secondResult = v; });
    });

    // Second call should resolve immediately as notReady (in-flight guard)
    await waitFor(() => expect(secondResult).toEqual({ status: 'notReady' }));
    // First call is still in flight
    expect(firstResult).toBeNull();
    // Only one showFullScreenAd call should have been made
    expect(mockShowFullScreenAd).toHaveBeenCalledTimes(1);

    // Resolve the first show
    const showRequest = mockShowFullScreenAd.mock.calls[0]?.[0] as FullScreenAdRequest | undefined;
    act(() => { showRequest?.onEvent({ type: 'dismissed' }); });

    await waitFor(() => expect(firstResult).toEqual({ status: 'dismissed' }));
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

  test('does not replace the in-flight show request on duplicate calls', async () => {
    const controllerRef: { current?: RewardedAdController } = {};
    render(
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

    const controller = controllerRef.current;
    if (controller == null) {
      throw new Error('useFullScreenAd did not provide a controller.');
    }

    let firstResult: RewardedAdShowResult | null = null;
    let secondResult: RewardedAdShowResult | null = null;
    let firstPromise: Promise<void> | null = null;
    let secondPromise: Promise<void> | null = null;
    await act(async () => {
      firstPromise = controller.showAd().then((value: RewardedAdShowResult) => {
        firstResult = value;
      });
      secondPromise = controller.showAd().then((value: RewardedAdShowResult) => {
        secondResult = value;
      });
    });

    await secondPromise;
    expect(secondResult).toEqual({ status: 'notReady' });
    expect(mockShowFullScreenAd).toHaveBeenCalledTimes(1);

    act(() => {
      latestShowRequest?.onEvent({ type: 'dismissed' });
    });
    await firstPromise;

    expect(firstResult).toEqual({ status: 'dismissed' });
    expect(mockUnregisterShow).toHaveBeenCalledTimes(1);
  });

  test('settles an in-flight show request even when SDK unregister throws', async () => {
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

    const controller = controllerRef.current;
    if (controller == null) {
      throw new Error('useFullScreenAd did not provide a controller.');
    }

    mockUnregisterShow.mockImplementationOnce(() => {
      throw new Error('unregister failed');
    });

    let result: RewardedAdShowResult | null = null;
    let showPromise: Promise<void> | null = null;
    await act(async () => {
      showPromise = controller.showAd().then((value: RewardedAdShowResult) => {
        result = value;
      });
    });

    await act(async () => {
      rendered.unmount();
    });
    await showPromise;

    expect(result).toEqual({ status: 'dismissed' });
    expect(mockUnregisterShow).toHaveBeenCalledTimes(1);
  });
});
