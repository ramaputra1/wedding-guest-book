import type { CameraCopy } from '../config/site';
import { Shutter, type CaptureMode } from './Shutter';

/** Short facts that fit the rail. Longer warnings appear above the album. */
export interface RailStatus {
  /** Captures in the queue, not yet confirmed saved. */
  waiting: number;
  /** From /api/stats: what the album uses of the free R2 allowance. */
  gauge: { usedBytes: number; allowanceBytes: number } | null;
}

interface Props {
  open: boolean;
  onToggle: () => void;
  mode: CaptureMode;
  onMode: (mode: CaptureMode) => void;
  recording: boolean;
  counting: boolean;
  /** The chosen photo self-timer and its choices, in seconds. */
  timer: number;
  timers: readonly number[];
  onTimer: (seconds: number) => void;
  progress: number;
  busy: boolean;
  onShutter: () => void;
  /** Where the next capture goes, e.g. "Spread 3". */
  destination: string;
  status: RailStatus;
  copy: CameraCopy;
}

const CONTROLS_ID = 'camera-rail-controls';
const GB = 1_000_000_000;

function gaugeText(gauge: NonNullable<RailStatus['gauge']>, copy: CameraCopy): string {
  const used = gauge.usedBytes / GB;
  return `${used < 10 ? used.toFixed(1) : Math.round(used)} ${copy.gaugeOf} ${Math.round(gauge.allowanceBytes / GB)} ${copy.gaugeUnit}`;
}

/**
 * The camera body: flush to the right edge on a wide screen, a bottom bar
 * when folded. Collapses to a thin strip with one control to reopen it; the
 * camera turns off with it.
 */
export function CameraRail({
  open,
  onToggle,
  mode,
  onMode,
  recording,
  counting,
  timer,
  timers,
  onTimer,
  progress,
  busy,
  onShutter,
  destination,
  status,
  copy,
}: Props) {
  // Nothing about the capture may change while one is under way.
  const capturing = recording || counting;
  return (
    <aside class="rail" data-open={String(open)} aria-label={copy.label}>
      <button
        type="button"
        class="rail__toggle"
        aria-expanded={open}
        aria-controls={CONTROLS_ID}
        // Closing the rail mid-recording or mid-countdown would cut a guest off.
        disabled={capturing}
        onClick={onToggle}
      >
        <svg class="rail__chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M9 5l7 7-7 7" />
        </svg>
        <span class="visually-hidden">{open ? copy.hide : copy.show}</span>
      </button>

      <div class="rail__controls" id={CONTROLS_ID} hidden={!open}>
        <div class="rail__choices">
          <fieldset class="rail__mode" disabled={capturing}>
            <legend class="visually-hidden">{copy.mode}</legend>
            {(['photo', 'video'] as const).map((option) => (
              <label key={option} class="rail__mode-option">
                <input type="radio" name="capture-mode" value={option} checked={mode === option} onChange={() => onMode(option)} />
                <span>{option === 'photo' ? copy.photo : copy.video}</span>
              </label>
            ))}
          </fieldset>

          {mode === 'photo' && (
            <fieldset class="rail__timer" disabled={capturing}>
              <legend class="visually-hidden">{copy.timer}</legend>
              {timers.map((seconds) => (
                <label key={seconds} class="rail__timer-option">
                  <input type="radio" name="photo-timer" value={seconds} checked={timer === seconds} onChange={() => onTimer(seconds)} />
                  <span>
                    {seconds} {copy.secondsShort}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
        </div>

        <Shutter mode={mode} recording={recording} counting={counting} timer={timer} progress={progress} busy={busy} onPress={onShutter} copy={copy} />

        <p class="rail__destination" aria-live="polite">
          <span class="visually-hidden">{copy.destination}: </span>
          <span aria-hidden="true">→ </span>
          {destination}
        </p>
      </div>

      <div class="rail__status" hidden={!open}>
        {status.waiting > 0 && (
          <p class="rail__waiting">
            {status.waiting} {copy.waiting}
          </p>
        )}
        {status.gauge && <p class="rail__gauge">{gaugeText(status.gauge, copy)}</p>}
      </div>
    </aside>
  );
}
