/**
 * The archive and the restore drill (Phase 6; docs/TESTING.md §7), performed
 * for real against the test server's own D1 + R2, through the same scripts
 * and the same wrangler commands that run against Cloudflare:
 *
 * 1. an entry with a photo, a video, two page versions and a deleted photo,
 *    and a saved look;
 * 2. export → a valid manifest, every file present and matching;
 * 3. the entry deleted from D1 and its objects from R2, for real;
 * 4. restored from the archive → back intact, version history and all;
 * 5. one lost file put back on its own; a second export downloads nothing.
 *
 * Every command and its output is written to test-results/restore-drill.log
 * for the phase report.
 */
import { execFile } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { validateArchive, type Manifest } from '../scripts/archive/manifest';
import { Store } from '../scripts/archive/store';
import { call, commitCanvas, commitPhoto, createEntry, freshEntries, jpeg, login, newId, strokeDocument, uploadCanvasPng, uploadPhotoFiles, type Cookie } from './helpers';

const run = promisify(execFile);
const LOG = join('test-results', 'restore-drill.log');
const store = () => new Store({ target: 'local', persistTo: inject('stateDir') });

let cookie: Cookie;
let archive: string;
let entryId: string;
const ids = { photo: '', video: '', deleted: '', v1: '', v2: '' };

/** Runs one of the scripts as the owner would, and records command and output. */
async function script(name: 'export-archive' | 'restore-archive', args: string[]): Promise<{ code: number; out: string }> {
  const argv = ['--experimental-strip-types', '--no-warnings', `scripts/${name}.ts`, ...args];
  let code = 0;
  let out = '';
  try {
    const result = await run(process.execPath, argv, { cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024 });
    out = result.stdout + result.stderr;
  } catch (failure) {
    const f = failure as { code?: number; stdout?: string; stderr?: string };
    code = f.code ?? 1;
    out = `${f.stdout ?? ''}${f.stderr ?? ''}`;
  }
  const shown = args.map((a) => a.replace(archive, '<archive>').replace(inject('stateDir'), '<local state>')).join(' ');
  appendFileSync(LOG, `$ node --experimental-strip-types scripts/${name}.ts ${shown}\n${out.replaceAll(archive, '<archive>')}(exit ${code})\n\n`);
  return { code, out };
}

/** SQL straight at the local database, as a person with wrangler would. */
async function sql(command: string) {
  const bin = join(process.cwd(), 'node_modules', '.bin', 'wrangler');
  await run(bin, ['d1', 'execute', 'wedding-guestbook', '--local', '--persist-to', inject('stateDir'), '--command', command], {
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });
  appendFileSync(LOG, `$ wrangler d1 execute wedding-guestbook --local --command "${command}"\n\n`);
}

const fileBytes = async (path: string) => new Uint8Array(await (await call(`/api/files/${path}`)).arrayBuffer());
const entryFromServer = async () => (await freshEntries(cookie)).find((e) => e.id === entryId);
const manifest = (): Manifest => JSON.parse(readFileSync(join(archive, 'manifest.json'), 'utf8')) as Manifest;

async function putPart(id: string, part: string, body: Uint8Array<ArrayBuffer>, contentType: string) {
  const response = await call(`/api/media/${id}/${part}?entryId=${entryId}&kind=video&container=mp4`, { method: 'PUT', cookie, body, contentType });
  if (response.status !== 201) throw new Error(`video ${part}: ${response.status}`);
}

beforeAll(async () => {
  mkdirSync('test-results', { recursive: true });
  writeFileSync(LOG, `Restore drill — ${new Date().toISOString()} — local D1 + R2 of the test server\n\n`);
  archive = mkdtempSync(join(tmpdir(), 'guestbook-archive-'));
  cookie = await login('ipad1');

  entryId = await createEntry(cookie, 'ipad1');
  ids.photo = await uploadPhotoFiles(cookie, 'ipad1', entryId);
  expect((await commitPhoto(cookie, ids.photo, entryId)).status).toBe(201);

  ids.video = newId('ipad1');
  const video = new Uint8Array(readFileSync('tests/fixtures/fake-camera-3s.mp4'));
  await putPart(ids.video, 'original', video, 'video/mp4');
  await putPart(ids.video, 'thumb', await jpeg(), 'image/jpeg');
  await putPart(ids.video, 'poster', await jpeg(), 'image/jpeg');
  const committed = await call('/api/media', {
    method: 'POST',
    cookie,
    json: { id: ids.video, entryId, kind: 'video', width: 1280, height: 720, durationMs: 3_000, container: 'mp4' },
  });
  expect(committed.status).toBe(201);

  ids.v1 = await uploadCanvasPng(cookie, 'ipad1', entryId);
  expect((await commitCanvas(cookie, ids.v1, entryId, strokeDocument([[10, 10, 0.5]]))).status).toBe(201);
  ids.v2 = await uploadCanvasPng(cookie, 'ipad1', entryId);
  expect((await commitCanvas(cookie, ids.v2, entryId, strokeDocument([[10, 10, 0.5], [500, 300, 0.9]]))).status).toBe(201);

  ids.deleted = await uploadPhotoFiles(cookie, 'ipad1', entryId);
  expect((await commitPhoto(cookie, ids.deleted, entryId)).status).toBe(201);
  expect((await call(`/api/media/${ids.deleted}`, { method: 'DELETE', cookie })).status).toBe(200);

  const look = { leaf: 'forest', frame: 'polaroid', paper: 'dotted', theme: 'botanical', watermark: { text: 'R & A', position: 'bottom-end' } };
  expect((await call('/api/settings', { method: 'POST', cookie, json: { id: newId('ipad1'), look } })).status).toBe(201);
}, 120_000);

afterAll(async () => {
  // The rest of the suite shares this server: back to the designed album.
  const look = { leaf: 'midnight', frame: 'corners', paper: 'ruled', theme: 'none', watermark: { text: '', position: 'bottom-end' } };
  await call('/api/settings', { method: 'POST', cookie, json: { id: newId('ipad1'), look } });
  rmSync(archive, { recursive: true, force: true });
});

describe('export', () => {
  it('writes a complete archive: every entry, item and page version, every file present and matching', async () => {
    const result = await script('export-archive', ['--target', 'local', '--persist-to', inject('stateDir'), '--out', archive]);
    expect(result.code, result.out).toBe(0);
    expect(result.out).toContain('manifest valid');

    const m = manifest();
    expect(m).toMatchObject({ format: 'guestbook-archive', version: 1, source: 'local', missing: [], couple: 'Rama & Assela', date: '2026-12-19' });
    const entry = m.entries.find((e) => e.id === entryId)!;
    expect(entry.media.map((x) => x.id)).toEqual([ids.photo, ids.video, ids.deleted]);
    expect(entry.media.find((x) => x.id === ids.deleted)!.removed).toMatchObject({ deviceId: 'ipad1' });
    expect(entry.media.find((x) => x.id === ids.photo)!.removed).toBeNull();
    expect(entry.canvases.map((c) => [c.id, c.version])).toEqual([[ids.v1, 1], [ids.v2, 2]]);
    expect(JSON.parse(readFileSync(join(archive, entry.canvases[1].strokes), 'utf8'))).toEqual(strokeDocument([[10, 10, 0.5], [500, 300, 0.9]]));
    expect(m.looks.at(-1)!.look).toMatchObject({ leaf: 'forest', watermark: { text: 'R & A' } });

    // The archived files are the stored files, byte for byte — the deleted photo's too.
    const video = entry.media.find((x) => x.id === ids.video)!;
    for (const path of [video.original, video.poster!, entry.canvases[0].png, entry.media[2].original]) {
      expect(new Uint8Array(readFileSync(join(archive, path)))).toEqual(await fileBytes(path));
    }

    // The viewer and everything it needs, offline.
    for (const furniture of ['viewer.html', 'manifest.js', 'README.md', '.gitattributes', 'fonts/spectral-latin-400-normal.woff2', 'fonts/OFL-Spectral.txt']) {
      expect(readFileSync(join(archive, furniture)).length).toBeGreaterThan(0);
    }
    expect(readFileSync(join(archive, 'manifest.js'), 'utf8')).toMatch(/^window\.GUESTBOOK_ARCHIVE = \{/);
    expect(readFileSync(join(archive, '.gitattributes'), 'utf8')).toContain('videos/** filter=lfs');

    // --check validates without Cloudflare.
    expect((await script('export-archive', ['--check', '--out', archive])).code).toBe(0);
  }, 240_000);

  it('the validator catches a changed file, a missing file and a stray one', async () => {
    const m = manifest();
    const copy = mkdtempSync(join(tmpdir(), 'guestbook-archive-broken-'));
    try {
      await run('cp', ['-R', `${archive}/.`, copy]);
      const [first, second] = m.files;
      writeFileSync(join(copy, first.path), 'not the photo');
      rmSync(join(copy, second.path));
      writeFileSync(join(copy, 'photos', 'stray.jpg'), 'x');
      const problems = await validateArchive(copy, m);
      expect(problems.some((p) => p.startsWith(`${first.path}:`))).toBe(true);
      expect(problems).toContain(`${second.path}: listed but not present`);
      expect(problems).toContain('photos/stray.jpg: present but not in the manifest');
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });
});

describe('restore drill', () => {
  it('an entry deleted from D1 and R2 comes back from the archive intact, version history included', async () => {
    const entry = manifest().entries.find((e) => e.id === entryId)!;
    const keys = [...entry.media.flatMap((m) => [m.original, m.thumb, ...(m.poster ? [m.poster] : [])]), ...entry.canvases.map((c) => c.png)];

    // The accident, for real: rows and objects gone.
    await sql(`DELETE FROM media_removals WHERE media_id = '${ids.deleted}'; DELETE FROM media WHERE entry_id = '${entryId}'; DELETE FROM canvases WHERE entry_id = '${entryId}'; DELETE FROM entries WHERE id = '${entryId}'`);
    for (const key of keys) await store().deleteObject(key);
    appendFileSync(LOG, `(deleted ${keys.length} objects from local R2 with wrangler r2 object delete)\n\n`);
    expect(await entryFromServer()).toBeUndefined();
    expect((await call(`/api/files/${keys[0]}`)).status).toBe(404);

    // A dry run says what it would do and changes nothing.
    const dry = await script('restore-archive', ['--from', archive, '--target', 'local', '--persist-to', inject('stateDir'), '--entry', entryId]);
    expect(dry.code, dry.out).toBe(0);
    expect(dry.out).toContain('Dry run: nothing was changed');
    expect(dry.out).toContain(`files:          ${keys.length} missing`);
    expect(await entryFromServer()).toBeUndefined();

    const done = await script('restore-archive', ['--from', archive, '--target', 'local', '--persist-to', inject('stateDir'), '--entry', entryId, '--apply']);
    expect(done.code, done.out).toBe(0);
    expect(done.out).toContain('Restored. Checked again: nothing in scope is missing.');

    // Back, as it was: the photo and video in order, the deleted photo still deleted, the page at version 2.
    const back = (await entryFromServer())!;
    expect(back.media.map((m) => m.id)).toEqual([ids.photo, ids.video]);
    expect(back.canvas).toMatchObject({ id: ids.v2, version: 2 });
    const latest = (await (await call(`/api/canvas?entryId=${entryId}`, { cookie })).json()) as { strokes: unknown };
    expect(latest.strokes).toEqual(strokeDocument([[10, 10, 0.5], [500, 300, 0.9]]));
    const versions = await store().rows<{ id: string; version: number }>(`SELECT id, version FROM canvases WHERE entry_id = '${entryId}' ORDER BY version`);
    expect(versions).toEqual([{ id: ids.v1, version: 1 }, { id: ids.v2, version: 2 }]);
    for (const key of keys) expect(await fileBytes(key)).toEqual(new Uint8Array(readFileSync(join(archive, key))));

    // Running it again finds nothing to do: restore never overwrites.
    const again = await script('restore-archive', ['--from', archive, '--target', 'local', '--persist-to', inject('stateDir'), '--entry', entryId, '--apply']);
    expect(again.out).toContain('Nothing is missing. Nothing to do.');
  }, 300_000);

  it('one lost file is put back on its own; its row is left alone', async () => {
    const photo = manifest().entries.find((e) => e.id === entryId)!.media[0];
    await store().deleteObject(photo.thumb);
    appendFileSync(LOG, `(deleted ${photo.thumb} from local R2)\n\n`);
    expect((await call(`/api/files/${photo.thumb}`)).status).toBe(404);
    const done = await script('restore-archive', ['--from', archive, '--target', 'local', '--persist-to', inject('stateDir'), '--media', photo.id, '--apply']);
    expect(done.code, done.out).toBe(0);
    expect(done.out).toContain('photos/videos:  0 to put back');
    expect(done.out).toContain(`↑ ${photo.thumb}`);
    expect(await fileBytes(photo.thumb)).toEqual(new Uint8Array(readFileSync(join(archive, photo.thumb))));
  }, 120_000);

  it('production is never written by accident', async () => {
    const refused = await script('restore-archive', ['--from', archive, '--target', 'production', '--all', '--apply']);
    expect(refused.code).toBe(1);
    expect(refused.out).toContain('This would write to the real album. Add --production');
  });

  it('Git LFS pointers (how the nightly job sees old media) count as the files they stand for; restore refuses them', async () => {
    const m = manifest();
    const video = m.files.find((f) => f.path.startsWith('videos/'))!;
    const copy = mkdtempSync(join(tmpdir(), 'guestbook-archive-lfs-'));
    try {
      await run('cp', ['-R', `${archive}/.`, copy]);
      writeFileSync(join(copy, video.path), `version https://git-lfs.github.com/spec/v1\noid sha256:${video.sha256}\nsize ${video.bytes}\n`);
      expect(await validateArchive(copy, m)).toEqual([]);
      // An export over it downloads nothing and records the real file's facts, not the pointer's.
      const result = await script('export-archive', ['--target', 'local', '--persist-to', inject('stateDir'), '--out', copy]);
      expect(result.code, result.out).toBe(0);
      const after = (JSON.parse(readFileSync(join(copy, 'manifest.json'), 'utf8')) as Manifest).files.find((f) => f.path === video.path);
      expect(after).toEqual(video);
      expect(readFileSync(join(copy, video.path), 'utf8')).toContain('git-lfs.github.com');
      // A restore from a clone that never ran `git lfs pull` stops before uploading a pointer.
      const entry = m.entries.find((e) => e.id === entryId)!;
      await store().deleteObject(video.path);
      const refused = await script('restore-archive', ['--from', copy, '--target', 'local', '--persist-to', inject('stateDir'), '--entry', entry.id, '--apply']);
      expect(refused.code).toBe(1);
      expect(refused.out).toContain('is a Git LFS pointer, not the file itself. Run `git lfs pull`');
      // The real archive puts it back.
      const fixed = await script('restore-archive', ['--from', archive, '--target', 'local', '--persist-to', inject('stateDir'), '--entry', entry.id, '--apply']);
      expect(fixed.code, fixed.out).toBe(0);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  }, 300_000);

  it('a second export is incremental: nothing new to download', async () => {
    const result = await script('export-archive', ['--target', 'local', '--persist-to', inject('stateDir'), '--out', archive]);
    expect(result.code, result.out).toBe(0);
    expect(result.out).toMatch(/files: 0 downloaded, \d+ already here/);
  }, 240_000);
});
