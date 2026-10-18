/**
 * The archive → the live album: puts back what is missing, and touches
 * nothing that is there (docs/RUNBOOK.md has the situations and commands).
 *
 *   node --experimental-strip-types scripts/restore-archive.ts --from ../guest-book-archive --target test --entry ipad1-01K…
 *   …                                                            --target production --media ipad2-01K… --apply --production
 *   …                                                            --target production --all --apply --production
 *
 * - Dry run by default: it says exactly what it would do. --apply does it.
 *   Production also needs --production, so a slip of the target cannot
 *   write to the real album.
 * - Never overwrites. Rows go back with INSERT OR IGNORE; a row that exists
 *   is left as it is. A file is uploaded only when storage does not have it,
 *   and only after its SHA-256 matches the manifest.
 * - Files first, then rows: the album never names a file that is not there.
 * - Writes need the owner's own `wrangler login` (Edit rights); the nightly
 *   export's token can only read.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readLfsPointer, sha256File, type ArchiveEntry, type ArchiveLook, type Manifest } from './archive/manifest.ts';
import { eachLimit, Store, type Target } from './archive/store.ts';

const ROOT = resolve(import.meta.dirname, '..');

const CONTENT_TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4', mov: 'video/quicktime' };

/** A value as a SQL literal. Strings are quoted with quotes doubled; nothing else is accepted. */
function sql(value: string | number | null): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Not a finite number: ${value}`);
    return String(value);
  }
  return `'${value.replace(/'/g, "''")}'`;
}

const list = (ids: string[]) => ids.map(sql).join(', ');

export interface Scope {
  entries?: string[];
  media?: string[];
  all?: boolean;
}

interface Plan {
  entries: ArchiveEntry[];
  /** Media rows, page versions, deletions and looks to put back. */
  rows: { entries: string[]; media: string[]; canvases: string[]; removals: string[]; looks: string[] };
  /** Files storage does not have, to upload. */
  uploads: string[];
  statements: string[];
}

/** What the scope covers in the archive. */
function select(manifest: Manifest, scope: Scope): { entries: ArchiveEntry[]; looks: ArchiveLook[] } {
  if (scope.all) return { entries: manifest.entries, looks: manifest.looks };
  const wantEntries = new Set(scope.entries ?? []);
  const wantMedia = new Set(scope.media ?? []);
  const entries: ArchiveEntry[] = [];
  for (const entry of manifest.entries) {
    if (wantEntries.has(entry.id)) entries.push(entry);
    else {
      const media = entry.media.filter((m) => wantMedia.has(m.id));
      // A single item comes back with its entry (if that is missing too), but not the entry's other items.
      if (media.length) entries.push({ ...entry, media, canvases: [] });
    }
  }
  const found = new Set(entries.flatMap((e) => [e.id, ...e.media.map((m) => m.id)]));
  const unknown = [...wantEntries, ...wantMedia].filter((id) => !found.has(id));
  if (unknown.length) throw new Error(`Not in this archive: ${unknown.join(', ')}`);
  return { entries, looks: [] };
}

async function existing(store: Store, table: string, column: string, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const out = new Set<string>();
  // In batches, to keep each query short.
  for (let i = 0; i < ids.length; i += 200) {
    const rows = await store.rows<Record<string, string>>(`SELECT ${column} AS id FROM ${table} WHERE ${column} IN (${list(ids.slice(i, i + 200))})`);
    for (const row of rows) out.add(row.id);
  }
  return out;
}

export async function planRestore(store: Store, archive: string, manifest: Manifest, scope: Scope): Promise<Plan> {
  const { entries, looks } = select(manifest, scope);
  const media = entries.flatMap((e) => e.media.map((m) => ({ ...m, entryId: e.id })));
  const canvases = entries.flatMap((e) => e.canvases.map((c) => ({ ...c, entryId: e.id })));
  const removals = media.filter((m) => m.removed);

  // One query at a time (see readRows in export-archive.ts).
  const haveEntries = await existing(store, 'entries', 'id', entries.map((e) => e.id));
  const haveMedia = await existing(store, 'media', 'id', media.map((m) => m.id));
  const haveCanvases = await existing(store, 'canvases', 'id', canvases.map((c) => c.id));
  const haveRemovals = await existing(store, 'media_removals', 'media_id', removals.map((m) => m.id));
  const haveLooks = await existing(store, 'album_settings', 'id', looks.map((l) => l.id));

  // Every file in scope is checked against storage, so a lost file is put back even when its row survived.
  const files = [...media.flatMap((m) => [m.original, m.thumb, ...(m.poster ? [m.poster] : [])]), ...canvases.map((c) => c.png)];
  const uploads: string[] = [];
  const scratch = mkdtempSync(join(tmpdir(), 'guestbook-restore-'));
  try {
    await eachLimit(files, store.parallel(6), async (path) => {
      if (!(await store.getObject(path, join(scratch, path.replace(/\//g, '_'))))) uploads.push(path);
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const statements: string[] = [];
  const rows: Plan['rows'] = { entries: [], media: [], canvases: [], removals: [], looks: [] };
  for (const e of entries) {
    if (haveEntries.has(e.id)) continue;
    rows.entries.push(e.id);
    statements.push(
      `INSERT OR IGNORE INTO entries (id, device_id, position, title, note, created_at) VALUES (${[e.id, e.deviceId, e.position, e.title, e.note, e.createdAt].map(sql).join(', ')});`,
    );
  }
  for (const m of media) {
    if (haveMedia.has(m.id)) continue;
    rows.media.push(m.id);
    statements.push(
      `INSERT OR IGNORE INTO media (id, entry_id, kind, r2_key, poster_key, thumb_key, width, height, duration_ms, bytes, sort_order, created_at) VALUES (${[
        m.id, m.entryId, m.kind, m.original, m.poster, m.thumb, m.width, m.height, m.durationMs, m.bytes, m.sortOrder, m.createdAt,
      ].map(sql).join(', ')});`,
    );
  }
  for (const c of canvases) {
    if (haveCanvases.has(c.id)) continue;
    rows.canvases.push(c.id);
    const strokes = readFileSync(join(archive, c.strokes), 'utf8');
    statements.push(
      `INSERT OR IGNORE INTO canvases (id, entry_id, r2_key, stroke_data, version, created_at) VALUES (${[c.id, c.entryId, c.png, strokes, c.version, c.createdAt].map(sql).join(', ')});`,
    );
  }
  // A photo deleted on the day stays deleted after a restore: the archive says so.
  for (const m of removals) {
    if (haveRemovals.has(m.id) || !m.removed) continue;
    rows.removals.push(m.id);
    statements.push(`INSERT OR IGNORE INTO media_removals (media_id, device_id, removed_at) VALUES (${[m.id, m.removed.deviceId, m.removed.removedAt].map(sql).join(', ')});`);
  }
  for (const l of looks) {
    if (haveLooks.has(l.id)) continue;
    rows.looks.push(l.id);
    statements.push(`INSERT OR IGNORE INTO album_settings (id, device_id, data, created_at) VALUES (${[l.id, l.deviceId, JSON.stringify(l.look), l.createdAt].map(sql).join(', ')});`);
  }
  return { entries, rows, uploads, statements };
}

export async function applyRestore(store: Store, archive: string, manifest: Manifest, plan: Plan): Promise<void> {
  const listed = new Map(manifest.files.map((f) => [f.path, f]));
  // Nothing goes up that does not match the manifest byte for byte.
  for (const path of plan.uploads) {
    const file = listed.get(path);
    if (!file) throw new Error(`${path} is not listed in the manifest; refusing to upload it.`);
    if (readLfsPointer(join(archive, path))) {
      throw new Error(`${path} is a Git LFS pointer, not the file itself. Run \`git lfs pull\` in the archive folder first.`);
    }
    if ((await sha256File(join(archive, path))) !== file.sha256) throw new Error(`${path} does not match its SHA-256 in the manifest; refusing to upload it.`);
  }
  await eachLimit(plan.uploads, store.parallel(4), async (path) => {
    await store.putObject(path, join(archive, path), CONTENT_TYPES[path.split('.').pop() ?? ''] ?? 'application/octet-stream');
  });
  if (plan.statements.length) {
    const folder = mkdtempSync(join(tmpdir(), 'guestbook-restore-sql-'));
    try {
      const file = join(folder, 'restore.sql');
      writeFileSync(file, `${plan.statements.join('\n')}\n`);
      await store.runSqlFile(file);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }
}

function describe(plan: Plan): string {
  const { rows, uploads } = plan;
  const lines = [
    `  entries:        ${rows.entries.length} to put back`,
    `  photos/videos:  ${rows.media.length} to put back`,
    `  page versions:  ${rows.canvases.length} to put back`,
    `  deletions:      ${rows.removals.length} to put back (items deleted on the day stay deleted)`,
    `  looks:          ${rows.looks.length} to put back`,
    `  files:          ${uploads.length} missing from storage, to upload`,
  ];
  for (const path of uploads) lines.push(`    ↑ ${path}`);
  return lines.join('\n');
}

async function main() {
  const { values } = parseArgs({
    options: {
      from: { type: 'string' },
      target: { type: 'string' },
      'persist-to': { type: 'string' },
      entry: { type: 'string', multiple: true },
      media: { type: 'string', multiple: true },
      all: { type: 'boolean', default: false },
      apply: { type: 'boolean', default: false },
      production: { type: 'boolean', default: false },
    },
  });
  if (!values.from) throw new Error('Say which archive folder to restore from: --from <folder>');
  const target = values.target as Target;
  if (!['production', 'test', 'local'].includes(target)) throw new Error('Say where to restore to: --target test, production or local');
  if (!values.all && !values.entry?.length && !values.media?.length) throw new Error('Say what to restore: --entry <id>, --media <id>, or --all');
  if (target === 'production' && values.apply && !values.production) {
    throw new Error('This would write to the real album. Add --production to confirm that is what you mean.');
  }

  const archive = resolve(values.from);
  const manifest = JSON.parse(readFileSync(join(archive, 'manifest.json'), 'utf8')) as Manifest;
  const store = new Store({ target, persistTo: values['persist-to'], root: ROOT });
  console.log(`Archive exported ${new Date(manifest.exportedAt).toISOString()} → ${target}`);

  const plan = await planRestore(store, archive, manifest, { entries: values.entry, media: values.media, all: values.all });
  console.log(describe(plan));
  if (!plan.statements.length && !plan.uploads.length) {
    console.log('Nothing is missing. Nothing to do.');
    return;
  }
  if (!values.apply) {
    console.log('\nDry run: nothing was changed. Run again with --apply to do this.');
    return;
  }
  await applyRestore(store, archive, manifest, plan);
  const check = await planRestore(store, archive, manifest, { entries: values.entry, media: values.media, all: values.all });
  if (check.statements.length || check.uploads.length) {
    console.error(`Restored, but something is still missing:\n${describe(check)}`);
    process.exit(1);
  }
  console.log('Restored. Checked again: nothing in scope is missing.');
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) {
  main().catch((failure: unknown) => {
    console.error(failure instanceof Error ? failure.message : String(failure));
    process.exit(1);
  });
}
