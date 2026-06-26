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
import { runWithNetworkPolicy } from './network';
import { getRemoteBoolean } from './remoteConfig';

const CLOUD_SAVE_ENABLED_KEY = 'cloud_save_backup_enabled';

// Firestore 호출은 게임 로딩(클라우드 복원)을 막을 수 있으므로 타임아웃·재시도를
// 건다. 모든 경로는 고정 문서('current')에 대한 멱등 연산이라 재시도가 안전하다.
// 타임아웃/최종 실패 에러는 cloudBackupCore의 try/catch로 전파되어 Crashlytics에
// 일관되게 기록된다.
const firestoreCloudSaveStore: CloudSaveStore = {
  async readCurrentSave(uid: string) {
    return runWithNetworkPolicy(
      async () => {
        const snapshot = await getDoc(doc(getFirestore(), 'users', uid, 'saves', 'current'));
        if (!snapshot.exists()) {
          return null;
        }
        return snapshot.data() as CloudSaveDocument;
      },
      { label: 'firestore:read_current_save' }
    );
  },

  async writeCurrentSave(uid: string, document: CloudSaveDocument) {
    await runWithNetworkPolicy(
      () =>
        setDoc(
          doc(getFirestore(), 'users', uid, 'saves', 'current'),
          {
            ...document,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ),
      { label: 'firestore:write_current_save' }
    );
  },

  async deleteCurrentSave(uid: string) {
    await runWithNetworkPolicy(() => deleteDoc(doc(getFirestore(), 'users', uid, 'saves', 'current')), {
      label: 'firestore:delete_current_save',
    });
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
