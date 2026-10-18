/**
 * The live album → an archive folder: manifest.json, every file the album
 * holds, and viewer.html, which opens it all offline (docs/ARCHITECTURE.md,
 * "Archive, backup, restore"). Run nightly by .github/workflows/archive.yml
 * into the private archive repository; also runnable by hand:
 *
 *   node --experimental-strip-types scripts/export-archive.ts --target production --out ../guest-book-archive
 *   node --experimental-strip-types scripts/export-archive.ts --target test --out ../archive-test
 *   node --experimental-strip-types scripts/export-archive.ts --target local --persist-to .wrangler/state --out /tmp/a
 *
 * Read-only towards Cloudflare. Incremental: a file already in the folder is
 * kept (R2 keys are never reused, so the bytes cannot have changed) and only
 * new ones are downloaded — the nightly run fetches one day's captures.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  buildEntries,
  buildLooks,
  fileFacts,
  isFurniture,
  listFiles,
  MANIFEST_FORMAT,
  MANIFEST_VERSION,
  objectKeys,
  strokesPath,
  validateArchive,
  type ArchiveFile,
  type Manifest,
  type Rows,
} from './archive/manifest.ts';
import { eachLimit, Store, type Target } from './archive/store.ts';

const ROOT = resolve(import.meta.dirname, '..');
const DOWNLOADS_AT_ONCE = 6;

/** Media is binary and large: Git LFS. Stroke JSON and the manifest stay plain git, so they diff. */
const GITATTRIBUTES = `# Written by the guest book's export (scripts/export-archive.ts).
photos/** filter=lfs diff=lfs merge=lfs -text
videos/** filter=lfs diff=lfs merge=lfs -text
thumbs/** filter=lfs diff=lfs merge=lfs -text
posters/** filter=lfs diff=lfs merge=lfs -text
canvases/**/*.png filter=lfs diff=lfs merge=lfs -text
fonts/*.woff2 filter=lfs diff=lfs merge=lfs -text
`;

function readme(manifest: Manifest): string {
  const title = manifest.couple ? `${manifest.couple}'s guest book` : 'The guest book';
  return `# ${title}

The whole guest book, kept independently of the website that collected it.

- **viewer.html** — double-click to open the album in any browser. No internet, no server, nothing to install.
- **manifest.json** — every entry, photo, video and handwritten page (every version), with dates, which iPad made it, and each file's size and SHA-256.
- **photos/, videos/, thumbs/, posters/** — the original files.
- **canvases/** — each handwritten page version as a PNG (ink only, transparent) and its strokes as JSON, which can redraw it at any size.

Photos and videos deleted on the day are kept here and marked \`removed\` in the manifest; the viewer hides them unless asked.

To keep a copy on a drive: install Git LFS (https://git-lfs.com), then \`git clone\` this repository and run \`git lfs pull\` inside it.

Last exported: ${new Date(manifest.exportedAt).toISOString()} (${manifest.source}).
`;
}

/** The couple and date from the site's own config, for the viewer's title. Best effort. */
function siteDetails(): { couple: string | null; date: string | null } {
  try {
    const site = readFileSync(join(ROOT, 'src/config/site.ts'), 'utf8');
    const names = /const names = \[\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*\]/.exec(site);
    const joiner = /const joiner = ["']([^"']+)["']/.exec(site)?.[1] ?? '&';
    const iso = /iso:\s*["'](\d{4}-\d{2}-\d{2})["']/.exec(site)?.[1] ?? null;
    return { couple: names ? `${names[1]} ${joiner} ${names[2]}` : null, date: iso };
  } catch {
    return { couple: null, date: null };
  }
}

// One query at a time: a local database refuses overlapping wrangler processes,
// and five short reads take seconds either way.
async function readRows(store: Store): Promise<Rows> {
  const entries = await store.rows<Rows['entries'][number]>('SELECT id, device_id, position, title, note, created_at FROM entries');
  const media = await store.rows<Rows['media'][number]>(
    'SELECT id, entry_id, kind, r2_key, poster_key, thumb_key, width, height, duration_ms, bytes, sort_order, created_at FROM media',
  );
  const canvases = await store.rows<Rows['canvases'][number]>('SELECT id, entry_id, r2_key, stroke_data, version, created_at FROM canvases');
  const removals = await store.rows<Rows['removals'][number]>('SELECT media_id, device_id, removed_at FROM media_removals');
  const settings = await store.rows<Rows['settings'][number]>('SELECT id, device_id, data, created_at FROM album_settings');
  return { entries, media, canvases, removals, settings };
}

function copyFurniture(out: string) {
  copyFileSync(join(ROOT, 'scripts/archive/viewer.html'), join(out, 'viewer.html'));
  // The album's own typefaces travel with it, so the viewer reads as the album does.
  mkdirSync(join(out, 'fonts'), { recursive: true });
  for (const name of readdirSync(join(ROOT, 'public/fonts'))) {
    if (/\.(woff2|txt)$/.test(name)) copyFileSync(join(ROOT, 'public/fonts', name), join(out, 'fonts', name));
  }
  writeFileSync(join(out, '.gitattributes'), GITATTRIBUTES);
}

export interface ExportResult {
  manifest: Manifest;
  downloaded: number;
  kept: number;
  pruned: string[];
  problems: string[];
}

export async function exportArchive(store: Store, out: string, log: (line: string) => void = console.log): Promise<ExportResult> {
  mkdirSync(out, { recursive: true });
  log(`Reading the ${store.target} database…`);
  const rows = await readRows(store);
  log(`  ${rows.entries.length} entries, ${rows.media.length} photos and videos, ${rows.canvases.length} page versions, ${rows.settings.length} saved looks`);

  // Files: keep what is here, fetch what is new. A partial download never
  // lands under its real name, so an interrupted run cannot leave half a photo.
  const keys = objectKeys(rows);
  const missing: string[] = [];
  let downloaded = 0;
  let kept = 0;
  await eachLimit(keys, store.parallel(DOWNLOADS_AT_ONCE), async (key) => {
    const target = join(out, key);
    if (existsSync(target) && statSync(target).size > 0) {
      kept++;
      return;
    }
    mkdirSync(dirname(target), { recursive: true });
    const partial = `${target}.partial`;
    if (await store.getObject(key, partial)) {
      renameSync(partial, target);
      downloaded++;
    } else {
      rmSync(partial, { force: true });
      missing.push(key);
    }
  });
  log(`  files: ${downloaded} downloaded, ${kept} already here${missing.length ? `, ${missing.length} MISSING from storage` : ''}`);

  // Stroke JSON, exactly as stored, beside each PNG.
  for (const canvas of rows.canvases) {
    const path = join(out, strokesPath(canvas.r2_key));
    mkdirSync(dirname(path), { recursive: true });
    if (!existsSync(path) || readFileSync(path, 'utf8') !== canvas.stroke_data) writeFileSync(path, canvas.stroke_data);
  }

  const entries = buildEntries(rows);
  const named = new Set<string>([...keys.filter((k) => !missing.includes(k)), ...rows.canvases.map((c) => strokesPath(c.r2_key))]);

  // Anything left over that the database no longer names leaves the working
  // tree. It is not lost: the archive's git history still holds it.
  const pruned: string[] = [];
  for (const path of await listFiles(out)) {
    if (isFurniture(path) || named.has(path)) continue;
    rmSync(join(out, path));
    pruned.push(path);
  }

  const files: ArchiveFile[] = [];
  await eachLimit([...named].sort(), 8, async (path) => {
    const { bytes, sha256 } = await fileFacts(join(out, path));
    files.push({ path, bytes, sha256 });
  });
  files.sort((a, b) => a.path.localeCompare(b.path));

  const manifest: Manifest = {
    format: MANIFEST_FORMAT,
    version: MANIFEST_VERSION,
    exportedAt: Date.now(),
    source: store.target,
    ...siteDetails(),
    looks: buildLooks(rows),
    entries,
    files,
    missing: missing.sort(),
  };

  copyFurniture(out);
  const json = JSON.stringify(manifest, null, 2);
  writeFileSync(join(out, 'manifest.json'), `${json}\n`);
  // The same data as a script: browsers will not fetch() a file:// JSON, but
  // they will run a <script src> beside the page — which is what lets
  // viewer.html open by double-click.
  writeFileSync(join(out, 'manifest.js'), `window.GUESTBOOK_ARCHIVE = ${json};\n`);
  writeFileSync(join(out, 'README.md'), readme(manifest));

  const problems = await validateArchive(out, manifest);
  log(problems.length ? `  ${problems.length} PROBLEMS:\n    ${problems.join('\n    ')}` : '  manifest valid: every file listed, present and matching its SHA-256');
  return { manifest, downloaded, kept, pruned, problems };
}

async function main() {
  const { values } = parseArgs({
    options: {
      target: { type: 'string', default: 'production' },
      out: { type: 'string' },
      'persist-to': { type: 'string' },
      check: { type: 'boolean', default: false },
    },
  });
  if (!values.out) throw new Error('Say where the archive goes: --out <folder>');
  const out = resolve(values.out);

  if (values.check) {
    // Validate an existing archive without touching Cloudflare.
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8')) as Manifest;
    const problems = await validateArchive(out, manifest);
    console.log(problems.length ? problems.join('\n') : `Valid: ${manifest.files.length} files, ${manifest.entries.length} entries.`);
    process.exit(problems.length || manifest.missing.length ? 1 : 0);
  }

  const target = values.target as Target;
  if (!['production', 'test', 'local'].includes(target)) throw new Error('--target must be production, test or local');
  const result = await exportArchive(new Store({ target, persistTo: values['persist-to'], root: ROOT }), out);
  if (result.pruned.length) console.log(`  ${result.pruned.length} files no longer named by the database left the folder (git history keeps them)`);
  // Missing files or an invalid manifest fail the run, so the nightly job turns red.
  process.exit(result.problems.length || result.manifest.missing.length ? 1 : 0);
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) {
  main().catch((failure: unknown) => {
    console.error(failure instanceof Error ? failure.message : String(failure));
    process.exit(1);
  });
}
