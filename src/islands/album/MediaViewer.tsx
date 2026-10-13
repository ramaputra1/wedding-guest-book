import { useEffect, useRef } from 'preact/hooks';
import type { ViewerCopy } from '../../config/site';
import type { AlbumMedia } from '../../lib/types';

interface Props {
  item: AlbumMedia;
  onClose: () => void;
  copy: ViewerCopy;
}

/**
 * The full photo or video, opened from the public album. A native modal
 * <dialog>: Escape closes it, focus stays inside, the page behind is inert.
 */
export function MediaViewer({ item, onClose, copy }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      class="viewer"
      aria-label={item.alt}
      onClose={onClose}
      // A tap on the backdrop (the dialog itself, outside the media) closes it.
      onClick={(event) => event.target === dialog.current && dialog.current?.close()}
    >
      {item.kind === 'video' ? (
        // Loops, as videos do everywhere in the album (owner request).
        <video class="viewer__media" src={item.fullSrc} poster={item.posterSrc} controls playsInline preload="metadata" autoPlay loop />
      ) : (
        <img class="viewer__media" src={item.fullSrc ?? item.src} alt={item.alt} />
      )}
      <form method="dialog" class="viewer__bar">
        <button type="submit" class="viewer__close">
          {copy.close}
        </button>
      </form>
    </dialog>
  );
}
