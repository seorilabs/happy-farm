import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useIAP, type Purchase } from 'react-native-iap';

import type { FarmAdFreePurchase } from '../../../../packages/farm-ui/src';
import { ensureMobilePlatformSession, mobilePlatformIap } from '../platformEvents';

export const AD_FREE_ENTITLEMENT_ID = 'ad_free';
export const AD_FREE_PRODUCT_IDS = {
  android: 'ad_free',
  ios: 'com.seorilabs.happyfarm.premium.ad_free',
} as const;
export const AD_FREE_BASE_PRICE_KRW = 3_900;

const productId = Platform.OS === 'ios' ? AD_FREE_PRODUCT_IDS.ios : AD_FREE_PRODUCT_IDS.android;

function proofToken(purchase: Purchase): string | null {
  if (Platform.OS === 'ios') {
    return 'transactionId' in purchase && typeof purchase.transactionId === 'string'
      ? purchase.transactionId
      : null;
  }
  return typeof purchase.purchaseToken === 'string' ? purchase.purchaseToken : null;
}

export function useAdFreePurchase(): FarmAdFreePurchase {
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<FarmAdFreePurchase['status']>('loading');
  const processing = useRef<Set<string>>(new Set());
  const processPurchaseRef = useRef<(purchase: Purchase) => Promise<void>>(async () => undefined);

  const {
    connected,
    products,
    availablePurchases,
    fetchProducts,
    requestPurchase,
    finishTransaction,
    getAvailablePurchases,
  } = useIAP({
    onPurchaseSuccess: (purchase) => void processPurchaseRef.current(purchase),
    onPurchaseError: () => setStatus('failed'),
    onError: () => setStatus('failed'),
  });

  const refreshEntitlement = useCallback(async () => {
    if (!(await ensureMobilePlatformSession())) {
      setActive(false);
      setStatus('unavailable');
      return false;
    }
    const entitlements = await mobilePlatformIap.listEntitlements();
    const isActive = entitlements.includes(AD_FREE_ENTITLEMENT_ID);
    setActive(isActive);
    setStatus(isActive ? 'active' : 'ready');
    return isActive;
  }, []);

  processPurchaseRef.current = async (purchase) => {
    if (purchase.productId !== productId) return;
    const token = proofToken(purchase);
    const key = `${purchase.productId}:${purchase.id}`;
    if (token == null || processing.current.has(key)) {
      if (token == null) setStatus('failed');
      return;
    }
    processing.current.add(key);
    setStatus('verifying');
    try {
      if (!(await ensureMobilePlatformSession())) throw new Error('platform session unavailable');
      const outcome = await mobilePlatformIap.verifyPurchase({
        platform: Platform.OS === 'ios' ? 'app_store' : 'google_play',
        productId: purchase.productId,
        token,
      });
      if (!outcome.entitlements.includes(AD_FREE_ENTITLEMENT_ID) || outcome.status === 'revoked') {
        throw new Error('ad_free entitlement not active');
      }
      // 불변식 7: Platform 검증과 원장 지급이 끝난 뒤에만 native transaction을 끝낸다.
      await finishTransaction({ purchase, isConsumable: false });
      setActive(true);
      setStatus('active');
    } catch {
      setStatus('failed');
    } finally {
      processing.current.delete(key);
    }
  };

  useEffect(() => {
    void refreshEntitlement().catch(() => {
      setActive(false);
      setStatus('unavailable');
    });
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void refreshEntitlement().catch(() => setStatus('unavailable'));
      }
    });
    return () => subscription.remove();
  }, [refreshEntitlement]);

  useEffect(() => {
    if (!connected) return;
    void fetchProducts({ skus: [productId], type: 'in-app' }).catch(() => setStatus('failed'));
  }, [connected, fetchProducts]);

  useEffect(() => {
    for (const purchase of availablePurchases) {
      void processPurchaseRef.current(purchase);
    }
  }, [availablePurchases]);

  const purchase = useCallback(async () => {
    if (!connected || active) return;
    setStatus('purchasing');
    try {
      if (!(await ensureMobilePlatformSession())) throw new Error('platform session unavailable');
      const references = await mobilePlatformIap.accountReferences();
      await requestPurchase({
        request: {
          apple: { sku: AD_FREE_PRODUCT_IDS.ios, appAccountToken: references.appStoreAppAccountToken },
          google: { skus: [AD_FREE_PRODUCT_IDS.android], obfuscatedAccountId: references.googlePlayObfuscatedAccountId },
        },
        type: 'in-app',
      });
    } catch {
      setStatus('failed');
    }
  }, [active, connected, requestPurchase]);

  const restore = useCallback(async () => {
    setStatus('restoring');
    try {
      if (!(await ensureMobilePlatformSession())) throw new Error('platform session unavailable');
      await getAvailablePurchases([productId]);
      await refreshEntitlement();
    } catch {
      setStatus('failed');
    }
  }, [getAvailablePurchases, refreshEntitlement]);

  const storeProduct = products.find((candidate) => candidate.id === productId);
  return {
    isSupported: true,
    active,
    status,
    displayPrice: storeProduct?.displayPrice ?? `₩${AD_FREE_BASE_PRICE_KRW.toLocaleString('ko-KR')}`,
    purchase,
    restore,
  };
}
