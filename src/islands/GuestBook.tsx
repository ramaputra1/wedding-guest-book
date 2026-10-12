import { useCallback, useEffect, useState } from 'preact/hooks';
import type { AlbumCopy } from '../config/site';
import { getAlbum, getSession } from '../lib/api';
import type { AlbumEntry, AlbumMode, DeviceId } from '../lib/types';
import { Album, NEW_SPREAD_ID } from './album/Album';
import { CameraRail } from './CameraRail';
import { SignIn } from './SignIn';

interface Props {
  mode: AlbumMode;
  /** Write mode only: which iPad this page is. Identity, not permission. */
  deviceId?: DeviceId;
  intro: string;
  copy: AlbumCopy;
}

type Auth = 'checking' | 'signed-out' | 'signed-in';

/**
 * The one island. On `/` it renders the album read-only; on /ipad1 and /ipad2
 * it adds sign-in, selection and the camera rail. Same markup in both modes.
 * Whether a write is allowed is decided by the server on every request —
 * nothing here grants anything.
 */
export default function GuestBook({ mode, deviceId, intro, copy }: Props) {
  const [entries, setEntries] = useState<AlbumEntry[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [auth, setAuth] = useState<Auth>(mode === 'write' ? 'checking' : 'signed-out');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async (fresh = false) => {
    try {
      setEntries(await getAlbum(copy, fresh));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [copy]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (mode !== 'write' || !deviceId) return;
    getSession()
      // A session made on the other iPad's page does not count here: signing
      // in again relabels this browser as this page's device.
      .then((session) => {
        const signedIn = session?.deviceId === deviceId;
        setAuth(signedIn ? 'signed-in' : 'signed-out');
        if (signedIn) void load(true);
      })
      .catch(() => setAuth('signed-out'));
  }, [mode, deviceId, load]);

  const onSignedIn = () => {
    setAuth('signed-in');
    // Signed out, this page may have been shown the public cached copy; now read it fresh.
    void load(true);
  };

  const toggleSelection = (id: string) => setSelectedId((current) => (current === id ? null : id));

  const writing = mode === 'write' && auth === 'signed-in';
  const album = (
    <Album
      entries={entries}
      loadFailed={loadFailed}
      mode={writing ? 'write' : 'view'}
      intro={intro}
      selectedId={selectedId}
      onSelect={toggleSelection}
      copy={copy}
    />
  );

  if (mode === 'view') return album;

  if (!writing) {
    return (
      <div class="album writer__album">
        {auth === 'signed-out' && deviceId && <SignIn deviceId={deviceId} copy={copy.signIn} onSignedIn={onSignedIn} />}
        {album}
      </div>
    );
  }

  // With nothing selected, a capture starts a new spread.
  const selectedIndex = (entries ?? []).findIndex((entry) => entry.id === selectedId);
  const destination =
    selectedId === null || selectedId === NEW_SPREAD_ID || selectedIndex < 0 ? copy.newSpread : `${copy.spread} ${selectedIndex + 1}`;

  return (
    <div class="writer">
      <CameraRail destination={destination} copy={copy.camera} />
      <div class="album writer__album">{album}</div>
    </div>
  );
}
