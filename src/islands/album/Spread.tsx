import type { AlbumCopy } from '../../config/site';
import type { AlbumEntry, AlbumMedia, AlbumMode } from '../../lib/types';
import { Gutter } from './Gutter';
import { MediaMount, type LivePreview } from './MediaMount';
import { WritingCanvas } from './WritingCanvas';
import { WritingPage } from './WritingPage';
import type { Stroke } from '../../lib/canvas/strokes';

/** Turns this spread's page into a canvas: the writer's destination spread only. */
export interface PageEditor {
  entryId: string | null;
  hasSavedVersion: boolean;
  onSave: (strokes: Stroke[]) => Promise<void>;
  onPenDown: () => void;
  onPenUp: () => void;
}

interface Props {
  /** null for the writer's fresh, not-yet-saved spread. */
  entry: AlbumEntry | null;
  /** The spread's id, for scrolling it into view (the entry id, or the new-spread id). */
  spreadId: string;
  name: string;
  mode: AlbumMode;
  selected: boolean;
  onSelect: () => void;
  live?: LivePreview;
  editor?: PageEditor;
  justSaved?: boolean;
  onOpen?: (item: AlbumMedia) => void;
  onRetry?: (mediaId: string) => void;
  onDiscard?: (mediaId: string) => void;
  copy: AlbumCopy;
}

/** One entry as an open spread: media left, its handwriting right, the gutter between. */
export function Spread({ entry, spreadId, name, mode, selected, onSelect, live, editor, justSaved, onOpen, onRetry, onDiscard, copy }: Props) {
  return (
    <article class="spread" aria-label={name} data-spread-id={spreadId}>
      <div class="spread__media">
        <MediaMount
          media={entry?.media ?? []}
          mode={mode}
          spreadName={name}
          selected={selected}
          onSelect={onSelect}
          live={live}
          justSaved={justSaved}
          onOpen={onOpen}
          onRetry={onRetry}
          onDiscard={onDiscard}
          copy={copy}
        />
      </div>
      <Gutter />
      <div class="spread__writing">
        {editor ? (
          <WritingCanvas
            key={spreadId}
            entryId={editor.entryId}
            hasSavedVersion={editor.hasSavedVersion}
            spreadName={name}
            pending={entry?.page?.pending}
            onSave={editor.onSave}
            onPenDown={editor.onPenDown}
            onPenUp={editor.onPenUp}
            onRetry={onRetry}
            onDiscard={onDiscard}
            copy={copy}
          />
        ) : (
          <WritingPage page={entry?.page ?? null} blankLabel={copy.blankPage} onRetry={onRetry} copy={copy} />
        )}
      </div>
    </article>
  );
}
