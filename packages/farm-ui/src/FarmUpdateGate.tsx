import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Keyboard, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SupportedLocale } from '../../farm-core/src';
import { getFarmMessages } from './i18n';
import type { FarmUpdateGateController, FarmUpdateGatePresentation, FarmUpdateNotice } from './updateGate';
import { FarmUpdateGateModal } from './FarmUpdateGateModal';

type VisibleNotice = { state: FarmUpdateNotice; id: number };

function sameNotice(a: FarmUpdateNotice, b: FarmUpdateNotice) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'maintenance' && b.kind === 'maintenance') return a.until === b.until;
  if (a.kind !== 'maintenance' && b.kind !== 'maintenance') return a.recommendedVersion === b.recommendedVersion;
  return false;
}

export function FarmUpdateGate({ controller, locale, enabled, onShown, onStoreClick, openUrl, hosted = false, children }: {
  controller: FarmUpdateGateController;
  locale: SupportedLocale;
  enabled: boolean;
  onShown: (state: FarmUpdateNotice) => void;
  onStoreClick: (state: FarmUpdateNotice) => void;
  openUrl: (url: string) => Promise<unknown>;
  hosted?: boolean;
  children?: (presentation: FarmUpdateGatePresentation | null) => React.ReactNode;
}) {
  const [notice, setNotice] = useState<VisibleNotice | null>(null);
  const [startupModalOnScreen, setStartupModalOnScreen] = useState(false);
  const visible = useRef<VisibleNotice | null>(null);
  const [checking, setChecking] = useState(false);
  const [linkFailed, setLinkFailed] = useState(false);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const opening = useRef<number | null>(null);
  const generation = useRef(0);
  const exposure = useRef(0);
  const recordedId = useRef<number | null>(null);
  const mounted = useRef(true);
  const messages = getFarmMessages(locale);
  const { height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const commit = useCallback((next: VisibleNotice | null) => {
    visible.current = next;
    setNotice(next);
    setLinkFailed(false);
  }, []);

  const refresh = useCallback(async () => {
    const attempt = ++generation.current;
    setChecking(true);
    try {
      const state = await controller.load(locale);
      if (!mounted.current || attempt !== generation.current) return;
      if (state.kind === 'ok') { commit(null); return; }
      const current = visible.current;
      // 이미 열린 같은 안내는 저장 이력 때문에 사라지거나 새 노출로 기록되지 않는다.
      if (current != null && sameNotice(current.state, state)) {
        commit({ state, id: current.id }); return;
      }
      const shouldPrompt = await controller.shouldPrompt(state);
      if (!mounted.current || attempt !== generation.current) return;
      commit(shouldPrompt ? { state, id: ++exposure.current } : null);
    } catch {
      if (mounted.current && attempt === generation.current) commit(null);
    } finally {
      if (mounted.current && attempt === generation.current) setChecking(false);
    }
  }, [controller, locale, commit]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; };
  }, []);

  useEffect(() => {
    if (!enabled) { generation.current += 1; commit(null); return; }
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => { generation.current += 1; subscription.remove(); };
  }, [enabled, refresh, commit]);

  // 광고나 기존 시트 때문에 기다리는 동안에는 기록하지 않고, 카드의 실제 배치 뒤 기록한다.
  function recordPresentation(current: VisibleNotice) {
    if (!mounted.current || visible.current?.id !== current.id || recordedId.current === current.id) return;
    recordedId.current = current.id;
    try { onShown(current.state); } catch { /* 계측 실패가 안내를 막지 않는다. */ }
    void Promise.resolve().then(() => controller.markPrompted(current.state)).catch(() => undefined);
  }

  const dismiss = useCallback(() => {
    if (visible.current?.state.kind !== 'recommended') return;
    generation.current += 1;
    setChecking(false);
    commit(null);
  }, [commit]);

  useEffect(() => {
    if (notice == null) return;
    Keyboard.dismiss();
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { dismiss(); return true; });
    return () => subscription.remove();
  }, [notice?.id, dismiss]);

  async function openStore() {
    const current = visible.current;
    if (current == null || current.state.kind === 'maintenance' || !current.state.updateUrl || opening.current === current.id) return;
    opening.current = current.id;
    setOpeningId(current.id);
    setLinkFailed(false);
    try {
      try { onStoreClick(current.state); } catch { /* 계측 실패가 이동을 막지 않는다. */ }
      await openUrl(current.state.updateUrl);
    } catch {
      if (mounted.current && visible.current?.id === current.id) setLinkFailed(true);
    } finally {
      if (opening.current === current.id) opening.current = null;
      if (mounted.current && visible.current?.id === current.id) setOpeningId(null);
    }
  }

  if (notice == null) return <>
    {children?.(hosted && startupModalOnScreen ? { node: null, onRequestClose: dismiss, canPresent: false } : null)}
    <FarmUpdateGateModal testID="update-gate-modal" presentation={null} onScreenChange={setStartupModalOnScreen} />
  </>;
  const state = notice.state;
  const title = state.kind === 'maintenance' ? messages.updateMaintenanceTitle : state.kind === 'required' ? messages.updateRequiredTitle : messages.updateRecommendedTitle;
  const fallback = state.kind === 'maintenance' ? messages.updateMaintenanceMessage : state.kind === 'required' ? messages.updateRequiredMessage : messages.updateRecommendedMessage;
  const hasUrl = state.kind !== 'maintenance' && Boolean(state.updateUrl);
  let until = '';
  if (state.kind === 'maintenance' && state.until) {
    const date = new Date(state.until);
    if (Number.isFinite(date.getTime())) {
      until = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
    }
  }

  const node = (
      <View style={[styles.backdrop, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <View testID="update-gate-backdrop" accessible={false} style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true} onResponderRelease={dismiss} />
        <View testID="update-gate-card" onLayout={() => recordPresentation(notice)} accessibilityViewIsModal style={[styles.card, { maxHeight: Math.max(100, height - insets.top - insets.bottom - 32), padding: fontScale >= 1.5 ? 12 : 20 }]}>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <ScrollView testID="update-gate-message" style={styles.scroll} contentContainerStyle={styles.content}>
            <Text style={styles.message}>{state.message.trim() || fallback}</Text>
            {until ? <Text style={styles.message}>{messages.updateMaintenanceUntil(until)}</Text> : null}
          </ScrollView>
          {linkFailed ? <Text accessibilityRole="alert" style={styles.error}>{messages.updateLinkError}</Text> : null}
          {hasUrl ? (
            <NoticeAction testID="update-gate-open" label={messages.updateOpenStore} disabled={openingId === notice.id} onPress={() => { void openStore(); }} />
          ) : null}
          {state.kind !== 'recommended' ? (
            <NoticeAction testID="update-gate-retry" label={checking ? messages.updateChecking : messages.titleRetry} secondary={hasUrl} disabled={checking} onPress={() => { void refresh(); }} />
          ) : null}
          {state.kind === 'recommended' ? <NoticeAction testID="update-gate-later" label={messages.updateLater} secondary={hasUrl} onPress={dismiss} /> : null}
        </View>
      </View>
  );
  const presentation = { node, onRequestClose: dismiss };
  return <>
    {children?.(hosted && startupModalOnScreen ? { ...presentation, node: null, canPresent: false } : presentation)}
    <FarmUpdateGateModal testID="update-gate-modal" presentation={hosted ? null : presentation} onScreenChange={setStartupModalOnScreen} />
  </>;
}

function NoticeAction({ label, testID, disabled = false, secondary = false, onPress }: { label: string; testID: string; disabled?: boolean; secondary?: boolean; onPress: () => void }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondaryButton, disabled && styles.disabledButton]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryText, disabled && styles.disabledText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#182b20b8', paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  card: { width: '100%', maxWidth: 420, borderRadius: 20, borderWidth: 3, borderColor: '#4b6b39', backgroundColor: '#fff8e9', gap: 12 },
  title: { fontSize: 22, fontWeight: '900', color: '#365e2e', flexShrink: 1 },
  scroll: { flexShrink: 1, minHeight: 0 },
  content: { paddingVertical: 2, gap: 12 },
  message: { fontSize: 16, lineHeight: 24, color: '#594626', flexShrink: 1 },
  error: { fontSize: 15, color: '#a12b26' },
  button: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: '#39751f', borderWidth: 2, borderBottomWidth: 4, borderColor: '#285916', borderRadius: 10 },
  secondaryButton: { backgroundColor: '#fffaf0', borderColor: '#dcc189' },
  disabledButton: { backgroundColor: '#f0ece2', borderColor: '#cec6b3' },
  buttonText: { fontSize: 16, fontWeight: '900', color: '#ffffff', textAlign: 'center' },
  secondaryText: { color: '#6b4a22' },
  disabledText: { color: '#7a6647' },
});
