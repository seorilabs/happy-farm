import type { SupportedLocale } from '../../farm-core/src';
import type { ReactNode } from 'react';
import type { KeyValueStorage } from './persistence';

// SDK의 판정을 화면에 전달하는 데이터 계약이다. 판정과 버전 비교는 앱의 SDK가 소유한다.
export type FarmUpdateGateState =
  | { kind: 'ok' }
  | { kind: 'recommended' | 'required'; message: string; updateUrl?: string; recommendedVersion?: string }
  | { kind: 'maintenance'; message: string; until?: string };

export type FarmUpdateNotice = Exclude<FarmUpdateGateState, { kind: 'ok' }>;
export type FarmUpdateGatePresentation = { node: ReactNode; onRequestClose: () => void; canPresent?: boolean };

export type FarmUpdateGateController = {
  load(locale: SupportedLocale): Promise<FarmUpdateGateState>;
  shouldPrompt(state: FarmUpdateGateState): Promise<boolean>;
  markPrompted(state: FarmUpdateGateState): Promise<void>;
};

export const UPDATE_GATE_STORAGE_KEY = 'happy_farm.update_gate_prompt.v1';
type GatePromptLog = { version: string; promptedAt: number };

export function createUpdateGateStore(storage: Pick<KeyValueStorage, 'getItem' | 'setItem'>) {
  return {
    async load(): Promise<GatePromptLog | null> {
      const raw = await storage.getItem(UPDATE_GATE_STORAGE_KEY);
      if (raw == null) return null;
      try {
        const value: unknown = JSON.parse(raw);
        if (value == null || typeof value !== 'object' || !('version' in value) || !('promptedAt' in value)) return null;
        if (typeof value.version !== 'string' || typeof value.promptedAt !== 'number' || !Number.isFinite(value.promptedAt) || value.promptedAt < 0) return null;
        return { version: value.version, promptedAt: value.promptedAt };
      } catch {
        return null;
      }
    },
    async save(log: GatePromptLog): Promise<void> {
      await storage.setItem(UPDATE_GATE_STORAGE_KEY, JSON.stringify(log));
    },
  };
}
