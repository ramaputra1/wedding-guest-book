/**
 * manifest.json: the whole album as plain data — every entry, every photo and
 * video (deleted ones too, marked), every version of every handwritten page,
 * and every look the album has had — with each file's size and SHA-256.
 *
 * It is written to be read without this code, decades from now: plain JSON,
 * relative paths, epoch-millisecond times, and nothing that needs a server.
 */
import { createHash } from 'node:crypto';
import { closeSync, createReadStream, existsSync, openSync, readSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

export const MANIFEST_FORMAT = 'guestbook-archive';
export const MANIFEST_VERSION = 1;

export interface ArchiveFile {
  /** Relative to the archive folder, with forward slashes; also the R2 key. */
  path: string;
  bytes: number;
  sha256: string;
}

export interface ArchiveMedia {
  id: string;
  kind: 'photo' | 'video';
  width: number | null;
  height: number | null;
  durationMs: number | null;
  /** All of the item's files together, as the media row records it. */
  bytes: number;
  createdAt: number;
  sortOrder: number;
  original: string;
  thumb: string;
  poster: string | null;
  /** Taken out of the album with Delete; kept here, as it is kept in R2. */
  removed: { deviceId: string; removedAt: number } | null;
}

export interface ArchiveCanvas {
  id: string;
  version: number;
  createdAt: number;
  png: string;
  /** The stroke JSON exactly as stored in D1 (canvases.stroke_data). */
  strokes: string;
}

export interface ArchiveEntry {
  id: string;
  deviceId: string;
  title: string | null;
  note: string | null;
  position: number | null;
  createdAt: number;
  media: ArchiveMedia[];
  /** Every version, oldest first: an accidental clear is recoverable. */
  canvases: ArchiveCanvas[];
}

export interface ArchiveLook {
  id: string;
  deviceId: string;
  createdAt: number;
  /** As stored: the look's JSON (src/lib/settings.ts). */
  look: unknown;
}

export interface Manifest {
  format: typeof MANIFEST_FORMAT;
  version: typeof MANIFEST_VERSION;
  exportedAt: number;
  source: string;
  /** "Rama & Assela", "2026-12-19" — for the viewer's title. */
  couple: string | null;
  date: string | null;
  /** Every look ever saved, oldest first; the last is the one in use. */
  looks: ArchiveLook[];
  entries: ArchiveEntry[];
  /** Every file the archive holds besides the manifest and the viewer. */
  files: ArchiveFile[];
  /** Files the database names that could not be fetched. Empty in a healthy archive. */
  missing: string[];
}

/** Rows as D1 returns them (snake_case columns). */
export interface Rows {
  entries: Array<{ id: string; device_id: string; position: number | null; title: string | null; note: string | null; created_at: number }>;
  media: Array<{
    id: string;
    entry_id: string;
    kind: 'photo' | 'video';
    r2_key: string;
    poster_key: string | null;
    thumb_key: string;
    width: number | null;
    height: number | null;
    duration_ms: number | null;
    bytes: number;
    sort_order: number;
    created_at: number;
  }>;
  canvases: Array<{ id: string; entry_id: string; r2_key: string; stroke_data: string; version: number; created_at: number }>;
  removals: Array<{ media_id: string; device_id: string; removed_at: number }>;
  settings: Array<{ id: string; device_id: string; data: string; created_at: number }>;
}

/** Where a page version's stroke JSON is kept: beside its PNG. */
export const strokesPath = (pngPath: string) => pngPath.replace(/\.png$/, '.json');

/** Every R2 key the database refers to. */
export function objectKeys(rows: Rows): string[] {
  const keys = new Set<string>();
  for (const m of rows.media) {
    keys.add(m.r2_key);
    keys.add(m.thumb_key);
    if (m.poster_key) keys.add(m.poster_key);
  }
  for (const c of rows.canvases) keys.add(c.r2_key);
  return [...keys].sort();
}

export function buildEntries(rows: Rows): ArchiveEntry[] {
  const removed = new Map(rows.removals.map((r) => [r.media_id, { deviceId: r.device_id, removedAt: r.removed_at }]));
  const byEntry = new Map<string, ArchiveEntry>();
  for (const e of [...rows.entries].sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id))) {
    byEntry.set(e.id, { id: e.id, deviceId: e.device_id, title: e.title, note: e.note, position: e.position, createdAt: e.created_at, media: [], canvases: [] });
  }
  for (const m of [...rows.media].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))) {
    byEntry.get(m.entry_id)?.media.push({
      id: m.id,
      kind: m.kind,
      width: m.width,
      height: m.height,
      durationMs: m.duration_ms,
      bytes: m.bytes,
      createdAt: m.created_at,
      sortOrder: m.sort_order,
      original: m.r2_key,
      thumb: m.thumb_key,
      poster: m.poster_key,
      removed: removed.get(m.id) ?? null,
    });
  }
  for (const c of [...rows.canvases].sort((a, b) => a.version - b.version)) {
    byEntry.get(c.entry_id)?.canvases.push({ id: c.id, version: c.version, createdAt: c.created_at, png: c.r2_key, strokes: strokesPath(c.r2_key) });
  }
  return [...byEntry.values()];
}

export function buildLooks(rows: Rows): ArchiveLook[] {
  return [...rows.settings]
    .sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id))
    .map((s) => ({ id: s.id, deviceId: s.device_id, createdAt: s.created_at, look: JSON.parse(s.data) as unknown }));
}

export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

const LFS_POINTER = 'version https://git-lfs.github.com/spec/v1';

/**
 * A Git LFS pointer in place of the real file — what the nightly job sees,
 * because it clones the archive without downloading old media (that would
 * spend the LFS bandwidth allowance every night). The pointer carries the
 * real file's SHA-256 and size, which is all the manifest needs.
 */
export function readLfsPointer(path: string): { bytes: number; sha256: string } | null {
  const size = statSync(path).size;
  if (size > 400) return null;
  const buffer = Buffer.alloc(size);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, buffer, 0, size, 0);
  } finally {
    closeSync(fd);
  }
  const text = buffer.toString('utf8');
  if (!text.startsWith(LFS_POINTER)) return null;
  const oid = /^oid sha256:([0-9a-f]{64})$/m.exec(text)?.[1];
  const bytes = Number(/^size (\d+)$/m.exec(text)?.[1]);
  return oid && Number.isFinite(bytes) ? { bytes, sha256: oid } : null;
}

/** A file's real size and SHA-256, whether it is here in full or as an LFS pointer. */
export async function fileFacts(path: string): Promise<{ bytes: number; sha256: string; pointer: boolean }> {
  const pointer = readLfsPointer(path);
  if (pointer) return { ...pointer, pointer: true };
  return { bytes: statSync(path).size, sha256: await sha256File(path), pointer: false };
}

/** Files the archive keeps that the manifest does not list: itself, the viewer and its parts. */
export const ARCHIVE_FURNITURE = new Set(['manifest.json', 'manifest.js', 'viewer.html', 'README.md', '.gitattributes']);
const FURNITURE_FOLDERS = ['fonts/', '.git/'];

export function isFurniture(path: string): boolean {
  return ARCHIVE_FURNITURE.has(path) || FURNITURE_FOLDERS.some((folder) => path.startsWith(folder));
}

/** Every file under `dir`, as forward-slash relative paths. */
export async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(folder: string) {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      const full = join(folder, item.name);
      if (item.isDirectory()) {
        if (item.name === '.git') continue;
        await walk(full);
      } else if (item.isFile()) {
        out.push(relative(dir, full).split(sep).join('/'));
      }
    }
  }
  await walk(dir);
  return out.sort();
}

/**
 * Checks an archive folder against its manifest: the shape, every file the
 * entries name is listed and present with the listed size and SHA-256, and
 * no file is present that the manifest does not account for. Returns the
 * problems found; an empty list is a valid archive.
 */
export async function validateArchive(dir: string, manifest: Manifest, { hashes = true }: { hashes?: boolean } = {}): Promise<string[]> {
  const problems: string[] = [];
  if (manifest.format !== MANIFEST_FORMAT || manifest.version !== MANIFEST_VERSION) problems.push('manifest: not a guestbook-archive v1');
  if (!Array.isArray(manifest.entries) || !Array.isArray(manifest.files) || !Array.isArray(manifest.looks)) {
    problems.push('manifest: entries, files and looks must be lists');
    return problems;
  }

  const listed = new Map(manifest.files.map((f) => [f.path, f]));
  const missing = new Set(manifest.missing ?? []);
  const named: string[] = [];
  const ids = new Set<string>();
  for (const entry of manifest.entries) {
    if (ids.has(entry.id)) problems.push(`entry ${entry.id}: listed twice`);
    ids.add(entry.id);
    for (const m of entry.media) {
      if (ids.has(m.id)) problems.push(`media ${m.id}: listed twice`);
      ids.add(m.id);
      if (m.kind !== 'photo' && m.kind !== 'video') problems.push(`media ${m.id}: unknown kind`);
      if (m.kind === 'video' && !m.poster) problems.push(`media ${m.id}: a video without a poster`);
      named.push(m.original, m.thumb, ...(m.poster ? [m.poster] : []));
    }
    const versions = entry.canvases.map((c) => c.version);
    if (versions.some((v, i) => v !== i + 1)) problems.push(`entry ${entry.id}: page versions are not 1…${versions.length}`);
    for (const c of entry.canvases) named.push(c.png, c.strokes);
  }

  for (const path of named) {
    if (missing.has(path)) continue;
    if (!listed.has(path)) problems.push(`${path}: named by an entry but not listed in files`);
  }
  for (const file of manifest.files) {
    const full = join(dir, file.path);
    if (!existsSync(full)) {
      problems.push(`${file.path}: listed but not present`);
      continue;
    }
    const facts = hashes ? await fileFacts(full) : { bytes: readLfsPointer(full)?.bytes ?? statSync(full).size, sha256: file.sha256 };
    if (facts.bytes !== file.bytes) problems.push(`${file.path}: ${facts.bytes} bytes, the manifest says ${file.bytes}`);
    else if (facts.sha256 !== file.sha256) problems.push(`${file.path}: its SHA-256 does not match the manifest`);
  }
  const namedSet = new Set(named);
  for (const file of manifest.files) if (!namedSet.has(file.path)) problems.push(`${file.path}: listed but no entry names it`);
  for (const path of await listFiles(dir)) {
    if (!isFurniture(path) && !listed.has(path)) problems.push(`${path}: present but not in the manifest`);
  }
  return problems;
}
