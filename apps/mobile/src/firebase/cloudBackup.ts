import {
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from '@react-native-firebase/firestore';

import { RELEASE_INFO } from '../../../../packages/farm-core/src';

import { ensureMobileAnonymousUser } from './auth';
import { isFirebaseConfigured } from './app';
import { recordNonFatalError } from './crashlytics';
import {
  createMobileCloudSaveBackup,
  type CloudSaveDocument,
  type CloudSaveStore,
} from './cloudBackupCore';
import { getRemoteBoolean } from './remoteConfig';

const CLOUD_SAVE_ENABLED_KEY = 'cloud_save_backup_enabled';

const firestoreCloudSaveStore: CloudSaveStore = {
  async readCurrentSave(uid: string) {
    const snapshot = await getDoc(doc(getFirestore(), 'users', uid, 'saves', 'current'));
    if (!snapshot.exists()) {
      return null;
    }
    return snapshot.data() as CloudSaveDocument;
  },

  async writeCurrentSave(uid: string, document: CloudSaveDocument) {
    await setDoc(
      doc(getFirestore(), 'users', uid, 'saves', 'current'),
      {
        ...document,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  },

  async deleteCurrentSave(uid: string) {
    await deleteDoc(doc(getFirestore(), 'users', uid, 'saves', 'current'));
  },
};

export function createDefaultMobileCloudSaveBackup(storage: Parameters<typeof createMobileCloudSaveBackup>[0]['storage']) {
  return createMobileCloudSaveBackup({
    storage,
    isEnabled: () => isFirebaseConfigured() && getRemoteBoolean(CLOUD_SAVE_ENABLED_KEY),
    canDelete: isFirebaseConfigured,
    ensureUser: ensureMobileAnonymousUser,
    store: firestoreCloudSaveStore,
    appVersion: RELEASE_INFO.versionName,
    recordError: recordNonFatalError,
  });
}
