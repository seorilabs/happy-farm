/// <reference types="jest" />

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

type RecordedNativeProps = {
  disableAudioFocus?: boolean;
  paused?: boolean;
  playWhenInactive?: boolean;
  repeat?: boolean;
  source?: { uri: string; shouldCache: boolean };
  volume?: number;
  onVideoEnd?: () => void;
  onVideoError?: (event: { nativeEvent: unknown }) => void;
};

const mockNativeRenders: RecordedNativeProps[] = [];
const mockDispatchViewManagerCommand = jest.fn();
const mockOnEnd = jest.fn();
const mockOnError = jest.fn();

jest.mock('@granite-js/react-native', () => ({
  Video: Object.assign(() => null, { isAvailable: true }),
  useVisibility: () => true,
}));

jest.mock('react-native', () => {
  const ReactActual = jest.requireActual('react') as typeof import('react');

  return {
    Platform: { OS: 'android' },
    findNodeHandle: () => 42,
    requireNativeComponent: () =>
      ReactActual.forwardRef<unknown, RecordedNativeProps>((props, ref) => {
        ReactActual.useImperativeHandle(ref, () => ({}));
        mockNativeRenders.push(props);
        return null;
      }),
    UIManager: {
      getViewManagerConfig: () => ({ Commands: { seek: 7 } }),
      dispatchViewManagerCommand: mockDispatchViewManagerCommand,
    },
  };
});

const { AppsInTossAudioPlayer } = jest.requireActual<
  typeof import('../platform/appsInTossAudioPlayer')
>('../platform/appsInTossAudioPlayer');

describe('AppsInTossAudioPlayer Android', () => {
  beforeEach(() => {
    mockNativeRenders.length = 0;
    mockDispatchViewManagerCommand.mockClear();
    mockOnEnd.mockClear();
    mockOnError.mockClear();
  });

  it('passes disableAudioFocus directly to GraniteVideoView', async () => {
    const ref = React.createRef<{ seek: (time: number) => void }>();

    await act(async () => {
      TestRenderer.create(
        <AppsInTossAudioPlayer
          ref={ref}
          onEnd={mockOnEnd}
          onError={mockOnError}
          paused={false}
          repeat
          source={{ uri: 'https://example.com/audio.wav', shouldCache: true }}
          style={{ width: 1, height: 1 }}
          volume={0.5}
        />
      );
    });

    const nativeProps = mockNativeRenders.at(-1);
    expect(nativeProps).toEqual(
      expect.objectContaining({
        disableAudioFocus: true,
        paused: false,
        playWhenInactive: true,
        repeat: true,
        source: { uri: 'https://example.com/audio.wav', shouldCache: true },
        volume: 0.5,
      })
    );

    await act(async () => {
      ref.current?.seek(3.5);
    });
    expect(mockDispatchViewManagerCommand).toHaveBeenCalledWith(42, 7, [3.5, 0]);

    await act(async () => {
      nativeProps?.onVideoEnd?.();
      nativeProps?.onVideoError?.({ nativeEvent: { code: 1001 } });
    });
    expect(mockOnEnd).toHaveBeenCalledTimes(1);
    expect(mockOnError).toHaveBeenCalledWith({ code: 1001 });
  });
});
