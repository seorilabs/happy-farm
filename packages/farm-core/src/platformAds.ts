import type { RewardedAdPlacement } from './ads';

export type PlatformAdProvider = 'admob' | 'apps_in_toss';
export type PlatformAdClientPlatform = 'android' | 'ios' | 'apps_in_toss';
export type PlatformAdClaimState = 'accepted' | 'confirmed' | 'delivered' | 'expired';
export type PlatformAdAssurance = 'pending' | 'server_verified' | 'client_confirmed';

export type PlatformAdsPolicy = {
  appUsesAds: boolean;
  adsEnabled: boolean;
  disabledBy: Array<'operator' | 'ad_free'>;
  checkedAt: string;
};

export type PlatformAdClaim = {
  claimId: string;
  appId: string;
  placement: RewardedAdPlacement;
  provider: PlatformAdProvider;
  clientPlatform: PlatformAdClientPlatform;
  reward: { key: string; amount: number };
  state: PlatformAdClaimState;
  assurance: PlatformAdAssurance;
  createdAt: string;
  confirmedAt?: string;
  acknowledgedAt?: string;
  expiresAt: string;
  admobSsv?: { customData: string; userId: string };
};

type FetchLike = (input: string, init?: RequestInit) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export class PlatformAdsClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'PlatformAdsClientError';
  }
}

export type PlatformAdsClientOptions = {
  baseUrl: string;
  appId: string;
  getToken: () => Promise<string>;
  fetch?: FetchLike;
  /**
   * 개발 빌드면 true다. 조합 지점이 빌드 플래그(Metro `__DEV__`)를 명시적으로 넘긴다.
   * Platform은 `X-Seori-Build: debug` 요청을 정상 처리하되 운영 알림과 지표에서 제외한다.
   * 마켓 출시 빌드는 이 헤더를 보내면 안 되므로 버전 문자열 같은 추정 신호로 정하지 않는다.
   */
  debugBuild: boolean;
};

/**
 * Happy Farm의 두 광고 SDK가 공유하는 Platform Ads 포트다.
 * 구매 토큰과 provider callback 원문은 이 객체에 보관하지 않는다.
 */
export class PlatformAdsClient {
  private readonly baseUrl: string;
  private readonly appId: string;
  private readonly getToken: () => Promise<string>;
  private readonly fetcher: FetchLike;
  private readonly debugBuild: boolean;

  constructor(options: PlatformAdsClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.appId = options.appId;
    this.getToken = options.getToken;
    this.fetcher = options.fetch ?? (globalThis.fetch as FetchLike);
    this.debugBuild = options.debugBuild;
  }

  policy(): Promise<PlatformAdsPolicy> {
    return this.request('/v1/ads/policy', { method: 'GET' });
  }

  createClaim(input: {
    requestId: string;
    placement: RewardedAdPlacement;
    provider: PlatformAdProvider;
    clientPlatform: PlatformAdClientPlatform;
  }): Promise<PlatformAdClaim> {
    return this.request('/v1/ads/reward-claims', {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        reward: { key: input.placement, amount: 1 },
      }),
    });
  }

  claim(claimId: string): Promise<PlatformAdClaim> {
    return this.request(`/v1/ads/reward-claims/${encodeURIComponent(claimId)}`, { method: 'GET' });
  }

  confirm(claimId: string, transactionId: string): Promise<PlatformAdClaim> {
    return this.request(`/v1/ads/reward-claims/${encodeURIComponent(claimId)}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ transactionId }),
    });
  }

  ack(claimId: string): Promise<PlatformAdClaim> {
    return this.request(`/v1/ads/reward-claims/${encodeURIComponent(claimId)}/ack`, {
      method: 'POST',
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const token = await this.getToken();
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Seori-App': this.appId,
        ...(this.debugBuild ? { 'X-Seori-Build': 'debug' } : {}),
      },
    });
    let envelope: unknown;
    try {
      envelope = await response.json();
    } catch {
      throw new PlatformAdsClientError('response_invalid', 'Invalid Platform Ads response.', response.status);
    }
    if (typeof envelope !== 'object' || envelope == null || Array.isArray(envelope)) {
      throw new PlatformAdsClientError('response_invalid', 'Invalid Platform Ads response.', response.status);
    }
    const body = envelope as { ok?: unknown; result?: unknown; error?: { code?: unknown; message?: unknown } };
    if (!response.ok || body.ok !== true) {
      throw new PlatformAdsClientError(
        typeof body.error?.code === 'string' ? body.error.code : 'platform_unavailable',
        'Platform Ads request failed.',
        response.status
      );
    }
    return body.result as T;
  }
}
