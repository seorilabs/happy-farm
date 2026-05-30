import { getApps } from '@react-native-firebase/app';

export function isFirebaseConfigured() {
  try {
    return getApps().length > 0;
  } catch {
    return false;
  }
}
