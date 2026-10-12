import { useState } from 'preact/hooks';
import type { AlbumCopy } from '../../config/site';
import type { AlbumMedia, AlbumMode } from '../../lib/types';
import { PhotoCorners } from './PhotoCorners';

interface Props {
  media: AlbumMedia[];
  mode: AlbumMode;
  /** "Spread 3" — the mount's accessible name in write mode. */
  spreadName: string;
  selected: boolean;
  onSelect: () => void;
  copy: AlbumCopy;
}

/** 15000 → "0:15". */
export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// The mount is half a spread wide on a wide screen, nearly full width when folded.
const MOUNT_SIZES = '(orientation: landscape) and (min-width: 48rem) 40vw, 90vw';

function Print({ item, copy }: { item: AlbumMedia; copy: AlbumCopy }) {
  return (
    <span class="mount__print">
      <img
        class="mount__media"
        src={item.src}
        srcset={item.srcSet}
        sizes={MOUNT_SIZES}
        width={item.width}
        height={item.height}
        alt={item.alt}
        loading="lazy"
        decoding="async"
      />
      {item.kind === 'video' && item.durationMs !== undefined && (
        <span class="mount__duration">
          <span aria-hidden="true">{formatDuration(item.durationMs)}</span>
          <span class="visually-hidden">{`${copy.video}, ${Math.round(item.durationMs / 1000)} ${copy.seconds}`}</span>
        </span>
      )}
    </span>
  );
}

/**
 * A mounted print, or — with no media — four bare corners on the leaf.
 * Several items become a carousel with dots beneath. In write mode the mount
 * is a toggle button: selecting it makes it the camera's destination.
 */
export function MediaMount({ media, mode, spreadName, selected, onSelect, copy }: Props) {
  const [index, setIndex] = useState(0);
  const current = media[Math.min(index, media.length - 1)];
  const print = current ? <Print item={current} copy={copy} /> : null;

  const itemCount = media.length === 1 ? `1 ${copy.item}` : `${media.length} ${copy.items}`;
  // The name must contain any text drawn on the button (WCAG 2.5.3, label in
  // name), so a voice-control user can say what they see — the "0:15" badge.
  const videoPart =
    current?.kind === 'video' && current.durationMs !== undefined
      ? `, ${copy.video} ${formatDuration(current.durationMs)}`
      : '';
  const mountName = `${spreadName}, ${media.length === 0 ? copy.emptyMount : itemCount}${videoPart}`;

  const mount =
    mode === 'write' ? (
      <button type="button" class="mount" aria-pressed={selected} aria-label={mountName} onClick={onSelect}>
        {print}
        <PhotoCorners />
      </button>
    ) : (
      <div class="mount">
        {print}
        <PhotoCorners />
      </div>
    );

  return (
    <>
      {mount}
      <div class="dots" role={media.length > 1 ? 'group' : undefined} aria-label={media.length > 1 ? `${spreadName}, ${copy.items}` : undefined}>
        {media.length > 1 &&
          media.map((item, i) => (
            <button
              key={item.id}
              type="button"
              class="dots__dot"
              aria-current={i === index ? 'true' : undefined}
              aria-label={`${copy.showItem} ${i + 1} ${copy.of} ${media.length}`}
              onClick={() => setIndex(i)}
            />
          ))}
      </div>
    </>
  );
}
