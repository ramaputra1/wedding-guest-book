import { useEffect, useRef, useState } from 'preact/hooks';
import type { AlbumCopy } from '../../config/site';
import type { AlbumMedia, AlbumMode } from '../../lib/types';
import { useSwipe } from '../hooks/useSwipe';
import { registerVideo, toggleByGuest } from './playback';
import { PhotoCorners } from './PhotoCorners';

/** The live camera, shown in the mount where the next capture will land. */
export interface LivePreview {
  /**
   * Never mirrored, not even the front camera: the guest sees exactly the
   * picture that will be saved (owner request).
   */
  stream: MediaStream;
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
  /** Write mode: the trash button was pressed on a saved item. */
  onRemove?: (item: AlbumMedia) => void;
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

function Duration({ item, copy }: { item: AlbumMedia; copy: AlbumCopy }) {
  if (item.kind !== 'video' || item.durationMs === undefined) return null;
  return (
    <span class="mount__duration">
      <span aria-hidden="true">{formatDuration(item.durationMs)}</span>
      <span class="visually-hidden">{`${copy.video}, ${Math.round(item.durationMs / 1000)} ${copy.seconds}`}</span>
    </span>
  );
}

type Playback = 'paused' | 'playing' | 'muted';

/**
 * A saved video on a writer iPad: it plays in its mount by itself, with
 * sound, looping, one at a time (playback.ts). The button — and a tap on the
 * video — plays, pauses, or turns the sound on when the browser started it
 * silently. Pausing must be possible: audio that starts on its own needs a
 * way to stop it (WCAG 1.4.2).
 */
function InlineVideo({ item, copy }: { item: AlbumMedia; copy: AlbumCopy }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<Playback>('paused');
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const sync = () => setState(element.paused ? 'paused' : element.muted ? 'muted' : 'playing');
    const events = ['play', 'pause', 'volumechange'] as const;
    for (const name of events) element.addEventListener(name, sync);
    const unregister = registerVideo(element);
    return () => {
      for (const name of events) element.removeEventListener(name, sync);
      unregister();
    };
  }, [item.fullSrc]);

  const toggle = () => video.current && toggleByGuest(video.current);
  const action = state === 'playing' ? copy.playback.pause : state === 'muted' ? copy.playback.soundOn : copy.playback.play;
  return (
    <span class="mount__print">
      <video
        ref={video}
        class="mount__media mount__media--inline"
        src={item.fullSrc}
        poster={item.posterSrc ?? item.src}
        aria-label={item.alt}
        loop
        playsInline
        preload="metadata"
        onClick={toggle}
      />
      <Duration item={item} copy={copy} />
      <button type="button" class="mount__playback" data-state={state} onClick={toggle}>
        {action}
      </button>
    </span>
  );
}

function Print({ item, copy }: { item: AlbumMedia; copy: AlbumCopy }) {
  return (
    <span class="mount__print">
      <img
        class="mount__media"
        draggable={false}
        src={item.src}
        srcset={item.srcSet}
        sizes={item.srcSet ? MOUNT_SIZES : undefined}
        width={item.width}
        height={item.height}
        alt={item.alt}
        loading="lazy"
        decoding="async"
      />
      <Duration item={item} copy={copy} />
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
export function MediaMount({ media, mode, spreadName, selected, onAdd, onLeave, canAdd, onRemove, live, justSaved, onOpen, onRetry, onDiscard, copy }: Props) {
  const [index, setIndex] = useState(0);
  /** The item whose number was tapped: it shows the trash button (owner request). */
  const [armedId, setArmedId] = useState<string | null>(null);
  // A new capture landing here comes into view on its own.
  const previousCount = useRef(media.length);
  useEffect(() => {
    if (media.length > previousCount.current) setIndex(media.length - 1);
    previousCount.current = media.length;
  }, [media.length]);

  const current = media[Math.min(index, media.length - 1)];
  const showLive = live !== undefined && !(live.reviewing && current);

  /** Shows one item. In the spread the camera is aimed at, that turns the camera away. */
  const show = (i: number) => {
    setIndex(i);
    if (selected) onLeave();
  };

  // A swipe steps through the items. The live picture counts as the place
  // after the last item: swiping back from it shows the newest capture. A
  // swipe never aims the camera — only "+" (or touching an empty mount) does.
  const swipe = useSwipe((direction) => {
    const from = showLive ? media.length : Math.min(index, media.length - 1);
    const to = from + direction;
    if (to >= 0 && to < media.length) show(to);
    // Swiping is browsing; the trash comes only from tapping a number.
    setArmedId(null);
  });

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

  // Only a saved item can be deleted; one still on its way has "Saving…" instead.
  const removable = mode === 'write' && !showLive && current !== undefined && !current.pending && current.id === armedId && onRemove !== undefined;

  const frame = (
    <span class="mount__frame">
      {live && <Live live={live} behind={!showLive} />}
      {!showLive &&
        current &&
        // Writer iPads play a saved video in place; still on its way, it shows its poster.
        (mode === 'write' && current.kind === 'video' && !current.pending && current.fullSrc ? (
          <InlineVideo key={current.id} item={current} copy={copy} />
        ) : (
          <Print key={current.id} item={current} copy={copy} />
        ))}
      {removable && (
        <button
          type="button"
          class="mount__remove"
          aria-label={current.kind === 'video' ? copy.remove.buttonVideo : copy.remove.buttonPhoto}
          onClick={(event) => {
            // Not a tap on the video beneath, which would play or pause it.
            event.stopPropagation();
            onRemove(current);
          }}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
          </svg>
        </button>
      )}
      <PhotoCorners />
    </span>
  );

  let mount;
  if (mode === 'write') {
    // Not a control: the "+" below is. The print's own alt text names it.
    // An empty mount is the one exception (owner request): touching the bare
    // corners aims the camera there at once. It is a pointer shortcut only —
    // the "+" beside it is the same action, named, for keyboard and screen
    // readers, so the mount does not repeat it as a second control.
    const addable = media.length === 0 && !selected && canAdd;
    mount = (
      <div
        class="mount"
        data-selected={selected ? 'true' : undefined}
        data-saved={justSaved ? 'true' : undefined}
        data-addable={addable ? 'true' : undefined}
        onClick={addable ? onAdd : undefined}
      >
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
      <div class="mount-wrap" {...swipe}>
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
                show(i);
                setArmedId(item.id);
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
