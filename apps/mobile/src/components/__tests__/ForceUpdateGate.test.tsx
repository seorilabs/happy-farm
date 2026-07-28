import React from 'react';
import { Linking } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { mobileFarmAnalytics } from '../../firebase';
import type { ForceUpdateGateEvaluation } from '../../firebase/updateGate';
import { ForceUpdateGate } from '../ForceUpdateGate';

// #428: 강제 업데이트 게이트 UI + 계측(update_gate_shown / update_gate_store_click) 검증.
// 네이티브 의존을 끊기 위해 firebase 인덱스/crashlytics/updateGate 모듈을 목으로 대체하고,
// 게이트 평가는 prop으로 주입해 결정적으로 제어한다.
jest.mock('../../firebase', () => ({
  mobileFarmAnalytics: {
    trackUpdateGateShown: jest.fn(),
    trackUpdateGateStoreClick: jest.fn(),
  },
}));
jest.mock('../../firebase/crashlytics', () => ({ recordNonFatalError: jest.fn() }));
jest.mock('../../firebase/updateGate', () => ({ evaluateForceUpdateGate: jest.fn() }));

const trackShown = jest.mocked(mobileFarmAnalytics.trackUpdateGateShown);
const trackStoreClick = jest.mocked(mobileFarmAnalytics.trackUpdateGateStoreClick);

const gatedEvaluation: ForceUpdateGateEvaluation = {
  shouldPrompt: true,
  storeUrl: 'https://store.example/app',
  platform: 'android',
  buildNumber: 42,
  minimumSupportedVersionCode: 50,
};

function findByTestId(renderer: ReactTestRenderer.ReactTestRenderer, testID: string) {
  return renderer.root.findAll((node) => node.props?.testID === testID);
}

describe('ForceUpdateGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('게이트 발동 시 안내 카드를 렌더하고 update_gate_shown을 정확히 1회 계측한다', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ForceUpdateGate remoteConfigReady evaluate={() => gatedEvaluation} />
      );
      await Promise.resolve();
    });

    // Modal은 react-test-renderer에서 자식을 중첩 렌더해 testID가 2회 나타난다(호스트 quirk).
    // 존재 여부만 확인한다.
    expect(findByTestId(renderer!, 'force-update-card').length).toBeGreaterThanOrEqual(1);
    expect(trackShown).toHaveBeenCalledTimes(1);
    expect(trackShown).toHaveBeenCalledWith({
      buildNumber: 42,
      minimumSupportedVersionCode: 50,
      platform: 'android',
    });

    // 재렌더돼도 shown은 다시 발화하지 않는다(세션 1회 가드).
    await ReactTestRenderer.act(async () => {
      renderer!.update(<ForceUpdateGate remoteConfigReady evaluate={() => gatedEvaluation} />);
      await Promise.resolve();
    });
    expect(trackShown).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
  });

  it('스토어 버튼을 누르면 update_gate_store_click 계측 + 스토어 URL을 연다', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ForceUpdateGate remoteConfigReady evaluate={() => gatedEvaluation} />
      );
      await Promise.resolve();
    });

    const [button] = findByTestId(renderer!, 'force-update-store-button');
    await ReactTestRenderer.act(async () => {
      button!.props.onPress();
      await Promise.resolve();
    });

    expect(trackStoreClick).toHaveBeenCalledWith({
      buildNumber: 42,
      minimumSupportedVersionCode: 50,
      platform: 'android',
    });
    expect(openURL).toHaveBeenCalledWith('https://store.example/app');

    openURL.mockRestore();
    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
  });

  it('Remote Config 준비 전에는 아무것도 렌더/계측하지 않는다', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ForceUpdateGate remoteConfigReady={false} evaluate={() => gatedEvaluation} />
      );
      await Promise.resolve();
    });

    expect(findByTestId(renderer!, 'force-update-card')).toHaveLength(0);
    expect(trackShown).not.toHaveBeenCalled();

    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
  });

  it('게이트가 발동하지 않으면(shouldPrompt=false) 렌더/계측하지 않는다', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ForceUpdateGate remoteConfigReady evaluate={() => ({ ...gatedEvaluation, shouldPrompt: false })} />
      );
      await Promise.resolve();
    });

    expect(findByTestId(renderer!, 'force-update-card')).toHaveLength(0);
    expect(trackShown).not.toHaveBeenCalled();

    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
  });
});
