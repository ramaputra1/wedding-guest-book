import { useEffect, useRef, useState } from 'preact/hooks';
import type { AlbumCopy } from '../../config/site';
import type { AlbumMedia, AlbumMode } from '../../lib/types';
import { PhotoCorners } from './PhotoCorners';

/** The live camera, shown in the mount where the next capture will land. */
export interface LivePreview {
  /**
   * Never mirrored, not even the front camera: the guest sees exactly the
   * picture that will be saved (owner request).
   */
  stream: MediaStream;
  /** Width ÷ height of the camera frame. */
  aspect: number;
  /**
   * Just captured: show the new item for a moment. The camera stays mounted
   * underneath, invisible, so a quick second press of the shutter still has
   * a frame to take.
   */
  reviewing: boolean;
  /** Seconds left on the photo self-timer, shown large so guests know when to smile. */
  countdown?: number;
  onVideo: (video: HTMLVideoElement | null) => void;
}

interface Props {
  media: AlbumMedia[];
  mode: AlbumMode;
  /** "Spread 3" — the mount's accessible name. */
  spreadName: string;
  /** Write mode: this mount is where the camera's next capture lands. */
  selected: boolean;
  /** Write mode: the "+" was pressed — make this the destination, or stop being it. */
  onAdd: () => void;
  /** Write mode: a number was chosen here while the camera was aimed at it. */
  onLeave: () => void;
  /** Write mode: room for another item (a spread holds at most `maxItems`). */
  canAdd: boolean;
  live?: LivePreview;
  /** A capture in this mount was just confirmed saved: the corners flash brass. */
  justSaved?: boolean;
  onOpen?: (item: AlbumMedia) => void;
  onRetry?: (mediaId: string) => void;
  onDiscard?: (mediaId: string) => void;
  copy: AlbumCopy;
}

/** 15000 → "0:15". */
export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// The mount is half a spread wide on a wide screen, nearly full width when folded.
const MOUNT_SIZES = '(orientation: landscape) and (min-width: 48rem) 40vw, 90vw';
const CELL_RATIO = 4 / 3;

/**
 * The print keeps its own shape inside the mount's 4:3 space: a landscape
 * photo fills the width, a portrait one stands upright at full height. Nothing
 * is cropped, and every spread still lines up.
 */
function frameShape(ratio: number): { class: string; aspect: string } {
  return { class: ratio < CELL_RATIO ? 'mount__frame mount__frame--tall' : 'mount__frame', aspect: String(ratio) };
}

function Print({ item, copy }: { item: AlbumMedia; copy: AlbumCopy }) {
  return (
    <span class="mount__print">
      <img
        class="mount__media"
        src={item.src}
        srcset={item.srcSet}
        sizes={item.srcSet ? MOUNT_SIZES : undefined}
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

function Live({ live, behind }: { live: LivePreview; behind: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = live.stream;
    void element.play().catch(() => undefined);
    live.onVideo(element);
    return () => live.onVideo(null);
  }, [live.stream]);
  return (
    <span class={behind ? 'mount__print mount__print--live mount__print--behind' : 'mount__print mount__print--live'}>
      <video ref={video} class="mount__live" muted playsInline autoPlay aria-hidden="true" />
      {live.countdown !== undefined && !behind && (
        // Announced once by the page when the countdown starts; each second is visual only.
        <span class="mount__countdown" aria-hidden="true">
          {live.countdown}
        </span>
      )}
    </span>
  );
}

/** Saving…, or a failure that stays until it is fixed — on the mount, never a toast. */
function SaveStatus({ media, copy, onRetry, onDiscard }: { media: AlbumMedia[]; copy: AlbumCopy; onRetry?: (id: string) => void; onDiscard?: (id: string) => void }) {
  const failed = media.find((item) => item.pending?.state === 'failed');
  if (failed) {
    const pending = failed.pending!;
    const message =
      pending.code === 'unauthorized'
        ? copy.save.signInAgain
        : pending.permanent && pending.message
          ? pending.message
          : failed.kind === 'video'
            ? copy.save.notSavedVideo
            : copy.save.notSavedPhoto;
    return (
      <div class="mount-status mount-status--failed" role="alert">
        <button type="button" class="mount-status__retry" onClick={() => onRetry?.(failed.id)}>
          {message}
        </button>
        {pending.permanent && (
          <button type="button" class="mount-status__remove" onClick={() => onDiscard?.(failed.id)}>
            {copy.save.remove}
          </button>
        )}
      </div>
    );
  }
  if (media.some((item) => item.pending?.state === 'saving')) {
    return <p class="mount-status mount-status--saving">{copy.save.saving}</p>;
  }
  return null;
}

/**
 * A mounted print, or — with no media — four bare corners on the leaf.
 * Several items become a carousel with numbers beneath. In write mode a "+"
 * after the numbers is the only way to aim the camera here; choosing a
 * number shows that item and turns the camera away again. On the public
 * album the mount opens the full photo or video.
 */
export function MediaMount({ media, mode, spreadName, selected, onAdd, onLeave, canAdd, live, justSaved, onOpen, onRetry, onDiscard, copy }: Props) {
  const [index, setIndex] = useState(0);
  // A new capture landing here comes into view on its own.
  const previousCount = useRef(media.length);
  useEffect(() => {
    if (media.length > previousCount.current) setIndex(media.length - 1);
    previousCount.current = media.length;
  }, [media.length]);

  const current = media[Math.min(index, media.length - 1)];
  const showLive = live !== undefined && !(live.reviewing && current);
  const ratio = showLive ? live.aspect : current ? current.width / current.height : CELL_RATIO;
  const shape = frameShape(ratio);

  const itemCount = media.length === 1 ? `1 ${copy.item}` : `${media.length} ${copy.items}`;
  // The name must contain any text drawn on the button (WCAG 2.5.3, label in
  // name), so a voice-control user can say what they see — the "0:15" badge.
  const videoPart =
    current?.kind === 'video' && current.durationMs !== undefined
      ? `, ${copy.video} ${formatDuration(current.durationMs)}`
      : '';
  const mountName = `${spreadName}, ${media.length === 0 ? copy.emptyMount : itemCount}${videoPart}`;
  const writing = mode === 'write';
  // On the iPads even one item gets its number, beside the "+"; on the public
  // album a single print needs no navigation.
  const showNumbers = writing ? media.length > 0 : media.length > 1;

  const frame = (
    <span class={shape.class} style={{ aspectRatio: shape.aspect }}>
      {live && <Live live={live} behind={!showLive} />}
      {!showLive && current && <Print item={current} copy={copy} />}
      <PhotoCorners />
    </span>
  );

  let mount;
  if (mode === 'write') {
    // Not a control: the "+" below is. The print's own alt text names it.
    mount = (
      <div class="mount" data-selected={selected ? 'true' : undefined} data-saved={justSaved ? 'true' : undefined}>
        {frame}
      </div>
    );
  } else if (current && !current.pending && onOpen) {
    const action = current.kind === 'video' ? copy.viewer.playVideo : copy.viewer.openPhoto;
    mount = (
      <button type="button" class="mount mount--open" aria-label={`${action}, ${mountName}`} onClick={() => onOpen(current)}>
        {frame}
      </button>
    );
  } else {
    mount = <div class="mount">{frame}</div>;
  }

  return (
    <>
      <div class="mount-wrap">
        {mount}
        <SaveStatus media={media} copy={copy} onRetry={onRetry} onDiscard={onDiscard} />
      </div>
      <div class="numbers" role={showNumbers || writing ? 'group' : undefined} aria-label={showNumbers || writing ? `${spreadName}, ${media.length === 0 ? copy.emptyMount : itemCount}` : undefined}>
        {showNumbers &&
          media.map((item, i) => (
            <button
              key={item.id}
              type="button"
              class="numbers__item"
              aria-current={i === index && !showLive ? 'true' : undefined}
              aria-label={`${copy.showItem} ${i + 1} ${copy.of} ${media.length}`}
              onClick={() => {
                setIndex(i);
                if (selected) onLeave();
              }}
            >
              {i + 1}
            </button>
          ))}
        {writing && canAdd && (
          <button type="button" class="numbers__add" aria-pressed={selected} aria-label={`${copy.addTo} ${spreadName}`} onClick={onAdd}>
            <span aria-hidden="true">+</span>
          </button>
        )}
      </div>
    </>
  );
}
