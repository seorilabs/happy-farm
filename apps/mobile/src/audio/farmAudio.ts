import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import Sound from 'react-native-sound';

import { logDevWarning } from '../../../../packages/farm-core/src';
import type { FarmGameAudio, FarmSoundEffectKey } from '../../../../packages/farm-ui/src';

const farmBgmLoopSound = 'farm_bgm_loop.wav';
const harvestCoinSound = 'harvest_coin.wav';

// Per-effect assets and volumes. Stingers sit just below the harvest coin
// (0.85) so reward moments read as bigger without clipping over the BGM;
// the mechanical plant/wheel sounds stay quieter still.
const soundEffectSpecs: Record<FarmSoundEffectKey, { asset: string; volume: number }> = {
  plant: { asset: 'sfx_plant.wav', volume: 0.6 },
  reward: { asset: 'sting_reward.wav', volume: 0.8 },
  unlock: { asset: 'sting_unlock.wav', volume: 0.8 },
  mutation: { asset: 'sting_mutation.wav', volume: 0.75 },
  wheelSpin: { asset: 'sfx_wheel_spin.wav', volume: 0.55 },
};

const SOUND_EFFECT_KEYS = Object.keys(soundEffectSpecs) as FarmSoundEffectKey[];

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
      logDevWarning('Failed to load farm audio asset.', error);
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
  const effectSoundsRef = useRef<Partial<Record<FarmSoundEffectKey, Sound>>>({});
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
    for (const key of SOUND_EFFECT_KEYS) {
      const spec = soundEffectSpecs[key];
      effectSoundsRef.current[key] = loadSound(spec.asset, spec.volume);
    }
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
      const effectSounds = effectSoundsRef.current;

      appStateSubscription.remove();
      harvestSound?.release();
      harvestSoundRef.current = null;
      for (const key of SOUND_EFFECT_KEYS) {
        effectSounds[key]?.release();
        delete effectSounds[key];
      }
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
      playComboMilestone: (tier) => {
        const sound = harvestSoundRef.current;
        if (sound == null) {
          return;
        }

        playFromStart(sound);
        if (tier === 'legendary') {
          setTimeout(() => playFromStart(sound), 90);
        }
      },
      playEffect: (effect) => {
        const sound = effectSoundsRef.current[effect];
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
