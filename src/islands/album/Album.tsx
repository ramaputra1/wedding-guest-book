import type { AlbumCopy } from '../../config/site';
import type { AlbumEntry, AlbumMedia, AlbumMode } from '../../lib/types';
import type { LivePreview } from './MediaMount';
import { Spread, type PageEditor } from './Spread';

/** The writer's always-present blank spread at the end of the book. */
export const NEW_SPREAD_ID = 'new-spread';

interface Props {
  /** null while the album is loading. */
  entries: AlbumEntry[] | null;
  loadFailed: boolean;
  mode: AlbumMode;
  intro: string;
  /** Where the camera's next capture lands, if anywhere. */
  selectedId: string | null;
  onAdd: (id: string) => void;
  onLeave: (id: string) => void;
  /** A spread holds at most this many photos and videos. */
  maxItems: number;
  /** Write mode: a page was tapped. */
  onWrite?: (id: string) => void;
  /** The live camera, and the spread it is shown in. */
  live?: { spreadId: string; preview: LivePreview };
  /** The writer's destination page, and how it saves. */
  editor?: { spreadId: string } & PageEditor;
  /** Entries whose capture was just confirmed saved. */
  justSaved?: ReadonlySet<string>;
  onOpen?: (item: AlbumMedia) => void;
  onRetry?: (mediaId: string) => void;
  onDiscard?: (mediaId: string) => void;
  copy: AlbumCopy;
}

export function Album({ entries, loadFailed, mode, intro, selectedId, onAdd, onLeave, maxItems, onWrite, live, editor, justSaved, onOpen, onRetry, onDiscard, copy }: Props) {
  const shared = { mode, onOpen, onRetry, onDiscard, copy };
  const loaded = entries ?? [];
  const showBook = entries !== null && (loaded.length > 0 || mode === 'write');
  const status = loadFailed ? copy.loadFailed : entries === null ? copy.loading : loaded.length === 0 && mode === 'view' ? copy.emptyAlbum : null;

  return (
    <>
      {/* One ruling pattern for every writing page. Pattern content takes its
          colour from here, not from the page that uses it. */}
      <svg class="album__defs" width="0" height="0" aria-hidden="true" focusable="false">
        <defs>
          <pattern id="writing-rules" width="8" height="32" patternUnits="userSpaceOnUse">
            <rect y="31" width="8" height="1" fill="currentColor" />
          </pattern>
        </defs>
      </svg>

      <p class="album__intro">{intro}</p>
      {/* role=status: the change from "Opening…" to the album, or to a
          failure, is announced without moving focus. */}
      <p class="album__empty" role="status">
        {status}
      </p>

      {showBook && (
        <div class="book">
          {loaded.map((entry, i) => (
            <Spread
              key={entry.id}
              entry={entry}
              spreadId={entry.id}
              name={`${copy.spread} ${i + 1}`}
              selected={selectedId === entry.id}
              onAdd={() => onAdd(entry.id)}
              onLeave={() => onLeave(entry.id)}
              canAdd={entry.media.length < maxItems}
              onWrite={onWrite && (() => onWrite(entry.id))}
              live={live?.spreadId === entry.id ? live.preview : undefined}
              editor={editor?.spreadId === entry.id ? editor : undefined}
              justSaved={justSaved?.has(entry.id)}
              {...shared}
            />
          ))}
          {mode === 'write' && (
            <Spread
              key={NEW_SPREAD_ID}
              entry={null}
              spreadId={NEW_SPREAD_ID}
              name={copy.newSpread}
              selected={selectedId === NEW_SPREAD_ID}
              onAdd={() => onAdd(NEW_SPREAD_ID)}
              onLeave={() => onLeave(NEW_SPREAD_ID)}
              canAdd
              onWrite={onWrite && (() => onWrite(NEW_SPREAD_ID))}
              live={live?.spreadId === NEW_SPREAD_ID ? live.preview : undefined}
              editor={editor?.spreadId === NEW_SPREAD_ID ? editor : undefined}
              {...shared}
            />
          )}
        </div>
      )}
    </>
  );
}
