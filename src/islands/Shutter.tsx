import type { CameraCopy } from '../config/site';

export type CaptureMode = 'photo' | 'video';

interface Props {
  mode: CaptureMode;
  recording: boolean;
  /** A photo self-timer is running. */
  counting: boolean;
  /** The chosen photo timer, in seconds. */
  timer: number;
  /** 0 → 1 over the 15-second cap, or over the photo timer. */
  progress: number;
  busy: boolean;
  onPress: () => void;
  copy: CameraCopy;
}

/**
 * The shutter: a paper-white disc. In video mode it gains a ring; while
 * recording the ring depletes over the 15 seconds — guests feel the clock
 * without a number to perform to — and the face becomes the familiar
 * rounded "stop" square, so the state never rests on the ring alone.
 *
 * In photo mode the same ring counts down the self-timer.
 *
 * The ring is drawn from the elapsed time, not by a CSS animation: it is a
 * clock, not decoration, so the reduced-motion override must not freeze it.
 */
export function Shutter({ mode, recording, counting, timer, progress, busy, onPress, copy }: Props) {
  const label = recording
    ? copy.stopRecording
    : counting
      ? copy.cancelTimer
      : mode === 'photo'
        ? `${copy.takePhotoIn} ${timer} ${copy.seconds}`
        : copy.startRecording;
  return (
    <button
      type="button"
      class="shutter"
      data-mode={mode}
      data-recording={recording ? 'true' : undefined}
      data-counting={counting ? 'true' : undefined}
      aria-label={label}
      aria-busy={busy}
      disabled={busy}
      onClick={onPress}
    >
      <svg class="shutter__ring" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle class="shutter__ring-track" cx="50" cy="50" r="48" pathLength={100} />
        <circle
          class="shutter__ring-time"
          cx="50"
          cy="50"
          r="48"
          pathLength={100}
          stroke-dasharray="100"
          stroke-dashoffset={String(Math.round(progress * 1000) / 10)}
        />
      </svg>
      <span class="shutter__face" aria-hidden="true" />
    </button>
  );
}
