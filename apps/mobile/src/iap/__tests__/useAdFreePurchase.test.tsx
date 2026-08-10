/// <reference types="jest" />

import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import type { FarmAdFreePurchase } from '../../../../../packages/farm-ui/src';

const mockFetchProducts = jest.fn(() => Promise.resolve());
const mockRequestPurchase = jest.fn(() => Promise.resolve());
const mockFinishTransaction = jest.fn(() => Promise.resolve());
const mockGetAvailablePurchases = jest.fn(() => Promise.resolve([]));
let mockPurchaseSuccess: ((purchase: Record<string, unknown>) => void) | undefined;

jest.mock('react-native-iap', () => ({
  useIAP: jest.fn((options: { onPurchaseSuccess: (purchase: Record<string, unknown>) => void }) => {
    mockPurchaseSuccess = options.onPurchaseSuccess;
    return {
      connected: true,
      products: [{ id: 'ad_free', displayPrice: '₩3,900' }],
      availablePurchases: [],
      fetchProducts: mockFetchProducts,
      requestPurchase: mockRequestPurchase,
      finishTransaction: mockFinishTransaction,
      getAvailablePurchases: mockGetAvailablePurchases,
    };
  }),
}));

const mockEnsureMobilePlatformSession = jest.fn(() => Promise.resolve(true));
const mockListEntitlements = jest.fn(() => Promise.resolve([]));
const mockVerifyPurchase = jest.fn(() => Promise.resolve({
  status: 'active',
  entitlements: ['ad_free'],
}));
const mockAccountReferences = jest.fn(() => Promise.resolve({
  googlePlayObfuscatedAccountId: 'google-account-ref',
  appStoreAppAccountToken: '00000000-0000-4000-8000-000000000001',
}));

jest.mock('../../platformEvents', () => ({
  ensureMobilePlatformSession: mockEnsureMobilePlatformSession,
  mobilePlatformIap: {
    listEntitlements: mockListEntitlements,
    verifyPurchase: mockVerifyPurchase,
    accountReferences: mockAccountReferences,
  },
}));

const { useAdFreePurchase } = jest.requireActual<typeof import('../useAdFreePurchase')>(
  '../useAdFreePurchase'
);

function Harness({ onValue }: { onValue: (value: FarmAdFreePurchase) => void }) {
  onValue(useAdFreePurchase());
  return null;
}

describe('useAdFreePurchase', () => {
  beforeEach(() => {
    mockPurchaseSuccess = undefined;
    mockFetchProducts.mockClear();
    mockRequestPurchase.mockClear();
    mockFinishTransaction.mockClear();
    mockGetAvailablePurchases.mockClear();
    mockEnsureMobilePlatformSession.mockClear();
    mockListEntitlements.mockClear();
    mockVerifyPurchase.mockClear();
    mockAccountReferences.mockClear();
  });

  afterEach(cleanup);

  test('Platform 검증 뒤 non-consumable transaction을 종료한다', async () => {
    const nativeProductId = Platform.OS === 'ios'
      ? 'com.seorilabs.happyfarm.premium.ad_free'
      : 'ad_free';
    const nativePlatform = Platform.OS === 'ios' ? 'app_store' : 'google_play';
    const current: { value?: FarmAdFreePurchase } = {};
    render(<Harness onValue={(value) => { current.value = value; }} />);
    await waitFor(() => expect(current.value?.status).toBe('ready'));

    await act(async () => {
      mockPurchaseSuccess?.({
        id: 'purchase-1',
        productId: nativeProductId,
        purchaseToken: 'test-purchase-token',
        transactionId: 'test-purchase-token',
      });
    });
    await waitFor(() => expect(current.value?.status).toBe('active'));

    expect(mockVerifyPurchase).toHaveBeenCalledWith({
      platform: nativePlatform,
      productId: nativeProductId,
      token: 'test-purchase-token',
    });
    expect(mockFinishTransaction).toHaveBeenCalledWith({
      purchase: expect.objectContaining({ id: 'purchase-1', productId: nativeProductId }),
      isConsumable: false,
    });
    expect(mockVerifyPurchase.mock.invocationCallOrder[0]).toBeLessThan(
      mockFinishTransaction.mock.invocationCallOrder[0]!
    );
  });

  test('구매 요청에 앱 범위 상품과 Platform account reference를 전달한다', async () => {
    const current: { value?: FarmAdFreePurchase } = {};
    render(<Harness onValue={(value) => { current.value = value; }} />);
    await waitFor(() => expect(current.value?.status).toBe('ready'));

    await act(async () => {
      await current.value?.purchase();
    });

    expect(mockRequestPurchase).toHaveBeenCalledWith({
      request: {
        apple: {
          sku: 'com.seorilabs.happyfarm.premium.ad_free',
          appAccountToken: '00000000-0000-4000-8000-000000000001',
        },
        google: {
          skus: ['ad_free'],
          obfuscatedAccountId: 'google-account-ref',
        },
      },
      type: 'in-app',
    });
  });
});
