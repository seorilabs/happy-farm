/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import Sound from 'react-native-sound';

import type { FarmGameAudio } from '../../../../../packages/farm-ui/src';
import { useMobileFarmAudio } from '../farmAudio';

type MockSoundInstance = {
  asset: string;
  loaded: boolean;
  playing: boolean;
  setVolume: jest.Mock;
  isLoaded: jest.Mock;
  isPlaying: jest.Mock;
  setCurrentTime: jest.Mock;
  play: jest.Mock;
  stop: jest.Mock;
  pause: jest.Mock;
  setNumberOfLoops: jest.Mock;
  release: jest.Mock;
};

jest.mock('react-native-sound', () => {
  const instances: MockSoundInstance[] = [];
  function MockSound(this: MockSoundInstance, asset: string, _bundle: string, onLoad?: (error: unknown) => void) {
    this.asset = asset;
    this.loaded = true;
    this.playing = false;
    this.setVolume = jest.fn();
    this.isLoaded = jest.fn(() => this.loaded);
    this.isPlaying = jest.fn(() => this.playing);
    this.setCurrentTime = jest.fn();
    this.play = jest.fn(() => {
      this.playing = true;
    });
    this.stop = jest.fn((callback?: () => void) => {
      this.playing = false;
      callback?.();
    });
    this.pause = jest.fn(() => {
      this.playing = false;
    });
    this.setNumberOfLoops = jest.fn();
    this.release = jest.fn();
    instances.push(this);
    onLoad?.(null);
  }
  (MockSound as unknown as { MAIN_BUNDLE: string }).MAIN_BUNDLE = 'MAIN_BUNDLE';
  (MockSound as unknown as { setCategory: jest.Mock }).setCategory = jest.fn();
  (MockSound as unknown as { __instances: MockSoundInstance[] }).__instances = instances;
  return MockSound;
});

const soundInstances = (Sound as unknown as { __instances: MockSoundInstance[] }).__instances;

function findInstance(asset: string): MockSoundInstance {
  const instance = soundInstances.find((entry) => entry.asset === asset);
  if (instance == null) {
    throw new Error(`No sound was loaded for asset ${asset}`);
  }
  return instance;
}

function Harness({ onAudio }: { onAudio: (audio: FarmGameAudio) => void }) {
  onAudio(useMobileFarmAudio());
  return null;
}

async function renderFarmAudio() {
  let audio: FarmGameAudio | null = null;
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <Harness
        onAudio={(value) => {
          audio = value;
        }}
      />
    );
  });
  if (audio == null) {
    throw new Error('useMobileFarmAudio did not provide an audio controller.');
  }
  return { audio: audio as FarmGameAudio, renderer };
}

const EFFECT_ASSETS = {
  plant: 'sfx_plant.wav',
  reward: 'sting_reward.wav',
  unlock: 'sting_unlock.wav',
  mutation: 'sting_mutation.wav',
  wheelSpin: 'sfx_wheel_spin.wav',
} as const;

describe('useMobileFarmAudio', () => {
  beforeEach(() => {
    soundInstances.length = 0;
  });

  test('loads the harvest coin, BGM loop, and one bundled sound per effect', async () => {
    await renderFarmAudio();

    const loadedAssets = soundInstances.map((instance) => instance.asset);
    expect(loadedAssets).toEqual(
      expect.arrayContaining(['harvest_coin.wav', 'farm_bgm_loop.wav', ...Object.values(EFFECT_ASSETS)])
    );
    expect(loadedAssets).toHaveLength(2 + Object.keys(EFFECT_ASSETS).length);
  });

  test.each(Object.entries(EFFECT_ASSETS))(
    'playEffect(%s) plays only its own bundled asset from the start',
    async (effect, asset) => {
      const { audio } = await renderFarmAudio();

      await ReactTestRenderer.act(async () => {
        audio.playEffect(effect as keyof typeof EFFECT_ASSETS);
      });

      const played = findInstance(asset);
      expect(played.setCurrentTime).toHaveBeenCalledWith(0);
      expect(played.play).toHaveBeenCalledTimes(1);
      for (const [, otherAsset] of Object.entries(EFFECT_ASSETS)) {
        if (otherAsset !== asset) {
          expect(findInstance(otherAsset).play).not.toHaveBeenCalled();
        }
      }
    }
  );

  test('retriggering an effect mid-playback stops it before replaying', async () => {
    const { audio } = await renderFarmAudio();
    const reward = findInstance(EFFECT_ASSETS.reward);

    await ReactTestRenderer.act(async () => {
      audio.playEffect('reward');
    });
    await ReactTestRenderer.act(async () => {
      audio.playEffect('reward');
    });

    expect(reward.stop).toHaveBeenCalledTimes(1);
    expect(reward.play).toHaveBeenCalledTimes(2);
  });

  test('playEffect is a no-op (and does not throw) while the asset is not loaded', async () => {
    const { audio } = await renderFarmAudio();
    const unlock = findInstance(EFFECT_ASSETS.unlock);
    unlock.loaded = false;

    await ReactTestRenderer.act(async () => {
      expect(() => audio.playEffect('unlock')).not.toThrow();
    });

    expect(unlock.play).not.toHaveBeenCalled();
  });

  test('releases every loaded sound on unmount', async () => {
    const { renderer } = await renderFarmAudio();

    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });

    for (const instance of soundInstances) {
      expect(instance.release).toHaveBeenCalledTimes(1);
    }
  });
});
