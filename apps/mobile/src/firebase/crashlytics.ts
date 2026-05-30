import { getCrashlytics, log, recordError } from '@react-native-firebase/crashlytics';

import { isFirebaseConfigured } from './app';

export function logCrashlyticsMessage(message: string) {
  if (!isFirebaseConfigured()) {
    return;
  }

  try {
    log(getCrashlytics(), message);
  } catch {
    // Firebase config can be absent in local/CI builds before app credentials are added.
  }
}

export function recordNonFatalError(error: unknown, context: string) {
  if (!isFirebaseConfigured()) {
    return;
  }

  const normalizedError = error instanceof Error ? error : new Error(String(error));

  try {
    recordError(getCrashlytics(), normalizedError, context);
  } catch {
    // Never let telemetry failures affect gameplay.
  }
}

export function recordCrashlyticsSmokeTest() {
  if (!isFirebaseConfigured()) {
    return;
  }

  try {
    const crashlytics = getCrashlytics();
    log(crashlytics, 'Happy Farm Crashlytics smoke test');
    recordError(crashlytics, new Error('Happy Farm Crashlytics smoke test'), 'crashlytics:smoke_test');
  } catch {
    // Smoke test reporting must not affect app startup or gameplay.
  }
}
