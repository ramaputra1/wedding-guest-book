import type { AlbumCopy } from '../../config/site';
import type { AlbumEntry, AlbumMode } from '../../lib/types';
import { Spread } from './Spread';

/** The writer's always-present blank spread at the end of the book. */
export const NEW_SPREAD_ID = 'new-spread';

interface Props {
  entries: AlbumEntry[];
  mode: AlbumMode;
  intro: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  copy: AlbumCopy;
}

export function Album({ entries, mode, intro, selectedId, onSelect, copy }: Props) {
  const showBook = entries.length > 0 || mode === 'write';

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
      {entries.length === 0 && mode === 'view' && <p class="album__empty">{copy.emptyAlbum}</p>}

      {showBook && (
        <div class="book">
          {entries.map((entry, i) => (
            <Spread
              key={entry.id}
              entry={entry}
              name={`${copy.spread} ${i + 1}`}
              mode={mode}
              selected={selectedId === entry.id}
              onSelect={() => onSelect(entry.id)}
              copy={copy}
            />
          ))}
          {mode === 'write' && (
            <Spread
              key={NEW_SPREAD_ID}
              entry={null}
              name={copy.newSpread}
              mode={mode}
              selected={selectedId === NEW_SPREAD_ID}
              onSelect={() => onSelect(NEW_SPREAD_ID)}
              copy={copy}
            />
          )}
        </div>
      )}
    </>
  );
}
