import { Video, type VideoRef } from '@granite-js/react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';

import type { FarmGameAudio } from '../FarmGame';

// The Granite runtime cannot load require()-based local assets (its asset
// registry is a warning stub), so apps-in-toss audio must stream from remote
// URIs. These files live in web/audio and are served by Firebase Hosting.
// Deploy steps: docs/apps-in-toss-registration.md.
export const FARM_AUDIO_SOURCES = {
  backgroundMusic: 'https://happy-farm-tycoon.web.app/audio/farm_bgm_loop.wav',
  harvestCoin: 'https://happy-farm-tycoon.web.app/audio/harvest_coin.wav',
} as const;

const BACKGROUND_MUSIC_VOLUME = 0.16;
const HARVEST_VOLUME = 0.85;

// On Android every player must opt out of audio focus: otherwise starting the
// harvest SFX takes focus away from the BGM player and ExoPlayer pauses it, so
// only one sound survives. iOS mixes AVPlayer instances natively and the
// Granite wrapper pins disableFocus=false there.
const audioFocusProps = Platform.OS === 'android' ? { disableFocus: true } : null;

function keepPlaybackOnAudioFocusChange() {
  // Passing a handler stops the Granite Video wrapper from pausing playback on
  // focus changes; pause/resume is driven only by props and app visibility.
}

// Two players share this hook, so failure logs must name the URI to make
// on-device diagnosis (404, blocked host, codec) possible.
function createPlaybackFailureWarning(uri: string) {
  return (error: unknown) => {
    console.warn(`Failed to play farm audio source: ${uri}`, error);
  };
}

const warnBackgroundMusicFailure = createPlaybackFailureWarning(FARM_AUDIO_SOURCES.backgroundMusic);
const warnHarvestCoinFailure = createPlaybackFailureWarning(FARM_AUDIO_SOURCES.harvestCoin);

export function useAppsInTossFarmAudio(): { audio: FarmGameAudio; audioElement: React.ReactNode } {
  const harvestPlayerRef = useRef<VideoRef | null>(null);
  const [backgroundMusicEnabled, setBackgroundMusicEnabled] = useState(false);
  const [harvestPlaying, setHarvestPlaying] = useState(false);

  const stopHarvestPlayback = useCallback(() => setHarvestPlaying(false), []);

  const audio = useMemo<FarmGameAudio>(
    () => ({
      isSupported: Video.isAvailable,
      playHarvest: () => {
        harvestPlayerRef.current?.seek(0);
        setHarvestPlaying(true);
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
        source={{ uri: FARM_AUDIO_SOURCES.backgroundMusic }}
        style={styles.hiddenPlayer}
        volume={BACKGROUND_MUSIC_VOLUME}
      />
      <Video
        {...audioFocusProps}
        ref={harvestPlayerRef}
        ignoreSilentSwitch="ignore"
        onAudioFocusChanged={keepPlaybackOnAudioFocusChange}
        onEnd={stopHarvestPlayback}
        onError={warnHarvestCoinFailure}
        paused={!harvestPlaying}
        source={{ uri: FARM_AUDIO_SOURCES.harvestCoin }}
        style={styles.hiddenPlayer}
        volume={HARVEST_VOLUME}
      />
    </>
  );

  return { audio, audioElement };
}

const styles = StyleSheet.create({
  // Players stay mounted so the remote sources stay buffered, but they must
  // never affect layout or touch handling.
  hiddenPlayer: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
  },
});
