import { getAuth, signInAnonymously } from '@react-native-firebase/auth';

import { isFirebaseConfigured } from './app';
import { recordNonFatalError } from './crashlytics';

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

    signInPromise ??= signInAnonymously(auth)
      .then((credential) => normalizeUser(credential.user))
      .catch((error: unknown) => {
        if (!authFailureRecorded) {
          authFailureRecorded = true;
          recordNonFatalError(error, 'auth:anonymous_sign_in');
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
      recordNonFatalError(error, 'auth:anonymous_sign_in');
    }
    return null;
  }
}
