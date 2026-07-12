import { Video, type VideoRef } from '@granite-js/react-native';
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, StyleSheet } from 'react-native';

import { logDevWarning } from '../../../../../packages/farm-core/src';
import type { FarmGameAudio, FarmSoundEffectKey } from '../../../../../packages/farm-ui/src';

// The Granite runtime cannot load require()-based local assets (its asset
// registry is a warning stub), so apps-in-toss audio must stream from remote
// URIs. These files live in web/audio and are served by Firebase Hosting.
// Deploy steps: docs/apps-in-toss-registration.md.
export const FARM_AUDIO_SOURCES = {
  backgroundMusic: 'https://happy-farm-tycoon.web.app/audio/farm_bgm_loop.wav',
  harvestCoin: 'https://happy-farm-tycoon.web.app/audio/harvest_coin.wav',
  plant: 'https://happy-farm-tycoon.web.app/audio/sfx_plant.wav',
  reward: 'https://happy-farm-tycoon.web.app/audio/sting_reward.wav',
  unlock: 'https://happy-farm-tycoon.web.app/audio/sting_unlock.wav',
  mutation: 'https://happy-farm-tycoon.web.app/audio/sting_mutation.wav',
  wheelSpin: 'https://happy-farm-tycoon.web.app/audio/sfx_wheel_spin.wav',
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

// On Android every player must opt out of audio focus: otherwise starting the
// harvest SFX takes focus away from the BGM player and ExoPlayer pauses it, so
// only one sound survives. iOS mixes AVPlayer instances natively and the
// Granite wrapper pins disableFocus=false there.
const audioFocusProps = Platform.OS === 'android' ? { disableFocus: true } : {};

function keepPlaybackOnAudioFocusChange() {
  // Passing a handler stops the Granite Video wrapper from pausing playback on
  // focus changes; pause/resume is driven only by props and app visibility.
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
const OneShotEffectPlayer = React.forwardRef<OneShotHandle, { uri: string; volume: number }>(
  function OneShotEffectPlayer({ uri, volume }, ref) {
    const videoRef = useRef<VideoRef | null>(null);
    const [playing, setPlaying] = useState(false);
    const stopPlayback = useCallback(() => setPlaying(false), []);
    const warnFailure = useMemo(() => createPlaybackFailureWarning(uri), [uri]);

    useImperativeHandle(
      ref,
      () => ({
        play: () => {
          videoRef.current?.seek(0);
          setPlaying(true);
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
        onError={warnFailure}
        paused={!playing}
        source={{ uri, shouldCache: true }}
        style={styles.hiddenPlayer}
        volume={volume}
      />
    );
  }
);

export function useAppsInTossFarmAudio(): { audio: FarmGameAudio; audioElement: React.ReactNode } {
  const harvestPlayerRef = useRef<VideoRef | null>(null);
  const comboBonusOneRef = useRef<VideoRef | null>(null);
  const comboBonusTwoRef = useRef<VideoRef | null>(null);
  const comboMilestoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const effectHandlesRef = useRef<Partial<Record<FarmSoundEffectKey, OneShotHandle | null>>>({});
  const [backgroundMusicEnabled, setBackgroundMusicEnabled] = useState(false);
  const [harvestPlaying, setHarvestPlaying] = useState(false);
  const [comboBonusOnePlaying, setComboBonusOnePlaying] = useState(false);
  const [comboBonusTwoPlaying, setComboBonusTwoPlaying] = useState(false);

  const stopHarvestPlayback = useCallback(() => setHarvestPlaying(false), []);
  const stopComboBonusOnePlayback = useCallback(() => setComboBonusOnePlaying(false), []);
  const stopComboBonusTwoPlayback = useCallback(() => setComboBonusTwoPlaying(false), []);

  useEffect(() => {
    return () => {
      if (comboMilestoneTimerRef.current != null) {
        clearTimeout(comboMilestoneTimerRef.current);
      }
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
      setBackgroundMusicEnabled,
    }),
    []
  );

  const audioElement = (
    <>
      <Video
        {...audioFocusProps}
        ignoreSilentSwitch="ignore"
        onAudioFocusChanged={keepPlaybackOnAudioFocusChange}
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
        onError={warnHarvestCoinFailure}
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
        onError={warnHarvestCoinFailure}
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
        onError={warnHarvestCoinFailure}
        paused={!harvestPlaying}
        source={FARM_AUDIO_VIDEO_SOURCES.harvestCoin}
        style={styles.hiddenPlayer}
        volume={HARVEST_VOLUME}
      />
      {SOUND_EFFECT_PLAYERS.map(({ key, volume }) => (
        <OneShotEffectPlayer
          key={key}
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
