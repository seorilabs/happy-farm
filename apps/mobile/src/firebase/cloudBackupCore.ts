import { SAVE_KEY, type GameState } from '../../../../packages/farm-core/src';
import type { KeyValueStorage } from '../../../../packages/farm-ui/src';

export const CLOUD_SAVE_SCHEMA_VERSION = 'happy-farm-save-v1';
export const CLOUD_SAVE_BACKUP_DEBOUNCE_MS = 5_000;
export const CLOUD_SAVE_MAX_PAYLOAD_BYTES = 900_000;

const CLOUD_SAVE_DEVICE_ID_KEY = `${SAVE_KEY}.cloudDeviceId`;
const CLOUD_SAVE_REVISION_KEY = `${SAVE_KEY}.cloudRevision`;

type TimerHandle = ReturnType<typeof setTimeout>;

export type CloudSaveUser = {
  uid: string;
};

export type CloudSaveDocument = {
  schemaVersion: typeof CLOUD_SAVE_SCHEMA_VERSION;
  payloadJson: string;
  payloadBytes: number;
  saveHash: string;
  clientRevision: number;
  clientUpdatedAtMs: number;
  deviceId: string;
  appVersion: string;
  platform: 'mobile';
};

export type CloudSaveStore = {
  readCurrentSave(uid: string): Promise<CloudSaveDocument | null>;
  writeCurrentSave(uid: string, document: CloudSaveDocument): Promise<void>;
  deleteCurrentSave(uid: string): Promise<void>;
};

export type CloudSaveBackupDependencies = {
  storage: KeyValueStorage;
  isEnabled: () => boolean;
  canDelete?: () => boolean;
  ensureUser: () => Promise<CloudSaveUser | null>;
  store: CloudSaveStore;
  appVersion: string;
  now?: () => number;
  random?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
  recordError?: (error: unknown, context: string) => void;
};

export type CloudSaveRestoreResult =
  | { status: 'disabled' | 'local_exists' | 'signed_out' | 'missing' | 'invalid' | 'error' }
  | { status: 'restored'; clientRevision: number };

function getNow(dependencies: CloudSaveBackupDependencies) {
  return dependencies.now?.() ?? Date.now();
}

function getRandom(dependencies: CloudSaveBackupDependencies) {
  return dependencies.random?.() ?? Math.random();
}

function getUtf8ByteLength(value: string) {
  let bytes = 0;

  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);
    if (codePoint < 0x80) {
      bytes += 1;
    } else if (codePoint < 0x800) {
      bytes += 2;
    } else if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }

  return bytes;
}

function hashString(value: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizePositiveNumber(value: string | null) {
  if (value == null) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

async function getOrCreateDeviceId(dependencies: CloudSaveBackupDependencies) {
  const existing = await dependencies.storage.getItem(CLOUD_SAVE_DEVICE_ID_KEY);
  if (existing != null && existing.length > 0) {
    return existing;
  }

  const randomPart = Math.floor(getRandom(dependencies) * 0xffffffff)
    .toString(36)
    .padStart(7, '0');
  const deviceId = `mobile-${getNow(dependencies).toString(36)}-${randomPart}`;
  await dependencies.storage.setItem(CLOUD_SAVE_DEVICE_ID_KEY, deviceId);
  return deviceId;
}

async function nextClientRevision(dependencies: CloudSaveBackupDependencies) {
  const current = normalizePositiveNumber(await dependencies.storage.getItem(CLOUD_SAVE_REVISION_KEY));
  const next = current + 1;
  await dependencies.storage.setItem(CLOUD_SAVE_REVISION_KEY, String(next));
  return next;
}

function isCloudSaveDocument(value: unknown): value is CloudSaveDocument {
  if (typeof value !== 'object' || value == null) {
    return false;
  }

  const document = value as Partial<CloudSaveDocument>;
  return (
    document.schemaVersion === CLOUD_SAVE_SCHEMA_VERSION &&
    typeof document.payloadJson === 'string' &&
    typeof document.payloadBytes === 'number' &&
    document.payloadBytes > 0 &&
    document.payloadBytes <= CLOUD_SAVE_MAX_PAYLOAD_BYTES &&
    typeof document.saveHash === 'string' &&
    typeof document.clientRevision === 'number' &&
    typeof document.clientUpdatedAtMs === 'number' &&
    typeof document.deviceId === 'string' &&
    typeof document.appVersion === 'string' &&
    document.platform === 'mobile'
  );
}

function isValidSavePayload(payloadJson: string) {
  try {
    const parsed = JSON.parse(payloadJson);
    return typeof parsed === 'object' && parsed != null;
  } catch {
    return false;
  }
}

async function buildCloudSaveDocument(
  gameState: GameState,
  dependencies: CloudSaveBackupDependencies
): Promise<CloudSaveDocument> {
  const payloadJson = JSON.stringify(gameState);
  const payloadBytes = getUtf8ByteLength(payloadJson);

  if (payloadBytes > CLOUD_SAVE_MAX_PAYLOAD_BYTES) {
    throw new Error(`Cloud save payload is too large: ${payloadBytes} bytes`);
  }

  return {
    schemaVersion: CLOUD_SAVE_SCHEMA_VERSION,
    payloadJson,
    payloadBytes,
    saveHash: hashString(payloadJson),
    clientRevision: await nextClientRevision(dependencies),
    clientUpdatedAtMs: getNow(dependencies),
    deviceId: await getOrCreateDeviceId(dependencies),
    appVersion: dependencies.appVersion,
    platform: 'mobile',
  };
}

export function createMobileCloudSaveBackup(dependencies: CloudSaveBackupDependencies) {
  let backupTimer: TimerHandle | null = null;
  let pendingState: GameState | null = null;

  const setTimer = dependencies.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const clearTimer = dependencies.clearTimer ?? ((handle) => clearTimeout(handle));

  function recordError(error: unknown, context: string) {
    dependencies.recordError?.(error, context);
  }

  function clearPendingTimer() {
    if (backupTimer != null) {
      clearTimer(backupTimer);
      backupTimer = null;
    }
  }

  async function backupNow(gameState: GameState) {
    if (!dependencies.isEnabled()) {
      return { status: 'disabled' as const };
    }

    try {
      const user = await dependencies.ensureUser();
      if (user == null) {
        return { status: 'signed_out' as const };
      }

      const document = await buildCloudSaveDocument(gameState, dependencies);
      await dependencies.store.writeCurrentSave(user.uid, document);
      return { status: 'backed_up' as const, clientRevision: document.clientRevision };
    } catch (error) {
      recordError(error, 'cloud_save:backup');
      return { status: 'error' as const };
    }
  }

  function scheduleBackup(gameState: GameState) {
    if (!dependencies.isEnabled()) {
      return;
    }

    pendingState = gameState;
    clearPendingTimer();
    backupTimer = setTimer(() => {
      const stateToBackup = pendingState;
      pendingState = null;
      backupTimer = null;
      if (stateToBackup != null) {
        void backupNow(stateToBackup);
      }
    }, CLOUD_SAVE_BACKUP_DEBOUNCE_MS);
  }

  async function flushPendingBackup() {
    const stateToBackup = pendingState;
    pendingState = null;
    clearPendingTimer();
    if (stateToBackup == null) {
      return { status: 'empty' as const };
    }
    return backupNow(stateToBackup);
  }

  async function restoreLatestLocalSaveIfMissing(): Promise<CloudSaveRestoreResult> {
    if (!dependencies.isEnabled()) {
      return { status: 'disabled' };
    }

    try {
      const localSave = await dependencies.storage.getItem(SAVE_KEY);
      if (localSave != null) {
        return { status: 'local_exists' };
      }

      const user = await dependencies.ensureUser();
      if (user == null) {
        return { status: 'signed_out' };
      }

      const document = await dependencies.store.readCurrentSave(user.uid);
      if (document == null) {
        return { status: 'missing' };
      }

      if (!isCloudSaveDocument(document) || !isValidSavePayload(document.payloadJson)) {
        return { status: 'invalid' };
      }

      await dependencies.storage.setItem(SAVE_KEY, document.payloadJson);
      await dependencies.storage.setItem(CLOUD_SAVE_REVISION_KEY, String(document.clientRevision));
      return { status: 'restored', clientRevision: document.clientRevision };
    } catch (error) {
      recordError(error, 'cloud_save:restore');
      return { status: 'error' };
    }
  }

  async function deleteBackup() {
    pendingState = null;
    clearPendingTimer();

    try {
      await dependencies.storage.removeItem(CLOUD_SAVE_REVISION_KEY);
    } catch {
      // A reset must keep moving even if local metadata cleanup fails.
    }

    if (!(dependencies.canDelete?.() ?? dependencies.isEnabled())) {
      return { status: 'disabled' as const };
    }

    try {
      const user = await dependencies.ensureUser();
      if (user == null) {
        return { status: 'signed_out' as const };
      }

      await dependencies.store.deleteCurrentSave(user.uid);
      return { status: 'deleted' as const };
    } catch (error) {
      recordError(error, 'cloud_save:delete');
      return { status: 'error' as const };
    }
  }

  return {
    scheduleBackup,
    flushPendingBackup,
    restoreLatestLocalSaveIfMissing,
    deleteBackup,
  };
}
