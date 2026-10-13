import { useEffect, useId, useRef } from 'preact/hooks';

interface Props {
  question: string;
  detail: string;
  yes: string;
  no: string;
  /** Shown above the question, so nobody confirms about the wrong thing. */
  image?: { src: string; alt: string };
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The album's one way of asking before something goes: a native modal
 * <dialog> with No and Yes (owner request — Delete, Clear, Cancel all ask the
 * same way). Escape is No, focus starts on No, and the page behind is inert.
 */
export function ConfirmDialog({ question, detail, yes, no, image, onConfirm, onCancel }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const noButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    noButton.current?.focus();
  }, []);

  return (
    <dialog ref={dialog} class="confirm" aria-labelledby={`${id}-question`} aria-describedby={`${id}-detail`} onClose={onCancel}>
      {image && <img class="confirm__item" src={image.src} alt={image.alt} />}
      <h2 id={`${id}-question`} class="confirm__question">
        {question}
      </h2>
      <p id={`${id}-detail`} class="confirm__detail">
        {detail}
      </p>
      <div class="confirm__actions">
        <button ref={noButton} type="button" class="confirm__no" onClick={() => dialog.current?.close()}>
          {no}
        </button>
        <button type="button" class="confirm__yes" onClick={onConfirm}>
          {yes}
        </button>
      </div>
    </dialog>
  );
}
