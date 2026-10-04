/// <reference types="jest" />

import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import type {
  RewardedAdController,
  RewardedAdShowResult,
} from '../../../../../packages/farm-core/src';

type FullScreenAdEvent = {
  type: 'loaded' | 'userEarnedReward' | 'dismissed' | 'failedToShow';
};

type FullScreenAdRequest = {
  options: { adGroupId: string };
  onEvent: (event: FullScreenAdEvent) => void;
  onError: (error?: unknown) => void;
};

const mockUnregisterLoad = jest.fn();
const mockUnregisterShow = jest.fn();
const mockTrack = jest.fn();
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

// 분석·인증 모듈이 실패해도 광고는 SDK만으로 동작해야 한다.
jest.mock('../../platformEvents', () => {
  throw new Error('Platform unavailable: ads must not depend on authentication');
});

const {
  FULL_SCREEN_AD_LOAD_TIMEOUT_MS,
  FULL_SCREEN_AD_SHOW_TIMEOUT_MS,
  useFullScreenAd,
} = jest.requireActual<typeof import('../platform/fullScreenAd')>('../platform/fullScreenAd');

function Harness({ onController, adFormat = 'rewarded' }: { onController: (controller: RewardedAdController) => void; adFormat?: 'rewarded' | 'interstitial' }) {
  const controller = useFullScreenAd('ait.rewarded.test', {
    adFormat,
    track: mockTrack,
  });
  onController(controller);
  return null;
}

async function flushSdkCallbacks() {
  await act(async () => {
    await Promise.resolve();
  });
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
    mockTrack.mockReset();
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  test('전면 광고도 로그인 없이 SDK에서 로드·표시한다', async () => {
    let controller!: RewardedAdController;
    render(<Harness adFormat="interstitial" onController={(value) => { controller = value; }} />);
    act(() => { latestLoadRequest?.onEvent({ type: 'loaded' }); });
    let result!: Promise<RewardedAdShowResult>;
    act(() => { result = controller.showAd(); });
    act(() => { latestShowRequest?.onEvent({ type: 'dismissed' }); });
    await expect(result).resolves.toEqual({ status: 'dismissed' });
    expect(mockShowFullScreenAd).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('ad_load_result', expect.objectContaining({
      ad_format: 'interstitial', result: 'loaded',
    }));
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

  test('ensureAdReady waits for the actual loaded event', async () => {
    const controllerRef: { current?: RewardedAdController } = {};
    render(<Harness onController={(value) => { controllerRef.current = value; }} />);
    await waitFor(() => expect(latestLoadRequest).not.toBeNull());

    const controller = controllerRef.current;
    if (controller?.ensureAdReady == null) throw new Error('ensureAdReady not provided');
    let ready: boolean | null = null;
    let readyPromise!: Promise<void>;
    act(() => {
      readyPromise = controller.ensureAdReady!().then((value) => { ready = value; });
    });
    await Promise.resolve();
    expect(ready).toBeNull();

    act(() => { latestLoadRequest?.onEvent({ type: 'loaded' }); });
    await readyPromise;
    expect(ready).toBe(true);
    expect(controllerRef.current?.isAdReady).toBe(true);
    expect(mockTrack).toHaveBeenCalledWith('ad_load_result', expect.objectContaining({
      ad_format: 'rewarded',
      client_os: expect.any(String),
      result: 'loaded',
      load_latency_ms: expect.any(Number),
    }));
  });

  test('foreground resume retries a failed preload when no ad is ready', async () => {
    let appStateListener: ((state: AppStateStatus) => void) | null = null;
    const remove = jest.fn();
    const appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener;
      return { remove };
    });
    const controllerRef: { current?: RewardedAdController } = {};
    const rendered = render(<Harness onController={(value) => { controllerRef.current = value; }} />);

    await waitFor(() => expect(latestLoadRequest).not.toBeNull());
    act(() => { latestLoadRequest?.onError(new Error('network unavailable')); });
    await waitFor(() => expect(controllerRef.current?.isAdReady).toBe(false));

    await act(async () => {
      appStateListener?.('active');
      await Promise.resolve();
    });
    await waitFor(() => expect(mockLoadFullScreenAd).toHaveBeenCalledTimes(2));
    expect(mockTrack).toHaveBeenCalledWith('ad_load_result', expect.objectContaining({
      result: 'sdk_error',
      failure_family: 'network',
    }));

    rendered.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
    appStateSpy.mockRestore();
  });

  test('ensureAdReady resolves false on load error', async () => {
    const controllerRef: { current?: RewardedAdController } = {};
    render(<Harness onController={(value) => { controllerRef.current = value; }} />);
    await waitFor(() => expect(latestLoadRequest).not.toBeNull());

    const controller = controllerRef.current;
    if (controller?.ensureAdReady == null) throw new Error('ensureAdReady not provided');
    let readyPromise!: Promise<boolean>;
    act(() => {
      readyPromise = controller.ensureAdReady!();
    });
    // ensureAdReady joins the in-flight preload instead of repeating the
    // Platform policy request.
    act(() => { latestLoadRequest?.onError(new Error('no fill')); });

    await expect(readyPromise).resolves.toBe(false);
    expect(controllerRef.current?.isAdReady).toBe(false);
  });

  test('로그인 없이 광고를 표시하고 중복 완료 이벤트에도 한 번만 보상을 반환한다', async () => {
    const controllerRef: { current?: RewardedAdController } = {};
    render(<Harness onController={(value) => { controllerRef.current = value; }} />);
    await waitFor(() => expect(latestLoadRequest).not.toBeNull());
    act(() => { latestLoadRequest?.onEvent({ type: 'loaded' }); });
    await waitFor(() => expect(controllerRef.current?.isAdReady).toBe(true));

    let resultPromise!: Promise<RewardedAdShowResult>;
    act(() => {
      resultPromise = controllerRef.current!.showAd({
        type: 'wheelBonusAd',
        placement: 'wheel_bonus_spin',
      });
    });
    await waitFor(() => expect(mockShowFullScreenAd).toHaveBeenCalledTimes(1));
    act(() => {
      latestShowRequest?.onEvent({ type: 'userEarnedReward' });
      latestShowRequest?.onEvent({ type: 'userEarnedReward' });
      latestShowRequest?.onEvent({ type: 'dismissed' });
    });

    await expect(resultPromise).resolves.toEqual({ status: 'earned' });
    expect(controllerRef.current?.acknowledgeReward).toBeUndefined();
  });

  test('ensureAdReady resolves false when loading times out', async () => {
    jest.useFakeTimers();
    const controllerRef: { current?: RewardedAdController } = {};
    render(<Harness onController={(value) => { controllerRef.current = value; }} />);
    await flushSdkCallbacks();
    expect(latestLoadRequest).not.toBeNull();

    const controller = controllerRef.current;
    if (controller?.ensureAdReady == null) throw new Error('ensureAdReady not provided');
    let readyPromise!: Promise<boolean>;
    act(() => {
      readyPromise = controller.ensureAdReady!();
    });
    await flushSdkCallbacks();
    act(() => { jest.advanceTimersByTime(FULL_SCREEN_AD_LOAD_TIMEOUT_MS); });

    await expect(readyPromise).resolves.toBe(false);
    expect(controllerRef.current?.isAdReady).toBe(false);
  });

  test('ensureAdReady applies its own timeout while the default load remains in flight', async () => {
    jest.useFakeTimers();
    const controllerRef: { current?: RewardedAdController } = {};
    render(<Harness onController={(value) => { controllerRef.current = value; }} />);
    await flushSdkCallbacks();
    expect(latestLoadRequest).not.toBeNull();

    const controller = controllerRef.current;
    if (controller?.ensureAdReady == null) throw new Error('ensureAdReady not provided');
    let readyPromise!: Promise<boolean>;
    act(() => {
      readyPromise = controller.ensureAdReady!(250);
    });
    await flushSdkCallbacks();
    act(() => {
      jest.advanceTimersByTime(250);
    });

    await expect(readyPromise).resolves.toBe(false);
    expect(mockUnregisterLoad).not.toHaveBeenCalled();

    act(() => {
      latestLoadRequest?.onEvent({ type: 'loaded' });
    });
    await waitFor(() => {
      expect(controllerRef.current?.isAdReady).toBe(true);
    });
  });

  test('show timeout fails without a reward and reloads the next ad', async () => {
    jest.useFakeTimers();
    const controllerRef: { current?: RewardedAdController } = {};
    render(<Harness onController={(value) => { controllerRef.current = value; }} />);
    await flushSdkCallbacks();
    act(() => { latestLoadRequest?.onEvent({ type: 'loaded' }); });

    const controller = controllerRef.current;
    if (controller == null) throw new Error('controller not provided');
    let resultPromise!: Promise<RewardedAdShowResult>;
    act(() => {
      resultPromise = controller.showAd();
    });
    await flushSdkCallbacks();
    act(() => { jest.advanceTimersByTime(FULL_SCREEN_AD_SHOW_TIMEOUT_MS); });

    await expect(resultPromise).resolves.toEqual({ status: 'failed', error: 'show_timeout' });
    expect(mockTrack).toHaveBeenCalledWith('ad_load_result', expect.objectContaining({
      result: 'sdk_error', attempt_stage: 'show', reason: 'show_timeout',
    }));
    await flushSdkCallbacks();
    expect(mockLoadFullScreenAd).toHaveBeenCalledTimes(2);
  });

  test('show timeout preserves an earned reward when dismissed is missing', async () => {
    jest.useFakeTimers();
    const controllerRef: { current?: RewardedAdController } = {};
    render(<Harness onController={(value) => { controllerRef.current = value; }} />);
    await flushSdkCallbacks();
    act(() => { latestLoadRequest?.onEvent({ type: 'loaded' }); });

    const controller = controllerRef.current;
    if (controller == null) throw new Error('controller not provided');
    let resultPromise!: Promise<RewardedAdShowResult>;
    act(() => {
      resultPromise = controller.showAd();
    });
    await flushSdkCallbacks();
    act(() => {
      latestShowRequest?.onEvent({ type: 'userEarnedReward' });
      jest.advanceTimersByTime(FULL_SCREEN_AD_SHOW_TIMEOUT_MS);
    });

    await expect(resultPromise).resolves.toEqual({ status: 'earned' });
  });

  test('ignores late callbacks from a timed-out show after the next show starts', async () => {
    jest.useFakeTimers();
    const controllerRef: { current?: RewardedAdController } = {};
    render(<Harness onController={(value) => { controllerRef.current = value; }} />);
    await flushSdkCallbacks();
    act(() => {
      latestLoadRequest?.onEvent({ type: 'loaded' });
    });

    const controller = controllerRef.current;
    if (controller == null) throw new Error('controller not provided');

    let showA!: Promise<RewardedAdShowResult>;
    act(() => {
      showA = controller.showAd();
    });
    await flushSdkCallbacks();
    const requestA = mockShowFullScreenAd.mock.calls[0]?.[0] as FullScreenAdRequest | undefined;
    if (requestA == null) throw new Error('first show request not provided');

    act(() => {
      jest.advanceTimersByTime(FULL_SCREEN_AD_SHOW_TIMEOUT_MS);
    });
    await expect(showA).resolves.toEqual({ status: 'failed', error: 'show_timeout' });
    await flushSdkCallbacks();

    act(() => {
      latestLoadRequest?.onEvent({ type: 'loaded' });
    });
    let showBSettled = false;
    let showB!: Promise<RewardedAdShowResult>;
    act(() => {
      showB = controllerRef.current!.showAd();
      void showB.then(() => {
        showBSettled = true;
      });
    });
    await flushSdkCallbacks();
    const requestB = mockShowFullScreenAd.mock.calls[1]?.[0] as FullScreenAdRequest | undefined;
    if (requestB == null) throw new Error('second show request not provided');

    act(() => {
      requestA.onEvent({ type: 'userEarnedReward' });
      requestA.onEvent({ type: 'dismissed' });
      requestA.onError(new Error('late A error'));
    });
    await Promise.resolve();
    expect(showBSettled).toBe(false);

    act(() => {
      requestB.onEvent({ type: 'dismissed' });
    });
    await expect(showB).resolves.toEqual({ status: 'dismissed' });
  });
});
