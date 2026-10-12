import { useState } from 'preact/hooks';
import type { CameraCopy } from '../config/site';
import { Shutter, type CaptureMode } from './Shutter';

interface Props {
  /** Where the next capture goes, e.g. "Spread 3". */
  destination: string;
  copy: CameraCopy;
}

const CONTROLS_ID = 'camera-rail-controls';

/**
 * The camera body: flush to the right edge on a wide screen, a bottom bar when
 * folded. Collapses to a thin strip with one control to reopen it.
 */
export function CameraRail({ destination, copy }: Props) {
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<CaptureMode>('photo');

  return (
    <aside class="rail" data-open={String(open)} aria-label={copy.label}>
      <button
        type="button"
        class="rail__toggle"
        aria-expanded={open}
        aria-controls={CONTROLS_ID}
        onClick={() => setOpen(!open)}
      >
        <svg class="rail__chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M9 5l7 7-7 7" />
        </svg>
        <span class="visually-hidden">{open ? copy.hide : copy.show}</span>
      </button>

      <div class="rail__controls" id={CONTROLS_ID} hidden={!open}>
        <fieldset class="rail__mode">
          <legend class="visually-hidden">{copy.mode}</legend>
          {(['photo', 'video'] as const).map((option) => (
            <label key={option} class="rail__mode-option">
              <input
                type="radio"
                name="capture-mode"
                value={option}
                checked={mode === option}
                onChange={() => setMode(option)}
              />
              <span>{option === 'photo' ? copy.photo : copy.video}</span>
            </label>
          ))}
        </fieldset>

        <Shutter mode={mode} copy={copy} />

        <p class="rail__destination" aria-live="polite">
          <span class="visually-hidden">{copy.destination}: </span>
          <span aria-hidden="true">→ </span>
          {destination}
        </p>
      </div>
    </aside>
  );
}
