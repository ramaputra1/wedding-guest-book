/**
 * Empties an album: every entry, photo, video, page version, deletion and
 * saved look, and the files they name — for the one moment it is wanted,
 * clearing the rehearsal's test entries before the wedding (docs/RUNBOOK.md,
 * section 13; docs/PHASES.md, Phase 8).
 *
 *   node --experimental-strip-types scripts/clear-album.ts --target test
 *   node --experimental-strip-types scripts/clear-album.ts --target production --archive ../wedding-guest-book-archive --apply --production
 *
 * It is the only thing in the project that erases, so it is careful:
 * - a dry run unless --apply, and the real album also needs --production;
 * - it refuses unless --archive names an archive exported after the last
 *   thing was added, so everything it erases can be restored from there
 *   (scripts/restore-archive.ts --all);
 * - it keeps the album's look unless --looks is given.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { objectKeys, type Manifest, type Rows } from './archive/manifest.ts';
import { eachLimit, Store, type Target } from './archive/store.ts';

const ROOT = resolve(import.meta.dirname, '..');

async function main() {
  const { values } = parseArgs({
    options: {
      target: { type: 'string' },
      'persist-to': { type: 'string' },
      archive: { type: 'string' },
      looks: { type: 'boolean', default: false },
      apply: { type: 'boolean', default: false },
      production: { type: 'boolean', default: false },
    },
  });
  const target = values.target as Target;
  if (!['production', 'test', 'local'].includes(target)) throw new Error('Say which album to empty: --target test, production or local');
  if (target === 'production' && values.apply && !values.production) {
    throw new Error('This would erase the real album. Add --production to confirm that is what you mean.');
  }
  const store = new Store({ target, persistTo: values['persist-to'], root: ROOT });

  const entries = await store.rows<{ id: string; created_at: number }>('SELECT id, created_at FROM entries');
  const media = await store.rows<Rows['media'][number]>('SELECT id, entry_id, kind, r2_key, poster_key, thumb_key, width, height, duration_ms, bytes, sort_order, created_at FROM media');
  const canvases = await store.rows<Rows['canvases'][number]>('SELECT id, entry_id, r2_key, stroke_data, version, created_at FROM canvases');
  const looks = await store.rows<{ id: string; created_at: number }>('SELECT id, created_at FROM album_settings');
  const keys = objectKeys({ entries: [], media, canvases, removals: [], settings: [] });

  console.log(`The ${target} album holds:`);
  console.log(`  ${entries.length} entries, ${media.length} photos and videos, ${canvases.length} page versions, ${keys.length} files`);
  console.log(`  ${looks.length} saved looks — ${values.looks ? 'these go too' : 'kept (add --looks to clear them as well)'}`);
  if (!entries.length && !media.length && !canvases.length && (!values.looks || !looks.length)) {
    console.log('It is already empty. Nothing to do.');
    return;
  }

  // Erasing is only allowed when an archive holds everything that would go.
  const newest = Math.max(0, ...entries.map((e) => e.created_at), ...media.map((m) => m.created_at), ...canvases.map((c) => c.created_at), ...(values.looks ? looks.map((l) => l.created_at) : []));
  if (!values.archive) {
    if (values.apply) throw new Error('Name an up-to-date archive first (--archive <folder>): what this erases must be restorable.');
  } else {
    const manifest = JSON.parse(readFileSync(join(resolve(values.archive), 'manifest.json'), 'utf8')) as Manifest;
    if (manifest.source !== target) throw new Error(`That archive is of the ${manifest.source} album, not ${target}.`);
    const archived = new Set(manifest.entries.flatMap((e) => [e.id, ...e.media.map((m) => m.id), ...e.canvases.map((c) => c.id)]));
    const unarchived = [...entries.map((e) => e.id), ...media.map((m) => m.id), ...canvases.map((c) => c.id)].filter((id) => !archived.has(id));
    if (unarchived.length || manifest.exportedAt < newest) {
      throw new Error(`The archive (exported ${new Date(manifest.exportedAt).toISOString()}) does not hold ${unarchived.length || 'the newest'} of these. Run the export first (docs/RUNBOOK.md, section 2).`);
    }
    console.log(`  archive exported ${new Date(manifest.exportedAt).toISOString()} holds all of it: everything here can be restored with restore-archive.ts --all`);
  }

  if (!values.apply) {
    console.log('\nDry run: nothing was changed. Run again with --apply to empty it.');
    return;
  }

  // Rows first, so the album never names a file that is already gone; then the files.
  const folder = mkdtempSync(join(tmpdir(), 'guestbook-clear-'));
  const sql = join(folder, 'clear.sql');
  writeFileSync(
    sql,
    [
      'DELETE FROM media_removals;',
      'DELETE FROM canvases;',
      'DELETE FROM media;',
      'DELETE FROM entries;',
      ...(values.looks ? ['DELETE FROM album_settings;'] : []),
    ].join('\n'),
  );
  try {
    await store.runSqlFile(sql);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
  let deleted = 0;
  await eachLimit(keys, store.parallel(6), async (key) => {
    await store.deleteObject(key);
    deleted++;
  });
  console.log(`Emptied: ${entries.length} entries, ${media.length} photos and videos, ${canvases.length} page versions and ${deleted} files are gone${values.looks ? ', and the saved looks' : ''}.`);
}

main().catch((failure: unknown) => {
  console.error(failure instanceof Error ? failure.message : String(failure));
  process.exit(1);
});
