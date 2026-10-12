import type { AlbumCopy } from '../../config/site';
import type { AlbumEntry, AlbumMode } from '../../lib/types';
import { Gutter } from './Gutter';
import { MediaMount } from './MediaMount';
import { WritingPage } from './WritingPage';

interface Props {
  /** null for the writer's fresh, not-yet-saved spread. */
  entry: AlbumEntry | null;
  name: string;
  mode: AlbumMode;
  selected: boolean;
  onSelect: () => void;
  copy: AlbumCopy;
}

/** One entry as an open spread: media left, its handwriting right, the gutter between. */
export function Spread({ entry, name, mode, selected, onSelect, copy }: Props) {
  return (
    <article class="spread" aria-label={name}>
      <div class="spread__media">
        <MediaMount
          media={entry?.media ?? []}
          mode={mode}
          spreadName={name}
          selected={selected}
          onSelect={onSelect}
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
