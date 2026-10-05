import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEFAULT_LOCALE, type GameState, type SupportedLocale } from '../../farm-core/src';
import type { FarmGamePersistence } from './FarmGame';
import { normalizeFarmGameSettings, type FarmGameSettings } from './gameSettings';
import { getFarmMessages } from './i18n';

export type FarmStartupSnapshot = {
  gameState: GameState;
  settings: Partial<FarmGameSettings> | null | undefined;
  lastSeenAt: number | null;
};

export type FarmTitleArt = {
  background: ImageSourcePropType;
  shade: ImageSourcePropType;
};

type StartupState = {
  completed: number;
  status: 'loading' | 'ready' | 'error';
  locale: SupportedLocale;
  snapshot: FarmStartupSnapshot | null;
};

const OUTLINE_OFFSETS = [
  [-3, -3],
  [0, -3],
  [3, -3],
  [-3, 0],
  [3, 0],
  [-3, 3],
  [0, 3],
  [3, 3],
] as const;
const TOTAL_STEPS = 2;

export function FarmStartup({
  persistence,
  preferredLocale = DEFAULT_LOCALE,
  art,
  children,
  onStart,
}: {
  persistence: FarmGamePersistence;
  preferredLocale?: SupportedLocale;
  art: FarmTitleArt;
  children: (snapshot: FarmStartupSnapshot) => ReactNode;
  onStart?: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<StartupState>({
    completed: 0,
    status: 'loading',
    locale: preferredLocale,
    snapshot: null,
  });
  const [started, setStarted] = useState(false);
  const startCommitted = useRef(false);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const compact = height < 700;
  const messages = getFarmMessages(state.locale);
  const fontSize = Math.min(compact ? 52 : 69, width * 0.18);
  const lineHeight = fontSize * 1.06;
  const title = `${messages.titleLine1}\n${messages.titleLine2}`;

  useEffect(() => {
    let cancelled = false;
    async function prepare() {
      setState({ completed: 0, status: 'loading', locale: preferredLocale, snapshot: null });
      try {
        const settings = await persistence.readPersistedGameSettings?.();
        if (cancelled) return;
        const locale = normalizeFarmGameSettings(settings, preferredLocale).locale;
        setState({ completed: 1, status: 'loading', locale, snapshot: null });
        const [gameState, lastSeenAt] = await Promise.all([
          persistence.readPersistedGameState(),
          persistence.readLastSeenAt?.() ?? Promise.resolve(null),
        ]);
        if (cancelled) return;
        setState({ completed: TOTAL_STEPS, status: 'ready', locale, snapshot: { gameState, settings, lastSeenAt } });
      } catch {
        // A failed read must never mount a fresh game that overwrites an existing save.
        if (!cancelled) setState((previous) => ({ ...previous, status: 'error', snapshot: null }));
      }
    }
    void prepare();
    return () => {
      cancelled = true;
    };
  }, [attempt, persistence, preferredLocale]);

  if (started && state.snapshot != null) return <>{children(state.snapshot)}</>;

  const statusText =
    state.status === 'ready'
      ? messages.titleReady
      : state.status === 'error'
        ? messages.titleLoadError
        : state.completed === 0
          ? messages.titleLoadingSettings
          : messages.titleLoadingSave;

  return (
    <View testID="farm-title" style={styles.root}>
      <Image accessible={false} source={art.background} resizeMode="cover" style={styles.art} />
      <Image accessible={false} source={art.shade} resizeMode="stretch" style={styles.art} />
      <View
        accessible
        accessibilityLabel={messages.appTitle}
        style={[styles.logo, { top: Math.max(insets.top + 12, height * (compact ? 0.07 : 0.11)) }]}
      >
        <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.leaves}>
          <View style={[styles.leaf, styles.leafLeft]} />
          <View style={[styles.leaf, styles.leafRight]} />
        </View>
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={{ height: lineHeight * 2, width: '100%' }}
        >
          <Text
            accessible={false}
            allowFontScaling={false}
            style={[styles.brand, styles.brandDepth, { fontSize, lineHeight, top: 5 }]}
          >
            {title}
          </Text>
          {OUTLINE_OFFSETS.map(([x, y]) => (
            <Text
              key={`${x}:${y}`}
              accessible={false}
              allowFontScaling={false}
              style={[
                styles.brand,
                styles.brandOutline,
                { fontSize, lineHeight, transform: [{ translateX: x }, { translateY: y }] },
              ]}
            >
              {title}
            </Text>
          ))}
          <Text accessible={false} allowFontScaling={false} style={[styles.brand, { fontSize, lineHeight }]}>
            <Text style={styles.brandGreen}>{messages.titleLine1}</Text>
            {'\n'}
            <Text style={styles.brandOrange}>{messages.titleLine2}</Text>
          </Text>
        </View>
        <View style={[styles.tag, { marginTop: compact ? 10 : 18 }]}>
          <Text accessible={false} allowFontScaling={false} style={styles.tagText}>
            {messages.appSubtitle.toUpperCase()}
          </Text>
        </View>
      </View>
      <View
        style={[
          styles.action,
          {
            left: compact ? 24 : 34,
            right: compact ? 24 : 34,
            bottom: Math.max(insets.bottom + 32, compact ? 42 : 70),
          },
        ]}
      >
        <Text
          testID="title-status"
          accessibilityLiveRegion="polite"
          style={[styles.status, state.status === 'error' && styles.errorText]}
        >
          {statusText}
        </Text>
        <View
          testID="title-progress"
          accessibilityRole="progressbar"
          accessibilityLabel={messages.titleProgressLabel}
          accessibilityValue={{ min: 0, max: TOTAL_STEPS, now: state.completed }}
          style={styles.track}
        >
          <View
            style={[
              styles.fill,
              { width: `${(state.completed / TOTAL_STEPS) * 100}%` },
              state.status === 'error' && styles.errorFill,
            ]}
          />
        </View>
        <View
          style={[
            styles.buttonDepth,
            state.status === 'loading' && styles.disabledDepth,
            state.status === 'error' && styles.retryDepth,
          ]}
        >
          <Pressable
            testID="title-start"
            accessibilityRole="button"
            disabled={state.status === 'loading'}
            accessibilityState={{ disabled: state.status === 'loading' }}
            onPress={() => {
              if (state.status === 'error') {
                setAttempt((previous) => previous + 1);
                return;
              }
              if (state.status !== 'ready' || state.snapshot == null || startCommitted.current) return;
              startCommitted.current = true;
              onStart?.();
              setStarted(true);
            }}
            style={({ pressed }) => [
              styles.button,
              compact && styles.compactButton,
              state.status === 'loading' && styles.disabledButton,
              state.status === 'error' && styles.retryButton,
              pressed && styles.pressedButton,
            ]}
          >
            <Text style={[styles.buttonText, compact && styles.compactButtonText]}>
              {state.status === 'ready'
                ? messages.titleStart
                : state.status === 'error'
                  ? messages.titleRetry
                  : messages.titlePreparing}
            </Text>
          </Pressable>
        </View>
      </View>
      <Text
        allowFontScaling={false}
        style={[styles.footer, { bottom: Math.max(insets.bottom + 8, compact ? 15 : 24) }]}
      >
        {messages.titlePublisher}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4e7c8' },
  art: { position: 'absolute', width: '100%', height: '100%' },
  logo: { position: 'absolute', left: '5%', right: '5%', alignItems: 'center' },
  leaves: { width: 60, height: 29, marginBottom: 8 },
  leaf: {
    position: 'absolute',
    width: 30,
    height: 18,
    backgroundColor: '#7cba42',
    borderTopLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  leafLeft: { left: 4, top: 6, transform: [{ rotate: '65deg' }] },
  leafRight: { right: 1, top: 0, transform: [{ rotate: '-8deg' }] },
  brand: {
    position: 'absolute',
    width: '100%',
    textAlign: 'center',
    fontWeight: '900',
    letterSpacing: -2,
    includeFontPadding: false,
  },
  brandDepth: { color: '#6f492b' },
  brandOutline: { color: '#fff2cd' },
  brandGreen: { color: '#609d32' },
  brandOrange: { color: '#ed963d' },
  tag: {
    backgroundColor: '#7c512f',
    borderRadius: 13,
    paddingVertical: 7,
    paddingHorizontal: 19,
    borderBottomWidth: 2,
    borderBottomColor: '#563a26',
  },
  tagText: { color: '#ffefca', fontSize: 11, fontWeight: '800', letterSpacing: 4 },
  action: { position: 'absolute' },
  status: { color: '#5b4b30', fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 9 },
  track: {
    height: 11,
    borderRadius: 9,
    backgroundColor: '#e3d2ac',
    borderWidth: 2,
    borderColor: '#fff3d3',
    overflow: 'hidden',
    marginHorizontal: 25,
    marginBottom: 19,
  },
  fill: { height: '100%', backgroundColor: '#8cc947', borderRadius: 9 },
  buttonDepth: { backgroundColor: '#49772c', borderRadius: 21, paddingBottom: 5 },
  button: {
    minHeight: 65,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderWidth: 2,
    borderColor: '#4e8d28',
    borderRadius: 21,
    backgroundColor: '#82c447',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactButton: { minHeight: 55, paddingVertical: 13 },
  pressedButton: { transform: [{ translateY: 4 }] },
  buttonText: {
    color: '#fff8df',
    fontSize: 23,
    fontWeight: '800',
    textAlign: 'center',
    textShadowColor: '#4d832a',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 1,
  },
  compactButtonText: { fontSize: 21 },
  disabledDepth: { backgroundColor: '#a2916c' },
  disabledButton: { backgroundColor: '#cabc96', borderColor: '#ae9e78' },
  retryDepth: { backgroundColor: '#775031' },
  retryButton: { backgroundColor: '#b98754', borderColor: '#966139' },
  errorText: { color: '#814c2b' },
  errorFill: { backgroundColor: '#c59b61' },
  footer: {
    position: 'absolute',
    left: 20,
    right: 20,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
    color: '#806649',
  },
});
