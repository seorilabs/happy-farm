import { createFarmPersistence } from './persistence';
import { appsInTossStorage } from './platform/appsInTossStorage';

const farmPersistence = createFarmPersistence(appsInTossStorage);

export const readPersistedGameState = farmPersistence.readPersistedGameState;
export const writePersistedGameState = farmPersistence.writePersistedGameState;
export const removePersistedGameState = farmPersistence.removePersistedGameState;
export const readPersistedGameSettings = farmPersistence.readPersistedGameSettings;
export const writePersistedGameSettings = farmPersistence.writePersistedGameSettings;
export const readLastSeenAt = farmPersistence.readLastSeenAt;
export const writeLastSeenAt = farmPersistence.writeLastSeenAt;
