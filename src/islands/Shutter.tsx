import type { CameraCopy } from '../config/site';

export type CaptureMode = 'photo' | 'video';

interface Props {
  mode: CaptureMode;
  copy: CameraCopy;
}

/**
 * The shutter: a paper-white disc. In video mode it gains a ring, which
 * Phase 4 depletes over the 15-second cap — guests feel the clock without a
 * number to perform to. In Phase 2 it captures nothing.
 */
export function Shutter({ mode, copy }: Props) {
  return (
    <button type="button" class="shutter" data-mode={mode} aria-label={mode === 'photo' ? copy.takePhoto : copy.startRecording}>
      <svg class="shutter__ring" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle cx="50" cy="50" r="48" pathLength={100} />
      </svg>
      <span class="shutter__face" aria-hidden="true" />
    </button>
  );
}
