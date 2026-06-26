import { SAVE_KEY, createInitialState } from '../../../../../packages/farm-core/src';
import type { KeyValueStorage } from '../../../../../packages/farm-ui/src';
import {
  CLOUD_SAVE_SCHEMA_VERSION,
  createMobileCloudSaveBackup,
  type CloudSaveDocument,
  type CloudSaveStore,
} from '../cloudBackupCore';

function createMemoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { snapshot: () => Record<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    async getItem(key: string) {
      return values.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      values.set(key, value);
    },
    async removeItem(key: string) {
      values.delete(key);
    },
    snapshot() {
      return Object.fromEntries(values.entries());
    },
  };
}

function createMemoryStore(): CloudSaveStore & { writes: CloudSaveDocument[]; deleted: string[] } {
  const writes: CloudSaveDocument[] = [];
  const deleted: string[] = [];
  let currentSave: CloudSaveDocument | null = null;

  return {
    writes,
    deleted,
    async readCurrentSave() {
      return currentSave;
    },
    async writeCurrentSave(_uid: string, document: CloudSaveDocument) {
      currentSave = document;
      writes.push(document);
    },
    async deleteCurrentSave(uid: string) {
      currentSave = null;
      deleted.push(uid);
    },
  };
}

describe('mobile cloud save backup core', () => {
  test('backs up the latest pending state when flushed', async () => {
    const storage = createMemoryStorage();
    const store = createMemoryStore();
    const backup = createMobileCloudSaveBackup({
      storage,
      store,
      isEnabled: () => true,
      ensureUser: async () => ({ uid: 'user-1' }),
      appVersion: '1.2.3',
      now: () => 1_780_000_000_000,
      random: () => 0.5,
      setTimer: jest.fn(() => 1 as unknown as ReturnType<typeof setTimeout>),
      clearTimer: jest.fn(),
    });

    const state = createInitialState();
    backup.scheduleBackup(state);
    await expect(backup.flushPendingBackup()).resolves.toMatchObject({ status: 'backed_up', clientRevision: 1 });

    expect(store.writes).toHaveLength(1);
    expect(store.writes[0]).toMatchObject({
      schemaVersion: CLOUD_SAVE_SCHEMA_VERSION,
      clientRevision: 1,
      appVersion: '1.2.3',
      platform: 'mobile',
    });
    expect(JSON.parse(store.writes[0]!.payloadJson)).toMatchObject({ gold: state.gold });
  });

  test('does not sign in or write when disabled', async () => {
    const store = createMemoryStore();
    const ensureUser = jest.fn(async () => ({ uid: 'user-1' }));
    const backup = createMobileCloudSaveBackup({
      storage: createMemoryStorage(),
      store,
      isEnabled: () => false,
      ensureUser,
      appVersion: '1.2.3',
      setTimer: (callback) => {
        callback();
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: jest.fn(),
    });

    backup.scheduleBackup(createInitialState());
    const flushed = await backup.flushPendingBackup();

    expect(flushed.status).toBe('empty');
    expect(ensureUser).not.toHaveBeenCalled();
    expect(store.writes).toHaveLength(0);
  });

  test('restores a valid cloud save only when local save is missing', async () => {
    const state = createInitialState();
    const payloadJson = JSON.stringify({ ...state, gold: 1234 });
    const cloudDocument: CloudSaveDocument = {
      schemaVersion: CLOUD_SAVE_SCHEMA_VERSION,
      payloadJson,
      payloadBytes: payloadJson.length,
      saveHash: 'hash',
      clientRevision: 7,
      clientUpdatedAtMs: 1_780_000_000_000,
      deviceId: 'device-1',
      appVersion: '1.2.3',
      platform: 'mobile',
    };
    const storage = createMemoryStorage();
    const store: CloudSaveStore = {
      readCurrentSave: jest.fn(async () => cloudDocument),
      writeCurrentSave: jest.fn(),
      deleteCurrentSave: jest.fn(),
    };
    const backup = createMobileCloudSaveBackup({
      storage,
      store,
      isEnabled: () => true,
      ensureUser: async () => ({ uid: 'user-1' }),
      appVersion: '1.2.3',
    });

    await expect(backup.restoreLatestLocalSaveIfMissing()).resolves.toEqual({
      status: 'restored',
      clientRevision: 7,
    });

    expect(JSON.parse((await storage.getItem(SAVE_KEY)) ?? '{}')).toMatchObject({ gold: 1234 });
  });

  test('keeps local save when one already exists', async () => {
    const storage = createMemoryStorage({ [SAVE_KEY]: JSON.stringify({ gold: 77 }) });
    const store: CloudSaveStore = {
      readCurrentSave: jest.fn(),
      writeCurrentSave: jest.fn(),
      deleteCurrentSave: jest.fn(),
    };
    const backup = createMobileCloudSaveBackup({
      storage,
      store,
      isEnabled: () => true,
      ensureUser: async () => ({ uid: 'user-1' }),
      appVersion: '1.2.3',
    });

    await expect(backup.restoreLatestLocalSaveIfMissing()).resolves.toEqual({ status: 'local_exists' });
    expect(store.readCurrentSave).not.toHaveBeenCalled();
  });

  test('backs up the passed state immediately on manual backup', async () => {
    const storage = createMemoryStorage();
    const store = createMemoryStore();
    const backup = createMobileCloudSaveBackup({
      storage,
      store,
      isEnabled: () => true,
      ensureUser: async () => ({ uid: 'user-1' }),
      appVersion: '1.2.3',
      now: () => 1_780_000_000_000,
      random: () => 0.5,
    });

    const state = { ...createInitialState(), gold: 555 };
    await expect(backup.backupNow(state)).resolves.toEqual({ status: 'backed_up', clientRevision: 1 });
    expect(store.writes).toHaveLength(1);
    expect(JSON.parse(store.writes[0]!.payloadJson)).toMatchObject({ gold: 555 });
  });

  test('manual backup reports disabled without signing in', async () => {
    const store = createMemoryStore();
    const ensureUser = jest.fn(async () => ({ uid: 'user-1' }));
    const backup = createMobileCloudSaveBackup({
      storage: createMemoryStorage(),
      store,
      isEnabled: () => false,
      ensureUser,
      appVersion: '1.2.3',
    });

    await expect(backup.backupNow(createInitialState())).resolves.toEqual({ status: 'disabled' });
    expect(ensureUser).not.toHaveBeenCalled();
    expect(store.writes).toHaveLength(0);
  });

  test('force-restores cloud save over an existing local save', async () => {
    const state = createInitialState();
    const payloadJson = JSON.stringify({ ...state, gold: 4321 });
    const cloudDocument: CloudSaveDocument = {
      schemaVersion: CLOUD_SAVE_SCHEMA_VERSION,
      payloadJson,
      payloadBytes: payloadJson.length,
      saveHash: 'hash',
      clientRevision: 12,
      clientUpdatedAtMs: 1_780_000_000_000,
      deviceId: 'device-1',
      appVersion: '1.2.3',
      platform: 'mobile',
    };
    const storage = createMemoryStorage({ [SAVE_KEY]: JSON.stringify({ ...state, gold: 1 }) });
    const store: CloudSaveStore = {
      readCurrentSave: jest.fn(async () => cloudDocument),
      writeCurrentSave: jest.fn(),
      deleteCurrentSave: jest.fn(),
    };
    const backup = createMobileCloudSaveBackup({
      storage,
      store,
      isEnabled: () => true,
      ensureUser: async () => ({ uid: 'user-1' }),
      appVersion: '1.2.3',
    });

    const result = await backup.restoreFromCloud();
    expect(result).toMatchObject({ status: 'restored', clientRevision: 12 });
    expect(result.status === 'restored' ? result.gameState.gold : null).toBe(4321);
    expect(JSON.parse((await storage.getItem(SAVE_KEY)) ?? '{}')).toMatchObject({ gold: 4321 });
    expect(storage.snapshot()[`${SAVE_KEY}.cloudRevision`]).toBe('12');
  });

  test('manual restore reports missing when no cloud save exists', async () => {
    const storage = createMemoryStorage({ [SAVE_KEY]: JSON.stringify({ gold: 99 }) });
    const store: CloudSaveStore = {
      readCurrentSave: jest.fn(async () => null),
      writeCurrentSave: jest.fn(),
      deleteCurrentSave: jest.fn(),
    };
    const backup = createMobileCloudSaveBackup({
      storage,
      store,
      isEnabled: () => true,
      ensureUser: async () => ({ uid: 'user-1' }),
      appVersion: '1.2.3',
    });

    await expect(backup.restoreFromCloud()).resolves.toEqual({ status: 'missing' });
    // With no cloud save, the local save must be left untouched.
    expect(JSON.parse((await storage.getItem(SAVE_KEY)) ?? '{}')).toMatchObject({ gold: 99 });
  });

  test('deletes remote backup even when backup writes are disabled', async () => {
    const storage = createMemoryStorage({ [`${SAVE_KEY}.cloudRevision`]: '9' });
    const store = createMemoryStore();
    const ensureUser = jest.fn(async () => ({ uid: 'user-1' }));
    const backup = createMobileCloudSaveBackup({
      storage,
      store,
      isEnabled: () => false,
      canDelete: () => true,
      ensureUser,
      appVersion: '1.2.3',
    });

    await expect(backup.deleteBackup()).resolves.toEqual({ status: 'deleted' });

    expect(ensureUser).toHaveBeenCalledTimes(1);
    expect(store.deleted).toEqual(['user-1']);
    expect(storage.snapshot()[`${SAVE_KEY}.cloudRevision`]).toBeUndefined();
  });
});
