import { Platform } from 'react-native';

import { RELEASE_INFO } from '../../../../packages/farm-core/src';
import { getRemoteNumber, getRemoteString, MOBILE_REMOTE_CONFIG_DEFAULTS } from './remoteConfig';

// #428: 최소지원버전(강제 업데이트) 게이트의 순수 판정 로직. Remote Config에 선언만
// 되고 소비되지 않던 minimum_supported_version_code/force_update_url을 실제로 배선한다.
// AIT(WEB)는 서버 배포형이라 제외하고 모바일(Google Play/App Store)에만 적용한다.

export type UpdateGatePlatform = 'ios' | 'android';

// Remote Config 기본값(=미설정/fetch 실패 시 폴백값). 이 값 이하로는 절대 게이트를
// 발동시키지 않아 오차단(구버전이 아닌 유저까지 차단)을 구조적으로 막는다.
export const DEFAULT_MINIMUM_SUPPORTED_VERSION_CODE =
  MOBILE_REMOTE_CONFIG_DEFAULTS.minimum_supported_version_code;

// force_update_url 미설정 시 플랫폼별 스토어 폴백.
// - Android: 패키지명 기반 Google Play 정식 URL(결정적).
// - iOS: 숫자 App Store ID가 repo에 없어 정식 딥링크를 구성할 수 없다. 운영자는 iOS의
//   경우 반드시 Remote Config force_update_url을 설정해야 하며(docs/firebase-mobile.md),
//   미설정 시 App Store 앱을 여는 최후 폴백만 제공한다.
export const STORE_FALLBACK_URLS: Record<UpdateGatePlatform, string> = {
  android: 'https://play.google.com/store/apps/details?id=com.seorilabs.happyfarm',
  ios: 'itms-apps://apps.apple.com/',
};

/**
 * 설치된 빌드가 최소지원버전 미만이라 강제 업데이트 안내를 노출해야 하는지 판정한다.
 *
 * 오차단 방지 가드(#428 AC-3):
 * - minimumSupportedVersionCode가 기본값(1) 이하이면(미설정/fetch 실패 폴백 포함) 절대
 *   발동하지 않는다.
 * - buildNumber가 유효한 양의 정수가 아니면(예: 미버전 로컬 빌드의 0) 발동하지 않는다.
 * 위 가드를 모두 통과하고 buildNumber < minimum일 때만 true.
 */
export function shouldPromptForceUpdate(params: {
  buildNumber: number;
  minimumSupportedVersionCode: number;
}): boolean {
  const { buildNumber, minimumSupportedVersionCode } = params;

  if (!Number.isInteger(minimumSupportedVersionCode)) {
    return false;
  }
  // 기본값(1) 이하: 미설정으로 간주해 절대 차단하지 않는다.
  if (minimumSupportedVersionCode <= DEFAULT_MINIMUM_SUPPORTED_VERSION_CODE) {
    return false;
  }
  // 유효한 릴리스 빌드만 대상으로 한다(로컬/미버전 빌드의 0·음수·비정수 제외).
  if (!Number.isInteger(buildNumber) || buildNumber <= 0) {
    return false;
  }
  return buildNumber < minimumSupportedVersionCode;
}

// 업데이트 안내의 스토어 링크를 결정한다. force_update_url(운영자 설정)이 우선이고,
// 비어 있으면 플랫폼별 스토어 폴백을 사용한다.
export function resolveUpdateStoreUrl(forceUpdateUrl: string, platform: UpdateGatePlatform): string {
  const trimmed = forceUpdateUrl.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  return STORE_FALLBACK_URLS[platform];
}

function currentPlatform(): UpdateGatePlatform {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

export type ForceUpdateGateEvaluation = {
  shouldPrompt: boolean;
  storeUrl: string;
  platform: UpdateGatePlatform;
  buildNumber: number;
  minimumSupportedVersionCode: number;
};

// 현재 Remote Config 값과 RELEASE_INFO.buildNumber를 읽어 게이트를 평가한다.
// getRemoteNumber/getRemoteString은 fetch 실패·미설정 시 기본값(1/'')을 반환하므로,
// 그 경우 shouldPromptForceUpdate가 false가 되어 게이트가 발동하지 않는다.
export function evaluateForceUpdateGate(): ForceUpdateGateEvaluation {
  const platform = currentPlatform();
  const minimumSupportedVersionCode = getRemoteNumber('minimum_supported_version_code');
  const buildNumber = RELEASE_INFO.buildNumber;
  const shouldPrompt = shouldPromptForceUpdate({ buildNumber, minimumSupportedVersionCode });
  const storeUrl = resolveUpdateStoreUrl(getRemoteString('force_update_url'), platform);

  return { shouldPrompt, storeUrl, platform, buildNumber, minimumSupportedVersionCode };
}
