import { useEffect, useRef, useState } from 'preact/hooks';
import type { SettingsCopy } from '../config/site';
import { FRAMES, LEAVES, PAPERS, THEMES, WATERMARK_MAX, WATERMARK_POSITIONS, watermarkLength, type AlbumLook } from '../lib/settings';

interface Props {
  look: AlbumLook;
  /** Every change shows on the album at once, before anything is saved. */
  onPreview: (look: AlbumLook) => void;
  /** Resolves when saved; throws a message to show when it was not. */
  onSave: (look: AlbumLook) => Promise<void>;
  /** Closed without saving: the album goes back to the saved look. */
  onCancel: () => void;
  copy: SettingsCopy;
}

interface ChoiceProps<T extends string> {
  name: string;
  legend: string;
  values: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}

/** One question, as native radios: arrow keys move between the answers. */
function Choices<T extends string>({ name, legend, values, labels, value, onChange }: ChoiceProps<T>) {
  return (
    <fieldset class="settings__group">
      <legend class="settings__legend">{legend}</legend>
      <div class="settings__choices">
        {values.map((option) => (
          <label key={option} class="settings__choice">
            <input type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} />
            {labels[option]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Settings: the album's look for everyone (src/lib/settings.ts). A sheet at
 * the side of the screen, so the album beside it shows each choice as it is
 * made. A native modal <dialog>: Escape is Cancel, the page behind is inert.
 */
export function SettingsDialog({ look, onPreview, onSave, onCancel, copy }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<AlbumLook>(look);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const change = (next: AlbumLook) => {
    setDraft(next);
    setProblem(null);
    onPreview(next);
  };

  const save = async (event: Event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setProblem(null);
    try {
      await onSave({ ...draft, watermark: { ...draft.watermark, text: draft.watermark.text.trim() } });
    } catch (failure) {
      setProblem(failure instanceof Error ? failure.message : copy.failed);
      setSaving(false);
    }
  };

  const length = watermarkLength(draft.watermark.text);
  const w = copy.watermark;
  return (
    <dialog ref={dialog} class="settings" aria-labelledby="settings-title" onClose={onCancel}>
      <form class="settings__body" id="settings-form" onSubmit={(event) => void save(event)}>
        <h2 id="settings-title" class="settings__title">
          {copy.title}
        </h2>
        <p class="settings__intro">{copy.intro}</p>

        <fieldset class="settings__group">
          <legend class="settings__legend">{copy.leaf.legend}</legend>
          <div class="settings__choices">
            {LEAVES.map((leaf) => (
              <label key={leaf} class="settings__choice settings__choice--swatch">
                <input type="radio" name="leaf" value={leaf} checked={draft.leaf === leaf} onChange={() => change({ ...draft, leaf })} />
                {/* Its own data-leaf gives the disc that colour's --leaf. */}
                <span class="settings__swatch" data-leaf={leaf} aria-hidden="true" />
                {copy.leaf.options[leaf]}
              </label>
            ))}
          </div>
        </fieldset>

        <Choices name="frame" legend={copy.frame.legend} values={FRAMES} labels={copy.frame.options} value={draft.frame} onChange={(frame) => change({ ...draft, frame })} />
        <Choices name="paper" legend={copy.paper.legend} values={PAPERS} labels={copy.paper.options} value={draft.paper} onChange={(paper) => change({ ...draft, paper })} />

        <fieldset class="settings__group">
          <legend class="settings__legend">{w.legend}</legend>
          <label class="settings__hint" for="settings-watermark">
            {w.text}
          </label>
          <input
            id="settings-watermark"
            class="settings__input"
            type="text"
            autocomplete="off"
            spellcheck={false}
            // UTF-16 units: a little stricter than the server's count of characters, never looser.
            maxLength={WATERMARK_MAX}
            aria-describedby="settings-watermark-hint"
            value={draft.watermark.text}
            onInput={(event) => change({ ...draft, watermark: { ...draft.watermark, text: (event.target as HTMLInputElement).value } })}
          />
          <p id="settings-watermark-hint" class="settings__hint">
            {w.hint} <span class="settings__count">{`${length} ${w.of} ${WATERMARK_MAX}`}</span>
          </p>
          <p class="settings__hint" id="settings-place">
            {w.place}
          </p>
          <div class="settings__places" role="radiogroup" aria-labelledby="settings-place">
            {WATERMARK_POSITIONS.map((position) => (
              <label key={position} class="settings__choice" style={{ gridArea: position }}>
                <input
                  type="radio"
                  name="watermark-position"
                  value={position}
                  checked={draft.watermark.position === position}
                  onChange={() => change({ ...draft, watermark: { ...draft.watermark, position } })}
                />
                {w.options[position]}
              </label>
            ))}
          </div>
        </fieldset>

        <Choices name="theme" legend={copy.theme.legend} values={THEMES} labels={copy.theme.options} value={draft.theme} onChange={(theme) => change({ ...draft, theme })} />

        {problem && (
          <p class="settings__problem" role="alert">
            {problem}
          </p>
        )}
      </form>
      <div class="settings__actions">
        <button type="button" class="settings__cancel" onClick={() => dialog.current?.close()}>
          {copy.cancel}
        </button>
        <button type="submit" form="settings-form" class="settings__save" disabled={saving}>
          {saving ? copy.saving : copy.save}
        </button>
      </div>
    </dialog>
  );
}
