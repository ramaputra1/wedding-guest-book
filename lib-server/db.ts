/**
 * D1 queries. Every write is an INSERT; nothing is ever updated or deleted
 * here (CLAUDE.md, Data integrity).
 */
import type { ApiCanvas, ApiEntry, ApiMedia, DeviceId, MediaKind } from '../src/lib/types';

export const fileUrl = (key: string) => `/api/files/${key}`;

interface EntryRow {
  id: string;
  device_id: DeviceId;
  title: string | null;
  note: string | null;
  created_at: number;
}

interface MediaRow {
  id: string;
  entry_id: string;
  kind: MediaKind;
  r2_key: string;
  poster_key: string | null;
  thumb_key: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  bytes: number;
  created_at: number;
}

interface CanvasRow {
  id: string;
  entry_id: string;
  r2_key: string;
  version: number;
  created_at: number;
}

/** Everything the album shows, in three reads sent as one round trip. */
export async function listEntries(db: D1Database): Promise<ApiEntry[]> {
  const [entries, media, canvases] = await db.batch([
    db.prepare('SELECT id, device_id, title, note, created_at FROM entries ORDER BY created_at, id'),
    db.prepare(
      `SELECT id, entry_id, kind, r2_key, poster_key, thumb_key, width, height, duration_ms, bytes, created_at
       FROM media ORDER BY entry_id, sort_order, id`,
    ),
    // The highest version per entry. Versions are unique per entry (see insertCanvas).
    db.prepare(
      `SELECT c.id, c.entry_id, c.r2_key, c.version, c.created_at
       FROM canvases c
       JOIN (SELECT entry_id, MAX(version) AS version FROM canvases GROUP BY entry_id) latest
         ON latest.entry_id = c.entry_id AND latest.version = c.version`,
    ),
  ]);

  const mediaByEntry = new Map<string, ApiMedia[]>();
  for (const row of media.results as unknown as MediaRow[]) {
    const list = mediaByEntry.get(row.entry_id) ?? [];
    list.push({
      id: row.id,
      kind: row.kind,
      url: fileUrl(row.r2_key),
      thumbUrl: fileUrl(row.thumb_key),
      posterUrl: row.poster_key ? fileUrl(row.poster_key) : null,
      width: row.width,
      height: row.height,
      durationMs: row.duration_ms,
      bytes: row.bytes,
      createdAt: row.created_at,
    });
    mediaByEntry.set(row.entry_id, list);
  }

  const canvasByEntry = new Map<string, ApiCanvas>();
  for (const row of canvases.results as unknown as CanvasRow[]) {
    canvasByEntry.set(row.entry_id, { id: row.id, version: row.version, url: fileUrl(row.r2_key), createdAt: row.created_at });
  }

  return (entries.results as unknown as EntryRow[]).map((row) => ({
    id: row.id,
    deviceId: row.device_id,
    title: row.title,
    note: row.note,
    createdAt: row.created_at,
    media: mediaByEntry.get(row.id) ?? [],
    canvas: canvasByEntry.get(row.id) ?? null,
  }));
}

export async function entryExists(db: D1Database, id: string): Promise<boolean> {
  return (await db.prepare('SELECT 1 FROM entries WHERE id = ?').bind(id).first()) !== null;
}

export interface NewEntry {
  id: string;
  deviceId: DeviceId;
  title: string | null;
  note: string | null;
  createdAt: number;
}

/** Inserts the entry; a repeat of the same id inserts nothing. Returns whether a row was created. */
export async function insertEntry(db: D1Database, entry: NewEntry): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO entries (id, device_id, position, title, note, created_at)
       VALUES (?, ?, NULL, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
    )
    .bind(entry.id, entry.deviceId, entry.title, entry.note, entry.createdAt)
    .run();
  return result.meta.changes === 1;
}

export async function findEntry(db: D1Database, id: string): Promise<EntryRow | null> {
  return db.prepare('SELECT id, device_id, title, note, created_at FROM entries WHERE id = ?').bind(id).first<EntryRow>();
}

export interface NewMedia {
  id: string;
  entryId: string;
  kind: MediaKind;
  r2Key: string;
  posterKey: string | null;
  thumbKey: string;
  width: number;
  height: number;
  durationMs: number | null;
  bytes: number;
  createdAt: number;
}

export async function findMedia(db: D1Database, id: string): Promise<{ id: string; entry_id: string; kind: MediaKind } | null> {
  return db.prepare('SELECT id, entry_id, kind FROM media WHERE id = ?').bind(id).first();
}

export async function insertMedia(db: D1Database, m: NewMedia): Promise<boolean> {
  // sort_order is the capture time the id carries: items order themselves,
  // and no shared position counter is ever read or written.
  const result = await db
    .prepare(
      `INSERT INTO media (id, entry_id, kind, r2_key, poster_key, thumb_key, width, height, duration_ms, bytes, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
    )
    .bind(m.id, m.entryId, m.kind, m.r2Key, m.posterKey, m.thumbKey, m.width, m.height, m.durationMs, m.bytes, m.createdAt, m.createdAt)
    .run();
  return result.meta.changes === 1;
}

export async function findCanvas(db: D1Database, id: string): Promise<{ id: string; entry_id: string; version: number } | null> {
  return db.prepare('SELECT id, entry_id, version FROM canvases WHERE id = ?').bind(id).first();
}

/**
 * Saves a new canvas version. The version is computed inside the INSERT, in a
 * single statement, and D1 runs statements one at a time — so two iPads
 * saving the same page at the same instant get versions n and n+1, never two
 * rows claiming the same number. Nothing is overwritten; earlier versions stay.
 */
export async function insertCanvas(
  db: D1Database,
  c: { id: string; entryId: string; r2Key: string; strokeData: string; createdAt: number },
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO canvases (id, entry_id, r2_key, stroke_data, version, created_at)
       SELECT ?, ?, ?, ?, COALESCE(MAX(version), 0) + 1, ? FROM canvases WHERE entry_id = ?`,
    )
    .bind(c.id, c.entryId, c.r2Key, c.strokeData, c.createdAt, c.entryId)
    .run();
  return result.meta.changes === 1;
}

export async function counts(db: D1Database): Promise<{ entries: number; media: number; canvases: number; mediaBytes: number }> {
  const row = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM entries) AS entries,
              (SELECT COUNT(*) FROM media) AS media,
              (SELECT COUNT(*) FROM canvases) AS canvases,
              (SELECT COALESCE(SUM(bytes), 0) FROM media) AS mediaBytes`,
    )
    .first<{ entries: number; media: number; canvases: number; mediaBytes: number }>();
  return row ?? { entries: 0, media: 0, canvases: 0, mediaBytes: 0 };
}
