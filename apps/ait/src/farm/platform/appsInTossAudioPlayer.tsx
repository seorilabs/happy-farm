import { useVisibility, Video, type VideoRef } from '@granite-js/react-native';
import React, { useImperativeHandle, useRef } from 'react';
import {
  findNodeHandle,
  Platform,
  requireNativeComponent,
  UIManager,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

type AudioSource = {
  uri: string;
  shouldCache: boolean;
};

type AppsInTossAudioPlayerProps = {
  source: AudioSource;
  paused: boolean;
  repeat?: boolean;
  style: StyleProp<ViewStyle>;
  volume: number;
  onEnd?: () => void;
  onError: (error: unknown) => void;
};

export type AppsInTossAudioPlayerRef = Pick<VideoRef, 'seek'>;

type NativeVideoError = {
  code?: number;
  domain?: string;
  localizedDescription?: string;
  errorString?: string;
};

type NativeGraniteAudioProps = ViewProps & {
  source: AudioSource;
  paused: boolean;
  repeat?: boolean;
  volume: number;
  disableAudioFocus: boolean;
  playWhenInactive: boolean;
  onVideoEnd?: (event: NativeSyntheticEvent<null>) => void;
  onVideoError: (event: NativeSyntheticEvent<NativeVideoError>) => void;
};

const GRANITE_VIDEO_VIEW_NAME = 'GraniteVideoView';
const NativeGraniteAudioView =
  requireNativeComponent<NativeGraniteAudioProps>(GRANITE_VIDEO_VIEW_NAME);

function dispatchSeek(view: React.ComponentRef<typeof NativeGraniteAudioView> | null, time: number) {
  const nodeHandle = findNodeHandle(view);
  if (nodeHandle == null) {
    return;
  }

  const seekCommand =
    UIManager.getViewManagerConfig(GRANITE_VIDEO_VIEW_NAME).Commands.seek ?? 'seek';
  UIManager.dispatchViewManagerCommand(nodeHandle, seekCommand, [time, 0]);
}

const AndroidAudioPlayer = React.forwardRef<
  AppsInTossAudioPlayerRef,
  AppsInTossAudioPlayerProps
>(function AndroidAudioPlayer(
  { source, paused, repeat, style, volume, onEnd, onError },
  ref
) {
  const nativeRef = useRef<React.ComponentRef<typeof NativeGraniteAudioView> | null>(null);
  const isVisible = useVisibility();

  useImperativeHandle(
    ref,
    () => ({
      seek: (time: number) => dispatchSeek(nativeRef.current, time),
    }),
    []
  );

  return (
    <NativeGraniteAudioView
      ref={nativeRef}
      disableAudioFocus
      onVideoEnd={() => onEnd?.()}
      onVideoError={(event) => onError(event.nativeEvent)}
      paused={!isVisible || paused}
      playWhenInactive
      repeat={repeat}
      source={source}
      style={style}
      volume={volume}
    />
  );
});

function keepPlaybackOnAudioFocusChange() {
  // iOS keeps the public wrapper. Passing a handler leaves pause/resume under
  // the app visibility and explicit paused props, matching the previous path.
}

const IosAudioPlayer = React.forwardRef<
  AppsInTossAudioPlayerRef,
  AppsInTossAudioPlayerProps
>(function IosAudioPlayer(props, ref) {
  const videoRef = useRef<VideoRef | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      seek: (time: number) => videoRef.current?.seek(time),
    }),
    []
  );

  return (
    <Video
      ref={videoRef}
      ignoreSilentSwitch="ignore"
      onAudioFocusChanged={keepPlaybackOnAudioFocusChange}
      onEnd={props.onEnd}
      onError={props.onError}
      paused={props.paused}
      repeat={props.repeat}
      source={props.source}
      style={props.style}
      volume={props.volume}
    />
  );
});

export const AppsInTossAudioPlayer = React.forwardRef<
  AppsInTossAudioPlayerRef,
  AppsInTossAudioPlayerProps
>(function AppsInTossAudioPlayer(props, ref) {
  if (Platform.OS === 'android') {
    return <AndroidAudioPlayer {...props} ref={ref} />;
  }

  return <IosAudioPlayer {...props} ref={ref} />;
});

export function isAppsInTossAudioAvailable() {
  return Video.isAvailable;
}
