import { useEffect, useRef } from 'preact/hooks';
import type { RemoveCopy } from '../../config/site';
import type { AlbumMedia } from '../../lib/types';

interface Props {
  item: AlbumMedia;
  onConfirm: () => void;
  onCancel: () => void;
  copy: RemoveCopy;
}

/**
 * "Delete this photo?" — Yes or No (owner request). A native modal <dialog>:
 * Escape is No, focus starts on No, and the page behind is inert. The item
 * itself is shown, so nobody deletes the wrong one.
 */
export function ConfirmRemove({ item, onConfirm, onCancel, copy }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const no = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    no.current?.focus();
  }, []);

  const question = item.kind === 'video' ? copy.questionVideo : copy.questionPhoto;
  return (
    <dialog ref={dialog} class="confirm" aria-labelledby="confirm-question" aria-describedby="confirm-detail" onClose={onCancel}>
      <img class="confirm__item" src={item.src} alt={item.alt} />
      <h2 id="confirm-question" class="confirm__question">
        {question}
      </h2>
      <p id="confirm-detail" class="confirm__detail">
        {copy.detail}
      </p>
      <div class="confirm__actions">
        <button ref={no} type="button" class="confirm__no" onClick={() => dialog.current?.close()}>
          {copy.no}
        </button>
        <button type="button" class="confirm__yes" onClick={onConfirm}>
          {copy.yes}
        </button>
      </div>
    </dialog>
  );
}
