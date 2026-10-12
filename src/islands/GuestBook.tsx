import { useState } from 'preact/hooks';
import type { AlbumCopy } from '../config/site';
import type { AlbumEntry, AlbumMode } from '../lib/types';
import { Album, NEW_SPREAD_ID } from './album/Album';
import { CameraRail } from './CameraRail';

interface Props {
  mode: AlbumMode;
  entries: AlbumEntry[];
  intro: string;
  copy: AlbumCopy;
}

/**
 * The one island. On `/` it renders the album read-only; on /ipad1 and /ipad2
 * it adds selection and the camera rail. Same markup in both modes.
 */
export default function GuestBook({ mode, entries, intro, copy }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const toggleSelection = (id: string) => setSelectedId((current) => (current === id ? null : id));

  const album = (
    <Album entries={entries} mode={mode} intro={intro} selectedId={selectedId} onSelect={toggleSelection} copy={copy} />
  );

  if (mode === 'view') return album;

  // With nothing selected, a capture starts a new spread.
  const selectedIndex = entries.findIndex((entry) => entry.id === selectedId);
  const destination =
    selectedId === null || selectedId === NEW_SPREAD_ID ? copy.newSpread : `${copy.spread} ${selectedIndex + 1}`;

  return (
    <div class="writer">
      <CameraRail destination={destination} copy={copy.camera} />
      <div class="album writer__album">{album}</div>
    </div>
  );
}
