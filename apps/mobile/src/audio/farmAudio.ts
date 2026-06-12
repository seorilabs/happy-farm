import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import Sound from 'react-native-sound';

import type { FarmGameAudio } from '../../../ait/src/farm/FarmGame';

const farmBgmLoopSound = 'farm_bgm_loop.wav';
const harvestCoinSound = 'harvest_coin.wav';

function loadSound(
  asset: string,
  volume: number,
  onReady?: (sound: Sound) => void,
) {
  let sound: Sound | null = null;
  let didLoad = false;
  const notifyReady = () => {
    if (sound == null || !didLoad) {
      return;
    }
    sound.setVolume(volume);
    onReady?.(sound);
  };

  sound = new Sound(asset, Sound.MAIN_BUNDLE, error => {
    if (error != null) {
      console.warn('Failed to load farm audio asset.', error);
      return;
    }

    didLoad = true;
    notifyReady();
  });

  sound.setVolume(volume);
  notifyReady();

  return sound;
}

function playFromStart(sound: Sound) {
  if (!sound.isLoaded()) {
    return;
  }

  const play = () => {
    sound.setCurrentTime(0);
    sound.play();
  };

  if (sound.isPlaying()) {
    sound.stop(play);
    return;
  }

  play();
}

function isAppStateActive(appState: AppStateStatus | null) {
  return appState == null || appState === 'active';
}

export function useMobileFarmAudio(): FarmGameAudio {
  const harvestSoundRef = useRef<Sound | null>(null);
  const bgmSoundRef = useRef<Sound | null>(null);
  const bgmEnabledRef = useRef(false);
  const appActiveRef = useRef(isAppStateActive(AppState.currentState));

  const syncBackgroundMusicPlayback = useCallback((targetSound?: Sound | null) => {
    const sound = targetSound ?? bgmSoundRef.current;
    if (sound == null || !sound.isLoaded()) {
      return;
    }

    if (!bgmEnabledRef.current) {
      sound.stop();
      return;
    }

    if (!appActiveRef.current) {
      if (sound.isPlaying()) {
        sound.pause();
      }
      return;
    }

    sound.setNumberOfLoops(-1);
    if (!sound.isPlaying()) {
      sound.play();
    }
  }, []);

  useEffect(() => {
    Sound.setCategory('Playback', true);

    harvestSoundRef.current = loadSound(harvestCoinSound, 0.85);
    bgmSoundRef.current = loadSound(farmBgmLoopSound, 0.16, sound => {
      sound.setNumberOfLoops(-1);
      syncBackgroundMusicPlayback(sound);
    });

    const appStateSubscription = AppState.addEventListener('change', nextAppState => {
      appActiveRef.current = isAppStateActive(nextAppState);
      syncBackgroundMusicPlayback();
    });

    return () => {
      const harvestSound = harvestSoundRef.current;
      const bgmSound = bgmSoundRef.current;

      appStateSubscription.remove();
      harvestSound?.release();
      harvestSoundRef.current = null;
      bgmSound?.stop(() => bgmSound.release());
      bgmSoundRef.current = null;
    };
  }, [syncBackgroundMusicPlayback]);

  return useMemo(
    () => ({
      isSupported: true,
      playHarvest: () => {
        const sound = harvestSoundRef.current;
        if (sound == null) {
          return;
        }
        playFromStart(sound);
      },
      setBackgroundMusicEnabled: (enabled: boolean) => {
        bgmEnabledRef.current = enabled;
        syncBackgroundMusicPlayback();
      },
    }),
    [syncBackgroundMusicPlayback],
  );
}
