import type { AlbumCopy } from '../../config/site';
import type { AlbumEntry, AlbumMedia, AlbumMode } from '../../lib/types';
import { Gutter } from './Gutter';
import { MediaMount, type LivePreview } from './MediaMount';
import { WritingPage } from './WritingPage';

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
  justSaved?: boolean;
  onOpen?: (item: AlbumMedia) => void;
  onRetry?: (mediaId: string) => void;
  onDiscard?: (mediaId: string) => void;
  copy: AlbumCopy;
}

/** One entry as an open spread: media left, its handwriting right, the gutter between. */
export function Spread({ entry, spreadId, name, mode, selected, onSelect, live, justSaved, onOpen, onRetry, onDiscard, copy }: Props) {
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
        <WritingPage page={entry?.page ?? null} blankLabel={copy.blankPage} />
      </div>
    </article>
  );
}
