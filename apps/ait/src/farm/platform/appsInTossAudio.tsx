import { Video, type VideoRef } from '@granite-js/react-native';
import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { logDevWarning } from '../../../../../packages/farm-core/src';
import type { FarmGameAudio, FarmSoundEffectKey } from '../../../../../packages/farm-ui/src';

// The Granite runtime cannot load require()-based local assets (its asset
// registry is a warning stub), so apps-in-toss audio must stream from remote
// URIs. These files live in web/audio and are served by Firebase Hosting.
// Deploy steps: docs/apps-in-toss-registration.md.
const FARM_AUDIO_HOST = 'https://happy-farm-tycoon.web.app/audio';
// Bump after deploying changed audio. The query isolates a new AIT build from
// stale shouldCache entries, including cached 404s from a pre-deploy session.
export const FARM_AUDIO_ASSET_VERSION = '20260713-v2';

function farmAudioUri(fileName: string) {
  return `${FARM_AUDIO_HOST}/${fileName}?v=${FARM_AUDIO_ASSET_VERSION}`;
}

export const FARM_AUDIO_SOURCES = {
  backgroundMusic: farmAudioUri('farm_bgm_loop.wav'),
  harvestCoin: farmAudioUri('harvest_coin.wav'),
  plant: farmAudioUri('sfx_plant.wav'),
  reward: farmAudioUri('sting_reward.wav'),
  unlock: farmAudioUri('sting_unlock.wav'),
  mutation: farmAudioUri('sting_mutation.wav'),
  wheelSpin: farmAudioUri('sfx_wheel_spin.wav'),
} as const;

const FARM_AUDIO_VIDEO_SOURCES = {
  backgroundMusic: {
    uri: FARM_AUDIO_SOURCES.backgroundMusic,
    shouldCache: true,
  },
  harvestCoin: {
    uri: FARM_AUDIO_SOURCES.harvestCoin,
    shouldCache: true,
  },
} as const;

const BACKGROUND_MUSIC_VOLUME = 0.16;
const HARVEST_VOLUME = 0.85;

// Per-effect volumes mirror apps/mobile/src/audio/farmAudio.ts so both
// markets ship the same mix.
const SOUND_EFFECT_PLAYERS: readonly { key: FarmSoundEffectKey; volume: number }[] = [
  { key: 'plant', volume: 0.6 },
  { key: 'reward', volume: 0.8 },
  { key: 'unlock', volume: 0.8 },
  { key: 'mutation', volume: 0.75 },
  { key: 'wheelSpin', volume: 0.55 },
];

// disableFocus is the public Granite Video API. It is best-effort on the AIT
// Android host, so one-shot completion also resumes BGM explicitly below.
const audioFocusProps = Platform.OS === 'android' ? { disableFocus: true } : {};

function keepPlaybackOnAudioFocusChange() {
  // Passing a handler stops the Granite wrapper from changing paused state.
  // App state and the one-shot completion handlers own playback instead.
}

// Multiple players share this hook, so failure logs must name the URI to make
// on-device diagnosis (404, blocked host, codec) possible.
function createPlaybackFailureWarning(uri: string) {
  return (error: unknown) => {
    logDevWarning(`Failed to play farm audio source: ${uri}`, error);
  };
}

const warnBackgroundMusicFailure = createPlaybackFailureWarning(FARM_AUDIO_SOURCES.backgroundMusic);
const warnHarvestCoinFailure = createPlaybackFailureWarning(FARM_AUDIO_SOURCES.harvestCoin);

// Combo milestone: playing the coin sound from two/three players in rapid
// succession gives a "ka-ching ching" double-hit at Great and a triple-hit
// at Legendary without needing separate audio assets.
const COMBO_BONUS_DELAY_MS = 90;

type OneShotHandle = { play: () => void };

// Generic hidden player for the one-shot effect set: stays mounted so the
// remote source stays buffered, restarts from 0 on every play() call.
const OneShotEffectPlayer = React.forwardRef<
  OneShotHandle,
  { uri: string; volume: number; onPlaybackSettled: () => void }
>(function OneShotEffectPlayer({ uri, volume, onPlaybackSettled }, ref) {
  const videoRef = useRef<VideoRef | null>(null);
  // Three-state machine instead of a boolean: every play() request enters a
  // 'restarting' frame whose committed paused=true state guarantees the
  // player is not running when the seek is issued — the mobile adapter's
  // stop-then-play (playFromStart) parity. Any number of play() calls
  // landing in the same batch collapse into that single restart cycle, and
  // play() itself never touches the player imperatively, so no seek can
  // race active playback.
  const [playState, setPlayState] = useState<'idle' | 'playing' | 'restarting'>('idle');
  const warnFailure = useMemo(() => createPlaybackFailureWarning(uri), [uri]);
  const stopPlayback = useCallback(() => {
    setPlayState('idle');
    onPlaybackSettled();
  }, [onPlaybackSettled]);
  const stopFailedPlayback = useCallback(
    (error: unknown) => {
      warnFailure(error);
      stopPlayback();
    },
    [stopPlayback, warnFailure]
  );

  // Runs after the 'restarting' (paused) frame commits: the seek targets a
  // deterministically paused player, then playback resumes from 0.
  useEffect(() => {
    if (playState === 'restarting') {
      videoRef.current?.seek(0);
      setPlayState('playing');
    }
  }, [playState]);

  useImperativeHandle(
    ref,
    () => ({
      play: () => {
        setPlayState('restarting');
      },
    }),
    []
  );

  return (
    <Video
      {...audioFocusProps}
      ref={videoRef}
      ignoreSilentSwitch="ignore"
      onAudioFocusChanged={keepPlaybackOnAudioFocusChange}
      onEnd={stopPlayback}
      onError={stopFailedPlayback}
      paused={playState !== 'playing'}
      source={{ uri, shouldCache: true }}
      style={styles.hiddenPlayer}
      volume={volume}
    />
  );
});

export function useAppsInTossFarmAudio(): { audio: FarmGameAudio; audioElement: React.ReactNode } {
  const backgroundMusicPlayerRef = useRef<VideoRef | null>(null);
  const backgroundMusicEnabledRef = useRef(false);
  const harvestPlayerRef = useRef<VideoRef | null>(null);
  const comboBonusOneRef = useRef<VideoRef | null>(null);
  const comboBonusTwoRef = useRef<VideoRef | null>(null);
  const comboMilestoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const effectHandlesRef = useRef<Partial<Record<FarmSoundEffectKey, OneShotHandle | null>>>({});
  const [backgroundMusicEnabled, setBackgroundMusicEnabled] = useState(false);
  const [harvestPlaying, setHarvestPlaying] = useState(false);
  const [comboBonusOnePlaying, setComboBonusOnePlaying] = useState(false);
  const [comboBonusTwoPlaying, setComboBonusTwoPlaying] = useState(false);

  const resumeBackgroundMusic = useCallback(() => {
    if (backgroundMusicEnabledRef.current) {
      backgroundMusicPlayerRef.current?.resume();
    }
  }, []);
  const updateBackgroundMusicEnabled = useCallback((enabled: boolean) => {
    backgroundMusicEnabledRef.current = enabled;
    setBackgroundMusicEnabled(enabled);
  }, []);
  const handleBackgroundMusicAudioFocusChanged = useCallback(
    ({ hasAudioFocus }: { hasAudioFocus: boolean }) => {
      if (hasAudioFocus) {
        resumeBackgroundMusic();
      }
    },
    [resumeBackgroundMusic]
  );

  const stopHarvestPlayback = useCallback(() => {
    setHarvestPlaying(false);
    resumeBackgroundMusic();
  }, [resumeBackgroundMusic]);
  const stopComboBonusOnePlayback = useCallback(() => {
    setComboBonusOnePlaying(false);
    resumeBackgroundMusic();
  }, [resumeBackgroundMusic]);
  const stopComboBonusTwoPlayback = useCallback(() => {
    setComboBonusTwoPlaying(false);
    resumeBackgroundMusic();
  }, [resumeBackgroundMusic]);
  const stopFailedHarvestPlayback = useCallback(
    (error: unknown) => {
      warnHarvestCoinFailure(error);
      stopHarvestPlayback();
    },
    [stopHarvestPlayback]
  );
  const stopFailedComboBonusOnePlayback = useCallback(
    (error: unknown) => {
      warnHarvestCoinFailure(error);
      stopComboBonusOnePlayback();
    },
    [stopComboBonusOnePlayback]
  );
  const stopFailedComboBonusTwoPlayback = useCallback(
    (error: unknown) => {
      warnHarvestCoinFailure(error);
      stopComboBonusTwoPlayback();
    },
    [stopComboBonusTwoPlayback]
  );

  useEffect(() => {
    return () => {
      if (comboMilestoneTimerRef.current != null) {
        clearTimeout(comboMilestoneTimerRef.current);
      }
      // React nulls each player's ref callback on unmount, but clearing the
      // map here keeps every ref-based resource cleaned up in one place and
      // drops stale handles across a hook remount (e.g. Fast Refresh).
      effectHandlesRef.current = {};
    };
  }, []);

  const audio = useMemo<FarmGameAudio>(
    () => ({
      isSupported: Video.isAvailable,
      playHarvest: () => {
        harvestPlayerRef.current?.seek(0);
        setHarvestPlaying(true);
      },
      playComboMilestone: (tier) => {
        if (comboMilestoneTimerRef.current != null) {
          clearTimeout(comboMilestoneTimerRef.current);
          comboMilestoneTimerRef.current = null;
        }
        comboBonusOneRef.current?.seek(0);
        setComboBonusOnePlaying(true);
        if (tier === 'legendary') {
          comboMilestoneTimerRef.current = setTimeout(() => {
            comboBonusTwoRef.current?.seek(0);
            setComboBonusTwoPlaying(true);
            comboMilestoneTimerRef.current = null;
          }, COMBO_BONUS_DELAY_MS);
        }
      },
      playEffect: (effect) => {
        effectHandlesRef.current[effect]?.play();
      },
      setBackgroundMusicEnabled: updateBackgroundMusicEnabled,
    }),
    [updateBackgroundMusicEnabled]
  );

  const audioElement = (
    <>
      <Video
        {...audioFocusProps}
        ref={backgroundMusicPlayerRef}
        ignoreSilentSwitch="ignore"
        onAudioFocusChanged={handleBackgroundMusicAudioFocusChanged}
        onError={warnBackgroundMusicFailure}
        paused={!backgroundMusicEnabled}
        repeat
        source={FARM_AUDIO_VIDEO_SOURCES.backgroundMusic}
        style={styles.hiddenPlayer}
        volume={BACKGROUND_MUSIC_VOLUME}
      />
      <Video
        {...audioFocusProps}
        ref={comboBonusOneRef}
        ignoreSilentSwitch="ignore"
        onAudioFocusChanged={keepPlaybackOnAudioFocusChange}
        onEnd={stopComboBonusOnePlayback}
        onError={stopFailedComboBonusOnePlayback}
        paused={!comboBonusOnePlaying}
        source={FARM_AUDIO_VIDEO_SOURCES.harvestCoin}
        style={styles.hiddenPlayer}
        volume={HARVEST_VOLUME}
      />
      <Video
        {...audioFocusProps}
        ref={comboBonusTwoRef}
        ignoreSilentSwitch="ignore"
        onAudioFocusChanged={keepPlaybackOnAudioFocusChange}
        onEnd={stopComboBonusTwoPlayback}
        onError={stopFailedComboBonusTwoPlayback}
        paused={!comboBonusTwoPlaying}
        source={FARM_AUDIO_VIDEO_SOURCES.harvestCoin}
        style={styles.hiddenPlayer}
        volume={HARVEST_VOLUME}
      />
      <Video
        {...audioFocusProps}
        ref={harvestPlayerRef}
        ignoreSilentSwitch="ignore"
        onAudioFocusChanged={keepPlaybackOnAudioFocusChange}
        onEnd={stopHarvestPlayback}
        onError={stopFailedHarvestPlayback}
        paused={!harvestPlaying}
        source={FARM_AUDIO_VIDEO_SOURCES.harvestCoin}
        style={styles.hiddenPlayer}
        volume={HARVEST_VOLUME}
      />
      {SOUND_EFFECT_PLAYERS.map(({ key, volume }) => (
        <OneShotEffectPlayer
          key={key}
          onPlaybackSettled={resumeBackgroundMusic}
          ref={(handle) => {
            effectHandlesRef.current[key] = handle;
          }}
          uri={FARM_AUDIO_SOURCES[key]}
          volume={volume}
        />
      ))}
    </>
  );

  return { audio, audioElement };
}

const styles = StyleSheet.create({
  // Players stay mounted so the remote sources stay buffered, but they must
  // never affect layout or touch handling. Keep the native view non-zero so the
  // Granite video player reliably attaches in the AppsInToss runtime.
  hiddenPlayer: {
    position: 'absolute',
    left: -10000,
    top: -10000,
    width: 1,
    height: 1,
    opacity: 0,
  },
});
