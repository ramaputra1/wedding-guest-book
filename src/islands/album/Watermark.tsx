import type { AlbumLook } from '../../lib/settings';

/**
 * The owner's mark on every writing page (Settings → Watermark): their
 * initials, say, faint under the ink. A mark, not content — hidden from
 * assistive technology, and absent while the text is empty.
 */
export function Watermark({ mark }: { mark?: AlbumLook['watermark'] }) {
  if (!mark || mark.text === '') return null;
  return (
    <span class="writing-page__watermark" data-position={mark.position} aria-hidden="true">
      {mark.text}
    </span>
  );
}
