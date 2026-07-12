/// <reference types="jest" />

import React from 'react';
import { act, cleanup, render } from '@testing-library/react-native';

import type { FarmGameAudio } from '../../../../../packages/farm-ui/src';

type RecordedVideoProps = {
  source?: { uri?: string; shouldCache?: boolean };
  paused?: boolean;
  repeat?: boolean;
  style?: { left?: number; top?: number; width?: number; height?: number; opacity?: number };
  volume?: number;
  onEnd?: () => void;
  onAudioFocusChanged?: (event: { hasAudioFocus: boolean }) => void;
};

const mockVideoRenders: RecordedVideoProps[] = [];
const mockSeek = jest.fn();

jest.mock('@granite-js/react-native', () => {
  const ReactActual = jest.requireActual('react') as typeof import('react');

  const Video = ReactActual.forwardRef<unknown, RecordedVideoProps>((props, ref) => {
    ReactActual.useImperativeHandle(ref, () => ({ seek: mockSeek }));
    mockVideoRenders.push(props);
    return null;
  });
  (Video as unknown as { isAvailable: boolean }).isAvailable = true;

  return { Video };
});

const { FARM_AUDIO_SOURCES, useAppsInTossFarmAudio } =
  jest.requireActual<typeof import('../platform/appsInTossAudio')>('../platform/appsInTossAudio');

function latestPropsFor(uri: string): RecordedVideoProps {
  const props = [...mockVideoRenders].reverse().find((entry) => entry.source?.uri === uri);
  if (props == null) {
    throw new Error(`No Video was rendered with source ${uri}`);
  }
  return props;
}

function Harness({ onAudio }: { onAudio: (audio: FarmGameAudio) => void }) {
  const { audio, audioElement } = useAppsInTossFarmAudio();
  onAudio(audio);
  return <>{audioElement}</>;
}

function renderFarmAudio() {
  let audio: FarmGameAudio | null = null;
  render(
    <Harness
      onAudio={(value) => {
        audio = value;
      }}
    />
  );
  if (audio == null) {
    throw new Error('useAppsInTossFarmAudio did not provide an audio controller.');
  }
  return audio as FarmGameAudio;
}

describe('useAppsInTossFarmAudio', () => {
  beforeEach(() => {
    mockVideoRenders.length = 0;
    mockSeek.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  test('streams both farm sounds from remote URIs and reports audio as supported', () => {
    const audio = renderFarmAudio();

    expect(audio.isSupported).toBe(true);

    const bgm = latestPropsFor(FARM_AUDIO_SOURCES.backgroundMusic);
    expect(bgm.repeat).toBe(true);
    expect(bgm.paused).toBe(true);
    expect(bgm.source?.shouldCache).toBe(true);
    expect(bgm.style).toEqual(expect.objectContaining({ left: -10000, top: -10000, width: 1, height: 1, opacity: 0 }));
    expect(bgm.onAudioFocusChanged).toBeDefined();

    const harvest = latestPropsFor(FARM_AUDIO_SOURCES.harvestCoin);
    expect(harvest.paused).toBe(true);
    expect(harvest.source?.shouldCache).toBe(true);
  });

  test('toggles background music playback through the FarmGame audio contract', () => {
    const audio = renderFarmAudio();
    const initialSource = latestPropsFor(FARM_AUDIO_SOURCES.backgroundMusic).source;

    act(() => {
      void audio.setBackgroundMusicEnabled(true);
    });
    expect(latestPropsFor(FARM_AUDIO_SOURCES.backgroundMusic).paused).toBe(false);
    expect(latestPropsFor(FARM_AUDIO_SOURCES.backgroundMusic).source).toBe(initialSource);

    act(() => {
      void audio.setBackgroundMusicEnabled(false);
    });
    expect(latestPropsFor(FARM_AUDIO_SOURCES.backgroundMusic).paused).toBe(true);
    expect(latestPropsFor(FARM_AUDIO_SOURCES.backgroundMusic).source).toBe(initialSource);
  });

  test('plays the harvest sound from the start and pauses the player when it ends', () => {
    const audio = renderFarmAudio();

    act(() => {
      void audio.playHarvest();
    });

    expect(mockSeek).toHaveBeenCalledWith(0);
    expect(latestPropsFor(FARM_AUDIO_SOURCES.harvestCoin).paused).toBe(false);

    act(() => {
      latestPropsFor(FARM_AUDIO_SOURCES.harvestCoin).onEnd?.();
    });

    expect(latestPropsFor(FARM_AUDIO_SOURCES.harvestCoin).paused).toBe(true);
  });

  test('restarts the harvest sound when a new harvest lands mid-playback', () => {
    const audio = renderFarmAudio();

    act(() => {
      void audio.playHarvest();
    });
    act(() => {
      void audio.playHarvest();
    });

    expect(mockSeek).toHaveBeenCalledTimes(2);
    expect(latestPropsFor(FARM_AUDIO_SOURCES.harvestCoin).paused).toBe(false);
  });

  const EFFECT_URIS = {
    plant: FARM_AUDIO_SOURCES.plant,
    reward: FARM_AUDIO_SOURCES.reward,
    unlock: FARM_AUDIO_SOURCES.unlock,
    mutation: FARM_AUDIO_SOURCES.mutation,
    wheelSpin: FARM_AUDIO_SOURCES.wheelSpin,
  } as const;

  test('mounts one paused, cached remote player per one-shot effect', () => {
    renderFarmAudio();

    for (const uri of Object.values(EFFECT_URIS)) {
      expect(latestPropsFor(uri).paused).toBe(true);
      expect(latestPropsFor(uri).source?.shouldCache).toBe(true);
    }
  });

  test.each(Object.entries(EFFECT_URIS))(
    'playEffect(%s) plays only its own player from the start and pauses on end',
    (effect, uri) => {
      const audio = renderFarmAudio();

      act(() => {
        audio.playEffect(effect as keyof typeof EFFECT_URIS);
      });

      expect(mockSeek).toHaveBeenCalledWith(0);
      expect(latestPropsFor(uri).paused).toBe(false);
      // Every other effect player stays paused: play routes to exactly one.
      for (const otherUri of Object.values(EFFECT_URIS)) {
        if (otherUri !== uri) {
          expect(latestPropsFor(otherUri).paused).toBe(true);
        }
      }

      act(() => {
        latestPropsFor(uri).onEnd?.();
      });

      expect(latestPropsFor(uri).paused).toBe(true);
    }
  );

  test('retriggering an effect mid-playback restarts it via a stop-then-play cycle', () => {
    const audio = renderFarmAudio();

    act(() => {
      audio.playEffect('reward');
    });
    expect(latestPropsFor(FARM_AUDIO_SOURCES.reward).paused).toBe(false);

    // Second call before onEnd: the player must pass through paused=true and
    // come back unpaused (mobile playFromStart parity), with a fresh seek(0).
    act(() => {
      audio.playEffect('reward');
    });

    expect(mockSeek).toHaveBeenCalledTimes(2);
    expect(mockSeek).toHaveBeenLastCalledWith(0);
    expect(latestPropsFor(FARM_AUDIO_SOURCES.reward).paused).toBe(false);

    act(() => {
      latestPropsFor(FARM_AUDIO_SOURCES.reward).onEnd?.();
    });
    expect(latestPropsFor(FARM_AUDIO_SOURCES.reward).paused).toBe(true);
  });
});
