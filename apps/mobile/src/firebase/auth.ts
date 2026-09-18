import { getAuth, getIdToken, signInAnonymously } from '@react-native-firebase/auth';

import { logDevWarning } from '../../../../packages/farm-core/src';
import { isFirebaseConfigured } from './app';
import { runWithNetworkPolicy } from './network';

// 익명 로그인은 Seorilabs Platform 세션의 자격증명이다. 클라우드 저장을 걷어낸
// 뒤에도 남는 이유가 여기 있다 — Platform 세션 없이는 보상형 광고의 정책 조회와
// claim 검증, analytics relay, IAP 경로가 모두 막힌다.
export type MobileAnonymousUser = {
  uid: string;
  isAnonymous: boolean;
};

let signInPromise: Promise<MobileAnonymousUser | null> | null = null;
let authFailureRecorded = false;

function normalizeUser(user: { uid: string; isAnonymous: boolean } | null | undefined): MobileAnonymousUser | null {
  if (user == null || user.uid.length === 0) {
    return null;
  }
  return {
    uid: user.uid,
    isAnonymous: user.isAnonymous,
  };
}

export async function ensureMobileAnonymousUser(): Promise<MobileAnonymousUser | null> {
  if (!isFirebaseConfigured()) {
    return null;
  }

  try {
    const auth = getAuth();
    const currentUser = normalizeUser(auth.currentUser);
    if (currentUser != null) {
      return currentUser;
    }

    // 익명 로그인은 클라우드 저장의 선행 단계라 무한 대기를 막아야 한다. 동일
    // 디바이스의 익명 로그인은 멱등하므로 타임아웃 후 제한적 재시도가 안전하다.
    signInPromise ??= runWithNetworkPolicy(() => signInAnonymously(auth), {
      label: 'auth:anonymous_sign_in',
      retries: 1,
    })
      .then((credential) => normalizeUser(credential.user))
      .catch((error: unknown) => {
        if (!authFailureRecorded) {
          authFailureRecorded = true;
          logDevWarning('[auth] anonymous sign-in failed', error);
        }
        return null;
      })
      .finally(() => {
        signInPromise = null;
      });

    return signInPromise;
  } catch (error) {
    if (!authFailureRecorded) {
      authFailureRecorded = true;
      logDevWarning('[auth] anonymous sign-in failed', error);
    }
    return null;
  }
}

/** Platform 세션 교환에만 쓰며 ID token 원문을 저장하거나 로그로 남기지 않는다. */
export async function getMobileFirebaseIdToken(): Promise<string | null> {
  const user = await ensureMobileAnonymousUser();
  if (user == null) {
    return null;
  }
  const currentUser = getAuth().currentUser;
  if (currentUser == null || currentUser.uid !== user.uid) {
    return null;
  }
  try {
    return await getIdToken(currentUser);
  } catch (error) {
    logDevWarning('[auth] id token failed', error);
    return null;
  }
}
