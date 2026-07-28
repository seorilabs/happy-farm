import { Platform } from 'react-native';

import { getRemoteNumber, getRemoteString } from '../remoteConfig';
import {
  DEFAULT_MINIMUM_SUPPORTED_VERSION_CODE,
  evaluateForceUpdateGate,
  resolveUpdateStoreUrl,
  shouldPromptForceUpdate,
  STORE_FALLBACK_URLS,
} from '../updateGate';

// #428: updateGate 순수 판정/스토어 URL/평가 로직의 회귀 테스트.
// RELEASE_INFO는 레포에서 buildNumber 0이므로, evaluate의 "발동" 경로를 검증하려면
// farm-core 모듈을 목으로 대체해 buildNumber를 고정한다.
jest.mock('../../../../../packages/farm-core/src', () => ({
  RELEASE_INFO: { buildNumber: 42 },
}));
jest.mock('../remoteConfig', () => ({
  getRemoteNumber: jest.fn(),
  getRemoteString: jest.fn(() => ''),
  MOBILE_REMOTE_CONFIG_DEFAULTS: { minimum_supported_version_code: 1, force_update_url: '' },
}));

const mockedGetRemoteNumber = jest.mocked(getRemoteNumber);
const mockedGetRemoteString = jest.mocked(getRemoteString);

describe('shouldPromptForceUpdate — AC-1 (구버전 차단) / AC-3 (오차단 방지)', () => {
  it('AC-1: 최소버전이 기본값보다 크고 설치 빌드가 그 미만이면 발동한다', () => {
    expect(shouldPromptForceUpdate({ buildNumber: 42, minimumSupportedVersionCode: 50 })).toBe(true);
  });

  it('AC-3: 최소버전이 기본값(1) 이하이면(미설정/fetch 실패 폴백) 절대 발동하지 않는다', () => {
    expect(DEFAULT_MINIMUM_SUPPORTED_VERSION_CODE).toBe(1);
    expect(shouldPromptForceUpdate({ buildNumber: 42, minimumSupportedVersionCode: 1 })).toBe(false);
    expect(shouldPromptForceUpdate({ buildNumber: 42, minimumSupportedVersionCode: 0 })).toBe(false);
    // 빌드가 최소버전보다 낮아도 최소버전 자체가 기본값이면 발동 금지.
    expect(shouldPromptForceUpdate({ buildNumber: 1, minimumSupportedVersionCode: 1 })).toBe(false);
  });

  it('AC-3: buildNumber가 유효한 양의 정수가 아니면(로컬/미버전 0 등) 발동하지 않는다', () => {
    expect(shouldPromptForceUpdate({ buildNumber: 0, minimumSupportedVersionCode: 50 })).toBe(false);
    expect(shouldPromptForceUpdate({ buildNumber: -5, minimumSupportedVersionCode: 50 })).toBe(false);
    expect(shouldPromptForceUpdate({ buildNumber: 1.5, minimumSupportedVersionCode: 50 })).toBe(false);
    expect(shouldPromptForceUpdate({ buildNumber: Number.NaN, minimumSupportedVersionCode: 50 })).toBe(false);
  });

  it('최소버전이 비정수면 발동하지 않는다', () => {
    expect(shouldPromptForceUpdate({ buildNumber: 42, minimumSupportedVersionCode: 50.5 })).toBe(false);
    expect(shouldPromptForceUpdate({ buildNumber: 42, minimumSupportedVersionCode: Number.NaN })).toBe(false);
  });

  it('설치 빌드가 최소버전 이상이면(최신) 발동하지 않는다', () => {
    expect(shouldPromptForceUpdate({ buildNumber: 50, minimumSupportedVersionCode: 50 })).toBe(false);
    expect(shouldPromptForceUpdate({ buildNumber: 51, minimumSupportedVersionCode: 50 })).toBe(false);
  });
});

describe('resolveUpdateStoreUrl — AC-2 (force_update_url 우선 + 플랫폼 폴백)', () => {
  it('force_update_url이 설정돼 있으면 그것을 우선 사용한다', () => {
    expect(resolveUpdateStoreUrl('https://example.com/app', 'android')).toBe('https://example.com/app');
    expect(resolveUpdateStoreUrl('  https://example.com/app  ', 'ios')).toBe('https://example.com/app');
  });

  it('force_update_url이 비어 있으면 플랫폼별 스토어 폴백을 사용한다', () => {
    expect(resolveUpdateStoreUrl('', 'android')).toBe(STORE_FALLBACK_URLS.android);
    expect(resolveUpdateStoreUrl('   ', 'ios')).toBe(STORE_FALLBACK_URLS.ios);
    expect(STORE_FALLBACK_URLS.android).toContain('com.seorilabs.happyfarm');
  });
});

describe('evaluateForceUpdateGate — Remote Config 배선', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetRemoteString.mockReturnValue('');
  });

  const expectedPlatform = Platform.OS === 'ios' ? 'ios' : 'android';

  it('활성화된 최소버전이 빌드보다 높으면 발동하고 스토어 URL을 해석한다', () => {
    mockedGetRemoteNumber.mockReturnValue(50);
    mockedGetRemoteString.mockReturnValue('https://store.example/app');

    const result = evaluateForceUpdateGate();

    expect(result.shouldPrompt).toBe(true);
    expect(result.buildNumber).toBe(42);
    expect(result.minimumSupportedVersionCode).toBe(50);
    expect(result.platform).toBe(expectedPlatform);
    expect(result.storeUrl).toBe('https://store.example/app');
  });

  it('최소버전이 기본값(1)이면(미설정/fetch 실패) 발동하지 않는다', () => {
    mockedGetRemoteNumber.mockReturnValue(1);

    const result = evaluateForceUpdateGate();

    expect(result.shouldPrompt).toBe(false);
    expect(result.storeUrl).toBe(STORE_FALLBACK_URLS[expectedPlatform]);
  });

  it('빌드가 최소버전 이상이면 발동하지 않는다', () => {
    mockedGetRemoteNumber.mockReturnValue(40);

    expect(evaluateForceUpdateGate().shouldPrompt).toBe(false);
  });
});
